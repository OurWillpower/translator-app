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
let voices = [];   // for TTS selection

/* -------------------- Constants -------------------- */

const OFFLINE_MESSAGE =
    "You are offline. Speakly needs internet to translate. Use Speakly Pro for seamless offline use.";

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

    return code;
}

/* ---- Voice warm-up ---- */

function warmVoices() {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const list = synth.getVoices();
    if (list && list.length) {
        voices = list;
    }
}

function chooseVoiceForLang(langCode) {
    if (!voices || !voices.length) return null;
    const codeLower = langCode.toLowerCase();

    let v = voices.find(v => v.lang.toLowerCase() === codeLower);
    if (v) return v;

    const prefix = codeLower.split("-")[0];
    v = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
    if (v) return v;

    return null;
}

function speakTranslation(text) {
    if (isMuted || !window.speechSynthesis || !text) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    if (!voices || !voices.length) {
        warmVoices();
    }

    const utter = new SpeechSynthesisUtterance(text);
    const targetCode = targetSelect.value || "en";

    const lang = getSpeechLangFromTarget(targetCode);
    utter.lang = lang;

    const matchedVoice = chooseVoiceForLang(lang);
    if (matchedVoice) {
        utter.voice = matchedVoice;
    }

    synth.speak(utter);
}

/* -------------------- Input–language validation -------------------- */

const SCRIPT_REGEX = {
    devanagari: /[\u0900-\u097F]/,
    bengali: /[\u0980-\u09FF]/,
    gurmukhi: /[\u0A00-\u0A7F]/,
    gujarati: /[\u0A80-\u0AFF]/,
    oriya: /[\u0B00-\u0B7F]/,
    tamil: /[\u0B80-\u0BFF]/,
    telugu: /[\u0C00-\u0C7F]/,
    kannada: /[\u0C80-\u0CFF]/,
    malayalam: /[\u0D00-\u0D7F]/,
    sinhala: /[\u0D80-\u0DFF]/,
    thai: /[\u0E00-\u0E7F]/,
};

function getExpectedScriptForSourceLang(sourceCode) {
    if (!sourceCode) return null;
    const lc = sourceCode.toLowerCase();

    if (lc.startsWith("hi") || lc.startsWith("mr") || lc.startsWith("ne")) return "devanagari";
    if (lc.startsWith("bn")) return "bengali";
    if (lc.startsWith("pa")) return "gurmukhi";
    if (lc.startsWith("gu")) return "gujarati";
    if (lc.startsWith("or")) return "oriya";
    if (lc.startsWith("ta")) return "tamil";
    if (lc.startsWith("te")) return "telugu";
    if (lc.startsWith("kn")) return "kannada";
    if (lc.startsWith("ml")) return "malayalam";
    if (lc.startsWith("si")) return "sinhala";
    if (lc.startsWith("th")) return "thai";

    return null;
}

function inputMatchesSelectedLanguage(text, sourceCode) {
    const script = getExpectedScriptForSourceLang(sourceCode);
    if (!script) return true;
    const regex = SCRIPT_REGEX[script];
    if (!regex) return true;

    return regex.test(text);
}

function showLanguageMismatchError() {
    showStatus("टेक्स्ट चुनी हुई भाषा से मेल नहीं खाता", true);
}

/* -------------------- Translation (MyMemory) -------------------- */

async function translate(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
        showStatus("");
        return;
    }

    const sourceCodeRaw = sourceSelect.value;

    if (sourceCodeRaw && sourceCodeRaw !== "auto") {
        const ok = inputMatchesSelectedLanguage(trimmed, sourceCodeRaw);
        if (!ok) {
            showLanguageMismatchError();
            return;
        }
    }

    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
        return;
    }

    const sourceLang = mapSourceForTranslate(sourceCodeRaw);
    const targetLang = targetSelect.value || "en";

    const srcCode = sourceLang === "auto" ? "auto" : sourceLang;
    const tgtCode = targetLang;

    setLoading(true);
    showStatus("");

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
        if (!translated) throw new Error("No translated text.");

        outputTextEl.value = translated;
        speakTranslation(translated);

    } catch (err) {
        console.error("Translation error:", err);

        if (isOffline()) {
            showStatus(OFFLINE_MESSAGE, true);
        } else {
            showStatus("Unable to translate right now.", true);
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
        showStatus("Speech not supported. Type instead.", true);
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
    };

    recognition.onend = () => {
        isListening = false;
        talkButton.style.opacity = "1";
        const span = talkButton.querySelector("span:last-child");
        if (span) span.textContent = "Press to Speak";
    };

    recognition.onerror = () => {
        showStatus("Mic access error.", true);
    };

    recognition.onresult = event => {
        const transcript = Array.from(event.results)
            .map(r => r[0].transcript)
            .join(" ");
        inputTextEl.value = transcript;
        translate(transcript);
    };
}

/* -------------------- Event listeners -------------------- */

talkButton.addEventListener("click", () => {
    if (!recognition) return;

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
        showStatus("Mic error.", true);
    }
});

muteButton.addEventListener("click", () => {
    isMuted = !isMuted;
    iconSpeaker.style.display = isMuted ? "none" : "inline";
    iconMute.style.display = isMuted ? "inline" : "none";
});

clearButton.addEventListener("click", () => {
    inputTextEl.value = "";
    outputTextEl.value = "";
    showStatus("");
});

copyButton.addEventListener("click", async () => {
    const text = outputTextEl.value.trim();
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        iconCopy.style.display = "none";
        iconCheck.style.display = "inline";
        setTimeout(() => {
            iconCopy.style.display = "inline";
            iconCheck.style.display = "none";
        }, 1200);
    } catch (err) {
        showStatus("Copy failed.", true);
    }
});

/* 
---------------------------------------------------------------
 NEW FEATURE: Auto-translate on Enter, Tab, or leaving the box
---------------------------------------------------------------
*/

inputTextEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        translate(inputTextEl.value);
    }
    if (e.key === "Tab") {
        translate(inputTextEl.value);
    }
});

inputTextEl.addEventListener("blur", () => {
    translate(inputTextEl.value);
});

/* -------------------- Init -------------------- */

document.addEventListener("DOMContentLoaded", () => {
    setupRecognition();

    if (window.speechSynthesis) {
        warmVoices();
        window.speechSynthesis.onvoiceschanged = warmVoices;
    }

    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
    }
});
