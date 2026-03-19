import VideoProvider from './video-provider.js';

/**
 * Manages a camera stream for a modal (e.g. the Teachable Machine training editor).
 * Uses VideoProvider so the camera sharing mechanism in camera.js handles it correctly —
 * the modal and the stage can use the same stream simultaneously.
 */
class ModalVideoManager {
    constructor (canvas) {
        this._canvas = canvas;
        this._videoProvider = new VideoProvider();
        this._animFrameId = null;
        this._running = false;
    }

    /**
     * Start the camera stream and begin rendering to the canvas.
     * @param {Function} onAccess - called when the browser grants camera permission
     * @param {Function} onLoaded - called when the first frame is ready
     */
    enableVideo (onAccess, onLoaded) {
        this._videoProvider.enableVideo().then(() => {
            if (onAccess) onAccess();
            this._running = true;
            this._renderLoop(onLoaded);
        });
    }

    /**
     * Stop the camera stream and cancel the render loop.
     */
    disableVideo () {
        this._running = false;
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
        this._videoProvider.disableVideo();
    }

    /**
     * Continuously render camera frames to the canvas.
     * @param {Function} [onFirstFrame] - called once after the first successful frame
     * @private
     */
    _renderLoop (onFirstFrame) {
        if (!this._running) return;
        const frame = this._videoProvider.getFrame({
            format: VideoProvider.FORMAT_IMAGE_DATA,
            dimensions: [480, 360],
            mirror: true
        });
        if (frame && this._canvas) {
            const ctx = this._canvas.getContext('2d');
            ctx.putImageData(frame, 0, 0);
            if (onFirstFrame) {
                onFirstFrame();
                onFirstFrame = null; // eslint-disable-line no-param-reassign
            }
        }
        this._animFrameId = requestAnimationFrame(() => this._renderLoop(onFirstFrame));
    }
}

export default ModalVideoManager;
