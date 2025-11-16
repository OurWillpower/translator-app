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
    const voiceSelect = document.getElementById("voice-select");
    const voiceSelectWrapper = document.getElementById("voice-select-wrapper"); // Get the wrapper
    const inputText = document.getElementById("input-text");
    const outputText = document.getElementById("output-text");
    const status = document.getElementById("status");
    const clearButton = document.getElementById("clear-button");
    const copyButton = document.getElementById("copy-button");

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; // We only want final results

    let voices = []; // We will fill this array with all available voices

    // --- 1. Load Voices Function ---
    function populateVoiceList() {
        voices = synthesis.getVoices(); // Get all voices from the device
        
        const selectedLangCode = langSelect.value;
        const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;

        voiceSelect.innerHTML = '<option value="">Default for language</option>';
        
        let foundVoices = 0; // Let's count how many voices we find

        for (const voice of voices) {
            if (voice.lang.startsWith(selectedLangCode)) {
                foundVoices++; // We found one!
                const option = document.createElement("option");
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute("data-lang", voice.lang);
                option.setAttribute("data-name", voice.name);

                if (voice.name === selectedVoiceName) {
                    option.selected = true;
                }
                voiceSelect.appendChild(option);
            }
        }

        // Check if we found any voices for the selected language
        if (foundVoices > 0) {
            // If yes, show the "Play" button and the voice selector
            speakButton.style.display = "block";
            voiceSelectWrapper.style.display = "block";
        } else {
            // If no, HIDE the "Play" button and voice selector
            speakButton.style.display = "none";
            voiceSelectWrapper.style.display = "none";
        }
    }

    // This is the *most important* part.
    synthesis.onvoiceschanged = populateVoiceList;
    
    // --- 2. Update voice list when language changes ---
    langSelect.addEventListener("change", populateVoiceList);

    // --- 5. Text-to-Speech Function (MOVED) ---
    // We moved this function so doTranslate can call it
    const playTranslation = (textToSpeak) => {
        if (textToSpeak && synthesis.speaking) {
            synthesis.cancel(); // Stop if already speaking
        }

        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;
            const voice = voices.find(v => v.name === selectedVoiceName);

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
    
    // Add click event for the manual "Play" button
    speakButton.addEventListener("click", () => playTranslation(outputText.value));


    // --- 3. Speech-to-Text Logic (UPDATED) ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        status.textContent = "";
        talkButton.classList.remove("recording");
        talkButton.textContent = "🎤 Hold to Talk";
        
        // --- THIS IS THE KEY ---
        // We now pass "true" to tell doTranslate to auto-play
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

    // --- 4. Translation Logic (UPDATED) ---

    // autoPlay is a new variable (true or false)
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
            populateVoiceList();

            // --- THIS IS THE UPGRADE ---
            // If autoPlay is true AND we have voices, play it!
            if (autoPlay && voiceSelect.options.length > 1) {
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

    // --- 6. Helper Button Logic ---
    
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

    // --- 7. Initial Check ---
    populateVoiceList();
});
