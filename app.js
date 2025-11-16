// Wait for the DOM to be ready
document.addEventListener("DOMContentLoaded", () => {
    
    // Check if the browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Sorry, your browser doesn't support speech recognition. Try Chrome.");
        return;
    }

    // Check if the browser supports Speech Synthesis
    const synthesis = window.speechSynthesis;
    if (!synthesis) {
        alert("Sorry, your browser doesn't support speech synthesis.");
        return;
    }

    // Get all the HTML elements we need
    const talkButton = document.getElementById("talk-button");
    const langSelect = document.getElementById("language-select");
    const voiceSelect = document.getElementById("voice-select");
    const voiceSelectWrapper = document.getElementById("voice-select-wrapper");
    const inputText = document.getElementById("input-text");
    const outputText = document.getElementById("output-text");
    const status = document.getElementById("status");
    const clearButton = document.getElementById("clear-button");
    const copyButton = document.getElementById("copy-button");
    const muteButton = document.getElementById("mute-button");
    const recordToggle = document.getElementById("record-toggle"); // NEW

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; // We only want final results

    let voices = []; // We will fill this array with all available voices
    let isMuted = false;
    let isRecordMode = false; // NEW: State for our toggle
    let isListening = false; // NEW: State for "Record" mode

    // --- 1. Populate Voice List ---
    function populateVoiceList() {
        const selectedLangCode = langSelect.value;
        const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;

        voiceSelect.innerHTML = '<option value="">Default</option>';
        
        let langVoices = [];
        for (const voice of voices) {
            if (voice.lang.startsWith(selectedLangCode)) {
                langVoices.push(voice);
            }
        }

        if (langVoices.length > 0) {
            voiceSelectWrapper.style.display = "block";
            for (const voice of langVoices) {
                const option = document.createElement("option");
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute("data-lang", voice.lang);
                option.setAttribute("data-name", voice.name);
                if (voice.name === selectedVoiceName) {
                    option.selected = true;
                }
                voiceSelect.appendChild(option);
            }
        } else {
            voiceSelectWrapper.style.display = "none";
        }
    }

    // --- 2. Load Voices ---
    function loadAndDisplayVoices() {
        voices = synthesis.getVoices();
        if (voices.length > 0) {
            populateVoiceList();
        } else {
            setTimeout(loadAndDisplayVoices, 100);
        }
    }

    // --- 3. Event Listeners ---
    loadAndDisplayVoices(); 
    synthesis.onvoiceschanged = loadAndDisplayVoices;
    langSelect.addEventListener("change", populateVoiceList);
    
    muteButton.addEventListener("click", () => {
        isMuted = !isMuted;
        if (isMuted) {
            muteButton.textContent = "🔇";
            muteButton.classList.add("muted");
            synthesis.cancel();
        } else {
            muteButton.textContent = "🔊";
            muteButton.classList.remove("muted");
        }
    });

    // NEW: Listen for changes to the "Long Note" toggle
    recordToggle.addEventListener("change", () => {
        isRecordMode = recordToggle.checked;
        if (isRecordMode) {
            talkButton.textContent = "🎤 Tap to Record";
        } else {
            talkButton.textContent = "🎤 Hold to Talk";
        }
    });

    // --- 4. Text-to-Speech Function ---
    const playTranslation = (textToSpeak) => {
        if (isMuted) return;
        if (textToSpeak && synthesis.speaking) synthesis.cancel();
        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;
            let voice = voices.find(v => v.name === selectedVoiceName);
            if (!voice) {
                voice = voices.find(v => v.lang.startsWith(langSelect.value));
            }
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                utterance.lang = langSelect.value;
            }
            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice for this language?";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            synthesis.speak(utterance);
        }
    };

    // --- 5. Speech-to-Text Logic (HEAVILY UPDATED) ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        doTranslate(spokenText, true); // auto-play
    };

    recognition.onstart = () => {
        status.textContent = "Listening...";
        talkButton.classList.add("recording");
    };

    recognition.onend = () => {
        status.textContent = "";
        talkButton.classList.remove("recording");
        isListening = false; // Always set listening to false when recognition ends
        if (isRecordMode) {
            talkButton.textContent = "🎤 Tap to Record";
        } else {
            talkButton.textContent = "🎤 Hold to Talk";
        }
    };

    recognition.onerror = (event) => {
        status.textContent = `Error: ${event.error}. Try again.`;
        isListening = false;
    };

    // NEW: Re-written talk button logic
    
    // "Hold to Talk" mode (default)
    talkButton.addEventListener("mousedown", () => {
        if (!isRecordMode && !isListening) { // Only run if NOT in record mode
            try {
                isListening = true;
                recognition.start();
            } catch (e) {
                console.error("Recognition already started.", e);
            }
        }
    });

    talkButton.addEventListener("mouseup", () => {
        if (!isRecordMode && isListening) { // Only run if NOT in record mode
            recognition.stop();
            isListening = false;
        }
    });

    // "Tap to Record" mode
    talkButton.addEventListener("click", () => {
        if (isRecordMode) { // Only run IF in record mode
            if (!isListening) {
                // Start recording
                try {
                    isListening = true;
                    recognition.start();
                    talkButton.textContent = "🛑 Tap to Stop";
                } catch (e) {
                    console.error("Recognition already started.", e);
                }
            } else {
                // Stop recording
                recognition.stop();
                isListening = false;
                talkButton.textContent = "🎤 Tap to Record";
            }
        }
    });


    // --- 6. Translation Logic ---
    const doTranslate = async (textToTranslate, autoPlay = false) => {
        if (!textToTranslate) {
            outputText.value = "";
            return;
        }
        status.textContent = "Translating...";
        const targetLang = langSelect.value;
        const sourceLang = "auto";
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
            const res = await fetch(url);
            if (!res.ok) { throw new Error(`API error: ${res.status}`); }
            const data = await res.json();
            const translatedText = data[0].map(segment => segment[0]).join('');
            outputText.value = translatedText;
            status.textContent = "";
            
            const detectedLangCode = data[2].split('-')[0];
            if(langSelect.value === 'auto') {
                 if ([...langSelect.options].some(o => o.value === detectedLangCode)) {
                    langSelect.value = detectedLangCode;
                 }
            }
            
            populateVoiceList();

            if (autoPlay && voiceSelectWrapper.style.display !== 'none') {
                playTranslation(translatedText);
            }

        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    
    // Translate on type
    inputText.addEventListener("blur", () => {
        doTranslate(inputText.value, true); // auto-play
    });

    // --- 7. Helper Button Logic ---
    
    clearButton.addEventListener("click", () => {
        inputText.value = "";
        outputText.value = "";
        status.textContent = "";
    });

    copyButton.addEventListener("click", () => {
        const textToCopy = outputText.value;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    status.textContent = "Translation copied to clipboard!";
                    setTimeout(() => { status.textContent = ""; }, 2000);
                })
                .catch(err => {
                    status.textContent = "Failed to copy.";
                    console.error("Failed to copy text: ", err);
                });
        }
    });
});
