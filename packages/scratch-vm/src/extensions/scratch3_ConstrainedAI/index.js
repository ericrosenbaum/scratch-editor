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

/**
 * On-device model: Gemma 4 E2B — text, image and audio in, text out — run in
 * the browser by transformers.js on WebGPU.  The ONNX weights (q4f16, ~3.4 GB)
 * are downloaded from Hugging Face on first use and kept by the browser in
 * Cache Storage ("transformers-cache"), so later sessions load without a
 * download.
 *
 * transformers.js itself is fetched at runtime from jsDelivr rather than
 * bundled: it is ~1 MB plus the ONNX Runtime WebGPU/WASM binaries it pulls from
 * the same CDN, and keeping it out of the scratch-vm bundle avoids webpack chunk
 * loading through the GUI.  (The previous MediaPipe runtime fetched its WASM
 * from jsDelivr the same way.)
 */
// dist/transformers.min.js is the self-contained browser build; the *.web.* files
// expect a bundler to resolve their bare "onnxruntime-web/webgpu" import.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';
const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const MODEL_DTYPE = 'q4f16';
const MODEL_PAGE_URL = `https://huggingface.co/${MODEL_ID}`;
const MODEL_SIZE_LABEL = '~3.4 GB';
/** Cache Storage bucket transformers.js writes model files to. */
const TRANSFORMERS_CACHE_NAME = 'transformers-cache';
/** The largest model file — present in the cache only once the download completed. */
const MODEL_CACHE_MARKER = `${MODEL_ID}/resolve/main/onnx/decoder_model_merged_${MODEL_DTYPE}.onnx_data`;
/** Gemma 4's audio encoder expects 16 kHz mono samples. */
const AUDIO_SAMPLE_RATE = 16000;
/** Default cap on generated tokens: answers are meant to be short and the model is small. */
const DEFAULT_MAX_NEW_TOKENS = 128;

/**
 * OPFS files written by earlier versions of this extension (MediaPipe with
 * Gemma 3n / Gemma 4 web builds).  They are 2–3 GB each and unused now, so they
 * are removed on startup.
 */
const LEGACY_OPFS_FILENAMES = ['gemma-model.bin', 'gemma-4-model.bin'];

let transformersPromise = null;
/**
 * Load transformers.js from the CDN once (shared by all instances).  The native
 * dynamic import must be left alone by webpack — hence webpackIgnore.
 * @returns {Promise<object>} the transformers.js module namespace
 */
const loadTransformers = () => {
    if (!transformersPromise) {
        transformersPromise = import(/* webpackIgnore: true */ TRANSFORMERS_URL).catch(err => {
            transformersPromise = null;
            throw err;
        });
    }
    return transformersPromise;
};

