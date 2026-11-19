import * as pdfjsLib from "./pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "./pdf.worker.mjs",
  import.meta.url
).href;

const CONFIG = {
  INITIAL_SCALE: 1.15,
  MIN_SCALE: 0.5,
  MAX_SCALE: 3.0,
  ZOOM_STEP: 0.15,

  // Pages within this distance are eligible for rendering.
  OBSERVER_MARGIN: "1200px 0px",

  // Release rendered pages farther away than this.
  RELEASE_DISTANCE: 3,

  // Maximum simultaneous canvas rendering operations.
  MAX_CONCURRENT_RENDERS: 3,

  DEVICE_PIXEL_RATIO_LIMIT: 2
};

const elements = {
  fileInput: document.getElementById("file-input"),

  container: document.getElementById("pdf-container"),
  welcome: document.getElementById("welcome-screen"),

  loading: document.getElementById("loading-indicator"),
  loadingMessage: document.getElementById("loading-message"),
  error: document.getElementById("error-message"),

  currentPage: document.getElementById("page-input"),
  totalPages: document.getElementById("total-pages"),

  previous: document.getElementById("previous-page-btn"),
  next: document.getElementById("next-page-btn"),
  go: document.getElementById("go-btn"),

  zoomIn: document.getElementById("zoom-in-btn"),
  zoomOut: document.getElementById("zoom-out-btn"),
  fitWidth: document.getElementById("fit-width-btn"),
  zoomLevel: document.getElementById("zoom-level"),

  documentName: document.getElementById("document-name"),
  renderStatus: document.getElementById("render-status")
};

let pdfDocument = null;
let loadingTask = null;

let currentScale = CONFIG.INITIAL_SCALE;
let currentPageNumber = 1;

let pageRecords = new Map();

let intersectionObserver = null;
let activeRenderCount = 0;
let renderQueue = [];

let renderGeneration = 0;
let scrollFrame = null;
let isLoadingDocument = false;

/* -------------------------------------------------------
   UI HELPERS
------------------------------------------------------- */

function showLoading(message) {
  elements.loadingMessage.textContent = message;
  elements.loading.hidden = false;
}

function hideLoading() {
  elements.loading.hidden = true;
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function clearError() {
  elements.error.textContent = "";
  elements.error.hidden = true;
}

function setControlsEnabled(enabled) {
  [
    elements.currentPage,
    elements.previous,
    elements.next,
    elements.go,
    elements.zoomIn,
    elements.zoomOut,
    elements.fitWidth
  ].forEach(element => {
    element.disabled = !enabled;
  });
}

function updateZoomLabel() {
  elements.zoomLevel.textContent =
    `${Math.round(currentScale * 100)}%`;
}

function updatePageControls() {
  if (!pdfDocument) return;

  elements.currentPage.value = currentPageNumber;

  elements.currentPage.max = pdfDocument.numPages;
  elements.totalPages.textContent = pdfDocument.numPages;

  elements.previous.disabled = currentPageNumber <= 1;
  elements.next.disabled =
    currentPageNumber >= pdfDocument.numPages;
}

/* -------------------------------------------------------
   RENDER QUEUE
------------------------------------------------------- */

function acquireRenderSlot() {
  if (activeRenderCount < CONFIG.MAX_CONCURRENT_RENDERS) {
    activeRenderCount++;
    return Promise.resolve();
  }

  return new Promise(resolve => {
    renderQueue.push(resolve);
  });
}

function releaseRenderSlot() {
  activeRenderCount = Math.max(0, activeRenderCount - 1);

  const next = renderQueue.shift();

  if (next) {
    activeRenderCount++;
    next();
  }
}

/* -------------------------------------------------------
   DOCUMENT LOADING
------------------------------------------------------- */

elements.fileInput.addEventListener("change", async event => {
  const file = event.target.files?.[0];

  if (!file) return;

  if (file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")) {
    showError("Please select a valid PDF file.");
    return;
  }

  await openPDF(file);

  // Allow the same file to be selected again.
  elements.fileInput.value = "";
});

async function openPDF(file) {
  if (isLoadingDocument) return;

  isLoadingDocument = true;

  clearError();
  showLoading("Opening your document...");

  elements.welcome.hidden = true;
  elements.container.hidden = true;

  try {
    await disposeCurrentDocument();

    currentScale = CONFIG.INITIAL_SCALE;
    currentPageNumber = 1;

    updateZoomLabel();

    const buffer = await file.arrayBuffer();

    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true
    });

    pdfDocument = await loadingTask.promise;

    elements.documentName.textContent = file.name;

    elements.totalPages.textContent = pdfDocument.numPages;

    elements.container.hidden = false;

    setControlsEnabled(true);

    showLoading("Preparing page layout...");

    await createPagePlaceholders();

    setupIntersectionObserver();

    currentPageNumber = 1;
    updatePageControls();

    elements.container.scrollTop = 0;

    elements.renderStatus.textContent =
      `${pdfDocument.numPages} pages`;

    hideLoading();

    scheduleVisibleRenders();

  } catch (error) {
    console.error("PDF loading error:", error);

    hideLoading();

    showError(
      "Unable to open this PDF. It may be damaged, encrypted, or unsupported."
    );

    elements.welcome.hidden = false;
    elements.container.hidden = true;

    setControlsEnabled(false);

  } finally {
    isLoadingDocument = false;
  }
}

