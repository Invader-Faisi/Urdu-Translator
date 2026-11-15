pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

let pdfDoc = null;
let pageViewports = [];
let currentScale = 1.5;

const container = document.getElementById('pdf-container');
const currentPageEl = document.getElementById('current-page');
const totalPagesEl = document.getElementById('total-pages');
const zoomLevelEl = document.getElementById('zoom-level');

// Load PDF from PC
document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.onload = async function () {
    const typedarray = new Uint8Array(this.result);
    pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
    totalPagesEl.textContent = pdfDoc.numPages;
    currentPageEl.textContent = 1;
    
    await initPagePlaceholders();
    setupIntersectionObserver();
  };
  fileReader.readAsArrayBuffer(file);
});

// Step 1: Create lightweight placeholders for all pages
async function initPagePlaceholders() {
  container.innerHTML = '';
  pageViewports = [];

  for (let num = 1; num <= pdfDoc.numPages; num++) {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: currentScale });
    pageViewports[num] = viewport;

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.id = `page-${num}`;
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    wrapper.dataset.pageNumber = num;
    wrapper.dataset.rendered = "false";
    
    wrapper.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #9ca3af; font-size: 14px; background: #ffffff;">Loading page ${num}...</div>`;
    container.appendChild(wrapper);
  }
}

// Step 2: Render individual page canvas and text layer on demand
async function renderPage(num) {
  const wrapper = document.getElementById(`page-${num}`);
  if (!wrapper) return;

  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: currentScale });
  pageViewports[num] = viewport;

  wrapper.style.width = `${viewport.width}px`;
  wrapper.style.height = `${viewport.height}px`;
  wrapper.dataset.rendered = "true";
  wrapper.innerHTML = ""; 

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  wrapper.appendChild(canvas);

  const textLayerDiv = document.createElement('div');
  textLayerDiv.className = 'textLayer';
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;
  
  // Crucial: Set the scale factor variable for PDF.js text alignment
  textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
  
  wrapper.appendChild(textLayerDiv);

  // Render visual canvas
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  // Render text layer
  const textContent = await page.getTextContent();
  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: viewport,
    textDivs: []
  });
  await textLayer.render();
}

// Step 3: Intersection Observer for lazy loading
function setupIntersectionObserver() {
  const observerOptions = {
    root: null,
    rootMargin: '300px 0px',
    threshold: 0.01
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const pageNum = parseInt(entry.target.dataset.pageNumber, 10);
        renderPage(pageNum);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.page-wrapper').forEach(wrapper => {
    observer.observe(wrapper);
  });
}

// Zoom In Control
document.getElementById('zoom-in-btn').addEventListener('click', async () => {
  if (!pdfDoc || currentScale >= 3.0) return;
  currentScale += 0.25;
  zoomLevelEl.textContent = `${Math.round(currentScale * 100)}%`;
  await refreshAllVisiblePages();
});

// Zoom Out Control
document.getElementById('zoom-out-btn').addEventListener('click', async () => {
  if (!pdfDoc || currentScale <= 0.75) return;
  currentScale -= 0.25;
  zoomLevelEl.textContent = `${Math.round(currentScale * 100)}%`;
  await refreshAllVisiblePages();
});

async function refreshAllVisiblePages() {
  for (let num = 1; num <= pdfDoc.numPages; num++) {
    const wrapper = document.getElementById(`page-${num}`);
    if (wrapper && wrapper.dataset.rendered === "true") {
      await renderPage(num);
    } else if (wrapper) {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: currentScale });
      pageViewports[num] = viewport;
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
    }
  }
}

// Jump to specified page number
document.getElementById('go-btn').addEventListener('click', async () => {
  const inputEl = document.getElementById('page-input');
  if (!inputEl || !pdfDoc) return;

  const targetPage = parseInt(inputEl.value, 10);
  if (targetPage >= 1 && targetPage <= pdfDoc.numPages) {
    await renderPage(targetPage);
    const targetWrapper = document.getElementById(`page-${targetPage}`);
    if (targetWrapper) {
      targetWrapper.scrollIntoView({ behavior: 'smooth' });
      currentPageEl.textContent = targetPage;
    }
  } else {
    alert(`Please enter a page number between 1 and ${pdfDoc.numPages}`);
  }
});

// Update current page number indicator while scrolling
window.addEventListener('scroll', () => {
  const pages = document.querySelectorAll('.page-wrapper');
  pages.forEach((page) => {
    const rect = page.getBoundingClientRect();
    if (rect.top >= -200 && rect.top <= 300) {
      currentPageEl.textContent = page.dataset.pageNumber;
    }
  });
});