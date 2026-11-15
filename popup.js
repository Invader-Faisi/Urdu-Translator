document.getElementById("open-pdf-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer/viewer.html") });
});