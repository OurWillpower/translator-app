// SPEAKLY – app.js (India default = Hindi, MyMemory forced MT)

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

// Detect if user is likely in India (time zone or locale)
function isIndiaUser() {
  try {
    const tz = (
      Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    ).toLowerCase();

    if (tz.includes("kolkata") || tz.includes("calcutta")) {
      return true;
    }
  } catch (_) {
    // ignore
  }

  try {
    const primary = (navigator.language || "").toLowerCase();
    const langs = (navigator.languages || []).map((l) => l.toLowerCase());

    if (primary.endsWith("-in")) return true;
    if (langs.some((l) => l.endsWith("-in"))) return true;
  } catch (_) {
    // ignore
  }

  return false;
}

// ---------- DEFAULT SOURCE BASED ON REGION / LOCALE ----------
(function setDefaultSourceByLocale() {
  try {
    const locale = (navigator.language || "").toLowerCase();

    if (isIndiaUser()) {
      // Any India-region device: default to Hindi
      sourceSelect.value = "hi-IN";
    } else if (locale.startsWith("hi")) {
      sourceSelect.value = "hi-IN";
    } else if (locale.startsWith("mr")) {
      sourceSelect.value = "mr-IN";
    } else {
      sourceSelect.value = "en-US";
    }
  } catch (e) {
    // Safe fallback
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
    setStatus("Voice input