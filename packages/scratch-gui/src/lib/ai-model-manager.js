/**
 * Singleton AI model manager for the Gemma on-device model.
 * Works independently of the On-Device AI extension.
 *
 * Supports:
 *  - OPFS caching: model is saved to the browser's Origin Private File System
 *    after the first load, so subsequent sessions load automatically.
 *  - Auto-download: if MODEL_URL is set, the modal offers a one-click download
 *    with a streaming progress bar (no RAM spike from buffering the whole file).
 */

/**
 * Hosted model file: Gemma 4 E2B, the web build published by Google's LiteRT
 * community on Hugging Face (~2 GB).  Must match the value in the On-Device AI
 * extension (scratch3_ConstrainedAI) so both share one OPFS cache.
 *
 * NOTE: the Gemma 4 *web* builds are text-only — they ship without the vision
 * and audio encoders.  (The full gemma-4-E2B-it.litertlm has them, but the
 * MediaPipe web runtime refuses to load it: "could not find gpu_artisan .bin
 * file".)  Callers that need image input must check MODEL_SUPPORTS_VISION.
 */
const MODEL_URL = 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm';
const MODEL_SIZE_LABEL = '~2 GB';
const MODEL_SUPPORTS_VISION = false;
const TEXT_ONLY_MESSAGE = 'The Gemma 4 web model is text-only';

/**
 * OPFS filename — must match the On-Device AI extension.  Renamed from
 * 'gemma-model.bin' (Gemma 3n) so a stale Gemma 3n cache is never mistaken for
 * Gemma 4; old files are removed by removeLegacyCache().
 */
const OPFS_FILENAME = 'gemma-4-model.bin';
const LEGACY_OPFS_FILENAMES = ['gemma-model.bin'];

/** MediaPipe GenAI WASM runtime — keep in sync with the tasks-genai version in package.json. */
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';

/** Gemma 4 chat-template delimiters (Gemma 3/3n used <start_of_turn>/<end_of_turn>). */
const TURN_START = '<|turn>';
const TURN_END = '<turn|>';

/**
 * Wrap a plain prompt in the Gemma 4 chat template.  Without the turn tokens
 * the model returns nothing (or rambles) instead of answering.
 * @param {string} userText - the user turn
 * @param {string} [systemText] - optional system instruction
 * @returns {string} formatted prompt ending with an open model turn
 */
const formatPrompt = (userText, systemText) => {
    let p = '';
    if (systemText) p += `${TURN_START}system\n${systemText}${TURN_END}\n`;
    p += `${TURN_START}user\n${userText}${TURN_END}\n${TURN_START}model\n`;
    return p;
};

/**
 * Same as formatPrompt but for a multimodal part list (strings and
 * {imageSource}/{audioSource} objects) as accepted by generateResponse.
 * @param {Array} parts - content of the user turn
 * @returns {Array} parts wrapped in Gemma 4 turn delimiters
 */
const formatPromptParts = parts => [
    `${TURN_START}user\n`,
    ...parts,
    `${TURN_END}\n${TURN_START}model\n`
];

/**
 * Normalise a raw model response: stringify and drop anything after a turn delimiter.
 * @param {string} raw - value returned by generateResponse
 * @returns {string} cleaned text
 */
const cleanResponse = raw => {
    let text = typeof raw === 'string' ? raw : String(raw);
    const end = text.indexOf(TURN_END);
    if (end !== -1) text = text.slice(0, end);
    return text.trim();
};

let _llmInference = null;
let _modelLoaded = false;
let _isLoading = false;
let _modalPromise = null;

const isLoaded = () => _modelLoaded;

const getLlmInference = () => _llmInference;

const loadModel = async url => {
    if (_modelLoaded || _isLoading) return;
    _isLoading = true;
    try {
        const {FilesetResolver, LlmInference} = require('@mediapipe/tasks-genai');
        const filesetResolver = await FilesetResolver.forGenAiTasks(WASM_CDN);
        // No maxNumImages / supportAudio: the Gemma 4 web build has no vision
        // or audio encoders (see MODEL_URL note above).
        _llmInference = await LlmInference.createFromOptions(filesetResolver, {
            baseOptions: {modelAssetPath: url},
            maxTokens: 4096
        });
        _modelLoaded = true;
    } finally {
        _isLoading = false;
    }
};

const generate = async prompt => {
    if (!_llmInference) throw new Error('Model not loaded');
    return _llmInference.generateResponse(prompt);
};

// ---------------------------------------------------------------------------
// OPFS helpers
// ---------------------------------------------------------------------------

/**
 * Returns a blob URL for the cached model, or null if not cached.
 */
const checkOpfsCache = async () => {
    try {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle(OPFS_FILENAME);
        const file = await fh.getFile();
        if (file.size === 0) return null;
        return URL.createObjectURL(file);
    } catch {
        return null; // file doesn't exist yet
    }
};

/**
 * Delete cached model files left behind by earlier versions (Gemma 3n).
 * They are several GB and no longer loadable here.
 */
const removeLegacyCache = async () => {
    try {
        const root = await navigator.storage.getDirectory();
        for (const name of LEGACY_OPFS_FILENAMES) {
            await root.removeEntry(name).catch(() => {});
        }
    } catch {
        // OPFS unavailable — nothing to clean up
    }
};

/**
 * Streams the model from url directly into OPFS (no full-file RAM buffering).
 * Calls onProgress(bytesReceived, totalBytes) as chunks arrive.
 * Returns a blob URL pointing to the cached file.
 */
