"use strict";

const TRANSLATION_CONFIG = {
  TARGET_LANGUAGE: "ur",
  SOURCE_LANGUAGE: "auto",
  MAX_CHUNK_LENGTH: 1200,
  MAX_TEXT_LENGTH: 20000
};

/* -------------------------------------------------------
   TEXT CHUNKING
------------------------------------------------------- */

function splitTextIntoChunks(text, maxLength) {
  const chunks = [];

  let start = 0;

  while (start < text.length) {
    let end = Math.min(
      start + maxLength,
      text.length
    );

    if (end < text.length) {
      // Prefer splitting at a sentence or word boundary.
      const sentenceBoundary = Math.max(
        text.lastIndexOf(". ", end),
        text.lastIndexOf("! ", end),
        text.lastIndexOf("? ", end),
        text.lastIndexOf("\n", end)
      );

      const wordBoundary = text.lastIndexOf(" ", end);

      if (sentenceBoundary > start + 300) {
        end = sentenceBoundary + 1;
      } else if (wordBoundary > start + 300) {
        end = wordBoundary;
      }
    }

    const chunk = text.slice(start, end);

    if (chunk.trim()) {
      chunks.push(chunk);
    }

    start = end;
  }

  return chunks;
}

/* -------------------------------------------------------
   SINGLE CHUNK TRANSLATION
------------------------------------------------------- */

async function translateChunk(text) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: TRANSLATION_CONFIG.SOURCE_LANGUAGE,
    tl: TRANSLATION_CONFIG.TARGET_LANGUAGE,
    dt: "t",
    q: text
  });

  const url =
    `https://translate.googleapis.com/translate_a/single?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Translation service returned HTTP ${response.status}.`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data?.[0])) {
    throw new Error("Invalid translation response.");
  }

  return data[0]
    .map(item => item?.[0] || "")
    .join("");
}

/* -------------------------------------------------------
   COMPLETE TEXT TRANSLATION
------------------------------------------------------- */

async function translateText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("No text was provided.");
  }

  if (text.length > TRANSLATION_CONFIG.MAX_TEXT_LENGTH) {
    throw new Error(
      `Text is too long. Maximum allowed length is ${TRANSLATION_CONFIG.MAX_TEXT_LENGTH} characters.`
    );
  }

  const chunks = splitTextIntoChunks(
    text,
    TRANSLATION_CONFIG.MAX_CHUNK_LENGTH
  );

  const translations = [];

  // Translate sequentially to avoid flooding the endpoint.
  for (const chunk of chunks) {
    const translated = await translateChunk(chunk);

    translations.push(translated);
  }

  return translations.join("");
}

/* -------------------------------------------------------
   EXTENSION MESSAGE HANDLER
------------------------------------------------------- */

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    if (request?.action !== "translate") {
      return false;
    }

    translateText(request.text)
      .then(translation => {
        sendResponse({
          success: true,
          translation
        });
      })
      .catch(error => {
        console.error("Urdu translation error:", error);

        sendResponse({
          success: false,
          error: error.message || "Translation failed."
        });
      });

    return true;
  }
);