import html2canvas from 'html2canvas';
import {isLoaded, getLlmInference, showLoadModal} from './ai-model-manager';

/**
 * Capture the full GUI as a canvas, compositing the WebGL stage on top.
 * html2canvas cannot read WebGL content, so we blit the stage canvas manually.
 * @param {object} vm - Scratch VM instance
 * @returns {Promise<HTMLCanvasElement>}
 */
const captureGui = async vm => {
    // Snapshot the WebGL stage into a 2D canvas NOW, before html2canvas runs.
    // WebGL canvases have preserveDrawingBuffer: false by default, meaning the
    // browser clears the buffer after each composited frame.  We force a fresh
    // draw() so the pixels are in the buffer, then immediately copy them to a
    // regular 2D canvas before anything else can clear them.
    const renderer = vm && vm.runtime && vm.runtime.renderer;
    const stageCanvas = renderer && renderer.canvas;
    let stageSnapshot = null;
    if (renderer && stageCanvas) {
        renderer.draw();
        stageSnapshot = document.createElement('canvas');
        stageSnapshot.width = stageCanvas.width;
        stageSnapshot.height = stageCanvas.height;
        stageSnapshot.getContext('2d').drawImage(stageCanvas, 0, 0);
    }

    // Capture exactly the visible viewport.
    // foreignObjectRendering delegates to the browser's native rendering engine,
    // which correctly handles CSS transforms and SVG (e.g. the Blockly workspace).
    // Without it, html2canvas mis-positions SVG content that uses translate().
    const guiCanvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        foreignObjectRendering: true,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
    });

    if (stageSnapshot) {
        const ctx = guiCanvas.getContext('2d');
        const rect = stageCanvas.getBoundingClientRect();
        ctx.drawImage(stageSnapshot, rect.left, rect.top, rect.width, rect.height);
    }

    return guiCanvas;
};

/**
 * Show an imperative overlay that lets the user ask a question about the editor.
 * Captures a screenshot of the full GUI and sends it to the Gemma model.
 * Follows the same DOM-overlay pattern as showLoadModal() in ai-model-manager.js.
 * @param {object} vm - Scratch VM instance
 */
