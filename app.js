// Speakly app logic
// Uses: Web Speech API (for speech-to-text + text-to-speech)
//       LibreTranslate public instance (for text translation)

/* -------------------- DOM references -------------------- */

const sourceSelect = document.getElementById("language-select-source");
const targetSelect = document.getElementById("language-select-target");
const voiceSelect  = document.getElementById("voice-select");

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
let voices = [];

/* -------------------- Helpers -------------------- */

function showStatus(message, isError = false) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#ff6b81" : "#a9b3cf";
}

function setLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? "flex" : "none";
}

function savePreferences() {
    try {
        localStorage.setItem("speakly_source_lang", sourceSelect.value);
        localStorage.setItem("speakly_target_lang", targetSelect.value);
        localStorage.setItem("speakly_voice", voiceSelect.value);
    } catch (e) {
        // ignore storage errors
    }
}

function restorePreferences() {
    try {
        const src = localStorage.getItem("speakly_source_lang");
        const tgt = localStorage.getItem("speakly_target_lang");
        const voiceId = localStorage.getItem("speakly_voice");

        if (src && [...sourceSelect.options].some(o => o.value === src)) {
            sourceSelect.value = src;
        }
        if (tgt && [...targetSelect.options].some(o => o.value === tgt)) {
            targetSelect.value = tgt;
        }
        if (voiceId) {
            voiceSelect.value = voiceId;
        }
    } catch (e) {
        // ignore
    }
}

function mapSourceForTranslate(code) {
    if (!code || code === "auto") return "auto";
    return code.slice(0, 2); // "en-US" -> "en"
}

function speakTranslation(text) {
    if (isMuted || !window.speechSynthesis || !text) return;

    const synth = window.speechSynthesis;
    synth.cancel(); // stop any ongoing speech

    const utter = new SpeechSynthesisUtterance(text);
    const targetCode = targetSelect.value || "en";

    // Try to use selected voice
    const selectedVoiceName = voiceSelect.value;
    if (selectedVoiceName && voices.length) {
        const found = voices.find(v => v.name === selectedVoiceName);
        if (found) utter.voice = found;
    }

    // Best-effort language mapping
    utter.lang = (utter.voice && utter.voice.lang) || (targetCode.length === 2 ? targetCode : "en-US");

    synth.speak(utter);
}

/* -------------------- Translation -------------------- */

async function translate(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
        showStatus("Type or speak something to translate.");
        return;
    }

    const sourceLang = mapSourceForTranslate(sourceSelect.value);
    const targetLang = targetSelect.value || "en";

    setLoading(true);
    showStatus("Translating...");

    try {
        // Public LibreTranslate instance (no API key)
        const response = await fetch("https://libretranslate.de/translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                q: trimmed,
                source: sourceLang === "auto" ? "auto" : sourceLang,
                target: targetLang,
                format: "text"
            })
        });

        const data = await response.json();

        if (!response.ok || !data || (!data.translatedText && !data.error)) {
            throw new Error("Could not get a translation response.");
        }

        if (data.error) {
            throw new Error(data.error);
        }

        const translated = data.translatedText || "";
        outputTextEl.value = translated;
        showStatus("Translation ready.");
        speakTranslation(translated);
    } catch (err) {
        console.error(err);
        showStatus("Could not translate. Please check your connection or try another language.", true);
    } finally {
        setLoading(false);
    }
}

/* -------------------- Speech recognition -------------------- */

function setupRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showStatus("Speech recognition is not supported in this browser. You can still type to translate.", true);
        talkButton.disabled = false;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        talkButton.textContent = "🎤 Listening...";
        talkButton.style.opacity = "0.85";
        showStatus("Listening… speak now.");
    };

    recognition.onend = () => {
        isListening = false;
        talkButton.textContent = "🎤 Press to Speak";
        talkButton.style.opacity = "1";
        if (!loadingIndicator.style.display || loadingIndicator.style.display === "none") {
            showStatus("");
        }
    };

    recognition.onerror = (event) => {
        console.error(event);
        showStatus("Could not access microphone or understand speech. Please try again.", true);
    };

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(r => r[0].transcript)
            .join(" ");

        inputTextEl.value = transcript;
        translate(transcript);
    };

    talkButton.disabled = false;
}

/* -------------------- Voices -------------------- */

function populateVoices() {
    if (!window.speechSynthesis) return;

    voices = window.speechSynthesis.getVoices();

    // Clear existing options except first "Default"
    while (voiceSelect.options.length > 1) {
        voiceSelect.remove(1);
    }

    voices
        .slice()
        .sort((a, b) => a.lang.localeCompare(b.lang))
        .forEach(voice => {
            const option = document.createElement("option");
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

    // Re-apply saved preference if available
    try {
        const savedVoice = localStorage.getItem("speakly_voice");
        if (savedVoice && [...voiceSelect.options].some(o => o.value === savedVoice)) {
            voiceSelect.value = savedVoice;
        }
    } catch (e) {
        // ignore
    }
}

/* -------------------- Event listeners -------------------- */

// Save preferences on language / voice change
sourceSelect.addEventListener("change", savePreferences);
targetSelect.addEventListener("change", savePreferences);
voiceSelect.addEventListener("change", savePreferences);

// Talk button
talkButton.addEventListener("click", () => {
    if (!recognition) {
        showStatus("Speech recognition is not available in this browser.", true);
        return;
    }
    if (isListening) {
        recognition.stop();
        return;
    }

    try {
        const src = sourceSelect.value;
        if (src && src !== "auto") {
            recognition.lang = src;
        } else {
            recognition.lang = "en-US";
        }
        recognition.start();
    } catch (err) {
        console.error(err);
        showStatus("Unable to start listening. Please check microphone permissions.", true);
    }
});

// Mute button
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

// Clear button
clearButton.addEventListener("click", () => {
    inputTextEl.value = "";
    outputTextEl.value = "";
    showStatus("");
});

// Copy button
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
        console.error(err);
        showStatus("Could not copy to clipboard.", true);
    }
});

// Auto-translate when typing (with a small delay)
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

/* -------------------- Init -------------------- */

document.addEventListener("DOMContentLoaded", () => {
    restorePreferences();
    setupRecognition();
    populateVoices();

    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
    }
});
