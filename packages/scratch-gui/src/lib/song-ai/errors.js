class SongAiError extends Error {
    constructor (message, code) {
        super(message);
        this.name = 'SongAiError';
        this.code = code;
    }
}

export {SongAiError};