const downloadModelToOpfs = async (url, onProgress) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    const total = parseInt(response.headers.get('content-length') || '0', 10);

    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_FILENAME, {create: true});
    const writable = await fh.createWritable();
    const reader = response.body.getReader();

    let received = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        await writable.write(value);
        received += value.length;
        onProgress(received, total);
    }
    await writable.close();

    const cached = await (await root.getFileHandle(OPFS_FILENAME)).getFile();
    return URL.createObjectURL(cached);
};

// ---------------------------------------------------------------------------
// Toast (non-blocking status message for silent cache loads)
// ---------------------------------------------------------------------------

const showToast = text => {
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
        setText: t => {
            toast.innerText = t;
        },
        dismiss: () => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(toast)) document.body.removeChild(toast);
            }, 500);
        }
    };
};

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Show the model-loading modal.
 *
 * Behaviour:
 *  1. If model is already loaded — resolves immediately.
 *  2. If a cached model exists in OPFS — loads it silently via a toast toast.
 *  3. If MODEL_URL is set — modal offers a one-click download with progress bar.
 *  4. Always offers a file-picker fallback; on success the file is saved to OPFS.
 *
 * If the modal is already open, the same Promise is returned so concurrent
 * callers share one modal.
 */
const showLoadModal = () => {
    if (_modelLoaded) return Promise.resolve();
    if (_modalPromise) return _modalPromise;

    _modalPromise = _doShowLoadModal().finally(() => {
        _modalPromise = null;
    });

    return _modalPromise;
};

const _doShowLoadModal = async () => {
    await removeLegacyCache();

    // 1. Try OPFS cache first
    const cachedUrl = await checkOpfsCache();
    if (cachedUrl) {
        const toast = showToast('Loading cached AI model…');
        try {
            await loadModel(cachedUrl);
            toast.setText('AI model ready!');
            setTimeout(() => toast.dismiss(), 2000);
            return; // success — skip the modal entirely
        } catch (err) {
            toast.dismiss();
            console.warn('Cached model failed to load, showing modal:', err);
            // Fall through to the download modal
        }
    }

    // 2. Show download-progress modal and auto-start the download
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
        heading.innerText = 'Setting up Gemma AI';
        heading.style.marginTop = '0';
        heading.style.color = '#4c97ff';
        content.appendChild(heading);

        // ---- Description ----
        const descText = document.createElement('p');
        descText.style.lineHeight = '1.5';
        descText.style.color = '#575e75';
        descText.innerHTML =
            `Downloading Google's <b>Gemma 4</b> AI model (${MODEL_SIZE_LABEL}).<br>
             This only happens once — it will be cached for future sessions.`;
        content.appendChild(descText);

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
            width: '100%',
            backgroundColor: '#eee',
            borderRadius: '8px',
            overflow: 'hidden',
            margin: '16px 0 4px 0'
        });
        const progressBar = document.createElement('div');
        Object.assign(progressBar.style, {
            height: '10px',
            width: '0%',
            backgroundColor: '#4c97ff',
            transition: 'width 0.2s'
        });
        progressWrap.appendChild(progressBar);
        content.appendChild(progressWrap);

        // ---- Status text ----
        const statusDiv = document.createElement('div');
        Object.assign(statusDiv.style, {
            marginTop: '8px',
            minHeight: '30px',
            color: '#855cd6',
            fontSize: '14px'
        });
        statusDiv.innerText = 'Starting download…';
        content.appendChild(statusDiv);
        content.appendChild(spinner);

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        const setProgress = (received, total) => {
            const mb = n => `${(n / 1e6).toFixed(0)} MB`;
            if (total > 0) {
                const pct = Math.round((received / total) * 100);
                progressBar.style.width = `${pct}%`;
                statusDiv.innerText = `Downloading… ${mb(received)} / ${mb(total)} (${pct}%)`;
            } else {
                statusDiv.innerText = `Downloading… ${mb(received)} received`;
            }
        };

        // ---- Auto-start download ----
        const startDownload = async () => {
            try {
                const url = await downloadModelToOpfs(MODEL_URL, setProgress);
                statusDiv.innerText = 'Loading model into memory…';
                spinner.style.display = 'block';
                await loadModel(url);
                spinner.style.display = 'none';
                statusDiv.style.color = 'green';
                statusDiv.innerText = 'Model ready!';
                setTimeout(() => { removeModal(); resolve(); }, 1500);
            } catch (err) {
                spinner.style.display = 'none';
                statusDiv.style.color = 'red';
                statusDiv.innerText = `Download failed: ${err.message}`;
                const retryBtn = document.createElement('button');
                retryBtn.innerText = 'Retry';
                Object.assign(retryBtn.style, {
                    marginTop: '12px',
                    backgroundColor: '#4c97ff', color: 'white',
                    border: 'none', padding: '10px 24px',
                    fontSize: '15px', borderRadius: '20px',
                    cursor: 'pointer', fontWeight: 'bold'
                });
                retryBtn.onclick = () => {
                    content.removeChild(retryBtn);
                    progressBar.style.width = '0%';
                    statusDiv.style.color = '#855cd6';
                    statusDiv.innerText = 'Starting download…';
                    startDownload();
                };
                content.appendChild(retryBtn);
            }
        };

        startDownload();
    });
};

export {
    isLoaded,
    getLlmInference,
    loadModel,
    generate,
    showLoadModal,
    formatPrompt,
    formatPromptParts,
    cleanResponse,
    MODEL_SUPPORTS_VISION,
    TEXT_ONLY_MESSAGE
};
