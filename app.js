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
    const voiceSelect = document.getElementById("voice-select"); // Our new dropdown
    const inputText = document.getElementById("input-text");
    const outputText = document.getElementById("output-text");
    const status = document.getElementById("status");
    const clearButton = document.getElementById("clear-button");
    const copyButton = document.getElementById("copy-button");

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; // We only want final results

    let voices = []; // We will fill this array with all available voices

    // --- 1. NEW: Load Voices Function ---
    function populateVoiceList() {
        voices = synthesis.getVoices(); // Get all voices from the device
        
        // Find the currently selected language
        const selectedLangCode = langSelect.value;
        
        // Remember which voice was selected
        const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;

        // Clear the old list of voices
        voiceSelect.innerHTML = '<option value="">Default for language</option>';
        
        for (const voice of voices) {
            // Check if the voice's language code (e.g., "en-US") starts with the
            // language we selected (e.g., "en").
            if (voice.lang.startsWith(selectedLangCode)) {
                const option = document.createElement("option");
                // Show the user the voice name and language (e.g., "Zira (en-US)")
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute("data-lang", voice.lang);
                option.setAttribute("data-name", voice.name);

                // If this voice was the one previously selected, re-select it
                if (voice.name === selectedVoiceName) {
                    option.selected = true;
                }

                voiceSelect.appendChild(option);
            }
        }
    }

    // This is the *most important* part.
    // The browser takes a moment to load voices. This event
    // fires when the voices are ready.
    synthesis.onvoiceschanged = populateVoiceList;
    
    // --- 2. NEW: Update voice list when language changes ---
    langSelect.addEventListener("change", populateVoiceList);


    // --- 3. Speech-to-Text Logic ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
        status.textContent = "";
        talkButton.classList.remove("recording");
        talkButton.textContent = "🎤 Hold to Talk";
        doTranslate(spokenText);
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

    // --- 4. Translation Logic ---

    const doTranslate = async (textToTranslate) => {
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
            
            // --- NEW: Automatically update voice list after translation ---
            // This is helpful if "auto-detect" was used
            // We'll update the language dropdown to match the detected language
            const detectedLangCode = data[2].split('-')[0]; // e.g., 'es'
            if(langSelect.value === 'auto') {
                 // Check if we have this language in our list
                 if ([...langSelect.options].some(o => o.value === detectedLangCode)) {
                    langSelect.value = detectedLangCode;
                 }
            }
            // Now, refresh the voice list
            populateVoiceList();

        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    translateButton.addEventListener("click", () => {
        doTranslate(inputText.value);
    });

    // --- 5. Text-to-Speech Logic (UPDATED) ---
    
    speakButton.addEventListener("click", () => {
        const textToSpeak = outputText.value;
        if (textToSpeak && synthesis.speaking) {
            synthesis.cancel(); // Stop if already speaking
        }

        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            // --- THIS IS THE UPGRADE ---
            // Find the full voice object the user selected
            const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;
            const voice = voices.find(v => v.name === selectedVoiceName);

            if (voice) {
                // If we found a specific voice, use it!
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                // Otherwise, use the old "default" behavior
                utterance.lang = langSelect.value;
            }
            
            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice for this language?";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            
            synthesis.speak(utterance);
        }
    });

    // --- 6. Helper Button Logic ---
    
    // Add click event for the "Clear" button
    clearButton.addEventListener("click", () => {
        inputText.value = "";
        outputText.value = "";
        status.textContent = "";
    });

    // Add click event for the "Copy" button
    copyButton.addEventListener("click", () => {
        const textToCopy = outputText.value;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    status.textContent = "Translation copied to clipboard!";
                    // Clear the message after 2 seconds
                    setTimeout(() => { status.textContent = ""; }, 2000);
                })
                .catch(err => {
                    status.textContent = "Failed to copy.";
                    console.error("Failed to copy text: ", err);
                });
        }
    });
});
