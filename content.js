(() => {
  "use strict";

  if (window.__enUrTranslatorInitialized) {
    return;
  }

  window.__enUrTranslatorInitialized = true;

  const POPUP_ID = "en-ur-translator-popup";

  let currentRequestId = 0;
  let lastRequestedText = "";
  let selectionTimer = null;

  const popup = document.createElement("section");

  popup.id = POPUP_ID;
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "English to Urdu translation");

  popup.innerHTML = `
    <div id="en-ur-popup-header">
      <div class="en-ur-brand">
        <span class="en-ur-brand-icon">ع</span>

        <div class="en-ur-brand-copy">
          <strong>Urdu Translator</strong>
          <small>English → Urdu</small>
        </div>
      </div>

      <div class="en-ur-header-actions">
        <button
          type="button"
          id="en-ur-copy-btn"
          title="Copy Urdu translation"
          aria-label="Copy translation"
        >⧉</button>

        <button
          type="button"
          id="en-ur-close-btn"
          title="Close translation"
          aria-label="Close"
        >×</button>
      </div>
    </div>

    <div class="en-ur-popup-body">
      <div class="en-ur-section-label">
        ORIGINAL TEXT
      </div>

      <div id="en-ur-original-text">
        Select text to translate.
      </div>

      <div class="en-ur-translation-heading">
        <span>اردو ترجمہ</span>
        <span class="en-ur-status" id="en-ur-status">
          READY
        </span>
      </div>

      <div
        id="en-ur-translated-text"
        dir="rtl"
        lang="ur"
      >
        یہاں اردو ترجمہ ظاہر ہوگا۔
      </div>
    </div>

    <div class="en-ur-popup-footer">
      <span>Powered by Urdu Translator</span>
      <span id="en-ur-copy-status"></span>
    </div>
  `;

  function initializePopup() {
    if (!document.body) {
      return;
    }

    if (!document.getElementById(POPUP_ID)) {
      document.body.appendChild(popup);
    }
  }

  initializePopup();

  const popupElement = document.getElementById(POPUP_ID);

  if (!popupElement) {
    return;
  }

  const originalElement =
    popupElement.querySelector("#en-ur-original-text");

  const translatedElement =
    popupElement.querySelector("#en-ur-translated-text");

  const statusElement =
    popupElement.querySelector("#en-ur-status");

  const copyButton =
    popupElement.querySelector("#en-ur-copy-btn");

  const closeButton =
    popupElement.querySelector("#en-ur-close-btn");

  const copyStatus =
    popupElement.querySelector("#en-ur-copy-status");

  function setStatus(message) {
    statusElement.textContent = message;
  }

  function closePopup() {
    lastRequestedText = "";
    popupElement.style.display = "none";
  }

  function showPopup() {
    popupElement.style.display = "block";
  }

  function getSelectedText() {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return "";
    }

    return selection.toString().trim();
  }

  function showTranslationError(message) {
    translatedElement.textContent = message;
    setStatus("ERROR");
  }

  async function translateText(text) {
    const requestId = ++currentRequestId;

    if (!text || !text.trim()) {
      return;
    }

    if (!chrome?.runtime?.id) {
      showTranslationError(
        "Extension updated. Please refresh this page."
      );
      return;
    }

    lastRequestedText = text;

    originalElement.textContent = text;

    translatedElement.textContent = "ترجمہ کیا جا رہا ہے...";
    setStatus("TRANSLATING");

    copyStatus.textContent = "";

    showPopup();

    try {
      chrome.runtime.sendMessage(
        {
          action: "translate",
          text
        },
        response => {
          if (requestId !== currentRequestId) {
            return;
          }

          if (chrome.runtime.lastError) {
            showTranslationError(
              "Translation service is unavailable. Please refresh and try again."
            );
            return;
          }

          if (response?.success && response.translation) {
            translatedElement.textContent =
              response.translation;

            setStatus("COMPLETED");
          } else {
            showTranslationError(
              response?.error || "Translation failed. Please try again."
            );
          }
        }
      );

    } catch (error) {
      console.error("Translation error:", error);

      if (requestId === currentRequestId) {
        showTranslationError(
          "Unable to translate this selection."
        );
      }
    }
  }

  function handleSelection() {
    const selectedText = getSelectedText();

    if (!selectedText) {
      return;
    }

    if (popupElement.contains(document.activeElement)) {
      return;
    }

    if (selectedText === lastRequestedText) {
      return;
    }

    // Keep the popup responsive without firing on every mouse event.
    translateText(selectedText);
  }

  document.addEventListener("mouseup", event => {
    if (popupElement.contains(event.target)) {
      return;
    }

    clearTimeout(selectionTimer);

    selectionTimer = setTimeout(
      handleSelection,
      120
    );
  });

  document.addEventListener("keyup", event => {
    if (
      event.key === "Shift" ||
      event.key.startsWith("Arrow")
    ) {
      clearTimeout(selectionTimer);

      selectionTimer = setTimeout(
        handleSelection,
        120
      );
    }
  });

  closeButton.addEventListener("click", () => {
    currentRequestId++;
    closePopup();
  });

  copyButton.addEventListener("click", async () => {
    const text = translatedElement.textContent.trim();

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);

      copyStatus.textContent = "Copied!";
    } catch (error) {
      const range = document.createRange();

      range.selectNodeContents(translatedElement);

      const selection = window.getSelection();

      selection.removeAllRanges();
      selection.addRange(range);

      copyStatus.textContent =
        "Select and copy the translation.";
    }
  });

  // Avoid repeatedly translating an unchanged selection.
  document.addEventListener("selectionchange", () => {
    const selectedText = getSelectedText();

    if (!selectedText) {
      lastRequestedText = "";
    }
  });

})();