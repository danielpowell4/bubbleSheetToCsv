# bubbleSheetToCsv

Currently a WIP.

Goal is to detect bubbles, cast answers and export a JSON blob or CSV

Based on [pyimagesearch](https://www.pyimagesearch.com/2016/10/03/bubble-sheet-multiple-choice-scanner-and-test-grader-using-omr-python-and-opencv/) and other things around the web

# Get Started

- clone down repo
- cd on over
- run `python -m SimpleHTTPServer 8000`
- make edits to `/processImage.js`, refresh

# Working TODO list:

So far I’ve gotten:

- [x] upload image file
- [x] covert image to grey scale
- [x] slight blur
- [x] cut out piece of paper, transform to ideal rect
- [x] detect circles
- [x] reduce overlapping circles
- [x] cluster circles into question groups
- [x] cast each circle in group to darkness score
- [x] determine most bubbled based on ^^
- [x] paint chosen answer to canvas
- [x] determine the question number (currently assumed)
- [ ] ensure bubble sizing standardized
- [ ] remove outliers in clustering
- [ ] handle more complex sheets
- [ ] … all the other things :laughing:
