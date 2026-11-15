let extensionEnabled = true;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ extensionEnabled: true });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleState") {
    extensionEnabled = request.state;
    chrome.storage.local.set({ extensionEnabled });
    sendResponse({ status: "success", extensionEnabled });
  } else if (request.action === "getState") {
    chrome.storage.local.get(["extensionEnabled"], (data) => {
      sendResponse({ extensionEnabled: data.extensionEnabled ?? true });
    });
    return true;
  } else if (request.action === "openPdfViewer") {
    let viewerUrl = chrome.runtime.getURL("pdf-viewer.html?file=" + encodeURIComponent(request.fileUrl));
    chrome.tabs.create({ url: viewerUrl });
    sendResponse({ status: "opened" });
  }
});
