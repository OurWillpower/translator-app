// SPEAKLY – app.js (stable version with softer language check)

// ---------- ELEMENTS ----------
const sourceSelect = document.getElementById("language-select-source");
const targetSelect = document.getElementById("language-select-target");
const talkButton = document.getElementById("talk-button");
const inputText = document.getElementById("input-text");
const outputText = document.getElementById("output-text");
const muteButton = document.getElementById("mute-button");
const clearButton = document.getElementById("clear-button");
const copyButton = document.getElementById("copy-button");
const iconCopy = document.getElementById("icon-copy");
const iconCheck = document.getElementById("icon-check");
const statusEl = document.getElementById("status");
const loadingIndicator = document.getElementById("loading-indicator");

// ---------- STATE ----------
let isListening = false;
let isMuted = false;
let recognition = null;
let voices = [];

// ---------- UTILS ----------

// Convert locale to base language (hi-IN -> hi)
function baseLang(code) {
  if (!code) return "en";
  if (code === "auto") return "auto";
  return code.split("-")[0].toLowerCase();
}

// Very simple script detector
function detectScript(text) {
  if (!text) return "unknown";
  if (/[ऀ-ॿ]/.test(text)) return "devanagari"; // Hindi/Marathi script
  if (/[a-zA-Z]/.test(text)) return "latin";
  return "other";
}

// Softer language match:
// Only block if From = Hindi/Marathi AND user is typing in plain English letters.
function isLanguageMatch(text, srcCode) {
  const script = detectScript(text);
  const base = baseLang(srcCode);

  if ((base === "hi" || base === "mr") && script === "latin") {
    return false;
  }
  return true;
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

// ---------- DEFAULT SOURCE BASED ON BROWSER ----------
(function setDefaultSourceByLocale() {
  try {
    const locale = (navigator.language || "").toLowerCase();
    if (locale.startsWith("hi")) {
      sourceSelect.value = "hi-IN";
    } else if (locale.startsWith("mr")) {
      sourceSelect.value = "mr-IN";
    } else {
      sourceSelect.value = "en-US";
    }
  } catch (e) {
    sourceSelect.value = "en-US";
  }

  // Default target – English
  targetSelect.value = "en";
})();

// ---------- SPEECH RECOGNITION ----------
function initSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Voice input not supported on this browser.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onstart = () => {
    isListening = true;
    setStatus("Listening…");
    talkButton.disabled = true;
    talkButton.style.opacity = "0.7";
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    setStatus("Couldn’t hear clearly. Please try again.");
    isListening = false;
    talkButton.disabled = false;
    talkButton.style.opacity = "1";
  };

  recognition.onend = () => {
    isListening = false;
    talkButton.disabled = false;
    talkButton.style.opacity = "1";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    inputText.value = transcript;
    translateCurrentText();
  };
}

initSpeechRecognition();

// ---------- SPEECH SYNTHESIS ----------
function loadVoices() {
  if (!window.speechSynthesis) return;
  voices = window.speechSynthesis.getVoices();
}

if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function speakOut(text, langCode) {
  if (!window.speechSynthesis || isMuted || !text) return;

  const utterance = new SpeechSynthesisUtterance(text);
  const base = baseLang(langCode);

  const voice =
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
    null;

  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// ---------- TRANSLATION ----------
async function translateCurrentText() {
  const text = inputText.value.trim();
  if (!text) {
    setStatus("");
    outputText.value = "";
    return;
  }

  // Offline check
  if (!navigator.onLine) {
    setStatus("You are offline. Speakly needs internet to translate.");
    return;
  }

  const srcCode = sourceSelect.value;
  const tgtCode = targetSelect.value;
  const srcBase = baseLang(srcCode);
  const tgtBase = baseLang(tgtCode);

  // Smart mismatch warning ONLY for Hindi/Marathi when user types in English letters.
  if (!isLanguageMatch(text, srcCode)) {
    setStatus("टेक्स्ट चुनी हुई भाषा से मेल नहीं खाता");
    return;
  } else {
    setStatus("");
  }

  const langpair = `${srcBase}|${tgtBase}`;
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=" +
    encodeURIComponent(langpair);

  loadingIndicator.style.display = "flex";
  outputText.value = "";

  try {
    const res = await fetch(url);
    const data = await res.json();
    loadingIndicator.style.display = "none";

    if (data && data.responseData && data.responseData.translatedText) {
      const translated = data.responseData.translatedText;
      outputText.value = translated;
      setStatus("");
      speakOut(translated, tgtBase);
    } else {
      console.error("Unexpected translation response:", data);
      setStatus("Could not translate right now. Please try again.");
    }
  } catch (err) {
    console.error("Translation error:", err);
    loadingIndicator.style.display = "none";
    setStatus("Could not translate right now. Please try again.");
  }
}

// ---------- EVENT LISTENERS ----------

// Press to Speak
talkButton.addEventListener("click", () => {
  if (!recognition) {
    setStatus("Voice input not supported on this browser.");
    return;
  }
  if (isListening) {
    recognition.stop();
    return;
  }
  const srcCode = sourceSelect.value || "en-US";
  recognition.lang = srcCode;
  recognition.start();
});

// Auto-translate on Enter
inputText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    translateCurrentText();
  }
});

// Auto-translate when leaving the box
inputText.addEventListener("blur", () => {
  translateCurrentText();
});

// Mute / Unmute (only toggles behaviour, doesn’t touch label)
muteButton.addEventListener("click", () => {
  isMuted = !isMuted;
  if (isMuted) {
    setStatus("Voice output muted.");
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } else {
    setStatus("");
  }
});

// Clear
clearButton.addEventListener("click", () => {
  inputText.value = "";
  outputText.value = "";
  setStatus("");
});

// Copy
copyButton.addEventListener("click", async () => {
  const text = outputText.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (iconCopy && iconCheck) {
      iconCopy.style.display = "none";
      iconCheck.style.display = "inline";
      setTimeout(() => {
        iconCopy.style.display = "inline";
        iconCheck.style.display = "none";
      }, 1500);
    }
  } catch (e) {
    console.error("Clipboard error:", e);
  }
});

// Clear status when languages change
sourceSelect.addEventListener("change", () => setStatus(""));
targetSelect.addEventListener("change", () => setStatus(""));