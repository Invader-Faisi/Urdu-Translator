
document.getElementById("openPdf").addEventListener("click", () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("pdf-viewer.html")
    });
});
