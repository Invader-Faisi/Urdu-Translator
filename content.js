// Prevent duplicate initialization if loaded multiple times in the PDF viewer tab
if (!document.getElementById("en-ur-translator-popup")) {
  // Create the top-right translation popup container once
  const popup = document.createElement("div");
  popup.id = "en-ur-translator-popup";
  popup.innerHTML = `
    <div id="en-ur-popup-header">
      <span>English → Urdu Translation</span>
      <button id="en-ur-close-btn" title="Close">&times;</button>
    </div>
    <div id="en-ur-translated-text">Translating...</div>
  `;
  document.body.appendChild(popup);

  const textContainer = document.getElementById("en-ur-translated-text");
  const closeBtn = document.getElementById("en-ur-close-btn");

  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  // Listen for text selection across web pages and the local PDF viewer
  document.addEventListener("mouseup", (event) => {
    // Ignore clicks inside the popup itself
    if (popup.contains(event.target)) return;

    const selectedText = window.getSelection().toString().trim();

    if (selectedText.length > 0) {
      popup.style.display = "block";
      textContainer.innerText = "Translating...";

      document.addEventListener("mouseup", (event) => {
    if (popup.contains(event.target)) return;

    const selectedText = window.getSelection().toString().trim();

    if (selectedText.length > 0) {
      popup.style.display = "block";
      textContainer.innerText = "Translating...";

      // Safely check if the extension context is still valid before sending message
      try {
        if (!chrome.runtime?.id) {
          textContainer.innerText = "Extension updated. Please refresh this page.";
          return;
        }

        chrome.runtime.sendMessage(
          { action: "translate", text: selectedText },
          (response) => {
            if (chrome.runtime.lastError) {
              textContainer.innerText = "Extension context invalidated. Please refresh the page.";
              return;
            }
            if (response && response.success) {
              textContainer.innerText = response.translation;
            } else {
              textContainer.innerText = "Translation failed. Check your connection.";
            }
          }
        );
      } catch (err) {
        textContainer.innerText = "Extension updated. Please refresh the page.";
      }
    }
  });
    }
  });
}