/* -------------------------------------------------------
   DOCUMENT CLEANUP
------------------------------------------------------- */

async function disposeCurrentDocument() {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }

  renderGeneration++;

  for (const record of pageRecords.values()) {
    if (record.renderTask) {
      try {
        record.renderTask.cancel();
      } catch (_) {
        // The task may already be complete.
      }
    }

    record.wrapper.remove();
  }

  pageRecords.clear();

  elements.container.innerHTML = "";

  if (loadingTask) {
    try {
      await loadingTask.destroy();
    } catch (_) {
      // Ignore cleanup errors.
    }
  } else if (pdfDocument) {
    try {
      await pdfDocument.destroy();
    } catch (_) {
      // Ignore cleanup errors.
    }
  }

  pdfDocument = null;
  loadingTask = null;
}

/* -------------------------------------------------------
   PAGE PLACEHOLDERS
------------------------------------------------------- */

async function createPagePlaceholders() {
  elements.container.innerHTML = "";

  pageRecords.clear();

  const totalPages = pdfDocument.numPages;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const page = await pdfDocument.getPage(pageNumber);

    const baseViewport = page.getViewport({
      scale: 1
    });

    const wrapper = document.createElement("article");

    wrapper.className = "page-wrapper";
    wrapper.id = `page-${pageNumber}`;

    wrapper.dataset.pageNumber = pageNumber;

    const placeholder = document.createElement("div");

    placeholder.className = "page-placeholder";
    placeholder.textContent = `Page ${pageNumber}`;

    wrapper.appendChild(placeholder);

    const record = {
      pageNumber,
      wrapper,
      baseViewport,

      rendered: false,
      renderTask: null,
      renderPromise: null,

      token: 0,
      canvas: null,
      textLayer: null
    };

    pageRecords.set(pageNumber, record);

    updatePageDimensions(record);

    elements.container.appendChild(wrapper);

    // Only the dimensions are needed at this stage.
    // No canvas or text layer is rendered here.
    page.cleanup();
  }

  elements.renderStatus.textContent =
    `${totalPages} pages ready`;
}

function updatePageDimensions(record) {
  const width = record.baseViewport.width * currentScale;
  const height = record.baseViewport.height * currentScale;

  record.wrapper.style.width = `${width}px`;
  record.wrapper.style.height = `${height}px`;
}

/* -------------------------------------------------------
   INTERSECTION OBSERVER
------------------------------------------------------- */

function setupIntersectionObserver() {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }

  intersectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const pageNumber = Number(
        entry.target.dataset.pageNumber
      );

      const record = pageRecords.get(pageNumber);

      if (!record) return;

      if (entry.isIntersecting) {
        renderPage(pageNumber);
      } else {
        releaseIfFarAway(record);
      }
    });
  }, {
    root: null,
    rootMargin: CONFIG.OBSERVER_MARGIN,
    threshold: 0.01
  });

  pageRecords.forEach(record => {
    intersectionObserver.observe(record.wrapper);
  });
}

/* -------------------------------------------------------
   LAZY PAGE RENDERING
------------------------------------------------------- */

