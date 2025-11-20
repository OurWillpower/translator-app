// Speakly app logic
// Speech: Web Speech API (if available in browser)
// Translation: MyMemory free translation API (no key)

/* -------------------- DOM references -------------------- */

const sourceSelect = document.getElementById("language-select-source");
const targetSelect = document.getElementById("language-select-target");

const talkButton   = document.getElementById("talk-button");
const muteButton   = document.getElementById("mute-button");
const clearButton  = document.getElementById("clear-button");
const copyButton   = document.getElementById("copy-button");

const inputTextEl  = document.getElementById("input-text");
const outputTextEl = document.getElementById("output-text");

const loadingIndicator = document.getElementById("loading-indicator");
const statusEl         = document.getElementById("status");

const iconSpeaker = document.getElementById("icon-speaker");
const iconMute    = document.getElementById("icon-mute");
const iconCopy    = document.getElementById("icon-copy");
const iconCheck   = document.getElementById("icon-check");

/* -------------------- State -------------------- */

let isListening = false;
let isMuted     = false;
let recognition = null;
let debounceTimer = null;

/* -------------------- Constants -------------------- */

const OFFLINE_MESSAGE =
    "You are offline. Speakly needs internet to translate. Use Speakly Pro to use seamlessly in offline conditions.";

/* -------------------- Helpers -------------------- */

function showStatus(message, isError = false) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#ff6b81" : "#e1d0a6";
}

function setLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? "flex" : "none";
}

function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
}

// "en-US" -> "en", "hi-IN" -> "hi"
function mapSourceForTranslate(code) {
    if (!code || code === "auto") return "auto";
    const lower = String(code).toLowerCase();
    return lower.split("-")[0];
}

/**
 * Choose a reasonable speech language code from the target code.
 * e.g. "en" -> "en-US", "hi" -> "hi-IN", otherwise use the code directly.
 */
function getSpeechLangFromTarget(targetCode) {
    if (!targetCode) return "en-US";

    const code = targetCode.toLowerCase();

    if (code === "en") return "en-US";
    if (code === "hi") return "hi-IN";
    if (code === "mr") return "mr-IN";
    if (code === "es") return "es-ES";
    if (code === "fr") return "fr-FR";
    if (code === "de") return "de-DE";
    if (code === "zh") return "zh-CN";
    if (code === "ja") return "ja-JP";
    if (code === "ko") return "ko-KR";
    if (code === "pt") return "pt-PT";
    if (code === "ar") return "ar-SA";
    if (code === "ru") return "ru-RU";

    return code; // fallback: use as-is
}

function speakTranslation(text) {
    if (isMuted || !window.speechSynthesis || !text) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const targetCode = targetSelect.value || "en";

    // Default voice selection based on target language only
    utter.lang = getSpeechLangFromTarget(targetCode);

    synth.speak(utter);
}

/**
 * Set default source language based on browser location / language.
 * - If user appears to be from India: default Hindi (hi-IN) or Marathi (mr-IN).
 * - Else fallback: hi / mr / en based on browser language.
 */
function setDefaultSourceLanguage() {
    try {
        const navLangRaw = (navigator.language || "").toLowerCase(); // e.g. "en-in", "hi-in"
        let tz = "";

        try {
            if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
                const opts = Intl.DateTimeFormat().resolvedOptions();
                tz = (opts && opts.timeZone) || "";
            }
        } catch (e) {
            tz = "";
        }

        const tzLower = (tz || "").toLowerCase();

        let defaultCode = null;

        // Broad "India" detection
        const isIndia =
            tzLower.includes("kolkata") ||
            tzLower.includes("calcutta") ||
            navLangRaw.endsWith("-in");

        if (isIndia) {
            if (navLangRaw.startsWith("mr")) {
                defaultCode = "mr-IN";  // Marathi for India if browser prefers mr
            } else {
                defaultCode = "hi-IN";  // default Hindi for India
            }
        }

        // If still nothing, fallback on language only
        if (!defaultCode && navLangRaw) {
            if (navLangRaw.startsWith("hi")) {
                defaultCode = "hi-IN";
            } else if (navLangRaw.startsWith("mr")) {
                defaultCode = "mr-IN";
            } else if (navLangRaw.startsWith("en")) {
                defaultCode = "en-US";
            }
        }

        if (defaultCode) {
            const options = Array.from(sourceSelect.options);
            const exists = options.some(o => o.value === defaultCode);
            if (exists) {
                sourceSelect.value = defaultCode;
            }
        }
    } catch (e) {
        console.error("Could not set default source language:", e);
    }
}

