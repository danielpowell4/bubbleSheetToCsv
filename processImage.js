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

  // PRE-DETECTION
  // - load the image
  let srcMat = cv.imread("imageCanvas"); // will be mutated
  // - convert it to grayscale
  cv.cvtColor(srcMat, srcMat, cv.COLOR_RGBA2GRAY);
  // - blur it slightly for smoothing
  // per https://docs.opencv.org/3.4/dd/d6a/tutorial_js_filtering.html
  let ksize = new cv.Size(3, 3);
  cv.GaussianBlur(srcMat, srcMat, ksize, 0, 0, cv.BORDER_DEFAULT);
  // - detect edges
  // per https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
  cv.Canny(srcMat, srcMat, 75, 200, 3, false);

  // WIP: transform the image to be as square as possible
  // find contours in the edge map, then initialize
  // the contour that corresponds to the document
  // per https://docs.opencv.org/3.4/d5/daa/tutorial_js_contours_begin.html
  let contMat = srcMat.clone();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    contMat,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  let docCnt = null;

  // ensure that at least one contour was found
  if (contours.size() > 0) {
    // loop over the sorted contours
    // question... what makes them sorted?
    for (let i = 0; i < contours.size(); ++i) {
      // # approximate the contour
      // per https://docs.opencv.org/master/dc/dcf/tutorial_js_contour_features.html
      let approx = new cv.Mat();
      let contour = contours.get(i);
      let peri = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      // if 4, found paper's countour!
      if (approx.size().height == 4) {
        docCnt = approx;
        break; // or just return?
      }
    }
  }

  // TODO: check out the 'Get Affine Transform Example'
  // here: https://docs.opencv.org/3.4/dd/d52/tutorial_js_geometric_transformations.html
  let dst = new cv.Mat();
  let dsize = new cv.Size(contMat.rows, contMat.cols);
  // (data32F[0], data32F[1]) is the first point
  // (data32F[2], data32F[3]) is the sescond point
  // (data32F[4], data32F[5]) is the third point
  // (data32F[6], data32F[7]) is the fourth point
  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    56,
    65,
    368,
    52,
    28,
    387,
    389,
    390,
  ]);
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    300,
    0,
    0,
    300,
    300,
    300,
  ]);
  let M = cv.getPerspectiveTransform(srcTri, dstTri);
  // You can try more different parameters
  cv.warpPerspective(
    contMat,
    dst,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );
  cv.imshow("imageCanvas", dst);

  // check out star examples here: https://docs.opencv.org/master/dc/dcf/tutorial_js_contour_features.html

  // add display in canvas
  // cv.imshow("imageCanvas", srcMat);
  // cv.imshow("imageCanvas", contMat);
  // cv.imshow("imageCanvas", docCnt); BROKEN

  // re-enable button, hide loader
  this.disabled = false;
  document.body.classList.remove("loading");
};
