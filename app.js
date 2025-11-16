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
    const inputText = document.getElementById("inputText");
    const outputText = document.getElementById("outputText");
    const status = document.getElementById("status");
    const clearButton = document.getElementById("clear-button");
    const copyButton = document.getElementById("copy-button");
    const muteButton = document.getElementById("mute-button");
    
    // Get the icons for mute button control
    const iconSpeaker = document.getElementById("icon-speaker");
    const iconMute = document.getElementById("icon-mute");

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; 
    recognition.lang = langSelectSource.value; // Set initial input language

    let voices = []; 
    let isMuted = false;
    let isListening = false; 

    // --- 1. Populate Voice List (The Specific Voice Dropdown) ---
    function populateVoiceList() {
        // This function runs when the "To" language changes
        const selectedLangCode = langSelectTarget.value;
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
            // Hide the specific voice dropdown if no voices are available for the target language
            voiceSelectWrapper.style.display = "none";
        }
    }

    // --- 2. Load Voices (The 100% Reliable Dictionary Fix) ---
    function loadAndDisplayVoices() {
        // This function fills the *target* language dropdown with friendly names
        voices = synthesis.getVoices();
        
        if (voices.length > 0) {
            
            // This is our 100% reliable, hard-coded dictionary
            const languageDictionary = {
                "en": "English", "es": "Spanish", "fr": "French",
                "de": "German", "hi": "Hindi", "mr": "Marathi",
                "ja": "Japanese", "zh": "Chinese", "it": "Italian",
                "pt": "Portuguese", "ru": "Russian", "ko": "Korean",
                "ar": "Arabic", "el": "Greek", "he": "Hebrew",
                "id": "Indonesian", "nl": "Dutch", "pl": "Polish",
                "sv": "Swedish", "th": "Thai", "tr": "Turkish",
                "vi": "Vietnamese", "fi": "Finnish"
            };

            const languages = new Set(); 
            for (const voice of voices) {
                const langCode = voice.lang.split('-')[0];
                languages.add(langCode);
            }

            langSelectTarget.innerHTML = ""; 
            
            for (const lang of languages) {
                // Look up the name in our dictionary, or use the code if name is missing
                let langName = languageDictionary[lang] || lang;
                
                const option = document.createElement("option");
                option.value = lang;
                option.textContent = langName;

                // Set English as default target language
                if (lang === 'en') {
                    option.selected = true;
                }
                langSelectTarget.appendChild(option);
            }

            // After filling the target languages, fill the specific voice list
            populateVoiceList(); 
        } else {
            // Keep checking until voices are loaded (handles race condition)
            setTimeout(loadAndDisplayVoices, 100);
        }
    }

    // --- 3. Event Listeners (Setup) ---
    loadAndDisplayVoices(); 
    synthesis.onvoiceschanged = loadAndDisplayVoices; 
    
    langSelectTarget.addEventListener("change", populateVoiceList);
    
    // Update recognition language when user changes "From" language
    langSelectSource.addEventListener("change", () => {
        recognition.lang = langSelectSource.value;
    });
    
    // Mute Button Logic
    muteButton.addEventListener("click", () => {
        isMuted = !isMuted;
        if (isMuted) {
            muteButton.classList.add("muted");
            iconSpeaker.style.display = "none";
            iconMute.style.display = "block";
            synthesis.cancel();
        } else {
            muteButton.classList.remove("muted");
            iconSpeaker.style.display = "block";
            iconMute.style.display = "none";
        }
    });

    // --- 4. Text-to-Speech Function (Plays the voice) ---
    const playTranslation = (textToSpeak) => {
        if (isMuted) return;
        if (voices.length === 0) { return; } // Cannot play if voices haven't loaded

        if (textToSpeak && synthesis.speaking) synthesis.cancel();

        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            // Try to find specific voice based on user selection
            const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;
            let voice = voices.find(v => v.name === selectedVoiceName);
            
            // Fallback: Find the first voice for the target language
            if (!voice) {
                voice = voices.find(v => v.lang.startsWith(langSelectTarget.value));
            }
            
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                status.textContent = "No voice found for this language.";
                return; 
            }
            
            utterance.onerror = (event) => {
                status.textContent = "Speech error.";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            synthesis.speak(utterance);
        }
    };

    // --- 5. Speech-to-Text Logic (Tap-to-Speak) ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        // Auto-play the translation using the recognized source language
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

    // Tap-to-start/Tap-to-stop logic
    talkButton.addEventListener("click", () => {
        if (!isListening) {
            try {
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


    // --- 6. Translation Logic (Main API Call) ---
    const doTranslate = async (textToTranslate, autoPlay = false, sourceLang) => {
        if (!textToTranslate) {
            outputText.value = "";
            return;
        }
        status.textContent = "Translating...";
        const targetLang = langSelectTarget.value;
        
        try {
            // Uses the free Google API endpoint
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
            const res = await fetch(url);
            if (!res.ok) { throw new Error(`API error: ${res.status}`); }
            const data = await res.json();
            const translatedText = data[0].map(segment => segment[0]).join('');
            outputText.value = translatedText;
            status.textContent = "";
            
            populateVoiceList();

            if (autoPlay) {
                playTranslation(translatedText);
            }
        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    
    // Auto-translate and auto-play when user finishes typing
    inputText.addEventListener("blur", () => {
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
