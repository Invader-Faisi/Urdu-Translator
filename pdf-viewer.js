import * as pdfjsLib from './lib/pdf.mjs';

// Set worker path explicitly for extension security boundaries
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');

let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
const scale = 1.5;

const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');

// Extract file query parameter from URL
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const fileUrl = urlParams.get('file');

if (!fileUrl) {
  alert("No PDF file specified.");
} else {
  loadPDF(decodeURIComponent(fileUrl));
}

function loadPDF(url) {
  pdfjsLib.getDocument(url).promise.then((pdfDoc_) => {
    pdfDoc = pdfDoc_;
    document.getElementById('page-count').textContent = pdfDoc.numPages;
    renderPage(pageNum);
  }).catch(err => {
    console.error("Error loading PDF:", err);
    alert("Failed to load PDF file.");
  });
}

function renderPage(num) {
  pageRendering = true;
  pdfDoc.getPage(num).then((page) => {
    const viewport = page.getViewport({ scale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    const renderTask = page.render(renderContext);
    renderTask.promise.then(() => {
      pageRendering = false;
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });

  document.getElementById('page-num').textContent = num;
}

function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

document.getElementById('prev-page').addEventListener('click', () => {
  if (pageNum <= 1) return;
  pageNum--;
  queueRenderPage(pageNum);
});

document.getElementById('next-page').addEventListener('click', () => {
  if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
  pageNum++;
  queueRenderPage(pageNum);
});

// Enable text highlighting translation inside the viewer canvas wrapper
document.addEventListener('mouseup', async () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    // Re-use selection translation logic seamlessly inside viewer pages
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=en|ur`);
    const data = await res.json();
    const translation = data?.responseData?.translatedText || "ترجمہ دستیاب نہیں ہے";
    
    // Log or output translation (can be attached to a floating card if desired)
    console.log("Urdu Translation:", translation);
  }
});
