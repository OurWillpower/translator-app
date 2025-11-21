// SPEAKLY – app.js (clean stable version)

// ---------- ELEMENTS ----------
const sourceSelect = document.getElementById("language-select-source");
const targetSelect = document.getElementById("language-select-target");
const voiceWrapper = document.getElementById("voice-select-wrapper"); // kept if needed later
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

// ---------- UTILS ----------

// Map full locale to base language code for translation API.
function baseLang(code) {
  if (!code) return "en";
  if (code === "auto") return "auto";
  return code.split("-")[0]; // "hi-IN" -> "hi"
}

// Very simple script detector for smart warnings.
function detectScript(text) {
  if (!text) return "unknown";
  if (/[ऀ-ॿ]/.test(text)) return "devanagari";
  if (/[a-zA-Z]/.test(text)) return "latin";
  return "other";
}

// Check if text roughly matches the chosen source language.
function isLanguageMatch(text, srcCode) {
  const script = detectScript(text);
  const base = baseLang(srcCode);

  // For Hindi / Marathi we expect Devanagari, not plain Latin.
  if ((base === "hi" || base === "mr") && script === "latin") return false;

  // For English we expect mainly Latin, not Devanagari.
  if (base === "en" && script === "devanagari") return false;

  // Everything else – we don't over-police.
  return true;
}

// Set status message
function setStatus(msg) {
  statusEl.textContent = msg || "";
}

// ---------- DEFAULT LANGUAGE BASED ON BROWSER ----------
(function setDefaultSourceByLocale() {
  try {
    const locale = (navigator.language || "").toLowerCase();
    if (locale.startsWith("hi")) {
      sourceSelect.value = "hi-IN";
    } else if (locale.startsWith("mr")) {
      sourceSelect.value