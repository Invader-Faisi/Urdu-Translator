
// ======================================================
// URDU TRANSLATOR - BACKGROUND SERVICE WORKER
// ======================================================

const TAB_STATE_PREFIX = "urduTranslatorEnabled_";

// ------------------------------------------------------
// Toolbar icon click: Enable / Disable translation
// ------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id || !tab.url) return;

    // Chrome internal pages and other restricted pages
    // cannot run injected content scripts.
    if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:")
    ) {
        return;
    }

    const stateKey = TAB_STATE_PREFIX + tab.id;

    try {
        const stored = await chrome.storage.session.get(stateKey);
        const isEnabled = stored[stateKey] === true;

        if (isEnabled) {
            // Disable translation on this tab
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: "setEnabled",
                    enabled: false
                });
            } catch (error) {
                // Content script may no longer exist.
            }

            await chrome.storage.session.set({
                [stateKey]: false
            });

            await chrome.action.setBadgeText({
                tabId: tab.id,
                text: ""
            });

            await chrome.action.setTitle({
                tabId: tab.id,
                title: "Urdu Translator is OFF"
            });

            return;
        }

        // Inject webpage translation script
        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            files: ["content.js"]
        });

        // Inject webpage translation styling
        await chrome.scripting.insertCSS({
            target: {
                tabId: tab.id
            },
            files: ["styles.css"]
        });

        // Activate the translator
        await chrome.tabs.sendMessage(tab.id, {
            action: "setEnabled",
            enabled: true
        });

        await chrome.storage.session.set({
            [stateKey]: true
        });

        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: "ON"
        });

        await chrome.action.setBadgeBackgroundColor({
            tabId: tab.id,
            color: "#16a34a"
        });

        await chrome.action.setTitle({
            tabId: tab.id,
            title: "Urdu Translator is ON"
        });

    } catch (error) {
        console.error("Urdu Translator activation error:", error);

        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: "ERR"
        });

        await chrome.action.setBadgeBackgroundColor({
            tabId: tab.id,
            color: "#dc2626"
        });
    }
});

// ------------------------------------------------------
// Reset state when a tab navigates to a new page
// ------------------------------------------------------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== "loading") return;

    const stateKey = TAB_STATE_PREFIX + tabId;

    await chrome.storage.session.remove(stateKey);

    await chrome.action.setBadgeText({
        tabId,
        text: ""
    });

    await chrome.action.setTitle({
        tabId,
        title: "Click to enable Urdu Translator"
    });
});

// ------------------------------------------------------
// Clean up when a tab is closed
// ------------------------------------------------------

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const stateKey = TAB_STATE_PREFIX + tabId;

    await chrome.storage.session.remove(stateKey);
});

// ------------------------------------------------------
// Open PDF translator using keyboard shortcut
// Alt + Shift + P
// ------------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
    if (command === "open-pdf-translator") {
        chrome.tabs.create({
            url: chrome.runtime.getURL("pdf-viewer.html")
        });
    }
});

// ------------------------------------------------------
// Translation API message handler
// ------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== "translate") {
        return;
    }

    translateText(message.text)
        .then((translation) => {
            sendResponse({
                success: true,
                translation
            });
        })
        .catch((error) => {
            sendResponse({
                success: false,
                error: error.message || "Translation failed."
            });
        });

    return true;
});

// ------------------------------------------------------
// MyMemory Translation API
// ------------------------------------------------------

async function translateText(text) {
    if (!text || !text.trim()) {
        throw new Error("No text provided.");
    }

    if (text.length > 5000) {
        throw new Error("Selected text is too long.");
    }

    const url = new URL(
        "https://api.mymemory.translated.net/get"
    );

    url.searchParams.set("q", text.trim());
    url.searchParams.set("langpair", "autodetect|ur");

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Translation service unavailable.");
    }

    const data = await response.json();

    if (data.responseStatus !== 200) {
        throw new Error(
            data.responseDetails || "Translation failed."
        );
    }

    const translation = data.responseData?.translatedText;

    if (!translation) {
        throw new Error("No translation was returned.");
    }

    return translation;
}
