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

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; // We only want final results

    let voices = []; // We will fill this array with all available voices

    // --- 1. Populate Voice List (Now much simpler) ---
    function populateVoiceList() {
        const selectedLangCode = langSelect.value;
        const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;

        voiceSelect.innerHTML = '<option value="">Default</option>';
        
        let langVoices = []; // Array to hold all voices for this language
        
        // Find *all* voices for the selected language
        for (const voice of voices) {
            if (voice.lang.startsWith(selectedLangCode)) {
                langVoices.push(voice);
            }
        }

        // Check if we found *any* voices for the language
        if (langVoices.length > 0) {
            // If yes, show the voice dropdown
            voiceSelectWrapper.style.display = "block";
            
            // Populate the dropdown with the voices we found
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
            // If no voices found for the language, HIDE the dropdown
            voiceSelectWrapper.style.display = "none";
        }
    }

    // --- 2. Load Voices (The "Controller") ---
    function loadAndDisplayVoices() {
        voices = synthesis.getVoices();
        
        if (voices.length > 0) {
            populateVoiceList();
        } else {
            // Voices aren't ready. Try again in a moment.
            setTimeout(loadAndDisplayVoices, 100);
        }
    }

    // --- 3. Event Listeners ---
    loadAndDisplayVoices(); 
    synthesis.onvoiceschanged = loadAndDisplayVoices;
    
    // Update UI when user changes dropdowns
    langSelect.addEventListener("change", populateVoiceList);
    // "genderSelect" listener is gone


    // --- 4. Text-to-Speech Function ---
    const playTranslation = (textToSpeak) => {
        if (textToSpeak && synthesis.speaking) {
            synthesis.cancel(); // Stop if already speaking
        }

        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            // 1. Try to get the user's *specific* choice from the dropdown
            const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;
            let voice = voices.find(v => v.name === selectedVoiceName);
            
            // 2. If no specific choice, just find the *first available voice*
            if (!voice) {
                voice = voices.find(v => v.lang.startsWith(langSelect.value));
            }
            
            // 3. If we found a voice, use it.
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                // 4. If no voice exists at all, use the browser default
                utterance.lang = langSelect.value;
            }
            
            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice for this language?";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            
            synthesis.speak(utterance);
        }
    };
    
    // "speakButton" listener is gone

    // --- 5. Speech-to-Text Logic ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        status.textContent = "";
        talkButton.classList.remove("recording");
        talkButton.textContent = "🎤 Hold to Talk";
        
        doTranslate(spokenText, true); // auto-play
    };
    recognition.onstart = () => {
        status.textContent = "Listening...";
        talkButton.classList.add("recording");
        talkButton.textContent = "🛑 Listening...";
    };
    recognition.onend = () => {
        status.textContent = "";
        talkButton.classList.remove("recording");
        talkButton.textContent = "🎤 Hold to Talk";
    };
    recognition.onerror = (event) => {
        status.textContent = `Error: ${event.error}. Try again.`;
    };
    talkButton.addEventListener("mousedown", () => {
        try { recognition.start(); } catch (e) { console.error("Recognition already started.", e); }
    });
    talkButton.addEventListener("mouseup", () => {
        recognition.stop();
    });

    // --- 6. Translation Logic (THIS IS THE FIX) ---
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
            
            // Refresh the voice list
            populateVoiceList();

            // If autoPlay is true AND we have voices, play it!
            if (autoPlay && voiceSelectWrapper.style.display !== 'none') {
                playTranslation(translatedText);
            }

        } catch (error) { // <-- THE TYPO WAS HERE
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    
    // We also need to translate if the user *types*
    // We will add a 'blur' event, which fires when
    // the user clicks out of the text box.
    inputText.addEventListener("blur", () => {
        doTranslate(inputText.value, false); // No auto-play
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
