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
    const inputText = document.getElementById("input-text");
    const outputText = document.getElementById("output-text");
    const status = document.getElementById("status");

    const recognition = new SpeechRecognition();
    recognition.interimResults = false; // We only want final results

    // --- 1. Speech-to-Text Logic ---
    
    // This runs when speech recognition has a final result
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        inputText.value = spokenText; // Put the spoken text into the input box
        status.textContent = "";
        talkButton.classList.remove("recording");
        talkButton.textContent = "🎤 Hold to Talk";
        
        // Automatically translate after speaking
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

    // Use 'mousedown' and 'mouseup' to create the "hold to talk" feel
    talkButton.addEventListener("mousedown", () => {
        try {
            recognition.start();
        } catch (e) {
            console.error("Recognition already started.", e);
        }
    });

    talkButton.addEventListener("mouseup", () => {
        recognition.stop();
    });

    // --- 2. Translation Logic ---

    // *** THIS IS THE NEW, RELIABLE CODE ***
    const doTranslate = async (textToTranslate) => {
        if (!textToTranslate) {
            outputText.value = "";
            return;
        }

        status.textContent = "Translating...";
        
        const targetLang = langSelect.value;
        const sourceLang = "auto"; // Google will auto-detect

        try {
            // We are using the unofficial Google Translate API
            // This is much more reliable
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
            
            const res = await fetch(url);

            if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
            }

            const data = await res.json();
            
            // Google's API returns the text in a nested array
            // This line safely gets the translated text
            const translatedText = data[0].map(segment => segment[0]).join('');

            outputText.value = translatedText; // Put translation in the output box
            status.textContent = "";

        } catch (error) {
            status.textContent = "Translation failed. Check internet.";
            console.error(error);
        }
    };

    // Add click event for the manual "Translate Text" button
    translateButton.addEventListener("click", () => {
        doTranslate(inputText.value);
    });

    // --- 3. Text-to-Speech Logic ---
    
    speakButton.addEventListener("click", () => {
        const textToSpeak = outputText.value;
        if (textToSpeak && synthesis.speaking) {
            synthesis.cancel(); // Stop if already speaking
        }

        if (textToSpeak) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            
            // Try to set the language of the voice
            // This is a "best effort" - the browser picks the best voice it has
            const targetLang = langSelect.value;
            utterance.lang = targetLang; // e.g., "es-ES", "fr-FR"

            utterance.onerror = (event) => {
                status.textContent = "Speech error. No voice for this language?";
                console.error("SpeechSynthesisUtterance.onerror", event);
            };
            
            synthesis.speak(utterance);
        }
    });
});
