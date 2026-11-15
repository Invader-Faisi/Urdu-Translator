
(() => {
    // Avoid duplicate initialization
    if (window.urduTranslatorLoaded) {
        return;
    }

    window.urduTranslatorLoaded = true;

    let isEnabled = true;
    let requestNumber = 0;
    let lastTranslatedText = "";

    // --------------------------------------------------
    // Create translation popup
    // --------------------------------------------------

    const popup = document.createElement("div");

    popup.id = "urdu-translator-popup";

    popup.innerHTML = `
    <div class="ut-header">
        <span class="ut-title">اردو مترجم</span>

        <div class="ut-header-actions">
            <button class="ut-open-pdf" title="Open PDF Translator">
                📄 Open PDF
            </button>

            <button class="ut-close" title="Close">×</button>
        </div>
    </div>

    document.body.appendChild(popup);

    const original = popup.querySelector(".ut-original");
    const result = popup.querySelector(".ut-result");
    const copyButton = popup.querySelector(".ut-copy");
    const closeButton = popup.querySelector(".ut-close");

    // --------------------------------------------------
    // Show popup at top-right corner
    // --------------------------------------------------

    function showPopup() {
        if (!isEnabled) return;

        popup.classList.add("ut-visible");
    }

    // --------------------------------------------------
    // Hide popup
    // --------------------------------------------------

    function hidePopup() {
        popup.classList.remove("ut-visible");

        requestNumber++;
        lastTranslatedText = "";
    }

    // --------------------------------------------------
    // Close button
    // --------------------------------------------------

    closeButton.addEventListener("click", hidePopup);
    // Open PDF Translator
    popup.querySelector(".ut-open-pdf").addEventListener("click", () => {
        chrome.runtime.sendMessage({
            action: "openPdf"
        });
    });

    // --------------------------------------------------
    // Copy translation
    // --------------------------------------------------

    copyButton.addEventListener("click", async () => {
        const translatedText = result.textContent;

        if (
            !translatedText ||
            translatedText === "Translating..."
        ) {
            return;
        }

        try {
            await navigator.clipboard.writeText(
                translatedText
            );

            copyButton.textContent = "Copied!";

            setTimeout(() => {
                copyButton.textContent = "Copy";
            }, 1200);

        } catch (error) {
            copyButton.textContent = "Copy failed";

            setTimeout(() => {
                copyButton.textContent = "Copy";
            }, 1200);
        }
    });

    // --------------------------------------------------
    // Translate selected text
    // --------------------------------------------------

    function translate(text) {
        text = text.trim();

        if (!isEnabled || !text) return;

        if (text === lastTranslatedText) return;

        if (text.length > 5000) {
            original.textContent = text.slice(0, 150) + "...";

            result.textContent =
                "Please select a shorter text.";

            showPopup();
            return;
        }

        lastTranslatedText = text;

        const currentRequest = ++requestNumber;

        original.textContent = text;
        result.textContent = "Translating...";
        copyButton.textContent = "Copy";

        showPopup();

        chrome.runtime.sendMessage(
            {
                action: "translate",
                text: text
            },
            (response) => {
                // Ignore old translation responses
                if (currentRequest !== requestNumber) {
                    return;
                }

                if (chrome.runtime.lastError) {
                    result.textContent =
                        "Translation service error.";

                    return;
                }

                if (response?.success) {
                    result.textContent =
                        response.translation;
                } else {
                    result.textContent =
                        response?.error ||
                        "Translation failed.";
                }
            }
        );
    }

    // --------------------------------------------------
    // Detect selected webpage text
    // --------------------------------------------------

    function handleTextSelection(event) {
        if (!isEnabled) return;

        // Ignore selection inside popup
        if (popup.contains(event.target)) return;

        const selection = window.getSelection();

        if (!selection || selection.isCollapsed) {
            return;
        }

        const selectedText = selection.toString().trim();

        if (!selectedText) return;

        translate(selectedText);
    }

    document.addEventListener(
        "mouseup",
        handleTextSelection
    );

    // --------------------------------------------------
    // Escape key closes popup
    // --------------------------------------------------

    function handleKeyboard(event) {
        if (event.key === "Escape") {
            hidePopup();
        }
    }

    document.addEventListener(
        "keydown",
        handleKeyboard
    );

    // --------------------------------------------------
    // Enable / Disable from extension toolbar
    // --------------------------------------------------

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action !== "setEnabled") {
            return;
        }

        isEnabled = message.enabled === true;

        if (!isEnabled) {
            hidePopup();
        }
    });

})();
