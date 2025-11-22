// SPEAKLY – core version with strict Hindi/Marathi check

window.addEventListener("DOMContentLoaded", () => {
  // ---------- GET ELEMENTS ----------
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

  if (!sourceSelect || !targetSelect || !talkButton || !inputText || !outputText) {
    console.error("Speakly: some DOM elements are missing. Check IDs in index.html.");
    return;
  }

  // ---------- STATE ----------
  let isListening = false;
  let isMuted = false;
  let recognition = null;
  let voices = [];

  // ---------- HELPERS ----------
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  // "en-US" -> "en"
  function baseLang(code) {
    if (!code) return "en";
    if (code === "auto") return "auto";
    return code.split("-")[0].toLowerCase();
  }

  // Detect if text is written in Latin (A–Z) or Devanagari
  function detectScript(text) {
    if (!text) return "unknown";
    if (/[ऀ-ॿ]/.test(text)) return "devanagari";   // Hindi / Marathi script
    if (/[a-zA-Z]/.test(text)) return "latin";      // English letters
    return "other";
  }

  // ---------- SIMPLE DEFAULTS ----------
  // Everyone gets: FROM Hindi, TO English on first load.
  try {
    sourceSelect.value = "hi-IN";
  } catch (_) {}
  try {
    targetSelect.value = "en";
  } catch (_) {}

  // ---------- SPEECH RECOGNITION ----------
  function initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speakly: SpeechRecognition not supported on this browser.");
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