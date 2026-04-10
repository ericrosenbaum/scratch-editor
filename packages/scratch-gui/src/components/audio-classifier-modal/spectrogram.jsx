import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';

import styles from './spectrogram.css';

/**
 * Map an intensity value (0-255) to an RGBA color on a purple gradient.
 * 0 = dark purple-black, ~128 = sound-primary purple, 255 = bright white-pink.
 * @param {number} value - byte value 0-255.
 * @returns {Array.<number>} [r, g, b, a]
 */
const intensityToColor = value => {
    const t = value / 255;
    if (t < 0.5) {
        // Dark → purple
        const s = t * 2; // 0..1
        return [
            20 + (187 * s),   // 20 → 207
            5 + (94 * s),     // 5 → 99
            25 + (182 * s),   // 25 → 207
            255
        ];
    }
    // Purple → bright
    const s = (t - 0.5) * 2; // 0..1
    return [
        207 + (48 * s),   // 207 → 255
        99 + (131 * s),   // 99 → 230
        207 + (48 * s),   // 207 → 255
        255
    ];
};

/**
 * Normalize a Float32Array of spectrogram data to 0-255 range
 * based on its actual min/max values.
 * @param {Float32Array} data - the raw spectrogram data.
 * @returns {{min: number, max: number}} the data range for mapping.
 */
const getDataRange = data => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
    }
    return {min, max};
};

/**
 * Live scrolling spectrogram that reads from a Web Audio AnalyserNode.
 */
class Spectrogram extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['_draw']);
        this._canvasRef = React.createRef();
        this._rafId = null;
        this._frequencyData = null;
    }

    componentDidMount () {
        if (this.props.analyserNode) {
            this._startDrawing();
        }
    }

    componentDidUpdate (prevProps) {
        if (!prevProps.analyserNode && this.props.analyserNode) {
            this._startDrawing();
        } else if (prevProps.analyserNode && !this.props.analyserNode) {
            this._stopDrawing();
        }
    }

    componentWillUnmount () {
        this._stopDrawing();
    }

    _startDrawing () {
        const {analyserNode} = this.props;
        this._frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
        // Clear canvas
        const canvas = this._canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgb(20, 5, 25)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        this._draw();
    }

    _stopDrawing () {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._frequencyData = null;
    }

    _draw () {
        const {analyserNode} = this.props;
        const canvas = this._canvasRef.current;
        if (!analyserNode || !canvas) return;

        analyserNode.getByteFrequencyData(this._frequencyData);

        const ctx = canvas.getContext('2d');
        const {width, height} = canvas;

        // Scroll left by 1px
        ctx.drawImage(canvas, -1, 0);

        // Draw new column on the right edge
        // Use lower 75% of frequency bins (upper quarter is usually empty)
        const usableBins = Math.floor(this._frequencyData.length * 0.75);
        const col = ctx.createImageData(1, height);

        for (let y = 0; y < height; y++) {
            // y=0 is top (highest freq), y=height-1 is bottom (lowest freq)
            const binIndex = Math.floor((1 - (y / height)) * usableBins);
            const value = this._frequencyData[Math.min(binIndex, usableBins - 1)];
            const [r, g, b, a] = intensityToColor(value);
            const offset = y * 4;
            col.data[offset] = r;
            col.data[offset + 1] = g;
            col.data[offset + 2] = b;
            col.data[offset + 3] = a;
        }

        ctx.putImageData(col, width - 1, 0);

        this._rafId = requestAnimationFrame(this._draw);
    }

    render () {
        return (
            <canvas
                className={styles.spectrogram}
                height={32}
                ref={this._canvasRef}
                width={468}
            />
        );
    }
}

Spectrogram.propTypes = {
    analyserNode: PropTypes.object
};

Spectrogram.defaultProps = {
    analyserNode: null
};

/**
 * Static spectrogram thumbnail rendered from speech-commands example data.
 * Renders once when data changes (not animated).
 */
class ExampleSpectrogram extends React.Component {
    constructor (props) {
        super(props);
        this._canvasRef = React.createRef();
    }

    componentDidMount () {
        this._renderSpectrogram();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.data !== this.props.data) {
            this._renderSpectrogram();
        }
    }

    _renderSpectrogram () {
        const {data, frameSize} = this.props;
        const canvas = this._canvasRef.current;
        if (!canvas || !data || !frameSize) return;

        const numFrames = Math.floor(data.length / frameSize);
        if (numFrames === 0) return;

        const {min, max} = getDataRange(data);
        const range = max - min || 1;

        const {width, height} = canvas;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        for (let x = 0; x < width; x++) {
            const frameIndex = Math.floor((x / width) * numFrames);
            const frameOffset = frameIndex * frameSize;

            for (let y = 0; y < height; y++) {
                // y=0 is top (highest freq), y=height-1 is bottom (lowest freq)
                const binIndex = Math.floor((1 - (y / height)) * frameSize);
                const rawValue = data[frameOffset + Math.min(binIndex, frameSize - 1)];
                // Normalize to 0-255 based on actual data range
                const normalized = Math.round(((rawValue - min) / range) * 255);
                const [r, g, b, a] = intensityToColor(normalized);
                const offset = (y * width + x) * 4;
                imageData.data[offset] = r;
                imageData.data[offset + 1] = g;
                imageData.data[offset + 2] = b;
                imageData.data[offset + 3] = a;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    render () {
        return (
            <canvas
                className={styles.exampleSpectrogram}
                height={this.props.height}
                ref={this._canvasRef}
                width={this.props.width}
            />
        );
    }
}

ExampleSpectrogram.propTypes = {
    data: PropTypes.object, // Float32Array
    frameSize: PropTypes.number.isRequired,
    height: PropTypes.number,
    width: PropTypes.number
};

ExampleSpectrogram.defaultProps = {
    height: 32,
    width: 50
};

export default Spectrogram;
export {ExampleSpectrogram};
