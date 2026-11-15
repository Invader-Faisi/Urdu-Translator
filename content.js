
(() => {
    // Prevent duplicate initialization
    if (window.urduTranslatorLoaded) return;
    window.urduTranslatorLoaded = true;

    let requestNumber = 0;
    let lastTranslatedText = "";

    // Create translation popup
    const popup = document.createElement("div");
    popup.id = "urdu-translator-popup";

    popup.innerHTML = `
        <div class="ut-header">
            <span class="ut-title">اردو مترجم</span>
            <button class="ut-close" title="Close">×</button>
        </div>

        <div class="ut-original"></div>
        <div class="ut-result">Translating...</div>

        <div class="ut-footer">
            <span class="ut-status">English → Urdu</span>
            <button class="ut-copy">Copy</button>
        </div>
    `;

    document.body.appendChild(popup);

    const original = popup.querySelector(".ut-original");
    const result = popup.querySelector(".ut-result");
    const copyButton = popup.querySelector(".ut-copy");

    // Close popup
    popup.querySelector(".ut-close").onclick = hidePopup;

    // Copy translated text
    copyButton.onclick = async () => {
        const translatedText = result.textContent;

        if (!translatedText || translatedText === "Translating...") {
            return;
        }

        try {
            await navigator.clipboard.writeText(translatedText);

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
    };

    function hidePopup() {
        popup.classList.remove("ut-visible");

        // Invalidate any pending translation request
        requestNumber++;

        lastTranslatedText = "";
    }

    // Display popup near selected text
    function showPopup(x, y) {
        const margin = 12;

        popup.classList.add("ut-visible");

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

        popup.style.left = left + "px";
        popup.style.top = top + "px";
    }

    // Translate selected text
    async function translate(text, x, y) {
        text = text.trim();

        if (!text || text === lastTranslatedText) return;

        if (text.length > 5000) {
            original.textContent = text.slice(0, 150) + "...";
            result.textContent = "Please select a shorter text.";

            showPopup(x, y);
            return;
        }

        lastTranslatedText = text;

        const currentRequest = ++requestNumber;

        original.textContent = text;
        result.textContent = "Translating...";
        copyButton.textContent = "Copy";

        showPopup(x, y);

        chrome.runtime.sendMessage(
            {
                action: "translate",
                text: text
            },
            response => {
                // Ignore outdated responses
                if (currentRequest !== requestNumber) return;

                if (chrome.runtime.lastError) {
                    result.textContent = "Translation service error.";
                    return;
                }

                if (response?.success) {
                    result.textContent = response.translation;
                } else {
                    result.textContent =
                        response?.error || "Translation failed.";
                }
            }
        );
    }

    // Translate only when the user selects text
    document.addEventListener("mouseup", event => {
        // Ignore clicks inside the translation popup
        if (popup.contains(event.target)) return;

        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (!selectedText) return;

        // Get selected text position
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Display translation popup
        translate(
            selectedText,
            rect.left,
            rect.bottom
        );
    });

    // Close popup using Escape
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            hidePopup();
        }
    });

})();
