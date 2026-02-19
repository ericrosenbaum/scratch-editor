const ArgumentType = require("../../extension-support/argument-type");
const BlockType = require("../../extension-support/block-type");
const Cast = require("../../util/cast");
const fetchWithTimeout = require("../../util/fetch-with-timeout");
const Clone = require("../../util/clone");
const MathUtil = require("../../util/math-util");
const Variable = require("../../engine/variable");
const uid = require("../../util/uid");
const defaultLists = require("./default-lists");

const log = require('../../util/log');

class Scratch3ConstrainedAIBlocks {
    constructor(runtime) {
        this.runtime = runtime;
        runtime._AIBlocksExtension = this;

        this.generalAnswer = '';
        this.constrainedAnswer = '';
        this.stageDescription = '';
        this.stageAnswer = '';
        this.speechResult = '';
             
        this.llmInference = null;
        this.modelLoaded = false;
        this.isLoading = false;
        
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.listeningTimeout = null;

        // Reset AI response on green flag
        this.runtime.on('PROJECT_START', this.resetResponse.bind(this));
        
        // Stop listening on red stop sign
        this.runtime.on('PROJECT_STOP_ALL', this.cancelListening.bind(this));

        // Ensure default lists exist on load and when a project loads
        this.ensureDefaultLists();
        this.runtime.on('PROJECT_LOADED', this.ensureDefaultLists.bind(this));

        // Show the startup modal to load the model
        if (typeof document !== 'undefined') {
            this.showLoadModal();
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: "AIBlocks",
            name: "On-Device AI",
            blockIconURI:
                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIGlkPSJMYXllcl8xIiB3aWR0aD0iMzQyIiBoZWlnaHQ9IjMzMSIgeD0iMCIgeT0iMCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMzQyIDMzMSIgdmVyc2lvbj0iMS4xIj48c3R5bGU+LnN0Mjh7ZmlsbDojZmZmO3N0cm9rZTojNGQ0ZDRkO3N0cm9rZS13aWR0aDoxMS42ODU5fS5zdDI4LC5zdDMwLC5zdDM0LC5zdDM3e3N0cm9rZS1taXRlcmxpbWl0OjEwfS5zdDMwe2ZpbGw6IzRkNGQ0ZDtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTEuNjg1OX0uc3QzNCwuc3QzN3tmaWxsOiNmZmZ9LnN0MzR7c3Ryb2tlOiM0ZDRkNGQ7c3Ryb2tlLXdpZHRoOjExLjY4NTk7c3Ryb2tlLWxpbmVjYXA6cm91bmR9LnN0Mzd7c3Ryb2tlOiNmZmY7c3Ryb2tlLXdpZHRoOjJ9PC9zdHlsZT48cGF0aCBkPSJNMjguMyAyMjUuOXYtMjUuNWMwLTguMyA2LjctMTUgMTUtMTVoMTgyLjNjOC4zIDAgMTUgNi43IDE1IDE1djI1LjVjMCA4LjMtNi43IDE1LTE1IDE1SDQzLjNjLTguMyAwLTE1LTYuNy0xNS0xNXoiIGNsYXNzPSJzdDI4Ii8+PHBhdGggZD0iTTUzLjEgMjQzLjZ2LTYzLjhjMC0xNC45IDEyLjEtMjcgMjctMjdoMTA4LjZjMTQuOSAwIDI3IDEyLjEgMjcgMjd2NjMuOGMwIDE0LjktMTIuMSAyNy0yNyAyN0g4MC4xYy0xNC45IDAtMjctMTItMjctMjd6IiBjbGFzcz0ic3QyOCIvPjxjaXJjbGUgY3g9IjgzLjEiIGN5PSIxMDQuMSIgcj0iMTQuMSIgY2xhc3M9InN0MjgiLz48Y2lyY2xlIGN4PSI5Ny44IiBjeT0iMjAwLjkiIHI9IjguNCIgY2xhc3M9InN0MzAiLz48Y2lyY2xlIGN4PSIxNjkuNyIgY3k9IjIwMC45IiByPSI4LjQiIGNsYXNzPSJzdDMwIi8+PHBhdGggZD0iTTExMyAyMzEuNGM5IDE0LjEgMzIuOSAxMy43IDQxLjYgMCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTEuNjg1OTtzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbWl0ZXJsaW1pdDoxMCIvPjxwYXRoIGQ9Ik0xMTAuMSAyNzcuM2g0OC43djI5LjJoLTQ4Ljd6IiBjbGFzcz0ic3QzNCIvPjxwYXRoIGQ9Im0xODguNiAxMjYuMyAzMy44LTE5LjMtOSA3YzM0LjMgOS42IDczLjYtLjIgOTAuOS0yMi42czYuOC01MC4xLTI0LjItNjMuOS03Mi4zLTkuNC05NS41IDEwLjNjLTIzLjIgMTkuNy0yMC42IDQ4LjMgNS45IDY1LjlsLTEuOSAyMi42eiIgc3R5bGU9ImZpbGw6IzRkNGQ0ZDtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTI7c3Ryb2tlLWxpbmVqb2luOnJvdW5kO3N0cm9rZS1taXRlcmxpbWl0OjEwIi8+PGNpcmNsZSBjeD0iMjAzLjYiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PGNpcmNsZSBjeD0iMjQwLjUiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PGNpcmNsZSBjeD0iMjc3LjQiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PHBhdGggZD0iTTgzLjEgMTE4LjJ2MzQuNiIgY2xhc3M9InN0MjgiLz48cGF0aCBkPSJNNjUuOCAzMDYuNWgxMzYuMSIgY2xhc3M9InN0MzQiLz48L3N2Zz4=",
            menuIconURI: null,
            blocks: [
                // General Chat
                {
                    opcode: "askGeneral",
                    text: "Ask AI [QUESTION]",
                    blockType: BlockType.COMMAND,
                    arguments: {
                        QUESTION: {
                            type: ArgumentType.STRING,
                            defaultValue: "who are you?"
                        }
                    }
                },
                {
                    opcode: "getGeneralAnswer",
                    text: "AI Answer",
                    blockType: BlockType.REPORTER,
                },
                '---',
                // Constrained Chat
                {
                    opcode: "askAIAndWait",
                    text: "ask AI [INPUT] using [LIST]",
                    blockType: BlockType.COMMAND,
                    arguments: {
                        INPUT: {
                            type: ArgumentType.STRING,
                            defaultValue: "What is Scratch?",
                        },
                        LIST: {
                            type: ArgumentType.STRING,
                            menu: "responseListMenu",
                            defaultValue: "scratch facts",
                        },
                    },
                },
                {
                    opcode: "getConstrainedAnswer",
                    text: "AI Answer from list",
                    blockType: BlockType.REPORTER,
                },
                '---',
                // Vision Chat
                {
                    opcode: "askAboutStage",
                    text: "ask AI [QUESTION] about stage",
                    blockType: BlockType.COMMAND,
                    arguments: {
                        QUESTION: {
                            type: ArgumentType.STRING,
                            defaultValue: "What do you see?"
                        }
                    }
                },
                {
                    opcode: "getStageAnswer",
                    text: "AI Answer about stage",
                    blockType: BlockType.REPORTER,
                },
                '---',
                // Speech
                {
                    opcode: 'startListening',
                    text: 'start listening',
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'stopListening',
                    text: 'stop listening',
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'getSpeechResult',
                    text: 'speech',
                    blockType: BlockType.REPORTER
                }
            ],
            menus: {
                responseListMenu: {
                    acceptReporters: true,
                    items: "getResponseListMenu",
                },
            },
        };
    }

