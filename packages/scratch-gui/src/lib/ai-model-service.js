/**
 * Singleton AI model service for the on-device Gemma model.
 *
 * Used by the JS-powered-blocks editor's "Generate with AI" feature to turn a
 * natural-language description into a block document. Ported from the `gemma4`
 * branch's SB2 experiment, minus the Redux wiring — status is kept as a module
 * singleton (see getStatus) so callers can read it without a reducer.
 *
 * Supports:
 *  - WebGPU capability detection (skips gracefully on unsupported hardware)
 *  - OPFS caching: model is saved to the browser's Origin Private File System
 *    after the first download, so subsequent sessions load from cache.
 *  - Auto-download with a streaming progress bar (no RAM spike).
 *  - Verification chat on load to confirm the model is working.
 */

/**
 * URL of the hosted model file.
 * Gemma 4 E2B in LiteRT web task format (~2 GB).
 */
const MODEL_URL = 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task';
const MODEL_NAME = 'Gemma 4 E2B';

const OPFS_FILENAME = 'gemma-4-e2b.bin';

let _llmInference = null;
let _modelLoaded = false;
let _isLoading = false;
let _status = 'idle'; // idle | loading | ready | error | unavailable

const isLoaded = () => _modelLoaded;

const getStatus = () => _status;

const getLlmInference = () => _llmInference;

const _setStatus = status => {
    _status = status;
};

// ---------------------------------------------------------------------------
// WebGPU detection
// ---------------------------------------------------------------------------

const checkWebGPU = async () => {
    if (!navigator.gpu) {
        return {available: false, reason: 'WebGPU not supported in this browser'};
    }
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return {available: false, reason: 'No WebGPU adapter available'};
        }
        const info = adapter.requestAdapterInfo ? adapter.requestAdapterInfo() : adapter.info;
        if (info?.description?.includes('SwiftShader')) {
            return {available: false, reason: 'SwiftShader (software GPU) detected — too slow for LLM inference'};
        }
        return {available: true};
    } catch (err) {
        return {available: false, reason: `WebGPU check failed: ${err.message}`};
    }
};

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------

const loadModel = async url => {
    if (_modelLoaded || _isLoading) return;
    _isLoading = true;
    _setStatus('loading');
    try {
        const {FilesetResolver, LlmInference} = require('@mediapipe/tasks-genai');
        const filesetResolver = await FilesetResolver.forGenAiTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm'
        );
        // eslint-disable-next-line no-console
        console.log(`[ai-model-service] Loading model: ${MODEL_NAME} from ${url.slice(0, 80)}…`);
        _llmInference = await LlmInference.createFromOptions(filesetResolver, {
            baseOptions: {modelAssetPath: url},
            maxTokens: 4096
        });
        _modelLoaded = true;
        _setStatus('ready');
        // eslint-disable-next-line no-console
        console.log(`[ai-model-service] ${MODEL_NAME} loaded successfully`);

        // Verification chat — non-blocking
        _llmInference.generateResponse('Say exactly: Hello from Gemma')
            .then(response => {
                // eslint-disable-next-line no-console
                console.log(`[ai-model-service] Model self-identification: ${response}`);
            })
            .catch(() => {}); // non-critical
    } catch (err) {
        _setStatus('error');
        throw err;
    } finally {
        _isLoading = false;
    }
};

const generate = prompt => {
    if (!_llmInference) return Promise.reject(new Error('Model not loaded'));
    return _llmInference.generateResponse(prompt);
};

// Expose for testing (CDP / Selenium test harness)
if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__aiGenerate', {
        get: () => (_modelLoaded ? generate : null),
        configurable: true
    });
    Object.defineProperty(window, '__aiModelLoaded', {
        get: () => _modelLoaded,
        configurable: true
    });
    Object.defineProperty(window, '__aiModelStatus', {
        get: () => _status,
        configurable: true
    });
}

// ---------------------------------------------------------------------------
// OPFS helpers
// ---------------------------------------------------------------------------

