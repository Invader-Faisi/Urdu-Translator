chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const text = encodeURIComponent(request.text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ur&dt=t&q=${text}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        // Combine translated sentences/paragraphs
        const translatedText = data[0].map((item) => item[0]).join("");
        sendResponse({ success: true, translation: translatedText });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keeps the message channel open for async response
  }
});