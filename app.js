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

    // exact match
    let v = voices.find(v => v.lang.toLowerCase() === codeLower);
    if (v) return v;

    // language prefix
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

/* ---- Default source language (India-aware) ---- */

function setDefaultSourceLanguage() {
    try {
        const navLangRaw = (navigator.language || "").toLowerCase();
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

        const isIndia =
            tzLower.includes("kolkata") ||
            tzLower.includes("calcutta") ||
            navLangRaw.endsWith("-in");

        if (isIndia) {
            if (navLangRaw.startsWith("mr")) {
                defaultCode = "mr-IN";
            } else {
                defaultCode = "hi-IN";
            }
        }

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

/* -------------------- Input–language validation -------------------- */

/**
 * For some scripts (Hindi, Marathi, etc.), ensure the typed text actually
 * contains characters from that script. This prevents strange translations
 * like "Hello" in Latin letters -> random phrase.
 */

const SCRIPT_REGEX = {
    devanagari: /[\u0900-\u097F]/,    // Hindi, Marathi, Nepali, etc.
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

/**
 * Decide which script we expect based on the selected "From" language.
 * Only validate for languages where script is clear (Hindi, Marathi etc.).
 */
function getExpectedScriptForSourceLang(sourceCode) {
    if (!sourceCode) return null;
    const lc = sourceCode.toLowerCase();

    if (lc.startsWith("hi") || lc.startsWith("mr") || lc.startsWith("ne")) {
        return "devanagari";
    }
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

/**
 * Returns true if the text looks consistent with the selected "From" language.
 */
function inputMatchesSelectedLanguage(text, sourceCode) {
    const script = getExpectedScriptForSourceLang(sourceCode);
    if (!script) {
        // No special validation for this language
        return true;
    }
    const regex = SCRIPT_REGEX[script];
    if (!regex) return true;

    return regex.test(text);
}

/**
 * Show a short, crisp mismatch error in the selected input language where possible.
 */
function showLanguageMismatchError(sourceCodeRaw) {
    const baseMsg =
        "Text doesn’t match the From language. Use that script or Auto-Detect.";

    if (!sourceCodeRaw) {
        showStatus(baseMsg, true);
        return;
    }

    const lc = sourceCodeRaw.toLowerCase();
    const key = lc.split("-")[0]; // e.g. "hi-in" -> "hi"

    const messages = {
        // English
        en: "Text doesn’t match the From language. Use that script or Auto-Detect.",

        // German
        de: "Text passt nicht zur Quellsprache. Nutze deren Schrift oder Auto-Erkennung.",

        // Hindi
        hi: "टेक्स्ट चुनी हुई भाषा से मेल नहीं खाता। उसी लिपि में लिखें या Auto-Detect चुनें।",

        // Marathi
        mr: "मजकूर निवडलेल्या भाषेशी जुळत नाही. त्या लिपीत लिहा किंवा Auto-Detect वापरा.",

        // Spanish
        es: "El texto no coincide con el idioma origen. Usa esa escritura o Auto-Detect.",

        // French
        fr: "Le texte ne correspond pas à la langue source. Utilisez cette écriture ou Auto-Detect."
    };

    const msg = messages[key] || baseMsg;
    showStatus(msg, true);
}

/* -------------------- Translation (MyMemory) -------------------- */

async function translate(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
        showStatus("Type or speak something to translate.");
        return;
    }

    const sourceCodeRaw = sourceSelect.value;

    // Validate script vs selected "From" language
    if (sourceCodeRaw && sourceCodeRaw !== "auto") {
        const ok = inputMatchesSelectedLanguage(trimmed, sourceCodeRaw);
        if (!ok) {
            showLanguageMismatchError(sourceCodeRaw);
            return;
        }
    }

    // OFFLINE HANDLING – always show your exact message
    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
        return;
    }

    const sourceLang = mapSourceForTranslate(sourceCodeRaw);
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

    if (window.speechSynthesis) {
        warmVoices();
        window.speechSynthesis.onvoiceschanged = warmVoices;
    }

    if (isOffline()) {
        showStatus(OFFLINE_MESSAGE, true);
    }
});
