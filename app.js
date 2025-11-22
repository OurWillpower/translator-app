// ===============================
// SPEAKLY - TRANSLATION LOGIC v3 + better Marathi voice handling
// ===============================

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
    console.error("Speakly: required DOM elements missing.");
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

  // Detect whether text is in Latin (A–Z) or Devanagari
  function detectScript(text) {
    if (!text) return "unknown";
    if (/[ऀ-ॿ]/.test(text)) return "devanagari"; // Hindi/Marathi script
    if (/[a-zA-Z]/.test(text)) return "latin";    // English letters
    return "other";
  }

  // Decide if we must BLOCK translation for this text/source combination
  function shouldBlockForSource(text, srcCode) {
    const script = detectScript(text);
    const base = baseLang(srcCode);

    // Rule: for FROM = Hindi/Marathi, user must not type only English letters
    if ((base === "hi" || base === "mr") && script === "latin") {
      return true;
    }
    return false;
  }

  // ---------- DEFAULT LANGUAGES ----------
  try { sourceSelect.value = "hi-IN"; } catch (_) {}
  try { targetSelect.value = "en"; } catch (_) {}

  // ---------- SPEECH RECOGNITION (optional) ----------
  function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn("Speakly: SpeechRecognition not supported.");
      return;
    }

    recognition = new SR();
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

  // ---------- SPEECH SYNTHESIS (optional) ----------
  function loadVoices() {
    if (!window.speechSynthesis) return;
    voices = window.speechSynthesis.getVoices();
    // console.log("Available voices:", voices.map(v => v.lang + " | " + v.name));
  }

  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function speakOut(text, langCode) {
    if (!window.speechSynthesis || isMuted || !text) return;

    const targetBase = baseLang(langCode);
    let preferredOrder;

    // Special handling for Marathi: try mr -> hi -> en
    if (targetBase === "mr") {
      preferredOrder = ["mr", "hi", "en"];
    } else if (targetBase === "hi") {
      preferredOrder = ["hi", "en"];
    } else {
      preferredOrder = [targetBase, "en"];
    }

    let selectedVoice = null;
    const lowerVoices = voices || [];

    for (const pref of preferredOrder) {
      selectedVoice = lowerVoices.find(v =>
        v.lang && v.lang.toLowerCase().startsWith(pref)
      );
      if (selectedVoice) break;
    }

    // If we still don't have any suitable voice, just skip speaking
    if (!selectedVoice) {
      if (targetBase === "mr") {
        setStatus("Marathi voice not available on this device. Showing text only.");
      }
      return;
    }

    // If Marathi is using a fallback (Hindi/English), tell user once
    if (targetBase === "mr" && !selectedVoice.lang.toLowerCase().startsWith("mr")) {
      setStatus("Marathi voice fallback used (Hindi/English voice). Text is correct.");
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
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

    const srcCode = sourceSelect.value || "hi-IN";
    const tgtCode = targetSelect.value || "en";

    // 1) Validation: block clearly wrong input for Hindi/Marathi
    if (shouldBlockForSource(text, srcCode)) {
      setStatus("टेक्स्ट चुनी हुई भाषा से मेल नहीं खाता");
      outputText.value = "";
      return;
    } else {
      setStatus("");
    }

    // 2) Internet check
    if (!navigator.onLine) {
      setStatus("You are offline. Speakly needs internet to translate.");
      return;
    }

    // 3) Build MyMemory request
    const srcBase = baseLang(srcCode);
    const tgtBase = baseLang(tgtCode);
    const langpair = `${srcBase}|${tgtBase}`;

    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(langpair) +
      "&mt=1"; // machine translation only

    if (loadingIndicator) loadingIndicator.style.display = "flex";
    outputText.value = "";

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (loadingIndicator) loadingIndicator.style.display = "none";

      if (data && data.responseData && data.responseData.translatedText) {
        const translated = data.responseData.translatedText;
        outputText.value = translated;
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
    if (recognition) {
      // Use mic if supported
      if (isListening) {
        recognition.stop();
        return;
      }
      const srcCode = sourceSelect.value || "hi-IN";
      recognition.lang = srcCode;
      recognition.start();
    } else {
      // Fallback: just translate typed text
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

  // Auto-translate when leaving the box
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

  // Clear button
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      inputText.value = "";
      outputText.value = "";
      setStatus("");
    });
  }

  // Copy button
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
