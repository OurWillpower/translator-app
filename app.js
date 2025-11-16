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

    // --- 1. Load Voices Function (UPDATED AND SAFER) ---
    function populateVoiceList() {
        // This function will *now* only use the 'voices' array
        // It will NOT call synthesis.getVoices() itself.
        
        const selectedLangCode = langSelect.value;
        const selectedGender = genderSelect.value;
        const selectedVoiceName = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute("data-name") : null;

        voiceSelect.innerHTML = '<option value="">Default for language</option>';
        
        let langVoices = []; // Array to hold all voices for this language
        
        // --- NEW LOGIC: Step 1 ---
        // First, find *all* voices for the selected language
        for (const voice of voices) {
            if (voice.lang.startsWith(selectedLangCode)) {
                langVoices.push(voice);
            }
        }

        // --- NEW LOGIC: Step 2 ---
        // Check if we found *any* voices for the language
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

    // --- 2. THIS IS THE MOST IMPORTANT PART ---
    // This event fires when the browser is ready
    synthesis.onvoiceschanged = () => {
        // We get the voices *once* and store them
        voices = synthesis.getVoices();
        // NOW we run the function to update the list
        populateVoiceList();
    };
    
    // --- 3. Update voice list when language OR GENDER changes ---
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
                // 5. If no voice exists at all
