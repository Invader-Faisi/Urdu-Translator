
import * as pdfjsLib from "./lib/pdf.mjs";

// ======================================================
// PDF.JS CONFIGURATION
// ======================================================

pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL("lib/pdf.worker.mjs");

// ======================================================
// DOM ELEMENTS
// ======================================================

const fileInput = document.getElementById("pdfFile");

const container = document.getElementById("pdfContainer");

const status = document.getElementById("status");

// Translation popup
const popup = document.getElementById("translationPopup");

const originalText = document.getElementById("originalText");

const translatedText = document.getElementById("translatedText");

const closePopupButton =
    document.getElementById("closePopup");

const copyButton =
    document.getElementById("copyTranslation");

// Page navigation
const previousPageButton =
    document.getElementById("previousPage");

const nextPageButton =
    document.getElementById("nextPage");

const goToPageButton =
    document.getElementById("goToPage");

const pageNumberInput =
    document.getElementById("pageNumber");

const totalPagesLabel =
    document.getElementById("totalPages");

// Zoom
const zoomInButton =
    document.getElementById("zoomIn");

const zoomOutButton =
    document.getElementById("zoomOut");

const resetZoomButton =
    document.getElementById("resetZoom");

const zoomLevel =
    document.getElementById("zoomLevel");

// ======================================================
// GLOBAL VARIABLES
// ======================================================

let currentDocument = null;

let currentScale = 1.0;

let currentPageNumber = 1;

let requestId = 0;

let lastText = "";

let renderVersion = 0;

let pageObserver = null;

const MIN_SCALE = 0.5;

const MAX_SCALE = 3.0;

const ZOOM_STEP = 0.25;

// ======================================================
// PDF PAGE NAVIGATION
// ======================================================

function updatePageControls() {

    if (!currentDocument) return;

    const total = currentDocument.numPages;

    pageNumberInput.value = currentPageNumber;

    totalPagesLabel.textContent = `of ${total}`;

    previousPageButton.disabled =
        currentPageNumber <= 1;

    nextPageButton.disabled =
        currentPageNumber >= total;

    pageNumberInput.disabled = false;

    goToPageButton.disabled = false;
}

// ------------------------------------------------------
// Navigate to a particular page
// ------------------------------------------------------

function goToPage(pageNumber) {

    if (!currentDocument) return;

    const totalPages = currentDocument.numPages;

    const requestedPage = Number(pageNumber);

    if (
        !Number.isInteger(requestedPage) ||
        requestedPage < 1 ||
        requestedPage > totalPages
    ) {
        status.textContent =
            `Enter a page number between 1 and ${totalPages}.`;

        pageNumberInput.value = currentPageNumber;

        return;
    }

    const pageElement = container.querySelector(
        `.pdf-page[data-page-number="${requestedPage}"]`
    );

    if (!pageElement) return;

    currentPageNumber = requestedPage;

    pageElement.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    updatePageControls();

    status.textContent =
        `Page ${requestedPage} of ${totalPages}`;
}

// Go button
goToPageButton.addEventListener("click", () => {
    goToPage(pageNumberInput.value);
});

// Enter key
pageNumberInput.addEventListener("keydown", event => {

    if (event.key === "Enter") {
        goToPage(pageNumberInput.value);
    }

});

// Previous page
previousPageButton.addEventListener("click", () => {

    if (currentPageNumber > 1) {
        goToPage(currentPageNumber - 1);
    }

});

// Next page
nextPageButton.addEventListener("click", () => {

    if (
        currentDocument &&
        currentPageNumber < currentDocument.numPages
    ) {
        goToPage(currentPageNumber + 1);
    }

});

// ======================================================
// AUTOMATIC CURRENT PAGE DETECTION
// ======================================================

function observePDFPages() {

    if (pageObserver) {
        pageObserver.disconnect();
    }

    pageObserver = new IntersectionObserver(
        entries => {

            // Select the most visible page
            const visiblePages = entries
                .filter(entry => entry.isIntersecting)
                .sort(
                    (a, b) =>
                        b.intersectionRatio -
                        a.intersectionRatio
                );

            if (visiblePages.length > 0) {

                const pageNumber = Number(
                    visiblePages[0].target.dataset.pageNumber
                );

                if (pageNumber) {

                    currentPageNumber = pageNumber;

                    updatePageControls();
                }
            }

        },
        {
            root: null,
            threshold: [0.1, 0.25, 0.5, 0.75, 1]
        }
    );

    container.querySelectorAll(".pdf-page").forEach(page => {
        pageObserver.observe(page);
    });
}