    getStage() {
        const stage = this.runtime &&
            this.runtime.targets &&
            this.runtime.targets.find((t) => t.isStage);
        return stage;
    }

    getListVars() {
        // Get list variables from the stage (i.e. all global lists)
        // TO DO: consider adding sprite-local lists as well
        const stage = this.getStage();
        if (!stage || !stage.variables) return [];
        return Object.values(stage.variables)
            .filter((variable) => variable.type === "list");
    }

    getListVarByName(listName) {
        // Find and return the list variable object by name
        const listVars = this.getListVars();
        if (!listVars) return null;
        return listVars.find((list) => list.name === listName);
    }

    getResponseListMenu() {
        // Return an array of list names for the menu
        const listVars = this.getListVars();
        const items = listVars && listVars.length
            ? listVars.map((list) => ({ text: list.name, value: list.name }))
            : [];
        // Add affordance to create a new list using existing GUI modal
        // Scratch GUI will handle the special value 'MAKE_A_LIST' by opening the modal
        // and will not treat it as a selection.
        items.push({ text: 'make a new list...', value: 'MAKE_A_LIST' });
        return items;
    }

    ensureDefaultLists() {
        try {
            const stage = this.getStage();
            if (!stage) return;

            let createdAny = false;
            for (const def of defaultLists) {
                if (!def || !def.name) continue;
                const existing = this.getListVarByName(def.name);
                if (existing) continue; // already present; skip

                const id = uid();
                stage.createVariable(id, def.name, Variable.LIST_TYPE, false);
                const created = stage.variables[id];
                if (created) {
                    // Only assign if items is an array of strings
                    if (Array.isArray(def.items)) {
                        created.value = def.items.slice(0, 200); // safety bound
                    } else {
                        created.value = [];
                    }
                    createdAny = true;
                }
            }

            // Nudge UI to refresh menus/toolbox if we created anything
            if (createdAny && this.runtime && typeof this.runtime.requestBlocksUpdate === 'function') {
                this.runtime.requestBlocksUpdate();
            }
        } catch (e) {
            // Non-fatal: if creation fails, extension still works for user-created lists
            // eslint-disable-next-line no-console
            console.warn('Failed to ensure default lists:', e);
        }
    }

