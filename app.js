// SPEAKLY – super-stable core version
// No fancy detection, just solid translate + optional voice.

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

  // If any core element is missing, stop here to avoid crashes.
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

  // ---------- SIMPLE DEFAULTS (NO DETECTION) ----------
  try {
    sourceSelect.value = "hi-IN"; // default FROM Hindi
  } catch (_) {}
  try {
    targetSelect.value = "en"; // default TO English
  } catch (_) {}

  // ---------- SPEECH RECOGNITION (OPTIONAL) ----------
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

  // ---------- SPEECH SYNTHESIS (OPTIONAL) ----------
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

    if (!navigator.onLine) {
      setStatus("You are offline. Speakly needs internet to translate.");
      return;
    }

    const srcCode = sourceSelect.value || "hi-IN";
    const tgtCode = targetSelect.value || "en";
    const srcBase = baseLang(srcCode);
    const tgtBase = baseLang(tgtCode);
    const langpair = `${srcBase}|${tgtBase}`;

    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(langpair) +
      "&mt=1";

    if (loadingIndicator) loadingIndicator.style.display = "flex";
    outputText.value = "";

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (loadingIndicator) loadingIndicator.style.display = "none";

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
      if (loadingIndicator) loadingIndicator.style.display = "none";
      setStatus("Could not translate right now. Please try again.");
    }
  }

  // ---------- EVENT LISTENERS ----------

  // Press to Speak
  talkButton.addEventListener("click", () => {
    // If recognition is available, use mic.
    if (recognition) {
      if (isListening) {
        recognition.stop();
        return;
      }
      const srcCode = sourceSelect.value || "hi-IN";
      recognition.lang = srcCode;
      recognition.start();
    } else {
      // Fallback: just translate typed text.
      translateCurrentText();
    }
  });

  // Auto-translate on Enter
  inputText.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      translateCurrentText();
    }
  });

  // Also translate when leaving the box
  inputText.addEventListener("blur", () => {
    translateCurrentText();
  });

  // Mute / Unmute
  if (muteButton) {
    muteButton.addEventListener("click", () => {
      isMuted = !isMuted;
      if (isMuted) {
        setStatus("Voice output muted.");
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      } else {
        setStatus("");
      }
    });
  }

  // Clear
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      inputText.value = "";
      outputText.value = "";
      setStatus("");
    });
  }

  // Copy
  if (copyButton) {
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
  }

  // Clear status when languages change
  sourceSelect.addEventListener("change", () => setStatus(""));
  targetSelect.addEventListener("change", () => setStatus(""));
});