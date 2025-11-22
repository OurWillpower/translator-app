// SPEAKLY – Minimal stable version
// Text + voice translation, no fancy checks, no region tricks.

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

// ---------- HELPERS ----------
function setStatus(msg) {
  statusEl.textContent = msg || "";
}

// "en-US" -> "en"
function baseLang(code) {
  if (!code) return "en";
  if (code === "auto") return "auto";
  return code.split("-")[0].toLowerCase();
}

// ---------- SIMPLE DEFAULTS ----------
// (We keep it simple: English → Hindi to start. User can change.)
(function setDefaults() {
  try {
    if (sourceSelect) sourceSelect.value = "en-US";
    if (targetSelect) targetSelect.value = "hi";
  } catch (e) {
    // ignore
  }
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

// ---------- TRANSLATION (MyMemory, MT only) ----------
async function translateCurrentText() {
  const text = inputText.value.trim();
  if (!text) {
    setStatus("");
    outputText.value = "";
    return;
  }

  if (!navigator.onLine) {
    setStatus("You are offline. Speakly needs internet to translate.");
    return;
  }

  const srcCode = sourceSelect.value ||