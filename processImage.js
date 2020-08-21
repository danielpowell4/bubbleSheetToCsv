// file input -> img

let inputElement = document.getElementById("imageInput");
let imgElement = document.getElementById("imageOriginal");

inputElement.addEventListener(
  "change",
  (e) => {
    imgElement.src = URL.createObjectURL(e.target.files[0]);
  },
  false
);

// image -> opencv -> canvas

let mat;
let loadImageToCanvas = function () {
  mat = cv.imread(imgElement);
  cv.imshow("imageCanvas", mat);
};

imgElement.onload = loadImageToCanvas;

// on button click, detect -> display circles

document.getElementById("detectButton").onclick = function () {
  // disable button, show loader
  this.disabled = true;
  document.body.classList.add("loading");

  // load or load fresh
  loadImageToCanvas();

  // // load the image, make gray + blur
  let srcMat = prepImage();
  // Transform the image to be as square as possible
  let squaredMat = fourPointTransform(srcMat); // NOTE: might throw

  // Working todo list:
  // find contours in a thresholded image,
  // initialize the list of contours that correspond to questions
  // ... loop?

  // - return its position in group
  // - determine the question number (?)
  // - check out star examples here: https://docs.opencv.org/master/dc/dcf/tutorial_js_contour_features.html

  // add display in canvas
  cv.imshow("imageCanvas", squaredMat);

  // re-enable button, hide loader
  this.disabled = false;
  document.body.classList.remove("loading");
};

// 'utils'

const prepImage = () => {
  const srcMat = cv.imread("imageCanvas"); // will be mutated
  // - convert it to grayscale
  cv.cvtColor(srcMat, srcMat, cv.COLOR_RGBA2GRAY);
  // - blur it slightly for smoothing
  // per https://docs.opencv.org/3.4/dd/d6a/tutorial_js_filtering.html
  let ksize = new cv.Size(3, 3);
  cv.GaussianBlur(srcMat, srcMat, ksize, 0, 0, cv.BORDER_DEFAULT);
  // - detect edges
  // per https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
  cv.Canny(srcMat, srcMat, 75, 200, 3, false);

  return srcMat;
};

const fourPointTransform = (srcMat) => {
  // the gist is to use cv's `findContours`
  // then sort them (biggest likely document)
  // then to find one with 4 points as it is document
  // most of source from https://stackoverflow.com/questions/51528462/opencv-js-perspective-transform
  // resource https://docs.opencv.org/3.4/d5/daa/tutorial_js_contours_begin.html

  let contMat = srcMat.clone();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    contMat,
    contours,
    hierarchy,
    cv.RETR_LIST,
    cv.CHAIN_APPROX_SIMPLE
  );

  // Get area for all contours so we can find the biggest
  let sortableContours = [];
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt, false);
    let perim = cv.arcLength(cnt, false);

    sortableContours.push({
      areaSize: area,
      perimiterSize: perim,
      contour: cnt,
    });
  }

  // Sort 'em as biggest is likely edges of paper
  sortableContours = sortableContours
    .sort((item1, item2) => {
      return item1.areaSize > item2.areaSize
        ? -1
        : item1.areaSize < item2.areaSize
        ? 1
        : 0;
    })
    .slice(0, 5);

  // Ensure the top area contour has 4 corners
  // NOTE: This is not a perfect science and likely needs more attention
  let approx = new cv.Mat();
  cv.approxPolyDP(
    sortableContours[0].contour,
    approx,
    0.05 * sortableContours[0].perimiterSize,
    true
  );

  if (approx.rows == 4) {
    foundContour = approx;
  } else {
    throw "No 4 - corner large contour! Aborting";
  }

  // Find the corners
  // 'foundCountour' has 2 channels (seemingly x/y), has a depth of 4, and a type of 12.
  // Seems to show it's a CV_32S "type", so the valid data is in data32S??
  let corner1 = new cv.Point(foundContour.data32S[0], foundContour.data32S[1]);
  let corner2 = new cv.Point(foundContour.data32S[2], foundContour.data32S[3]);
  let corner3 = new cv.Point(foundContour.data32S[4], foundContour.data32S[5]);
  let corner4 = new cv.Point(foundContour.data32S[6], foundContour.data32S[7]);

  // Order the corners
  let cornerArray = [
    { corner: corner1 },
    { corner: corner2 },
    { corner: corner3 },
    { corner: corner4 },
  ];

  // Sort by Y position (to get top-down)
  cornerArray
    .sort((item1, item2) => {
      return item1.corner.y < item2.corner.y
        ? -1
        : item1.corner.y > item2.corner.y
        ? 1
        : 0;
    })
    .slice(0, 5);

  // Determine left/right based on x position of top and bottom 2
  let tl =
    cornerArray[0].corner.x < cornerArray[1].corner.x
      ? cornerArray[0]
      : cornerArray[1];
  let tr =
    cornerArray[0].corner.x > cornerArray[1].corner.x
      ? cornerArray[0]
      : cornerArray[1];
  let bl =
    cornerArray[2].corner.x < cornerArray[3].corner.x
      ? cornerArray[2]
      : cornerArray[3];
  let br =
    cornerArray[2].corner.x > cornerArray[3].corner.x
      ? cornerArray[2]
      : cornerArray[3];

  // Calculate the output width/height
  let widthBottom = Math.hypot(
    br.corner.x - bl.corner.x,
    br.corner.y - bl.corner.y
  );
  let widthTop = Math.hypot(
    tr.corner.x - tl.corner.x,
    tr.corner.y - tl.corner.y
  );
  let outputWidth = Math.max(widthBottom, widthTop);
  let heightRight = Math.hypot(
    tr.corner.x - br.corner.x,
    tr.corner.y - br.corner.y
  );
  let heightLeft = Math.hypot(
    tl.corner.x - bl.corner.x,
    tr.corner.y - bl.corner.y
  );
  let outputHeight = Math.max(heightRight, heightLeft);

  // ... actually transform!
  let finalDestCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outputWidth - 1,
    0,
    outputWidth - 1,
    outputHeight - 1,
    0,
    outputHeight - 1,
  ]); //
  let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.corner.x,
    tl.corner.y,
    tr.corner.x,
    tr.corner.y,
    br.corner.x,
    br.corner.y,
    bl.corner.x,
    bl.corner.y,
  ]);
  let dsize = new cv.Size(outputWidth, outputHeight);
  let M = cv.getPerspectiveTransform(srcCoords, finalDestCoords);
  cv.warpPerspective(
    contMat,
    contMat,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  return contMat;
};
