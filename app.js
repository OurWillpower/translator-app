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
    const langSelectSource = document.getElementById("language-select-source"); // "From"
    const langSelectTarget = document.getElementById("language-select-target"); // "To"
    const voiceSelect = document.getElementById("voice-select");
    const voiceSelectWrapper = document.getElementById("voice-select-wrapper");
    const inputText = document.getElementById("input-text");
    const outputText = document.getElementById("output-text");
    const status = document.getElementById("status");
    const clearButton = document.getElementById("clear-button");
    const copyButton = document.getElementById("copy-button");
    const muteButton = document.getElementById("mute-button");

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; 
    recognition.lang = langSelectSource.value; 

    let voices = []; 
    let isMuted = false;
    let isListening = false; 

    // --- 1. Populate Voice List ---
    function populateVoiceList() {
        const selectedLangCode = langSelectTarget.value; // Point to the "To" language
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
    
    // Update UI when user changes "To" language
    langSelectTarget.addEventListener("change", populateVoiceList);
    
    // Update recognition language when user changes "From" language
    langSelectSource.addEventListener("change", () => {
        recognition.lang = langSelectSource.value;
    });
    
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

    // --- 4. Text-to-Speech Function ---
    const playTranslation = (textToSpeak) => {
        if (isMuted) return;
        if (textToSpeak && synthesis.speaking) synthesis.cancel();
        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;
            let voice = voices.find(v => v.name === selectedVoiceName);
            if (!voice) {
                // Find first voice for the "To" language
                voice = voices.find(v => v.lang.startsWith(langSelectTarget.value));
            }
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                utterance.lang = langSelectTarget.value;
            }
            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice for this language?";
                // THIS IS THE FIX: The typo "Gj" is gone.
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            synthesis.speak(utterance);
        }
    };

    // --- 5. Speech-to-Text Logic ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        
        // Use the "From" language, removing the region code (e.g., "en-US" -> "en")
        doTranslate(spokenText, true, langSelectSource.value.split('-')[0]); 
    };

    recognition.onstart = () => {
        status.textContent = "Listening...";
        talkButton.classList.add("recording"); 
        talkButton.textContent = "🛑 Press again to Stop"; 
    };

    recognition.onend = () => {
        status.textContent = "";
        talkButton.classList.remove("recording"); 
        talkButton.textContent = "🎤 Press to Speak"; 
        isListening = false; 
    };

    recognition.onerror = (event) => {
        status.textContent = `Error: ${event.error}. Try again.`;
        isListening = false;
    };

    // "tap-on/tap-off" logic
    talkButton.addEventListener("click", () => {
        if (!isListening) {
            try {
                // Set the correct language just before starting
                recognition.lang = langSelectSource.value;
                isListening = true;
                recognition.start();
            } catch (e) {
                console.error("Recognition already started.", e);
                isListening = false;
            }
        } else {
            recognition.stop();
        }
    });


    // --- 6. Translation Logic ---
    const doTranslate = async (textToTranslate, autoPlay = false, sourceLang) => {
        if (!textToTranslate) {
            outputText.value = "";
            return;
        }
        status.textContent = "Translating...";
        const targetLang = langSelectTarget.value;
        
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
            const res = await fetch(url);
            if (!res.ok) { throw new Error(`API error: ${res.status}`); }
            const data = await res.json();
            const translatedText = data[0].map(segment => segment[0]).join('');
            outputText.value = translatedText;
            status.textContent = "";
            
            // Refresh the voice list
            populateVoiceList();

            // If autoPlay is true AND we have voices, play it!
            if (autoPlay && voiceSelectWrapper.style.display !== 'none') {
                playTranslation(translatedText);
            }

        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    
    // --- THIS IS THE FINAL FIX ---
    // Translate on type
    inputText.addEventListener("blur", () => {
        // We now use the "From" dropdown for typing too!
        // This fixes the transliteration bug.
        const sourceLang = langSelectSource.value.split('-')[0];
        doTranslate(inputText.value, true, sourceLang); 
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
