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
 * URL of the hosted model file.
 * Set this to your Cloudflare R2 (or other public CDN) URL once you have uploaded
 * the Gemma 3n model file.  If null, the auto-download button will not appear
 * and users must load the file from their computer.
 * Example: 'https://pub-xxxxxxxxxxxx.r2.dev/gemma-3n-E2B-it-litert-preview.bin'
 */
const MODEL_URL = 'https://storage.googleapis.com/gemma-3n/gemma-3n-E2B-it-int4-Web.litertlm';

const OPFS_FILENAME = 'gemma-model.bin';

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
        const filesetResolver = await FilesetResolver.forGenAiTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm'
        );
        _llmInference = await LlmInference.createFromOptions(filesetResolver, {
            baseOptions: {modelAssetPath: url},
            maxTokens: 4096,
            maxNumImages: 1,
            supportAudio: true
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

// Expose for testing (CDP test harness)
if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__aiGenerate', {
        get: () => _modelLoaded ? generate : null,
        configurable: true
    });
    Object.defineProperty(window, '__aiModelLoaded', {
        get: () => _modelLoaded,
        configurable: true
    });
}

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
            `Downloading Google's <b>Gemma 3n</b> AI model (~3 GB).<br>
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
                let url;
                try {
                    url = await downloadModelToOpfs(MODEL_URL, setProgress);
                } catch (opfsErr) {
                    // OPFS not available (e.g. headless browser, permission denied).
                    // Fall back to loading the model directly from URL.
                    // eslint-disable-next-line no-console
                    console.warn('OPFS caching failed, loading model directly:', opfsErr.message);
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

export {isLoaded, getLlmInference, loadModel, generate, showLoadModal};