class Scratch3ConstrainedAIBlocks {
    constructor(runtime) {
        this.runtime = runtime;
        runtime._AIBlocksExtension = this;

        this.generalAnswer = '';
        this.constrainedAnswer = '';
        this.stageDescription = '';
        this.stageAnswer = '';
        this.speechResult = '';
             
        this.transformers = null; // transformers.js module namespace
        this.processor = null;
        this.model = null;
        this.modelLoaded = false;
        this.isLoading = false;
        this._activeLoad = null; // in-flight loadModel() promise
        this._loadPromise = null; // in-flight ensureModelLoaded() promise
        this._progressListeners = new Set();
        
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

        // Load the model at startup: silently when the browser has it cached,
        // otherwise via the download modal.
        if (typeof document !== 'undefined') {
            this.ensureModelLoaded().catch(() => {}); // catch handles user cancellation
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
                // // Constrained Chat
                // {
                //     opcode: "askAIAndWait",
                //     text: "ask AI [INPUT] using [LIST]",
                //     blockType: BlockType.COMMAND,
                //     arguments: {
                //         INPUT: {
                //             type: ArgumentType.STRING,
                //             defaultValue: "What is Scratch?",
                //         },
                //         LIST: {
                //             type: ArgumentType.STRING,
                //             menu: "responseListMenu",
                //             defaultValue: "scratch facts",
                //         },
                //     },
                // },
                // {
                //     opcode: "getConstrainedAnswer",
                //     text: "AI Answer from list",
                //     blockType: BlockType.REPORTER,
                // },
                // '---',
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

    // -------------------------------------------------------------------------
    // Model loading
    // -------------------------------------------------------------------------

    /**
     * Resolve once the model is ready.  Loads it on first call: silently (with
     * a toast) when the browser already has the weights cached, otherwise via a
     * modal that asks the user to start the download.  Concurrent callers share
     * one load.  Rejects if the user dismisses the modal or loading fails.
     * @returns {Promise<void>}
     */
    ensureModelLoaded () {
        if (this.modelLoaded) return Promise.resolve();
        if (!this._loadPromise) {
            this._loadPromise = this.showLoadModal().finally(() => {
                this._loadPromise = null;
            });
        }
        return this._loadPromise;
    }

    /**
     * Download (if needed) and initialise the model.  A second call while a
     * load is in flight joins it (its progress callback is attached too).
     * @param {function(object)} [onProgress] - transformers.js progress callback
     * @returns {Promise<void>}
     */
    loadModel (onProgress) {
        if (onProgress) this._progressListeners.add(onProgress);
        if (this.modelLoaded) return Promise.resolve();
        if (!this._activeLoad) {
            this._activeLoad = this._doLoadModel().finally(() => {
                this._activeLoad = null;
                this._progressListeners.clear();
            });
        }
        return this._activeLoad;
    }

    async _doLoadModel () {
        this.isLoading = true;
        try {
            if (typeof navigator === 'undefined' || !navigator.gpu) {
                throw new Error('WebGPU is not available in this browser');
            }
            const tf = await loadTransformers();
            tf.env.allowLocalModels = false;
            const progressCallback = info => {
                for (const listener of this._progressListeners) {
                    try {
                        listener(info);
                    } catch {
                        // a broken listener must not break loading
                    }
                }
            };
            const processor = await tf.AutoProcessor.from_pretrained(MODEL_ID, {
                progress_callback: progressCallback
            });
            const model = await tf.Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
                dtype: MODEL_DTYPE,
                device: 'webgpu',
                progress_callback: progressCallback
            });
            this.transformers = tf;
            this.processor = processor;
            this.model = model;
            this.modelLoaded = true;
        } catch (e) {
            log.error('Failed to load Gemma 4:', e);
            throw e;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * @returns {Promise<boolean>} true when the model weights are already in the browser cache
     */
    async _isModelCached () {
        try {
            if (typeof caches === 'undefined') return false;
            const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
            const keys = await cache.keys();
            return keys.some(request => request.url.includes(MODEL_CACHE_MARKER));
        } catch {
            return false;
        }
    }

    /**
     * Delete OPFS model files left behind by earlier versions of this
     * extension.  They are several GB and no longer used.
     */
    async _removeLegacyCache () {
        try {
            if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) return;
            const root = await navigator.storage.getDirectory();
            for (const name of LEGACY_OPFS_FILENAMES) {
                await root.removeEntry(name).catch(() => {});
            }
        } catch {
            // OPFS unavailable — nothing to clean up
        }
    }

    _showToast(text) {
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(76,151,255,0.95)',
            color: 'white',
            padding: '10px 22px',
            borderRadius: '20px',
            fontSize: '14px',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            zIndex: '20001',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'opacity 0.5s',
            opacity: '1'
        });
        toast.innerText = text;
        document.body.appendChild(toast);
        return {
            setText: t => { toast.innerText = t; },
            dismiss: () => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(toast)) document.body.removeChild(toast);
                }, 500);
            }
        };
    }

    // -------------------------------------------------------------------------
    // Modal
    // -------------------------------------------------------------------------

    async showLoadModal() {
        await this._removeLegacyCache();

        // 1. Weights already cached — load silently behind a toast
        if (await this._isModelCached()) {
            const toast = this._showToast('Loading cached AI model…');
            try {
                await this.loadModel();
                toast.setText('AI model ready!');
                setTimeout(() => toast.dismiss(), 2000);
                return;
            } catch (err) {
                toast.dismiss();
                log.warn('Cached model failed to load, showing modal:', err);
                // Fall through to the interactive modal
            }
        }

        // 2. Interactive modal with a one-click download
        return new Promise((resolve, reject) => {
            // ---- Overlay ----
            const overlay = document.createElement('div');
            overlay.id = 'llm-load-modal';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0', left: '0',
                width: '100%', height: '100%',
                backgroundColor: 'rgba(0,0,0,0.6)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: '20000'
            });

            const content = document.createElement('div');
            Object.assign(content.style, {
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '15px',
                width: '550px',
                maxWidth: '90%',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                textAlign: 'center',
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                position: 'relative'
            });

            const removeModal = () => {
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
            };

            // ---- Close button ----
            const closeBtn = document.createElement('button');
            closeBtn.innerText = '✕';
            Object.assign(closeBtn.style, {
                position: 'absolute',
                top: '12px', right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#999'
            });
            closeBtn.onclick = () => {
                removeModal();
                reject(new Error('cancelled'));
            };
            content.appendChild(closeBtn);

            // ---- Heading ----
            const heading = document.createElement('h2');
            heading.innerText = 'Setup Gemma AI';
            heading.style.marginTop = '0';
            heading.style.color = '#4c97ff';
            content.appendChild(heading);

            // ---- Description ----
            const text = document.createElement('p');
            text.style.lineHeight = '1.5';
            text.style.color = '#575e75';
            text.innerHTML =
                `This extension runs Google's <b>Gemma 4</b> AI model directly on your computer,
                 so it can answer questions, look at the stage and listen to you.<br><br>
                 The model is a one-time download of ${MODEL_SIZE_LABEL}. Your browser keeps it for next time.`;
            content.appendChild(text);

            const link = document.createElement('a');
            link.href = MODEL_PAGE_URL;
            link.target = '_blank';
            link.rel = 'noopener';
            link.innerText = 'About this model ↗';
            Object.assign(link.style, {
                display: 'inline-block',
                margin: '0 0 16px 0',
                color: '#4c97ff',
                textDecoration: 'none',
                fontSize: '13px'
            });
            content.appendChild(link);
            content.appendChild(document.createElement('br'));

            // ---- Spinner ----
            const spinner = document.createElement('div');
            spinner.className = 'llm-spinner';
            Object.assign(spinner.style, {
                display: 'none',
                margin: '10px auto',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #4c97ff',
                borderRadius: '50%',
                width: '30px',
                height: '30px'
            });
            if (!document.getElementById('llm-spinner-style')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'llm-spinner-style';
                styleEl.innerText =
                    '@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}' +
                    '.llm-spinner{animation:spin 1s linear infinite}';
                document.head.appendChild(styleEl);
            }

            // ---- Progress bar ----
            const progressWrap = document.createElement('div');
            Object.assign(progressWrap.style, {
                display: 'none',
                width: '100%',
                backgroundColor: '#eee',
                borderRadius: '8px',
                overflow: 'hidden',
                margin: '10px 0 4px 0'
            });
            const progressBar = document.createElement('div');
            Object.assign(progressBar.style, {
                height: '10px',
                width: '0%',
                backgroundColor: '#4c97ff',
                transition: 'width 0.2s'
            });
            progressWrap.appendChild(progressBar);

            // ---- Status text ----
            const statusDiv = document.createElement('div');
            Object.assign(statusDiv.style, {
                marginTop: '16px',
                minHeight: '30px',
                color: '#855cd6',
                fontSize: '14px'
            });

            const mb = n => `${(n / 1e6).toFixed(0)} MB`;
            let sawTotalProgress = false;
            // transformers.js progress events: an aggregate 'progress_total' (preferred)
            // plus per-file 'initiate' / 'download' / 'progress' / 'done', then 'ready'.
            const onProgress = info => {
                if (!info) return;
                if (info.status === 'progress_total') {
                    sawTotalProgress = true;
                    const pct = Math.round(info.progress || 0);
                    progressBar.style.width = `${pct}%`;
                    if (pct >= 100) {
                        spinner.style.display = 'block';
                        statusDiv.innerText = 'Loading model into memory… (this can take a minute)';
                    } else {
                        statusDiv.innerText = `Downloading… ${mb(info.loaded)} / ${mb(info.total)} (${pct}%)`;
                    }
                } else if (info.status === 'progress' && !sawTotalProgress) {
                    const pct = Math.round(info.progress || 0);
                    progressBar.style.width = `${pct}%`;
                    statusDiv.innerText = `Downloading ${info.file}… (${pct}%)`;
                }
            };

            // ---- Download button ----
            const downloadBtn = document.createElement('button');
            downloadBtn.innerText = `Download and set up (${MODEL_SIZE_LABEL})`;
            Object.assign(downloadBtn.style, {
                backgroundColor: '#4c97ff',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                fontSize: '16px',
                borderRadius: '25px',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'block',
                margin: '10px auto 10px auto',
                transition: '0.2s'
            });
            downloadBtn.onmouseover = () => {
                downloadBtn.style.transform = 'scale(1.05)';
            };
            downloadBtn.onmouseout = () => {
                downloadBtn.style.transform = 'scale(1.0)';
            };
            downloadBtn.onclick = async () => {
                downloadBtn.disabled = true;
                downloadBtn.style.opacity = '0.5';
                progressWrap.style.display = 'block';
                statusDiv.style.color = '#855cd6';
                statusDiv.innerText = 'Starting download…';
                try {
                    await this.loadModel(onProgress);
                    spinner.style.display = 'none';
                    statusDiv.style.color = 'green';
                    statusDiv.innerText = 'Model ready!';
                    setTimeout(() => { removeModal(); resolve(); }, 1500);
                } catch (err) {
                    spinner.style.display = 'none';
                    progressWrap.style.display = 'none';
                    statusDiv.style.color = 'red';
                    statusDiv.innerText = `Setup failed: ${err.message}`;
                    downloadBtn.disabled = false;
                    downloadBtn.style.opacity = '1';
                    downloadBtn.innerText = 'Try again';
                }
            };
            content.appendChild(downloadBtn);

            content.appendChild(progressWrap);
            content.appendChild(statusDiv);
            content.appendChild(spinner);
            overlay.appendChild(content);
            document.body.appendChild(overlay);
        });
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

    // -------------------------------------------------------------------------
    // Generation
    // -------------------------------------------------------------------------

    /**
     * Generate a reply from Gemma 4, optionally grounded in an image and/or an
     * audio clip.  Emits EXT_ON_DEVICE_AI_THINKING around the call so the GUI
     * can show its spinner.
     * @param {object} request - what to generate
     * @param {string} request.text - the user's prompt
     * @param {HTMLCanvasElement|Blob|string|object} [request.image] - a canvas (WebGL is fine), image
     *   Blob/URL, or a transformers.js RawImage the prompt refers to
     * @param {Blob|Float32Array} [request.audio] - recorded audio (any decodable Blob) or 16 kHz mono samples
     * @param {number} [request.maxNewTokens] - cap on generated tokens
     * @returns {Promise<string>} the model's reply, trimmed
     */
    async generate ({text, image = null, audio = null, maxNewTokens = DEFAULT_MAX_NEW_TOKENS}) {
        if (!this.modelLoaded) throw new Error('Model not loaded');
        if (this.runtime) this.runtime.emit('EXT_ON_DEVICE_AI_THINKING', true);
        try {
            const content = [];
            if (image) content.push({type: 'image'});
            if (audio) content.push({type: 'audio'});
            content.push({type: 'text', text: Cast.toString(text)});
            const prompt = this.processor.apply_chat_template([{role: 'user', content}], {
                enable_thinking: false,
                add_generation_prompt: true
            });
            const rawImage = image ? await this._toRawImage(image) : null;
            const samples = audio ? await this._toAudioSamples(audio) : null;
            const inputs = await this.processor(prompt, rawImage, samples, {add_special_tokens: false});
            const outputs = await this.model.generate(Object.assign({}, inputs, {
                max_new_tokens: maxNewTokens,
                do_sample: false
            }));
            const promptLength = inputs.input_ids.dims.at(-1);
            const decoded = this.processor.batch_decode(
                outputs.slice(null, [promptLength, null]),
                {skip_special_tokens: true}
            );
            return (decoded[0] || '').trim();
        } finally {
            if (this.runtime) this.runtime.emit('EXT_ON_DEVICE_AI_THINKING', false);
        }
    }

    /**
     * Convert an image input into a transformers.js RawImage.
     * @param {HTMLCanvasElement|Blob|string|object} image - see generate()
     * @returns {Promise<object>|object} RawImage (or a promise of one)
     */
    _toRawImage (image) {
        const {RawImage} = this.transformers;
        if (image instanceof RawImage) return image;
        if (typeof image === 'string') return RawImage.fromURL(image);
        if (typeof Blob !== 'undefined' && image instanceof Blob) return RawImage.fromBlob(image);
        // RawImage.fromCanvas needs a 2D context, which a WebGL canvas (the stage)
        // cannot provide — copy the pixels into a 2D canvas first.
        const copy = document.createElement('canvas');
        copy.width = image.width;
        copy.height = image.height;
        copy.getContext('2d').drawImage(image, 0, 0);
        return RawImage.fromCanvas(copy);
    }

    /**
     * Decode recorded audio into the 16 kHz mono samples the audio encoder expects.
     * @param {Blob|Float32Array} audio - see generate()
     * @returns {Promise<Float32Array>} samples
     */
    async _toAudioSamples (audio) {
        if (audio instanceof Float32Array) return audio;
        const url = URL.createObjectURL(audio);
        try {
            return await this.transformers.read_audio(url, AUDIO_SAMPLE_RATE);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Snapshot the stage into a 2D canvas the model can read.
     * @returns {HTMLCanvasElement|null} the snapshot, or null when there is no renderer
     */
    captureStageImage () {
        const renderer = this.runtime && this.runtime.renderer;
        const canvas = renderer && renderer.canvas;
        if (!canvas) return null;
        renderer.draw(); // fresh frame: the WebGL drawing buffer is not preserved between frames
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);
        return copy;
    }

    /**
     * Transcribe a recorded audio clip.
     * @param {Blob} blob - e.g. MediaRecorder output
     * @returns {Promise<string>} the transcription
     */
    transcribeBlob (blob) {
        return this.generate({
            text: 'Transcribe the audio accurately. Output only the transcription.',
            audio: blob,
            maxNewTokens: 128
        });
    }

    async askGeneral(args) {
        if (!this.modelLoaded) return;
        
        try {
            const question = Cast.toString(args.QUESTION);
            console.log('[Constrained AI] Asking general:', question);
            this.generalAnswer = await this.generate({
                text: `Your response is always as short as possible. ${question}`
            });
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
            const responseText = await this.generate({text: prompt, maxNewTokens: 48});
            console.log('[Constrained AI] Full Raw Output:\n', responseText);

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
            const image = this.captureStageImage();
            if (!image) {
                this.stageDescription = 'No stage canvas found';
                return;
            }
            console.log('[Constrained AI] Generating description for stage image...');
            this.stageDescription = await this.generate({
                text: 'Describe this image in one short sentence.',
                image,
                maxNewTokens: 64
            });
            console.log('[Constrained AI] Description:', this.stageDescription);
        } catch (e) {
            console.error('[Constrained AI] Description generation failed:', e);
            this.stageDescription = `Error: ${e.message}`;
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
            const image = this.captureStageImage();
            if (!image) {
                this.stageAnswer = 'No stage canvas found';
                return;
            }
            const question = Cast.toString(args.QUESTION);
            console.log('[Constrained AI] Asking about stage:', question);
            this.stageAnswer = await this.generate({
                text: `Your response is always as short as possible. ${question}`,
                image
            });
            console.log('[Constrained AI] Answer:', this.stageAnswer);
        } catch (e) {
            console.error('[Constrained AI] Ask about stage failed:', e);
            this.stageAnswer = `Error: ${e.message}`;
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

                    // Transcribe the recording
                    const audioBlob = new Blob(this.audioChunks, {type: 'audio/webm'});
                    console.log('[On-Device AI] Transcribing audio...');
                    this.speechResult = await this.transcribeBlob(audioBlob);
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
