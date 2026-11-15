document.addEventListener('DOMContentLoaded', async () => {
  const toggleSwitch = document.getElementById('toggle-switch');
  const statusText = document.getElementById('status-text');
  const openPdfBtn = document.getElementById('open-pdf-btn');
  const localPdfInput = document.getElementById('local-pdf-input');

  // Fetch current toggle state
  chrome.runtime.sendMessage({ action: "getState" }, (response) => {
    if (response) {
      toggleSwitch.checked = response.extensionEnabled;
      statusText.textContent = response.extensionEnabled ? "Extension Enabled" : "Extension Disabled";
    }
  });

  toggleSwitch.addEventListener('change', () => {
    const state = toggleSwitch.checked;
    statusText.textContent = state ? "Extension Enabled" : "Extension Disabled";
    chrome.runtime.sendMessage({ action: "toggleState", state });
  });

  // Handle Open PDF button click
  openPdfBtn.addEventListener('click', () => {
    localPdfInput.click();
  });

  localPdfInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      const fileReader = new FileReader();
      fileReader.onload = function () {
        const blobUrl = URL.createObjectURL(file);
        chrome.runtime.sendMessage({ action: "openPdfViewer", fileUrl: blobUrl });
      };
      fileReader.readAsDataURL(file);
    }
  });
});
