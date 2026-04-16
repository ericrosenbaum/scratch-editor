/* eslint-env worker */

let pipeline = null;
let transcriber = null;

self.onmessage = async function (event) {
    const {type} = event.data;

    if (type === 'init') {
        try {
            console.log('[Speech2Text Worker] Received init message');
            console.log('[Speech2Text Worker] Importing @huggingface/transformers...');

            const {pipeline: createPipeline} = await import('@huggingface/transformers');
            pipeline = createPipeline;

            console.log('[Speech2Text Worker] Import successful, creating ASR pipeline...');
            console.log('[Speech2Text Worker] Model: onnx-community/whisper-tiny, dtype: q8, device: wasm');

            transcriber = await pipeline(
                'automatic-speech-recognition',
                'onnx-community/whisper-tiny',
                {
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback: progressInfo => {
                        if (progressInfo.status === 'progress') {
                            console.log(`[Speech2Text Worker] Download: ${progressInfo.file} ${Math.round(progressInfo.progress)}%`);
                            self.postMessage({
                                type: 'progress',
                                progress: progressInfo.progress,
                                status: progressInfo.status,
                                file: progressInfo.file
                            });
                        } else {
                            console.log(`[Speech2Text Worker] Status: ${progressInfo.status} ${progressInfo.file || ''}`);
                        }
                    }
                }
            );

            console.log('[Speech2Text Worker] Pipeline created, model ready');
            self.postMessage({type: 'ready'});
        } catch (error) {
            console.error(`[Speech2Text Worker] Init failed: ${error.message}`);
            console.error(error.stack);
            self.postMessage({
                type: 'error',
                message: `Failed to load Whisper model: ${error.message}`
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
            const {audio, language} = event.data;
            console.log(`[Speech2Text Worker] Transcribing ${audio.length} samples, language: ${language}`);

            const options = {
                language: language || 'en',
                task: 'transcribe'
            };

            const result = await transcriber(audio, options);

            console.log(`[Speech2Text Worker] Result: "${(result.text || '').trim()}"`);
            self.postMessage({
                type: 'result',
                text: (result.text || '').trim()
            });
        } catch (error) {
            console.error(`[Speech2Text Worker] Transcription failed: ${error.message}`);
            self.postMessage({
                type: 'error',
                message: `Transcription failed: ${error.message}`
            });
        }
    }
};