// ======================================================
// PDF LOADING
// ======================================================

fileInput.addEventListener("change", async event => {

    const file = event.target.files[0];

    if (!file) return;

    if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
    ) {
        status.textContent = "Please select a PDF file.";
        return;
    }

    try {

        status.textContent = "Loading PDF...";

        hidePopup();

        if (pageObserver) {
            pageObserver.disconnect();
            pageObserver = null;
        }

        renderVersion++;

        container.innerHTML = "";

        currentDocument = null;

        currentPageNumber = 1;

        const buffer = await file.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer)
        });

        const loadedDocument = await loadingTask.promise;

        currentDocument = loadedDocument;

        status.textContent =
            `${file.name} | ${currentDocument.numPages} pages`;

        // Reset zoom
        currentScale = 1.0;

        currentPageNumber = 1;

        updateZoomControls();

        updatePageControls();

        await renderAllPages();

    } catch (error) {

        console.error("PDF loading error:", error);

        status.textContent = "Unable to load PDF.";

    }

});

// ======================================================
// RENDER ALL PDF PAGES
// ======================================================

async function renderAllPages() {

    if (!currentDocument) return;

    const version = ++renderVersion;

    const documentToRender = currentDocument;

    const pageToRestore = currentPageNumber;

    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
    }

    container.innerHTML = "";

    const totalPages = documentToRender.numPages;

    for (
        let pageNumber = 1;
        pageNumber <= totalPages;
        pageNumber++
    ) {

        if (
            version !== renderVersion ||
            documentToRender !== currentDocument
        ) {
            return;
        }

        await renderPage(
            pageNumber,
            currentScale,
            version,
            documentToRender
        );
    }

    if (version !== renderVersion) return;

    // Observe pages for current-page detection
    observePDFPages();

    // Restore previous page after zooming
    const targetPage = container.querySelector(
        `.pdf-page[data-page-number="${pageToRestore}"]`
    );

    if (targetPage) {

        targetPage.scrollIntoView({
            behavior: "auto",
            block: "start"
        });

    }

    updatePageControls();
}

// ======================================================
// RENDER INDIVIDUAL PDF PAGE
// ======================================================

async function renderPage(
    pageNumber,
    scale,
    version,
    documentToRender
) {

    const page = await documentToRender.getPage(pageNumber);

    if (
        version !== renderVersion ||
        documentToRender !== currentDocument
    ) {
        return;
    }

    const viewport = page.getViewport({
        scale: scale
    });

    const pageWrapper = document.createElement("div");

    pageWrapper.className = "pdf-page";

    pageWrapper.dataset.pageNumber = pageNumber;

    pageWrapper.style.width = `${viewport.width}px`;

    pageWrapper.style.height = `${viewport.height}px`;

    // Canvas
    const canvas = document.createElement("canvas");

    const context = canvas.getContext("2d");

    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(
        viewport.width * outputScale
    );

    canvas.height = Math.floor(
        viewport.height * outputScale
    );

    canvas.style.width = `${viewport.width}px`;

    canvas.style.height = `${viewport.height}px`;

    pageWrapper.appendChild(canvas);

    // Text layer
    const textLayerDiv = document.createElement("div");

    textLayerDiv.className = "textLayer";

    textLayerDiv.style.width = `${viewport.width}px`;

    textLayerDiv.style.height = `${viewport.height}px`;

    textLayerDiv.style.setProperty(
        "--scale-factor",
        viewport.scale
    );

    pageWrapper.appendChild(textLayerDiv);

    container.appendChild(pageWrapper);

    // Render page graphics
    const renderTask = page.render({

        canvasContext: context,

        viewport: viewport,

        transform: outputScale !== 1
            ? [
                outputScale,
                0,
                0,
                outputScale,
                0,
                0
            ]
            : null

    });

    await renderTask.promise;

    if (
        version !== renderVersion ||
        documentToRender !== currentDocument
    ) {
        pageWrapper.remove();
        return;
    }

    // Render selectable text
    const textLayer = new pdfjsLib.TextLayer({

        textContentSource: page.streamTextContent(),

        container: textLayerDiv,

        viewport: viewport

    });

    await textLayer.render();

    if (
        version !== renderVersion ||
        documentToRender !== currentDocument
    ) {
        pageWrapper.remove();
    }

}