/**
 * Returns a blob URL for the cached model, or null if not cached.
 * @returns {?string} a blob URL or null.
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
 * Streams the model from url directly into OPFS (no full-file RAM buffering).
 * Calls onProgress(bytesReceived, totalBytes) as chunks arrive.
 * @param {string} url - the model URL.
 * @param {Function} onProgress - progress callback.
 * @returns {string} a blob URL pointing to the cached file.
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
    for (;;) {
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
// Download modal
// ---------------------------------------------------------------------------

const _showDownloadModal = () => new Promise((resolve, reject) => {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'llm-load-modal';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
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

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '12px',
        right: '16px',
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

    // Heading
    const heading = document.createElement('h2');
    heading.innerText = 'Setting up Gemma AI';
    heading.style.marginTop = '0';
    heading.style.color = '#4c97ff';
    content.appendChild(heading);

    // Description
    const descText = document.createElement('p');
    descText.style.lineHeight = '1.5';
    descText.style.color = '#575e75';
    descText.innerHTML =
        `Downloading Google's <b>${MODEL_NAME}</b> AI model (~2 GB).<br>
         This only happens once — it will be cached for future sessions.`;
    content.appendChild(descText);

    // Spinner style
    if (!document.getElementById('llm-spinner-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'llm-spinner-style';
        styleEl.innerText =
            '@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}' +
            '.llm-spinner{animation:spin 1s linear infinite}';
        document.head.appendChild(styleEl);
    }

    // Progress bar
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

    // Status text
    const statusDiv = document.createElement('div');
    Object.assign(statusDiv.style, {
        marginTop: '8px',
        minHeight: '30px',
        color: '#855cd6',
        fontSize: '14px'
    });
    statusDiv.innerText = 'Starting download…';
    content.appendChild(statusDiv);

    // Spinner
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

    const startDownload = async () => {
        try {
            let url;
            try {
                url = await downloadModelToOpfs(MODEL_URL, setProgress);
            } catch (opfsErr) {
                // OPFS not available (e.g. headless browser, permission denied).
                // Fall back to loading the model directly from URL.
                // eslint-disable-next-line no-console
                console.warn('[ai-model-service] OPFS caching failed, loading model directly:', opfsErr.message);
                statusDiv.innerText = 'Loading model directly (no cache)…';
                progressBar.style.width = '100%';
                url = MODEL_URL;
            }
            statusDiv.innerText = 'Loading model into memory…';
            spinner.style.display = 'block';
            await loadModel(url);
            spinner.style.display = 'none';
            statusDiv.style.color = 'green';
            statusDiv.innerText = 'Model ready!';
            setTimeout(() => {
                removeModal();
                resolve();
            }, 1500);
        } catch (err) {
            spinner.style.display = 'none';
            statusDiv.style.color = 'red';
            statusDiv.innerText = `Download failed: ${err.message}`;
            const retryBtn = document.createElement('button');
            retryBtn.innerText = 'Retry';
            Object.assign(retryBtn.style, {
                marginTop: '12px',
                backgroundColor: '#4c97ff',
                color: 'white',
                border: 'none',
                padding: '10px 24px',
                fontSize: '15px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontWeight: 'bold'
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

// ---------------------------------------------------------------------------
// Public init — lazily called the first time the user asks to generate
// ---------------------------------------------------------------------------

let _initPromise = null;

/**
 * Initialize the AI model service.
 * Checks WebGPU, tries the OPFS cache, downloads if needed. Safe to call
 * repeatedly — the first call's promise is reused.
 * @returns {Promise} resolves once init has run (model ready or unavailable).
 */
const init = () => {
    if (_initPromise) return _initPromise;

    _initPromise = _doInit().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('[ai-model-service] Init failed:', err.message);
        // Allow a later retry after a cancellation/failure.
        _initPromise = null;
        throw err;
    });

    return _initPromise;
};

const _doInit = async () => {
    // 1. Check WebGPU
    const gpu = await checkWebGPU();
    if (!gpu.available) {
        // eslint-disable-next-line no-console
        console.log(`[ai-model-service] WebGPU not available: ${gpu.reason}`);
        _setStatus('unavailable');
        return;
    }

    // 2. Try OPFS cache
    const cachedUrl = await checkOpfsCache();
    if (cachedUrl) {
        const toast = showToast('Loading cached AI model…');
        try {
            await loadModel(cachedUrl);
            toast.setText('AI model ready!');
            setTimeout(() => toast.dismiss(), 2000);
            return;
        } catch (err) {
            toast.dismiss();
            // eslint-disable-next-line no-console
            console.warn('[ai-model-service] Cached model failed to load, showing modal:', err.message);
            // Fall through to download modal
        }
    }

    // 3. Show download modal and auto-start
    await _showDownloadModal();
};

export {init, isLoaded, getStatus, generate, getLlmInference};
