/**
 * Singleton AI model manager for the Gemma on-device model.
 * Works independently of the On-Device AI extension.
 */

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

/**
 * Show the model-loading modal.
 * Returns a Promise that resolves when the model is loaded, or rejects if
 * the user dismisses the modal.  If the modal is already open, the same
 * Promise is returned so concurrent callers share one modal.
 */
const showLoadModal = () => {
    if (_modelLoaded) return Promise.resolve();
    if (_modalPromise) return _modalPromise;

    _modalPromise = new Promise((resolve, reject) => {
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
            _modalPromise = null;
        };

        // Close / cancel button
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

        const heading = document.createElement('h2');
        heading.innerText = 'Setup Gemma AI';
        heading.style.marginTop = '0';
        heading.style.color = '#4c97ff';
        content.appendChild(heading);

        const text = document.createElement('p');
        text.style.lineHeight = '1.5';
        text.style.color = '#575e75';
        text.innerHTML = `
            This feature uses Google's <b>Gemma 3n</b> AI model, running directly on your computer.<br><br>
            To use it, you must first download the model file (approx 1.7GB) from the official website.
        `;
        content.appendChild(text);

        const linkBtn = document.createElement('a');
        linkBtn.href = 'https://deepmind.google/models/gemma/gemma-3n/';
        linkBtn.target = '_blank';
        linkBtn.innerText = 'Open Gemma Download Page ↗';
        Object.assign(linkBtn.style, {
            display: 'inline-block',
            margin: '10px 0 20px 0',
            color: '#4c97ff',
            textDecoration: 'none',
            fontWeight: 'bold'
        });
        content.appendChild(linkBtn);
        content.appendChild(document.createElement('br'));

        const loadBtn = document.createElement('button');
        loadBtn.innerText = 'Load model file from my computer';
        Object.assign(loadBtn.style, {
            backgroundColor: '#4c97ff',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            fontSize: '16px',
            borderRadius: '25px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: '0.2s'
        });
        loadBtn.onmouseover = () => { loadBtn.style.transform = 'scale(1.05)'; };
        loadBtn.onmouseout = () => { loadBtn.style.transform = 'scale(1.0)'; };
        content.appendChild(loadBtn);

        const statusDiv = document.createElement('div');
        Object.assign(statusDiv.style, {
            marginTop: '20px',
            minHeight: '30px',
            color: '#855cd6',
            fontSize: '14px'
        });
        content.appendChild(statusDiv);

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
        content.appendChild(spinner);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.bin,.task,.litertlm';
        fileInput.style.display = 'none';
        loadBtn.onclick = () => fileInput.click();

        fileInput.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;

            loadBtn.disabled = true;
            loadBtn.style.opacity = '0.5';
            loadBtn.innerText = 'Loading...';
            spinner.style.display = 'block';
            statusDiv.innerText = `Loading ${file.name}… (This may take a moment)`;

            try {
                await loadModel(URL.createObjectURL(file));
                spinner.style.display = 'none';
                statusDiv.style.color = 'green';
                statusDiv.innerText = 'Model loaded!';
                setTimeout(() => { removeModal(); resolve(); }, 1500);
            } catch (err) {
                spinner.style.display = 'none';
                statusDiv.style.color = 'red';
                statusDiv.innerText = `Error loading model: ${err.message}`;
                loadBtn.disabled = false;
                loadBtn.style.opacity = '1';
                loadBtn.innerText = 'Try again';
            }
        };

        content.appendChild(fileInput);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
    });

    return _modalPromise;
};

export {isLoaded, getLlmInference, loadModel, generate, showLoadModal};
