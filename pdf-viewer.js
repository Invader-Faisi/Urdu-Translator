
import * as pdfjsLib from "./lib/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL("lib/pdf.worker.mjs");

const fileInput = document.getElementById("pdfFile");
const container = document.getElementById("pdfContainer");
const status = document.getElementById("status");

const popup = document.getElementById("translationPopup");
const originalText = document.getElementById("originalText");
const translatedText = document.getElementById("translatedText");

// let hoverTimer = null;
let requestId = 0;
let lastText = "";
let currentDocument = null;


let currentScale = 1.0;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const ZOOM_STEP = 0.25;

let renderVersion = 0;



const zoomInButton = document.getElementById("zoomIn");
const zoomOutButton = document.getElementById("zoomOut");
const resetZoomButton = document.getElementById("resetZoom");
const zoomLevel = document.getElementById("zoomLevel");

function updateZoom() {
    zoomLevel.textContent =
        `${Math.round(currentScale * 100)}%`;

    zoomOutButton.disabled = currentScale <= MIN_SCALE;
    zoomInButton.disabled = currentScale >= MAX_SCALE;

    if (currentDocument) {
        renderAllPages();
    }
}

zoomInButton.addEventListener("click", () => {
    currentScale = Math.min(
        MAX_SCALE,
        currentScale + ZOOM_STEP
    );

    updateZoom();
});

zoomOutButton.addEventListener("click", () => {
    currentScale = Math.max(
        MIN_SCALE,
        currentScale - ZOOM_STEP
    );

    updateZoom();
});

resetZoomButton.addEventListener("click", () => {
    currentScale = 1.0;
    updateZoom();
});

updateZoom();


// Load a PDF selected from the computer
fileInput.addEventListener("change", async event => {
    const file = event.target.files[0];

    if (!file) return;

    if (file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")) {
        status.textContent = "Please select a PDF file.";
        return;
    }

    try {
        status.textContent = "Loading PDF...";

        container.innerHTML = "";
        hidePopup();

        const buffer = await file.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer)
        });

        currentDocument = await loadingTask.promise;

        status.textContent =
            `${file.name} | ${currentDocument.numPages} pages`;

        // Render all pages
        currentScale = 1.0;
        updateZoom();

    } catch (error) {
        console.error(error);
        status.textContent = "Unable to load PDF.";
    }
});


async function renderAllPages() {
    if (!currentDocument) return;

    const version = ++renderVersion;

    container.innerHTML = "";

    const totalPages = currentDocument.numPages;

    for (let pageNumber = 1;
         pageNumber <= totalPages;
         pageNumber++) {

        if (version !== renderVersion) return;

        await renderPage(
            pageNumber,
            currentScale,
            version
        );
    }
}


// Render an individual PDF page

async function renderPage(pageNumber, scale, version) {

    const page = await currentDocument.getPage(pageNumber);

    // Stop if a newer rendering operation has started
    if (version !== renderVersion) return;

    const viewport = page.getViewport({ scale });

    const pageWrapper = document.createElement("div");
    pageWrapper.className = "pdf-page";

    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");

    const context = canvas.getContext("2d");
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);

    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    pageWrapper.appendChild(canvas);

    // Create selectable text layer
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

    // Render PDF graphics
    await page.render({
        canvasContext: context,
        viewport: viewport,
        transform: outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : null
    }).promise;

    // Check again after canvas rendering
    if (version !== renderVersion) {
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

    // Final version check
    if (version !== renderVersion) {
        pageWrapper.remove();
        return;
    }
}


// Extract word underneath cursor
function getWordAtPoint(x, y) {

    let range = null;

    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);

    } else if (document.caretPositionFromPoint) {

        const position = document.caretPositionFromPoint(x, y);

        if (position) {
            range = document.createRange();

            range.setStart(
                position.offsetNode,
                position.offset
            );

            range.collapse(true);
        }
    }

    if (!range) return null;

    const node = range.startContainer;

    if (node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent;
    const offset = range.startOffset;

    const pattern =
        /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

    for (const match of text.matchAll(pattern)) {

        const start = match.index;
        const end = start + match[0].length;

        if (offset >= start && offset < end) {
            return match[0];
        }
    }

    return null;
}

// Display popup
function showPopup(x, y) {

    popup.classList.add("visible");

    const margin = 12;

    const width = popup.offsetWidth;
    const height = popup.offsetHeight;

    const left = Math.max(
        margin,
        Math.min(x + 12, window.innerWidth - width - margin)
    );

    const top = Math.max(
        margin,
        Math.min(y + 18, window.innerHeight - height - margin)
    );

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

// Hide popup
function hidePopup() {
    popup.classList.remove("visible");
    lastText = "";
    requestId++;
}

// Translate selected text or word
function translate(text, x, y) {

    text = text.trim();

    if (!text || text === lastText) return;

    if (text.length > 5000) {
        originalText.textContent = text.slice(0, 150) + "...";
        translatedText.textContent =
            "Please select a shorter text.";
        showPopup(x, y);
        return;
    }

    lastText = text;

    const currentRequest = ++requestId;

    originalText.textContent = text;
    translatedText.textContent = "Translating...";

    showPopup(x, y);

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

            if (response && response.success) {
                translatedText.textContent =
                    response.translation;
            } else {
                translatedText.textContent =
                    response?.error || "Translation failed.";
            }
        }
    );
}

// Hover over PDF words
// container.addEventListener("mousemove", event => {

//     if (popup.contains(event.target)) return;

//     clearTimeout(hoverTimer);

//     hoverTimer = setTimeout(() => {

//         const word = getWordAtPoint(
//             event.clientX,
//             event.clientY
//         );

//         if (word && word.length > 1) {
//             translate(
//                 word,
//                 event.clientX,
//                 event.clientY
//             );
//         }

//     }, 600);
// });

// Select sentence or paragraph
container.addEventListener("mouseup", event => {

    if (popup.contains(event.target)) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text) {

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        translate(
            text,
            rect.left,
            rect.bottom
        );
    }
});

// Copy translation
document.getElementById("copyTranslation")
    .addEventListener("click", async () => {

        const text = translatedText.textContent;

        if (!text || text === "Translating...") return;

        try {
            await navigator.clipboard.writeText(text);

            document.getElementById("copyTranslation")
                .textContent = "Copied!";

            setTimeout(() => {
                document.getElementById("copyTranslation")
                    .textContent = "Copy";
            }, 1200);

        } catch (error) {
            console.error("Copy failed:", error);
        }
    });

// Close popup
document.getElementById("closePopup")
    .addEventListener("click", hidePopup);

document.addEventListener("keydown", event => {
    if (event.key === "Escape") hidePopup();
});
