// Parse a minimal subset of a RIFF/WAV header to read sample rate and sample
// count without re-encoding. Walks chunks past `fmt ` until it finds `data`.

/**
 * @param {Uint8Array} bytes
 * @returns {{sampleRate:number, sampleCount:number, numChannels:number, bitsPerSample:number}}
 */
const parseWavMeta = bytes => {
    if (bytes.length < 44) throw new Error('WAV too short');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('Not a WAV file');

    let offset = 12;
    let fmt = null;
    let dataSize = 0;
    while (offset + 8 <= bytes.length) {
        const id = String.fromCharCode(
            bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]
        );
        const size = dv.getUint32(offset + 4, true);
        const bodyStart = offset + 8;
        if (id === 'fmt ') {
            fmt = {
                audioFormat: dv.getUint16(bodyStart, true),
                numChannels: dv.getUint16(bodyStart + 2, true),
                sampleRate: dv.getUint32(bodyStart + 4, true),
                bitsPerSample: dv.getUint16(bodyStart + 14, true)
            };
        } else if (id === 'data') {
            dataSize = size;
            break;
        }
        // RIFF chunks are word-aligned
        offset = bodyStart + size + (size % 2);
    }
    if (!fmt) throw new Error('WAV missing fmt chunk');
    if (!dataSize) throw new Error('WAV missing data chunk');
    const bytesPerSample = fmt.bitsPerSample / 8;
    const sampleCount = Math.floor(dataSize / (bytesPerSample * fmt.numChannels));
    return {
        sampleRate: fmt.sampleRate,
        sampleCount,
        numChannels: fmt.numChannels,
        bitsPerSample: fmt.bitsPerSample
    };
};

export {parseWavMeta};