/* -------------------- Translation (MyMemory) -------------------- */

async function translate(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
        showStatus("Type or speak something to translate.");
        return;
    }

    // OFFLINE HANDLING – always show your exact message
    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
        return;
    }

    const sourceLang = mapSourceForTranslate(sourceSelect.value);
    const targetLang = targetSelect.value || "en";

    const srcCode = sourceLang === "auto" ? "auto" : sourceLang;
    const tgtCode = targetLang;

    setLoading(true);
    showStatus(`Translating from ${srcCode} to ${tgtCode}...`);

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
            trimmed
        )}&langpair=${encodeURIComponent(srcCode)}|${encodeURIComponent(tgtCode)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || !data || !data.responseData) {
            throw new Error("Invalid translation response.");
        }

        const translated = data.responseData.translatedText || "";
        if (!translated) {
            throw new Error("No translated text received.");
        }

        outputTextEl.value = translated;
        showStatus("Translation ready.");
        speakTranslation(translated);
    } catch (err) {
        console.error("Translation error:", err);

        if (isOffline()) {
            showStatus(OFFLINE_MESSAGE, true);
        } else {
            showStatus(
                "Unable to translate right now. Please check your internet or try again in a while.",
                true
            );
        }
    } finally {
        setLoading(false);
    }
}

/* -------------------- Speech recognition -------------------- */

function setupRecognition() {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showStatus(
            "Speech recognition is not supported in this browser. You can still type to translate.",
            true
        );
        talkButton.disabled = false;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        talkButton.style.opacity = "0.85";
        const span = talkButton.querySelector("span:last-child");
        if (span) span.textContent = "Listening...";
        showStatus("Listening… speak now.");
    };

    recognition.onend = () => {
        isListening = false;
        talkButton.style.opacity = "1";
        const span = talkButton.querySelector("span:last-child");
        if (span) span.textContent = "Press to Speak";
        if (loadingIndicator.style.display === "none") {
            showStatus("");
        }
    };

    recognition.onerror = event => {
        console.error("Speech recognition error:", event);
        showStatus(
            "Could not access the microphone or understand speech. Please try again.",
            true
        );
    };

    recognition.onresult = event => {
        const transcript = Array.from(event.results)
            .map(r => r[0].transcript)
            .join(" ");

        inputTextEl.value = transcript;
        translate(transcript);
    };

    talkButton.disabled = false;
}

/* -------------------- Event listeners -------------------- */

talkButton.addEventListener("click", () => {
    if (!recognition) {
        showStatus(
            "Speech recognition is not available in this browser. You can still type to translate.",
            true
        );
        return;
    }
    if (isListening) {
        recognition.stop();
        return;
    }

    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
        return;
    }

    try {
        const src = sourceSelect.value;
        recognition.lang = src && src !== "auto" ? src : "en-US";
        recognition.start();
    } catch (err) {
        console.error("Start listening error:", err);
        showStatus("Unable to start listening. Please check microphone permissions.", true);
    }
});

muteButton.addEventListener("click", () => {
    isMuted = !isMuted;
    if (isMuted) {
        iconSpeaker.style.display = "none";
        iconMute.style.display = "inline";
        showStatus("Sound muted.");
    } else {
        iconSpeaker.style.display = "inline";
        iconMute.style.display = "none";
        showStatus("Sound on.");
    }
});

clearButton.addEventListener("click", () => {
    inputTextEl.value = "";
    outputTextEl.value = "";
    showStatus("");
});

copyButton.addEventListener("click", async () => {
    const text = outputTextEl.value.trim();
    if (!text) {
        showStatus("Nothing to copy yet.");
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        iconCopy.style.display = "none";
        iconCheck.style.display = "inline";
        showStatus("Translation copied.");
        setTimeout(() => {
            iconCopy.style.display = "inline";
            iconCheck.style.display = "none";
        }, 1200);
    } catch (err) {
        console.error("Copy error:", err);
        showStatus("Could not copy to clipboard.", true);
    }
});

inputTextEl.addEventListener("input", () => {
    const text = inputTextEl.value;
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
        if (text.trim()) {
            translate(text);
        } else {
            outputTextEl.value = "";
            showStatus("");
        }
    }, 700);
});

window.addEventListener("offline", () => {
    showStatus(OFFLINE_MESSAGE, true);
});

window.addEventListener("online", () => {
    showStatus("You are back online. You can translate again.");
});

/* -------------------- Init -------------------- */

document.addEventListener("DOMContentLoaded", () => {
    setDefaultSourceLanguage();
    setupRecognition();

    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
    }
});
