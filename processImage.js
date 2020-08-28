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

// setup colors
const white = new cv.Scalar(255, 255, 255);
const red = new cv.Scalar(255, 0, 0);
const green = new cv.Scalar(0, 255, 0);
const blue = new cv.Scalar(0, 0, 255);

// on button click, detect -> display circles

document.getElementById("detectButton").onclick = function () {
  // disable button, show loader
  this.disabled = true;
  document.body.classList.add("loading");

  // load or load fresh
  loadImageToCanvas();

  // load the image, make gray + blur
  let srcMat = prepImage();
  // Transform the image to be as square as possible
  let warped = fourPointTransform(srcMat); // NOTE: might throw
  // turn to black or white binary
  let blackOrWhite = applyOtsuThresh(warped);
  // grab circles
  let circleMat = detectCircles(blackOrWhite);

  // Working todo list:
  // have detectCircles
  //  - group circles into question clusters
  //  - cast an answer based on darkest color
  // figure out question number

  // show the magic
  cv.imshow("imageCanvas", circleMat);

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

const applyOtsuThresh = (src) => {
  // https://docs.opencv.org/master/d7/dd0/tutorial_js_thresholding.html
  let thresh = new cv.Mat();
  cv.threshold(src, thresh, 0, 255, cv.THRESH_OTSU);

  return thresh;
};

const detectCircles = (mat) => {
  let src = mat.clone();
  let output = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    src,
    contours,
    hierarchy,
    cv.RETR_CCOMP,
    cv.CHAIN_APPROX_SIMPLE
  );

  // Get area for all contours so we can find the biggest
  let potentialBubbles = [];
  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    let { height, width } = cv.boundingRect(c); // also returns x, y
    let aspectRatio = width / height;

    // in order to label the contour as a question, region
    // should be sufficiently wide, sufficiently tall, and
    // have an aspect ratio approximately equal to 1
    if (
      width >= 20 &&
      height >= 20 &&
      aspectRatio >= 0.9 &&
      aspectRatio <= 1.1
    ) {
      potentialBubbles.push(c);
    }
  }

  // reduce any overlaps to the biggest
  let bubbleOutlines = potentialBubbles.reduce((collection, current) => {
    let currentRect = cv.boundingRect(current);

    let overlapping = collection.find((other) => {
      let otherRect = cv.boundingRect(other);

      return (
        currentRect.x < otherRect.x + otherRect.width &&
        currentRect.x + currentRect.width > otherRect.x &&
        currentRect.y < otherRect.y + otherRect.height &&
        currentRect.height + currentRect.y > otherRect.y
      );
    });

    if (!overlapping) {
      collection.push(current);
    } else {
      let currentArea = currentRect.width * currentRect.height;
      let otherArea = overlapping.width * overlapping.height;

      if (currentArea > otherArea) {
        otherIndex = collection.indexOf(overlapping);
        collection[otherIndex] = current;
      }
    }

    return collection;
  }, []);

  // sort top then left
  bubbleOutlines = sortContours(bubbleOutlines);

  // TODO: cluster circles into rows
  // ...

  // TODO: decide an answer
  // ...

  // paint all bubbles to image
  // see from https://docs.opencv.org/master/dc/dcf/tutorial_js_contour_features.html
  for (let i = 0, length = bubbleOutlines.length; i < length; i++) {
    let bubble = bubbleOutlines[i];
    let circle = cv.minEnclosingCircle(bubble);
    // paint circle outline
    cv.circle(output, circle.center, circle.radius, blue, 2, cv.LINE_AA, 0);
    // paint dev helping label
    const textCenter =
      i < 9 // single digit, less offset
        ? { x: circle.center.x - 5, y: circle.center.y + 5 }
        : { x: circle.center.x - 10, y: circle.center.y + 5 };
    const bubbleLabel = `${i + 1}`;
    cv.putText(output, bubbleLabel, textCenter, 1, 1, blue);
  }

  return output;
};

const sortContours = (contours) => {
  const BUFFER = 1.2; // because sizing not PERFECT

  return contours
    .map((c) => [c, cv.boundingRect(c)])
    .sort((a, b) => {
      const [, aRect] = a;
      const [, bRect] = b;

      if (BUFFER * aRect.y < bRect.y) return -1;
      if (aRect.y > BUFFER * bRect.y) return 1;

      if (aRect.x < bRect.x) return -1;
      if (aRect.x > bRect.x) return 1;
    })
    .map(([c, _rect]) => c);
};
