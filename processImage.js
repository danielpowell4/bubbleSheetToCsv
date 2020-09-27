// requires opencv.js to have loaded

// image -> opencv -> canvas

let inputCanvas = document.getElementById("canvasInput");

let loadImageToCanvas = function (imageSrc) {
  let ctx = inputCanvas.getContext("2d");
  let img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function () {
    inputCanvas.width = img.width;
    inputCanvas.height = img.height;
    ctx.drawImage(img, 0, 0, img.width, img.height);
  };
  img.src = imageSrc;
};

// file input -> img
// - add default image
const defaultImages = [
  "test_01.png",
  "test_02.png",
  "test_03.png",
  "test_04.png",
  "test_05.png",
];
const defaultImage =
  defaultImages[Math.floor(Math.random() * defaultImages.length)];
loadImageToCanvas("./images/" + defaultImage);
// - allow upload
let inputElement = document.getElementById("imageInput");
inputElement.addEventListener(
  "change",
  (e) => {
    loadImageToCanvas(URL.createObjectURL(e.target.files[0]));
  },
  false
);

// setup colors
const white = new cv.Scalar(255, 255, 255);
const red = new cv.Scalar(255, 0, 0);
const green = new cv.Scalar(0, 255, 0);
const blue = new cv.Scalar(0, 0, 255);
const yellow = new cv.Scalar(235, 229, 52);
const black = new cv.Scalar(0, 0, 0);

// on button click, detect -> display circles

document.getElementById("detectButton").onclick = function () {
  // disable button, show loader
  this.disabled = true;
  document.body.classList.add("loading");

  let rawSrc = cv.imread("canvasInput");
  cv.imshow("canvasOutput", rawSrc);

  // load the image, make gray + blur
  let srcMat = prepImage(rawSrc.clone());
  // Transform the image to be as square as possible
  let warped = fourPointTransform(srcMat); // NOTE: might throw
  // turn to black or white binary
  let blackOrWhite = applyOtsuThresh(warped);
  // grab circles
  let [circleMat, answers] = detectCircles(blackOrWhite);

  console.log("answers", answers);

  // Working todo list:
  // have detectCircles
  //  - discard outlier groups
  // robustly figure out question number ..?

  // show the magic
  cv.imshow("canvasOutput", circleMat);

  // re-enable button, hide loader
  this.disabled = false;
  document.body.classList.remove("loading");
};

// 'utils'

const prepImage = (srcMat) => {
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

  // DEV HELPER
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

  // cluster circles into rows
  const optionCount = 5; // TODO: make me property/arg ..?
  const questions = groupToQuestions(bubbleOutlines, optionCount); // TODO: discard outliers

  // DEV HELPER
  // loop through rows, paint outline, label
  for (let i = 0, length = questions.length; i < length; i++) {
    const questionGroup = questions[i];
    const firstCnt = questionGroup[0];
    const lastCnt = questionGroup[optionCount - 1];
    if (!lastCnt) {
      throw `questionGroup i=${i} is the victim of a previous (not enough bubbles for question)`;
    }
    const firstBubble = cv.boundingRect(firstCnt);
    const lastBubble = cv.boundingRect(lastCnt);

    let point1 = new cv.Point(firstBubble.x, firstBubble.y);
    let point2 = new cv.Point(
      lastBubble.x + lastBubble.width,
      lastBubble.y + lastBubble.height
    );
    cv.rectangle(output, point1, point2, red, 2, cv.LINE_AA, 0);

    const textCenter = {
      x: firstBubble.x - 30,
      y: firstBubble.y + firstBubble.height / 2 + 5,
    };
    const qNum = `Q${i + 1}`; // make me smarter?
    cv.putText(output, qNum, textCenter, 1, 1, red);
  }

  // IN PROGRESS: decide an answer
  let thresh = mat.clone();
  let answers = [];

  for (let i = 0, length = questions.length; i < length; i++) {
    const questionGroup = questions[i];
    let max;
    let table = [];

    for (let j = 0, optionCount = questionGroup.length; j < optionCount; j++) {
      let choice = questionGroup[j]; // choice is a Mat

      // cut out rectangle around choice
      // as region of interest or 'roi'
      let boundingRect = cv.boundingRect(choice);
      // IDEA #1 -> use innerRect avoid border
      // TODO: standardize size for all bubbles
      let innerRect = new cv.Rect(
        boundingRect.x + 5,
        boundingRect.y + 5,
        boundingRect.width - 10,
        boundingRect.height - 10
      );
      let region = thresh.roi(innerRect); // must be a rect

      // DEV HELPER: Draw region boundary to output (for manual tweaks)
      let point1 = new cv.Point(innerRect.x, innerRect.y);
      let point2 = new cv.Point(
        innerRect.x + innerRect.width,
        innerRect.y + innerRect.height
      );
      cv.rectangle(output, point1, point2, red, 2, cv.LINE_AA, 0);

      // IDEA #2 -> create circle mask w/ bitwise_and
      // per ~https://stackoverflow.com/questions/60118622/how-to-crop-circle-image-from-webcam-opencv-and-remove-background
      // for background see https://stackoverflow.com/questions/44333605/what-does-bitwise-and-operator-exactly-do-in-opencv
      let blackOnly = cv.Mat.zeros(region.rows, region.cols, cv.CV_8UC1);
      let circleMask = blackOnly.clone();
      let calculatedRadius = (region.rows + region.cols) / 4;

      // DEV HELPER: draw circle to output
      let boundingCircle = cv.minEnclosingCircle(choice);
      cv.circle(output, boundingCircle.center, calculatedRadius, yellow, -1);
      cv.circle(
        circleMask,
        { x: region.rows / 2, y: region.cols / 2 },
        calculatedRadius, // use circle radius or correction factor?
        white,
        -1 // -1 => filled
      );

      let whiteCircle = new cv.Mat();
      cv.bitwise_and(region, region, whiteCircle, circleMask);

      let regionCount = cv.countNonZero(region); // of the whole region
      let circleCount = cv.countNonZero(whiteCircle); // of the circle only

      table.push([["A", "B", "C", "D", "E"][j], regionCount, circleCount]);

      if (!max || max[2] < circleCount) {
        max = [choice, j, circleCount];
      }
    }

    // DEV HELPER
    // paint 'correct' bubble
    let correct = cv.minEnclosingCircle(max[0]);
    // paint circle outline
    cv.circle(output, correct.center, correct.radius, green, 2, cv.LINE_AA, 0);

    answers.push({ q: i + 1, answerPosition: max[1] + 1 });

    console.log("\nQ", i + 1);
    console.table(table);
  }

  return [output, answers];
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

// takes sorted array of bubbles
const chunkArray = (array, size) => {
  if (array.length <= size) {
    return [array];
  }
  return [array.slice(0, size), ...chunkArray(array.slice(size), size)];
};

const groupToQuestions = (outlines, optionCount) => {
  // TODO: knock out outliers w /out group
  const questions = chunkArray(outlines, optionCount);
  return questions;
};
