// The real implementation lives in ./song-ai/. This file is kept as a stable
// import path for existing call sites.
export {
    generateSongFromPrompt,
    editTrackWithPrompt,
    generateTrackWithPrompt,
    sanitizeSong,
    sanitizeTrack,
    SongAiError,
    LOCAL_STORAGE_KEY,
    getProvider,
    listProviders,
    listAvailableProviders,
    subscribeGemma4LoadStatus,
    getGemma4LoadStatus
} from './song-ai/index.js';