    async loadModel(args) {
        if (this.modelLoaded || this.isLoading) return Promise.resolve();
        this.isLoading = true;
        
        try {
            const genai = require('@mediapipe/tasks-genai');
            const FilesetResolver = genai.FilesetResolver;
            const LlmInference = genai.LlmInference;
            
            const filesetResolver = await FilesetResolver.forGenAiTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm'
            );

            this.llmInference = await LlmInference.createFromOptions(filesetResolver, {
                baseOptions: { modelAssetPath: args.URL },
                maxTokens: 4096,
                maxNumImages: 1,
                supportAudio: true
            });

            this.modelLoaded = true;
            this.isLoading = false;
        } catch (e) {
            console.error('Failed to load LLM:', e);
            this.isLoading = false;
            throw e;
        }
    }

    showLoadModal() {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '20000'; // Make sure it's on top of Scratch GUI
        overlay.id = 'llm-load-modal';

        // Create modal content box
        const content = document.createElement('div');
        content.style.backgroundColor = 'white';
        content.style.padding = '30px';
        content.style.borderRadius = '15px';
        content.style.width = '550px';
        content.style.maxWidth = '90%';
        content.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        content.style.textAlign = 'center';
        content.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';

        // Heading
        const heading = document.createElement('h2');
        heading.innerText = 'Setup Gemma AI';
        heading.style.marginTop = '0';
        heading.style.color = '#4c97ff'; // Scratch blue
        content.appendChild(heading);

        // Explanation text
        const text = document.createElement('p');
        text.style.lineHeight = '1.5';
        text.style.color = '#575e75';
        text.innerHTML = `
            This extension runs Google's <b>Gemma 3n</b> AI model directly on your computer.<br><br>
            To use it, you must first download the model file (approx 1.7GB) from the official website.
        `;
        content.appendChild(text);

        // Link button
        const linkBtn = document.createElement('a');
        linkBtn.href = 'https://deepmind.google/models/gemma/gemma-3n/';
        linkBtn.target = '_blank';
        linkBtn.innerText = 'Open Gemma Download Page ↗';
        linkBtn.style.display = 'inline-block';
        linkBtn.style.margin = '10px 0 20px 0';
        linkBtn.style.color = '#4c97ff';
        linkBtn.style.textDecoration = 'none';
        linkBtn.style.fontWeight = 'bold';
        content.appendChild(linkBtn);
        
        content.appendChild(document.createElement('br'));

        // Load button
        const loadBtn = document.createElement('button');
        loadBtn.innerText = 'Load model file from my computer';
        loadBtn.style.backgroundColor = '#4c97ff';
        loadBtn.style.color = 'white';
        loadBtn.style.border = 'none';
        loadBtn.style.padding = '12px 24px';
        loadBtn.style.fontSize = '16px';
        loadBtn.style.borderRadius = '25px';
        loadBtn.style.cursor = 'pointer';
        loadBtn.style.fontWeight = 'bold';
        loadBtn.style.transition = '0.2s';
        
        loadBtn.onmouseover = () => loadBtn.style.transform = 'scale(1.05)';
        loadBtn.onmouseout = () => loadBtn.style.transform = 'scale(1.0)';
        
        content.appendChild(loadBtn);

        // Status area
        const statusDiv = document.createElement('div');
        statusDiv.style.marginTop = '20px';
        statusDiv.style.minHeight = '30px';
        statusDiv.style.color = '#855cd6';
        statusDiv.style.fontSize = '14px';
        content.appendChild(statusDiv);

        // Spinner (hidden by default)
        const spinner = document.createElement('div');
        spinner.className = 'llm-spinner';
        spinner.style.display = 'none';
        spinner.style.margin = '10px auto';
        spinner.style.border = '4px solid #f3f3f3';
        spinner.style.borderTop = '4px solid #4c97ff';
        spinner.style.borderRadius = '50%';
        spinner.style.width = '30px';
        spinner.style.height = '30px';
        
        // Add spinner animation style
        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .llm-spinner { animation: spin 1s linear infinite; }
        `;
        document.head.appendChild(styleSheet);
        content.appendChild(spinner);

        // File input (hidden)
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.bin,.task,.litertlm';
        fileInput.style.display = 'none';
        
        // Connect button to file input
        loadBtn.onclick = () => fileInput.click();

        // Handle file selection
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // UI Updates
            loadBtn.disabled = true;
            loadBtn.style.opacity = '0.5';
            loadBtn.innerText = 'Loading...';
            spinner.style.display = 'block';
            statusDiv.innerText = `Loading ${file.name}... (This may take a moment)`;

            try {
                const objectUrl = URL.createObjectURL(file);
                await this.loadModel({ URL: objectUrl });
                
                // Success
                spinner.style.display = 'none';
                statusDiv.style.color = 'green';
                statusDiv.innerText = 'Success! Model loaded.';
                
                setTimeout(() => {
                    document.body.removeChild(overlay);
                }, 1500);

            } catch (err) {
                console.error(err);
                spinner.style.display = 'none';
                statusDiv.style.color = 'red';
                statusDiv.innerText = 'Error loading model: ' + err.message;
                
                // Reset button
                loadBtn.disabled = false;
                loadBtn.style.opacity = '1';
                loadBtn.innerText = 'Try again';
            }
        };

        content.appendChild(fileInput);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
    }

    askAIAndWait(args, util) {
        const input = Cast.toString(args.INPUT).substring(0, 500);
        if (input.length < 1) {
            this.resetResponse();
            return;
        }
        
        const listName = Cast.toString(args.LIST);
        const listVar = this.getListVarByName(listName);
        if (!listVar) {
            this.resetResponse();
            return;
        }

        return this.sendChatRequest(input, listVar, true);
    }

    resetResponse() {
        this.generalAnswer = '';
        this.constrainedAnswer = '';
        this.stageDescription = '';
        this.stageAnswer = '';
        this.speechResult = '';
    }

    async generateWithSpinner(promptOrArgs) {
        if (!this.llmInference) throw new Error('Model not loaded');
        
        try {
            if (this.runtime) this.runtime.emit('EXT_ON_DEVICE_AI_THINKING', true);
            const response = await this.llmInference.generateResponse(promptOrArgs);
            if (this.runtime) this.runtime.emit('EXT_ON_DEVICE_AI_THINKING', false);
            return response;
        } catch (e) {
            if (this.runtime) this.runtime.emit('EXT_ON_DEVICE_AI_THINKING', false);
            throw e;
        }
    }

    async askGeneral(args) {
        if (!this.modelLoaded) return;
        
        try {
            const question = Cast.toString(args.QUESTION);
            const prompt = 'Your response is always as short as possible. ' + question;
            console.log('[Constrained AI] Asking general:', question);
            const rawResponse = await this.generateWithSpinner(prompt);
            this.generalAnswer = (typeof rawResponse === 'string' ? rawResponse : String(rawResponse)).trim();
            console.log('[Constrained AI] General Answer:', this.generalAnswer);
        } catch (e) {
            console.error('[Constrained AI] General ask failed:', e);
            this.generalAnswer = 'Error';
        }
    }

    getGeneralAnswer() {
        return this.generalAnswer;
    }

    async sendChatRequest(input, listVar, useReasoning) {
        if (!this.modelLoaded) {
            console.warn('Model not loaded');
            this.constrainedAnswer = 'Model not loaded';
            return;
        }

         // Build the responses array from the list
        let responses = listVar && Array.isArray(listVar.value) ? listVar.value : [];
        // omit empty items
        responses = responses.filter(item => item.trim().length > 0);

        const prompt = `Task: Select the best option from the list that answers the question. Reply with ONLY the exact text of the selected option.

Example:
Question: "What color is the sky?"
Options:
- Green
- Blue
- Red
Answer: Blue

Question: "${input}"
Options:
${responses.map(r => '- ' + r).join('\n')}
Answer:`;

        try {
            console.log('[Constrained AI] Full Input Prompt:\n', prompt);
            const rawResponse = await this.generateWithSpinner(prompt);
            console.log('[Constrained AI] Full Raw Output:\n', rawResponse);
            const responseText = (typeof rawResponse === 'string' ? rawResponse : String(rawResponse)).trim();
            console.log('Raw LLM response:', responseText);

            // Use the actual list items for validation
            if (responses.some(option => option === responseText)) {
                this.constrainedAnswer = responseText;
            } else {
                // Not exact match, use edit distance to find the closest valid option
                // This is especially useful if the LLM includes quotes or extra punctuation
                console.warn("AI response is not exact match", responseText);
                
                const distances = responses.map((option) => ({
                    option,
                    distance: this.getEditDistance(responseText, option)
                }));
                distances.sort((a, b) => a.distance - b.distance);
                
                const closestMatch = distances[0];
                console.log("Using closest match:", closestMatch.option);
                this.constrainedAnswer = closestMatch.option;
            }
        } catch (e) {
            console.error('LLM inference failed:', e);
            this.constrainedAnswer = 'Error';
        }
    }

    getConstrainedAnswer() {
        return this.constrainedAnswer;
    }

    // Deprecated? This was the old reporter for constrained answer in previous edits
    getAIResponse() {
        return this.constrainedAnswer; 
    }

    async describeStage() {
        if (!this.modelLoaded) {
            this.stageDescription = 'Model not loaded';
            return;
        }
        
        try {
            const canvas = this.runtime.renderer.canvas;
            if (!canvas) {
                this.stageDescription = 'No stage canvas found';
                return;
            }

            const imageInput = { imageSource: canvas };
            const prompt = 'Describe this image in one short sentence.';
            
            console.log('[Constrained AI] Generating description for stage image...');
            const response = await this.generateWithSpinner([prompt, imageInput]);
            
            this.stageDescription = (typeof response === 'string' ? response : String(response)).trim();
            console.log('[Constrained AI] Description:', this.stageDescription);
        } catch (e) {
            console.error('[Constrained AI] Description generation failed:', e);
            this.stageDescription = 'Error: ' + e.message;
        }
    }

    getStageDescription() {
        return this.stageDescription;
    }

    async askAboutStage(args) {
        if (!this.modelLoaded) {
            this.stageAnswer = 'Model not loaded';
            return;
        }
        
        try {
            const canvas = this.runtime.renderer.canvas;
            if (!canvas) {
                this.stageAnswer = 'No stage canvas found';
                return;
            }

            const imageInput = { imageSource: canvas };
            const question = Cast.toString(args.QUESTION);
            const prompt = 'Your response is always as short as possible. ' + question;
            
            console.log('[Constrained AI] Asking about stage:', question);
            // Pass the prompt and image as an array for multimodal inference
            const response = await this.generateWithSpinner([prompt, imageInput]);
            
            this.stageAnswer = (typeof response === 'string' ? response : String(response)).trim();
            console.log('[Constrained AI] Answer:', this.stageAnswer);
        } catch (e) {
            console.error('[Constrained AI] Ask about stage failed:', e);
            this.stageAnswer = 'Error: ' + e.message;
        }
    }

    getStageAnswer() {
        return this.stageAnswer;
    }

    cancelListening() {
        // Stop the microphone indicator
        if (this.runtime) {
            this.runtime.emitMicListening(false);
        }

        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
            this.listeningTimeout = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            // Remove the onstop handler so we don't trigger transcription
            this.mediaRecorder.onstop = null;
            this.mediaRecorder.stop();
            
            // Cleanup stream tracks immediately
            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
        }
    }

    async startListening() {
        if (!this.modelLoaded) {
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
             console.warn('Audio recording not supported');
             return;
        }

        try {
            // Stop any previous recording without transcribing
            this.cancelListening();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = event => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.start();
            
            // Show microphone indicator
            if (this.runtime) {
                this.runtime.emitMicListening(true);
            }

            // Auto-stop after 15 seconds
            this.listeningTimeout = setTimeout(() => {
                this.stopListening();
            }, 15000);

        } catch (e) {
            console.error('[On-Device AI] Start listening failed:', e);
            if (this.runtime) {
                 this.runtime.emitMicListening(false);
            }
        }
    }

    async stopListening() {
        // Clear the auto-stop timeout since we're stopping manually (or via timeout callback)
        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
            this.listeningTimeout = null;
        }

        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
            return; 
        }

        // Hide microphone indicator
        if (this.runtime) {
            this.runtime.emitMicListening(false);
        }

        return new Promise((resolve) => {
            this.mediaRecorder.onstop = async () => {
                try {
                    // Stop tracks to release mic
                    if (this.mediaRecorder.stream) {
                        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                    }

                    // Process Audio
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Transcribe
                    console.log('[On-Device AI] Transcribing audio...');

                    const prompt = 'Transcribe the audio accurately. Output only the transcription.';
                    
                    const response = await this.generateWithSpinner([
                        prompt,
                        { audioSource: audioBuffer }
                    ]);

                    this.speechResult = (typeof response === 'string' ? response : String(response)).trim();
                    console.log('[On-Device AI] Speech Result:', this.speechResult);

                } catch (e) {
                    console.error('[On-Device AI] Speech processing failed:', e);
                }
                resolve();
            };

            this.mediaRecorder.stop();
        });
    }

    getSpeechResult() {
        return this.speechResult;
    }

    getEditDistance(strA, strB) {
        const a = strA.toLowerCase();
        const b = strB.toLowerCase();
        const dp = Array(b.length + 1)
            .fill(0)
            .map((_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            let prev = dp[0];
            dp[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const temp = dp[j];
                dp[j] =
                    a[i - 1] === b[j - 1]
                        ? prev
                        : Math.min(prev, dp[j - 1], dp[j]) + 1;
                prev = temp;
            }
        }
        return dp[b.length];
    }
}
module.exports = Scratch3ConstrainedAIBlocks;