async function renderPage(pageNumber) {
  const record = pageRecords.get(pageNumber);

  if (!record || !pdfDocument) return;

  if (record.rendered || record.renderPromise) {
    return record.renderPromise;
  }

  const generation = renderGeneration;
  const token = record.token;

  record.renderPromise = (async () => {
    let slotAcquired = false;

    try {
      await acquireRenderSlot();
      slotAcquired = true;

      if (
        !pdfDocument ||
        generation !== renderGeneration ||
        token !== record.token
      ) {
        return;
      }

      const page = await pdfDocument.getPage(pageNumber);

      if (
        generation !== renderGeneration ||
        token !== record.token
      ) {
        return;
      }

      const viewport = page.getViewport({
        scale: currentScale
      });

      const outputScale = Math.min(
        window.devicePixelRatio || 1,
        CONFIG.DEVICE_PIXEL_RATIO_LIMIT
      );

      const canvas = document.createElement("canvas");

      const context = canvas.getContext("2d", {
        alpha: false
      });

      if (!context) {
        throw new Error("Unable to create canvas context.");
      }

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);

      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      canvas.className = "pdf-canvas";

      const textLayerDiv = document.createElement("div");

      textLayerDiv.className = "textLayer";

      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      textLayerDiv.style.setProperty(
        "--scale-factor",
        viewport.scale
      );

      // Remove the placeholder only when actual rendering starts.
      record.wrapper.innerHTML = "";

      record.wrapper.appendChild(canvas);
      record.wrapper.appendChild(textLayerDiv);

      record.canvas = canvas;
      record.textLayer = textLayerDiv;

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : null
      });

      record.renderTask = renderTask;

      await renderTask.promise;

      if (
        generation !== renderGeneration ||
        token !== record.token
      ) {
        return;
      }

      // Text is extracted only when the page is rendered.
      const textContent = await page.getTextContent();

      if (
        generation !== renderGeneration ||
        token !== record.token
      ) {
        return;
      }

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      });

      await textLayer.render();

      if (
        generation !== renderGeneration ||
        token !== record.token
      ) {
        return;
      }

      record.rendered = true;

      elements.renderStatus.textContent =
        `Page ${pageNumber} rendered`;

    } catch (error) {
      if (error?.name !== "RenderingCancelledException" &&
          error?.name !== "AbortException") {
        console.error(
          `Error rendering page ${pageNumber}:`,
          error
        );

        showPageError(record);
      }

    } finally {
      record.renderTask = null;
      record.renderPromise = null;

      if (slotAcquired) {
        releaseRenderSlot();
      }
    }
  })();

  return record.renderPromise;
}

function showPageError(record) {
  record.wrapper.innerHTML = "";

  const message = document.createElement("div");

  message.className = "page-error";
  message.textContent =
    `Unable to render page ${record.pageNumber}`;

  record.wrapper.appendChild(message);

  record.rendered = false;
}

/* -------------------------------------------------------
   PAGE MEMORY CLEANUP
------------------------------------------------------- */

function releaseIfFarAway(record) {
  if (!record.rendered && !record.renderPromise) {
    return;
  }

  const rect = record.wrapper.getBoundingClientRect();

  const distance = Math.max(
    -rect.bottom,
    rect.top - window.innerHeight,
    0
  );

  const releaseThreshold =
    window.innerHeight * CONFIG.RELEASE_DISTANCE;

  if (distance > releaseThreshold) {
    releasePage(record);
  }
}

function releasePage(record) {
  record.token++;

  if (record.renderTask) {
    try {
      record.renderTask.cancel();
    } catch (_) {
      // Ignore already completed tasks.
    }
  }

  if (record.renderPromise) {
    return;
  }

  record.canvas = null;
  record.textLayer = null;

  record.wrapper.innerHTML = "";

  const placeholder = document.createElement("div");

  placeholder.className = "page-placeholder";
  placeholder.textContent = `Page ${record.pageNumber}`;

  record.wrapper.appendChild(placeholder);

  record.rendered = false;
}

function releaseDistantPages() {
  pageRecords.forEach(record => {
    releaseIfFarAway(record);
  });
}

/* -------------------------------------------------------
   VISIBLE PAGE RENDER SCHEDULING
------------------------------------------------------- */

function scheduleVisibleRenders() {
  if (!pdfDocument) return;

  pageRecords.forEach(record => {
    const rect = record.wrapper.getBoundingClientRect();

    const margin = window.innerHeight * 1.5;

    const nearViewport =
      rect.bottom >= -margin &&
      rect.top <= window.innerHeight + margin;

    if (nearViewport && !record.rendered) {
      renderPage(record.pageNumber);
    }
  });
}

/* -------------------------------------------------------
   CURRENT PAGE TRACKING
------------------------------------------------------- */

function updateCurrentPage() {
  if (!pdfDocument) return;

  const viewportCenter = window.innerHeight / 2;

  let closestPage = currentPageNumber;
  let closestDistance = Infinity;

  pageRecords.forEach(record => {
    const rect = record.wrapper.getBoundingClientRect();

    const pageCenter = rect.top + rect.height / 2;

    const distance = Math.abs(
      pageCenter - viewportCenter
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = record.pageNumber;
    }
  });

  currentPageNumber = closestPage;

  updatePageControls();
}

window.addEventListener("scroll", () => {
  if (scrollFrame) return;

  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;

    updateCurrentPage();
    releaseDistantPages();
    scheduleVisibleRenders();
  });
}, { passive: true });

/* -------------------------------------------------------
   PAGE NAVIGATION
------------------------------------------------------- */

