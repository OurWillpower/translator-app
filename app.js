// Speakly app logic
// Speech: Web Speech API (if available in browser)
// Translation: MyMemory free translation API (no key)

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
    statusEl.style.color = isError ? "#ff6b81" : "#e1d0a6";
}

function setLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? "flex" : "none";
}

// map "en-US" -> "en", "hi-IN" -> "hi"
function mapSourceForTranslate(code) {
    if (!code || code === "auto") return "auto";
    const lower = code.toLowerCase();
    return lower.split("-")[0]; // part before "-"
}

function speakTranslation(text) {
    if (isMuted || !window.speechSynthesis || !text) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const targetCode = targetSelect.value || "en";

    const selectedVoiceName = voiceSelect.value;
    if (selectedVoiceName && voices.length) {
        const found = voices.find(v => v.name === selectedVoiceName);
        if (found) utter.voice = found;
    }

    utter.lang = (utter.voice && utter.voice.lang) || targetCode || "en-US";

    synth.speak(utter);
}

/* -------------------- Translation (MyMemory) -------------------- */

async function translate(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
        showStatus("Type or speak something to translate.");
        return;
    }

    // Read exactly what is selected NOW
    const sourceLang = mapSourceForTranslate(sourceSelect.value); // e.g. "en-US" -> "en"
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
        console.error(err);
        showStatus(
            "Could not translate right now. Please check your internet or try a different language pair.",
            true
        );
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
        talkButton.querySelector("span").textContent = "Listening...";
        showStatus("Listening… speak now.");
    };

    recognition.onend = () => {
        isListening = false;
        talkButton.style.opacity = "1";
        talkButton.querySelector("span").textContent = "Press to Speak";
        if (loadingIndicator.style.display === "none") {
            showStatus("");
        }
    };

    recognition.onerror = event => {
        console.error(event);
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

/* -------------------- Voices -------------------- */

function populateVoices() {
    if (!window.speechSynthesis) return;

    voices = window.speechSynthesis.getVoices();

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

    try {
        const src = sourceSelect.value;
        recognition.lang = src && src !== "auto" ? src : "en-US";
        recognition.start();
    } catch (err) {
        console.error(err);
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
        console.error(err);
        showStatus("Could not copy to clipboard.", true);
    }
});

// Type-to-translate with small delay
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
    setupRecognition();
    populateVoices();

    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
    }
});
