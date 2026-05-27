/**
 * Web Worker for Whisper speech-to-text inference.
 * This file is served as a static asset (not webpack-bundled) to avoid
 * import.meta issues. It loads @huggingface/transformers via dynamic import from CDN.
 */

let transcriber = null;

self.onmessage = async function (event) {
    const type = event.data.type;

    if (type === 'init') {
        try {
            console.log('[Speech2Text Worker] Received init message');
            console.log('[Speech2Text Worker] Importing @huggingface/transformers from CDN...');

            const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');

            console.log('[Speech2Text Worker] Library loaded, creating ASR pipeline...');
            console.log('[Speech2Text Worker] Model: onnx-community/whisper-tiny, dtype: q8, device: wasm');

            transcriber = await module.pipeline(
                'automatic-speech-recognition',
                'onnx-community/whisper-tiny',
                {
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback: function (progressInfo) {
                        if (progressInfo.status === 'progress') {
                            console.log('[Speech2Text Worker] Download: ' + progressInfo.file + ' ' + Math.round(progressInfo.progress) + '%');
                            self.postMessage({
                                type: 'progress',
                                progress: progressInfo.progress,
                                status: progressInfo.status,
                                file: progressInfo.file
                            });
                        } else {
                            console.log('[Speech2Text Worker] Status: ' + progressInfo.status + ' ' + (progressInfo.file || ''));
                        }
                    }
                }
            );

            console.log('[Speech2Text Worker] Pipeline created, model ready');
            self.postMessage({type: 'ready'});
        } catch (error) {
            console.error('[Speech2Text Worker] Init failed: ' + error.message);
            console.error(error.stack);
            self.postMessage({
                type: 'error',
                message: 'Failed to load Whisper model: ' + error.message
            });
        }
    } else if (type === 'transcribe') {
        if (!transcriber) {
            self.postMessage({
                type: 'error',
                message: 'Model not loaded yet'
            });
            return;
        }

        try {
            var audio = event.data.audio;
            var language = event.data.language;
            console.log('[Speech2Text Worker] Transcribing ' + audio.length + ' samples, language: ' + language);

            var result = await transcriber(audio, {
                language: language || 'en',
                task: 'transcribe'
            });

            var text = (result.text || '').trim();
            console.log('[Speech2Text Worker] Result: "' + text + '"');
            self.postMessage({
                type: 'result',
                text: text
            });
        } catch (error) {
            console.error('[Speech2Text Worker] Transcription failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Transcription failed: ' + error.message
            });
        }
    }
};
