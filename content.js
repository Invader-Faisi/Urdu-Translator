let translationBox = null;
let isEnabled = true;

// Check initial status
chrome.storage.local.get(["extensionEnabled"], (data) => {
  isEnabled = data.extensionEnabled ?? true;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.extensionEnabled) {
    isEnabled = changes.extensionEnabled.newValue;
    if (!isEnabled && translationBox) {
      translationBox.remove();
      translationBox = null;
    }
  }
});

document.addEventListener('mouseup', async (e) => {
  if (!isEnabled) return;

  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    if (translationBox && !translationBox.contains(e.target)) {
      translationBox.remove();
      translationBox = null;
    }
    return;
  }

  const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
  showTranslationPopup(rect.left + window.scrollX, rect.bottom + window.scrollY + 5, selectedText);
});

function showTranslationPopup(x, y, text) {
  if (translationBox) {
    translationBox.remove();
  }

  translationBox = document.createElement('div');
  translationBox.id = 'urdu-translator-popup';
  translationBox.innerHTML = `
    <div class="ut-header">
      <span>Urdu Translation</span>
      <button id="ut-close">×</button>
    </div>
    <div class="ut-body">
      <p id="ut-content">Translating...</p>
    </div>
  `;
  document.body.appendChild(translationBox);

  translationBox.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
  translationBox.style.top = `${y}px`;

  document.getElementById('ut-close').onclick = () => {
    translationBox.remove();
    translationBox = null;
  };

  // Simulated or fetched translation (Placeholder API integration point)
  translateText(text).then((translated) => {
    const contentEl = document.getElementById('ut-content');
    if (contentEl) {
      contentEl.textContent = translated;
    }
  });
}

async function translateText(text) {
  try {
    // Public free MyMemory translation API endpoint as a reliable fallback
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ur`);
    const data = await res.json();
    if (data && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
  } catch (err) {
    console.error("Translation error:", err);
  }
  return "ترجمہ دستیاب نہیں ہے (Translation failed)";
}
