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
    const translateButton = document.getElementById("translate-button");
    const speakButton = document.getElementById("speak-button");
    const langSelect = document.getElementById("language-select");
    const genderSelect = document.getElementById("gender-select"); 
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

    // --- 1. Populate Voice List (The "View") ---
    // This function just UPDATES the UI based on the 'voices' array
    function populateVoiceList() {
        const selectedLangCode = langSelect.value;
        const selectedGender = genderSelect.value;
        const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;

        voiceSelect.innerHTML = '<option value="">Default for language</option>';
        
        let langVoices = []; // Array to hold all voices for this language
        
        // Step 1: Find *all* voices for the selected language
        for (const voice of voices) {
            if (voice.lang.startsWith(selectedLangCode)) {
                langVoices.push(voice);
            }
        }

        // Step 2: Check if we found *any* voices for the language
        if (langVoices.length > 0) {
            // If yes, ALWAYS show the "Play" button
            speakButton.style.display = "block";

            // Now, filter this list by gender
            let genderVoices = [];
            for (const voice of langVoices) {
                const name = voice.name.toLowerCase();
                if (selectedGender === 'female' && (name.includes('female') || name.includes('zira') || name.includes('susan'))) {
                    genderVoices.push(voice);
                } else if (selectedGender === 'male' && (name.includes('male') || name.includes('david') || name.includes('mark'))) {
                    genderVoices.push(voice);
                }
            }

            // If we found gender-specific voices, use them.
            // Otherwise, just use the full list of language voices.
            let voicesToDisplay = (genderVoices.length > 0) ? genderVoices : langVoices;
            
            // Show the "Specific Voice" dropdown
            voiceSelectWrapper.style.display = "block";
            
            // Populate the dropdown with the voices we found
            for (const voice of voicesToDisplay) {
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
            // If no voices found for the language, HIDE both buttons
            speakButton.style.display = "none";
            voiceSelectWrapper.style.display = "none";
        }
    }

    // --- 2. Load Voices (The "Controller") ---
    // This is the NEW, robust function to GET the voices
    function loadAndDisplayVoices() {
        voices = synthesis.getVoices();
        
        if (voices.length > 0) {
            // SUCCESS! Voices are loaded.
            // Now we can populate the list.
            populateVoiceList();
        } else {
            // Voices aren't ready. Try again in a moment.
            setTimeout(loadAndDisplayVoices, 100);
        }
    }

    // --- 3. Event Listeners ---
    // Try to load voices immediately
    loadAndDisplayVoices(); 

    // Also, listen for the "official" event
    synthesis.onvoiceschanged = loadAndDisplayVoices;
    
    // Update UI when user changes dropdowns
    langSelect.addEventListener("change", populateVoiceList);
    genderSelect.addEventListener("change", populateVoiceList);


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

            // 2. If no specific choice, find the *first* voice that matches the gender
            if (!voice) {
                const selectedGender = genderSelect.value;
                for (const v of voices) {
                    if (v.lang.startsWith(langSelect.value)) {
                        const name = v.name.toLowerCase();
                        if (selectedGender === 'female' && (name.includes('female') || name.includes('zira') || name.includes('susan'))) {
                            voice = v; // Found a female voice!
                            break;
                        } else if (selectedGender === 'male' && (name.includes('male') || name.includes('david') || name.includes('mark'))) {
                            voice = v; // Found a male voice!
                            break;
                        }
                    }
                }
            }
            
            // 3. If STILL no voice (e.g., no gender match),
            //    just find the *first available voice* for that language
            if (!voice) {
                voice = voices.find(v => v.lang.startsWith(langSelect.value));
            }
            
            // 4. If we *finally* found a voice, use it.
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                // 5. If no voice exists at all, use the browser default
                utterance.lang = langSelect.value;
            }
            
            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice for this language?";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            
            synthesis.speak(utterance);
        }
    };
    
    // Add click event for the manual "Play" button
    speakButton.addEventListener("click", () => playTranslation(outputText.value));


    // --- 5. Speech-to-Text Logic ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        status.textContent = "";
        talkButton.classList.remove("recording");
        talkButton.textContent = "🎤 Hold to Talk";
        
        doTranslate(spokenText, true); 
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
            
            // Now, refresh the voice list
            // This will use the 'voices' array which is now full
            populateVoiceList();

            // If autoPlay is true AND we have voices, play it!
            if (autoPlay && speakButton.style.display !== 'none') {
                playTranslation(translatedText);
            }

        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    
    // When the user *types* and clicks, we do NOT auto-play
    translateButton.addEventListener("click", () => {
        doTranslate(inputText.value, false);
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

    // --- 8. Initial Check ---
    // (This is now handled by the new loadAndDisplayVoices function)
});