const askAboutGui = vm => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: '20000'
    });

    const content = document.createElement('div');
    Object.assign(content.style, {
        backgroundColor: 'white', padding: '30px', borderRadius: '15px',
        width: '620px', maxWidth: '90%',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        textAlign: 'center',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        position: 'relative'
    });

    const removeOverlay = () => {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
    };

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    Object.assign(closeBtn.style, {
        position: 'absolute', top: '12px', right: '16px',
        background: 'none', border: 'none',
        fontSize: '18px', cursor: 'pointer', color: '#999'
    });
    closeBtn.onclick = removeOverlay;
    content.appendChild(closeBtn);

    const heading = document.createElement('h2');
    heading.innerText = 'Ask AI about the Editor';
    Object.assign(heading.style, {marginTop: '0', color: '#4c97ff'});
    content.appendChild(heading);

    const sub = document.createElement('p');
    sub.innerText = 'Gemma will take a screenshot of the editor and answer your question.';
    Object.assign(sub.style, {color: '#575e75', lineHeight: '1.5', marginBottom: '16px'});
    content.appendChild(sub);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g. What does this project do?';
    Object.assign(input.style, {
        width: '100%', boxSizing: 'border-box',
        padding: '10px 14px', fontSize: '15px',
        border: '2px solid #d9e3f0', borderRadius: '8px',
        marginBottom: '16px'
    });
    content.appendChild(input);
    content.appendChild(document.createElement('br'));

    const askBtn = document.createElement('button');
    askBtn.innerText = 'Ask';
    Object.assign(askBtn.style, {
        backgroundColor: '#4c97ff', color: 'white',
        border: 'none', padding: '12px 30px',
        fontSize: '16px', borderRadius: '25px',
        cursor: 'pointer', fontWeight: 'bold'
    });
    content.appendChild(askBtn);

    // Screenshot thumbnail — shown once capture completes
    const screenshotImg = document.createElement('img');
    Object.assign(screenshotImg.style, {
        display: 'none',
        width: '100%', maxHeight: '160px',
        objectFit: 'contain',
        marginTop: '18px',
        borderRadius: '6px',
        border: '1px solid #d9e3f0'
    });
    content.appendChild(screenshotImg);

    // Status label (short messages: "Capturing…", "Thinking…")
    const statusDiv = document.createElement('div');
    Object.assign(statusDiv.style, {
        marginTop: '12px',
        color: '#575e75', fontSize: '13px', fontStyle: 'italic'
    });
    content.appendChild(statusDiv);

    const spinner = document.createElement('div');
    spinner.className = 'llm-spinner';
    Object.assign(spinner.style, {
        display: 'none', margin: '8px auto',
        border: '4px solid #f3f3f3', borderTop: '4px solid #4c97ff',
        borderRadius: '50%', width: '28px', height: '28px'
    });
    content.appendChild(spinner);

    // Scrollable answer pane — shown only when result is ready
    const answerDiv = document.createElement('div');
    Object.assign(answerDiv.style, {
        display: 'none',
        marginTop: '14px',
        padding: '12px 14px',
        backgroundColor: '#f7f9ff',
        border: '1px solid #d9e3f0',
        borderRadius: '8px',
        maxHeight: '200px',
        overflowY: 'auto',
        textAlign: 'left',
        fontSize: '14px',
        lineHeight: '1.65',
        color: '#333'
    });
    content.appendChild(answerDiv);

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    input.focus();

    const setLoading = msg => {
        input.disabled = true;
        askBtn.disabled = true;
        askBtn.style.opacity = '0.5';
        spinner.style.display = 'block';
        answerDiv.style.display = 'none';
        statusDiv.style.color = '#575e75';
        statusDiv.innerText = msg || '';
    };

    const showScreenshot = canvas => {
        screenshotImg.src = canvas.toDataURL('image/jpeg', 0.7);
        screenshotImg.style.display = 'block';
        sub.style.display = 'none';
    };

    const showResult = text => {
        spinner.style.display = 'none';
        statusDiv.innerText = '';
        answerDiv.innerText = text;
        answerDiv.style.display = 'block';
    };

    const showError = msg => {
        spinner.style.display = 'none';
        statusDiv.style.color = 'red';
        statusDiv.innerText = msg;
        input.disabled = false;
        askBtn.disabled = false;
        askBtn.style.opacity = '1';
    };

    const handleAsk = async () => {
        const question = input.value.trim();
        if (!question) {
            input.style.borderColor = 'red';
            return;
        }
        input.style.borderColor = '#d9e3f0';

        if (!isLoaded()) {
            setLoading('Loading AI model…');
            try {
                await showLoadModal();
            } catch (e) {
                removeOverlay();
                return;
            }
        }

        setLoading('Capturing screenshot…');
        // Hide the overlay so it doesn't appear in the screenshot
        overlay.style.display = 'none';
        let guiCanvas;
        try {
            guiCanvas = await captureGui(vm);
        } catch (err) {
            overlay.style.display = 'flex';
            showError(`Screenshot failed: ${err.message}`);
            return;
        }
        overlay.style.display = 'flex';

        showScreenshot(guiCanvas);
        setLoading('Gemma is thinking…');

        try {
            const prompt =
                'You are an assistant helping a user understand the Scratch code editor. ' +
                'Answer based on what you see in the screenshot. ' +
                'Be very concise — answer in 2 to 3 sentences at most. ' +
                question;
            const llm = getLlmInference();
            const response = await llm.generateResponse([prompt, {imageSource: guiCanvas}]);
            showResult(typeof response === 'string' ? response.trim() : String(response).trim());
        } catch (err) {
            showError(`Error: ${err.message}`);
        }
    };

    askBtn.onclick = handleAsk;
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleAsk();
    });
};

export {askAboutGui};
