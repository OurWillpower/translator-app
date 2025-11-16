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
    // Voice selector elements are GONE from here
    const inputText = document.getElementById("input-text");
    const outputText = document.getElementById("output-text");
    const status = document.getElementById("status");
    const clearButton = document.getElementById("clear-button");
    const copyButton = document.getElementById("copy-button");
    const muteButton = document.getElementById("mute-button");
    
    // Get the icons for mute button control
    const iconSpeaker = document.getElementById("icon-speaker");
    const iconMute = document.getElementById("icon-mute");

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; 
    recognition.lang = langSelectSource.value; 

    let isMuted = false;
    let isListening = false; 

    // --- 1. NEW: Simplified Text-to-Speech Function (Uses browser default) ---
    const playTranslation = (textToSpeak) => {
        if (isMuted) return;

        if (textToSpeak && synthesis.speaking) synthesis.cancel();
        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            // We only use the target language code, letting the browser pick the voice
            utterance.lang = langSelectTarget.value;
            
            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice found for this language on your device.";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            synthesis.speak(utterance);
        }
    };


    // --- 2. Event Listeners ---
    
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

    // --- 3. Speech-to-Text Logic ---
    
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText;
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


    // --- 4. Translation Logic (Main API Call) ---
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
            
            // Auto-play is now simpler: just play!
            if (autoPlay) {
                playTranslation(translatedText);
            }

        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };
    
    // Translate on type
    inputText.addEventListener("blur", () => {
        const sourceLang = langSelectSource.value.split('-')[0];
        doTranslate(inputText.value, true, sourceLang);
    });

    // --- 5. Helper Button Logic ---
    
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
