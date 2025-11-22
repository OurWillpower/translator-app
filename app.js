// SPEAKLY – clean translation logic with strict Hindi/Marathi input check

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

  // Rough script detection
  function detectScript(text) {
    if (!text) return "unknown";
    if (/[ऀ-ॿ]/.test(text)) return "devanagari";   // Hindi / Marathi
    if (/[a-zA-Z]/.test(text)) return "latin";      // English letters
    return "other";
  }

  // Should we block this text for the chosen source language?
  function isInvalidForSource(text, srcCode) {
    const script = detectScript(text);
    const base = baseLang(srcCode);

    // If FROM is Hindi or Marathi and user typed only English letters
    if ((base === "hi" || base === "mr") && script === "latin") {
      return true;
    }

    // For now we don't block anything else
    return false;
  }

  // ---------- SIMPLE DEFAULTS ----------
  try {
    sourceSelect.value = "hi-IN"; // From: Hindi
  } catch (_) {}
  try {
    targetSelect.value = "en";    // To: English
  } catch (_) {}

  // ---------- SPEECH RECOGNITION ----------
  function initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition