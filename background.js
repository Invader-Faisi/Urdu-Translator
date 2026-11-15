
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== "translate") return;

    translateText(message.text)
        .then(result => sendResponse({
            success: true,
            translation: result
        }))
        .catch(error => sendResponse({
            success: false,
            error: error.message
        }));

    return true;
});

async function translateText(text) {
    if (!text || !text.trim()) {
        throw new Error("No text provided.");
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

    return data.responseData.translatedText;
}
