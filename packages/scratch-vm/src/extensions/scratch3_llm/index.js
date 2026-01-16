const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');
const log = require('../../util/log');

const LLM_ICON = 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNDAgNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM5NjZjZmYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmIj5MTE08L3RleHQ+PC9zdmc+';

// Dependencies to be loaded lazily


class Scratch3LLM {
    constructor(runtime) {
        console.log('[LLM Extension] Constructor called');
        this.runtime = runtime;
        this.llmInference = null;
        this.modelLoaded = false;
        this.isLoading = false;
    }

    getInfo() {
        console.log('[LLM Extension] getInfo called');
        console.log('[LLM Extension] BlockType:', BlockType);
        console.log('[LLM Extension] ArgumentType:', ArgumentType);
        
        try {
            return {
                id: 'llm',
                name: 'LLM',
                blockIconURI: LLM_ICON,
                menuIconURI: LLM_ICON,
                blocks: [
                    {
                        opcode: 'loadModel',
                        blockType: BlockType.COMMAND,
                        text: 'load LLM model from [URL]',
                        arguments: {
                            URL: {
                                type: ArgumentType.STRING,
                                defaultValue: 'https://huggingface.co/google/gemma-3n-E2B-it-litert-lm/resolve/main/gemma-3n-E2B-it-int4-Web.litertlm'
                            }
                        }
                    },
                    {
                        opcode: 'loadModelFromFile',
                        blockType: BlockType.COMMAND,
                        text: 'load LLM model from computer',
                        arguments: {}
                    },
                    {
                        opcode: 'askLLM',
                        blockType: BlockType.REPORTER,
                        text: 'ask LLM [PROMPT]',
                        arguments: {
                            PROMPT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'Tell me a joke'
                            }
                        }
                    },
                    {
                        opcode: 'isLoaded',
                        blockType: BlockType.BOOLEAN,
                        text: 'is LLM loaded?',
                        arguments: {}
                    }
                ]
            };
        } catch (e) {
            console.error('[LLM Extension] Error in getInfo:', e);
            throw e;
        }
    }

    async loadModel(args) {
        console.log('[LLM Extension] loadModel block called with URL:', args.URL);
        if (this.modelLoaded || this.isLoading) {
            console.log('[LLM Extension] Model already loading or loaded');
            return Promise.resolve();
        }
        this.isLoading = true;
        
        try {
            // Load module
            let genai;
            try {
                console.log('[LLM Extension] Attempting to import @mediapipe/tasks-genai');
                 genai = require('@mediapipe/tasks-genai');
                 console.log('[LLM Extension] Require succeeded');
            } catch (e) {
                 console.warn('[LLM Extension] Require failed:', e);
                 log.warn('Could not require @mediapipe/tasks-genai', e);
            }
            
            if (!genai) {
                throw new Error('Could not load @mediapipe/tasks-genai');
            }
            
            const FilesetResolver = genai.FilesetResolver;
            const LlmInference = genai.LlmInference;
            
            if (!FilesetResolver || !LlmInference) {
                throw new Error('FilesetResolver or LlmInference not found in genai module');
            }

            console.log('[LLM Extension] Creating FilesetResolver');
            // Ensure we use the latest wasm binary compatible with version 0.10.26
            const filesetResolver = await FilesetResolver.forGenAiTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm'
            );

            console.log('[LLM Extension] Creating LLM inference instance with model:', args.URL);
            this.llmInference = await LlmInference.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: args.URL
                },
                maxTokens: 1000
            });
            console.log('[LLM Extension] LLM inference instance created');

            this.modelLoaded = true;
            this.isLoading = false;
            console.log('[LLM Extension] Model loaded successfully');
            log.info('LLM Model Loaded');
            return Promise.resolve();
        } catch (e) {
            console.error('[LLM Extension] Error loading model:', e);
            log.error('Failed to load LLM Model', e);
            this.isLoading = false;
            return Promise.reject(e);
        }
    }

    async loadModelFromFile() {
        console.log('[LLM Extension] loadModelFromFile called');
        if (typeof document === 'undefined') {
            const msg = 'File picking not supported in this environment (no document)';
            console.error('[LLM Extension]', msg);
            return Promise.reject(new Error(msg));
        }

        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.bin,.task,.litertlm';
            input.style.display = 'none';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve();
                    return;
                }
                
                console.log('[LLM Extension] File selected:', file.name);
                const objectUrl = URL.createObjectURL(file);
                try {
                    console.log('[LLM Extension] Created ObjectURL:', objectUrl);
                    await this.loadModel({ URL: objectUrl });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });
    }

    async askLLM(args) {
        console.log('[LLM Extension] askLLM called with prompt:', args.PROMPT);
        if (!this.modelLoaded) {
            console.log('[LLM Extension] Model not loaded, returning error message');
            return 'Model not loaded';
        }
        const prompt = 'Your response is always as short as possible. ' + args.PROMPT;
        try {
            const response = await this.llmInference.generateResponse(prompt);
            console.log('[LLM Extension] Inference response:', response);
            if (typeof response === 'string') {
                return response.trim();
            }
            return String(response);
        } catch (e) {
            console.error('[LLM Extension] Inference error:', e);
            log.error('LLM inference failed', e);
            return 'Error: ' + e.message;
        }
    }

    isLoaded() {
        return this.modelLoaded;
    }
}

module.exports = Scratch3LLM;