function goToPage(pageNumber) {
  if (!pdfDocument) return;

  const target = Number(pageNumber);

  if (
    !Number.isInteger(target) ||
    target < 1 ||
    target > pdfDocument.numPages
  ) {
    showError(
      `Enter a page number between 1 and ${pdfDocument.numPages}.`
    );

    return;
  }

  clearError();

  currentPageNumber = target;

  const record = pageRecords.get(target);

  if (!record) return;

  renderPage(target);

  record.wrapper.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  updatePageControls();
}

elements.go.addEventListener("click", () => {
  goToPage(elements.currentPage.value);
});

elements.currentPage.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    goToPage(elements.currentPage.value);
  }
});

elements.previous.addEventListener("click", () => {
  if (currentPageNumber > 1) {
    goToPage(currentPageNumber - 1);
  }
});

elements.next.addEventListener("click", () => {
  if (pdfDocument &&
      currentPageNumber < pdfDocument.numPages) {
    goToPage(currentPageNumber + 1);
  }
});

/* -------------------------------------------------------
   ZOOM
------------------------------------------------------- */

elements.zoomIn.addEventListener("click", () => {
  changeZoom(CONFIG.ZOOM_STEP);
});

elements.zoomOut.addEventListener("click", () => {
  changeZoom(-CONFIG.ZOOM_STEP);
});

async function changeZoom(amount) {
  if (!pdfDocument) return;

  const newScale = Math.min(
    CONFIG.MAX_SCALE,
    Math.max(
      CONFIG.MIN_SCALE,
      currentScale + amount
    )
  );

  await applyZoom(newScale);
}

async function applyZoom(newScale) {
  if (!pdfDocument || newScale === currentScale) return;

  const activeRecord = pageRecords.get(currentPageNumber);

  const oldTop = activeRecord
    ? activeRecord.wrapper.getBoundingClientRect().top
    : 0;

  renderGeneration++;

  const pendingRenders = [];

  pageRecords.forEach(record => {
    if (record.renderTask) {
      try {
        record.renderTask.cancel();
      } catch (_) {
        // Ignore completed tasks.
      }
    }

    if (record.renderPromise) {
      pendingRenders.push(record.renderPromise);
    }
  });

  await Promise.allSettled(pendingRenders);

  currentScale = newScale;

  pageRecords.forEach(record => {
    releasePage(record);
    updatePageDimensions(record);
  });

  updateZoomLabel();

  if (activeRecord) {
    const newTop =
      activeRecord.wrapper.getBoundingClientRect().top;

    window.scrollBy({
      top: newTop - oldTop,
      behavior: "instant"
    });
  }

  scheduleVisibleRenders();
}

/* -------------------------------------------------------
   FIT WIDTH
------------------------------------------------------- */

elements.fitWidth.addEventListener("click", async () => {
  if (!pdfDocument) return;

  const record = pageRecords.get(currentPageNumber);

  if (!record) return;

  const availableWidth = Math.max(
    300,
    window.innerWidth - 100
  );

  const fittedScale =
    availableWidth / record.baseViewport.width;

  const finalScale = Math.min(
    CONFIG.MAX_SCALE,
    Math.max(CONFIG.MIN_SCALE, fittedScale)
  );

  await applyZoom(finalScale);
});

/* -------------------------------------------------------
   KEYBOARD SHORTCUTS
------------------------------------------------------- */

document.addEventListener("keydown", event => {
  if (!pdfDocument) return;

  const target = event.target;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  if (event.ctrlKey && event.key === "+") {
    event.preventDefault();
    changeZoom(CONFIG.ZOOM_STEP);
  }

  if (event.ctrlKey && event.key === "-") {
    event.preventDefault();
    changeZoom(-CONFIG.ZOOM_STEP);
  }

  if (event.key === "PageDown") {
    goToPage(
      Math.min(pdfDocument.numPages, currentPageNumber + 1)
    );
  }

  if (event.key === "PageUp") {
    goToPage(
      Math.max(1, currentPageNumber - 1)
    );
  }
});

/* -------------------------------------------------------
   DRAG AND DROP
------------------------------------------------------- */

document.addEventListener("dragover", event => {
  event.preventDefault();
});

document.addEventListener("drop", async event => {
  event.preventDefault();

  const file = event.dataTransfer?.files?.[0];

  if (!file) return;

  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    await openPDF(file);
  } else {
    showError("Please drop a PDF document.");
  }
});

/* -------------------------------------------------------
   INITIAL STATE
------------------------------------------------------- */

setControlsEnabled(false);
updateZoomLabel();

elements.container.hidden = true;
elements.welcome.hidden = false;

window.addEventListener("beforeunload", () => {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }

  pageRecords.forEach(record => {
    if (record.renderTask) {
      try {
        record.renderTask.cancel();
      } catch (_) {}
    }
  });
});