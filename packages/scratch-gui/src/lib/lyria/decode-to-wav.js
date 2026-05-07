import WavEncoder from 'wav-encoder';

const getAudioContext = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio API is not available');
    return new Ctx();
};

/**
 * Decode encoded audio bytes (e.g. MP3 from Lyria) and re-encode them as a
 * 16-bit PCM WAV. Preserves the original sample rate and channel count.
 *
 * @param {Uint8Array} audioBytes
 * @returns {Promise<Uint8Array>}
 */
const decodeToWav = async audioBytes => {
    const ctx = getAudioContext();
    // Copy into a fresh ArrayBuffer — decodeAudioData detaches the buffer it
    // receives, which would corrupt the caller's Uint8Array view.
    const ab = audioBytes.buffer.slice(
        audioBytes.byteOffset,
        audioBytes.byteOffset + audioBytes.byteLength
    );
    let audioBuffer;
    try {
        audioBuffer = await ctx.decodeAudioData(ab);
    } finally {
        if (typeof ctx.close === 'function') ctx.close();
    }
    const channelData = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        channelData.push(audioBuffer.getChannelData(i));
    }
    const wavBuffer = await WavEncoder.encode({
        sampleRate: audioBuffer.sampleRate,
        channelData
    });
    return new Uint8Array(wavBuffer);
};

export {decodeToWav};