// ======================================================
// ZOOM FUNCTIONALITY
// ======================================================

function updateZoomControls() {

    zoomLevel.textContent =
        `${Math.round(currentScale * 100)}%`;

    zoomOutButton.disabled =
        !currentDocument || currentScale <= MIN_SCALE;

    zoomInButton.disabled =
        !currentDocument || currentScale >= MAX_SCALE;

    resetZoomButton.disabled =
        !currentDocument;
}

zoomInButton.addEventListener("click", async () => {

    if (!currentDocument) return;

    currentScale = Math.min(
        MAX_SCALE,
        currentScale + ZOOM_STEP
    );

    updateZoomControls();

    await renderAllPages();

});

zoomOutButton.addEventListener("click", async () => {

    if (!currentDocument) return;

    currentScale = Math.max(
        MIN_SCALE,
        currentScale - ZOOM_STEP
    );

    updateZoomControls();

    await renderAllPages();

});

resetZoomButton.addEventListener("click", async () => {

    if (!currentDocument) return;

    currentScale = 1.0;

    updateZoomControls();

    await renderAllPages();

});

// ======================================================
// PDF TRANSLATION POPUP
// ======================================================

// Fixed top-right popup
function showPopup() {

    popup.classList.add("visible");

}

// Hide popup
function hidePopup() {

    popup.classList.remove("visible");

    requestId++;

    lastText = "";

}

// ======================================================
// TRANSLATE SELECTED PDF TEXT
// ======================================================

function translate(text) {

    text = text.trim();

    if (!text || text === lastText) return;

    if (text.length > 5000) {

        originalText.textContent =
            text.slice(0, 150) + "...";

        translatedText.textContent =
            "Please select a shorter text.";

        showPopup();

        return;
    }

    lastText = text;

    const currentRequest = ++requestId;

    originalText.textContent = text;

    translatedText.textContent = "Translating...";

    copyButton.textContent = "Copy";

    showPopup();

    chrome.runtime.sendMessage(
        {
            action: "translate",
            text: text
        },
        response => {

            if (currentRequest !== requestId) return;

            if (chrome.runtime.lastError) {

                translatedText.textContent =
                    "Translation service error.";

                return;
            }

            if (response?.success) {

                translatedText.textContent =
                    response.translation;

            } else {

                translatedText.textContent =
                    response?.error ||
                    "Translation failed.";

            }

        }
    );

}

// ======================================================
// SELECT TEXT FROM PDF
// ======================================================

container.addEventListener("mouseup", event => {

    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
        return;
    }

    // Ensure the selection belongs to the PDF text layer
    const anchorNode = selection.anchorNode;

    const focusNode = selection.focusNode;

    if (
        !anchorNode ||
        !focusNode ||
        !container.contains(anchorNode) ||
        !container.contains(focusNode)
    ) {
        return;
    }

    const selectedText = selection.toString().trim();

    if (!selectedText) return;

    translate(selectedText);

});

// ======================================================
// COPY TRANSLATION
// ======================================================

copyButton.addEventListener("click", async () => {

    const text = translatedText.textContent;

    if (
        !text ||
        text === "Translating..."
    ) {
        return;
    }

    try {

        await navigator.clipboard.writeText(text);

        copyButton.textContent = "Copied!";

        setTimeout(() => {
            copyButton.textContent = "Copy";
        }, 1200);

    } catch (error) {

        console.error("Copy failed:", error);

        copyButton.textContent = "Copy failed";

        setTimeout(() => {
            copyButton.textContent = "Copy";
        }, 1200);

    }

});

// ======================================================
// CLOSE POPUP
// ======================================================

closePopupButton.addEventListener(
    "click",
    hidePopup
);

document.addEventListener("keydown", event => {

    if (event.key === "Escape") {
        hidePopup();
    }

});

// ======================================================
// INITIALIZATION
// ======================================================

updateZoomControls();
