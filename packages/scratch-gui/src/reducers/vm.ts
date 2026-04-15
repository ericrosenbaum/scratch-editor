import VM from '@scratch/scratch-vm';
import {GUIConfig} from '../gui-config';
import embeddingService from '../lib/embedding/embedding-service.js';

const SET_VM = 'scratch-gui/vm/SET_VM';

const createVM = function (config: GUIConfig) {
    const defaultVM = new VM();
    defaultVM.attachStorage(config.storage.scratchStorage);
    // Share the embedding worker with any VM extension that needs it (e.g. Q+A).
    // warmUp is idempotent; other call sites (tips) may also trigger it.
    (defaultVM.runtime as unknown as {embeddingService: unknown}).embeddingService = embeddingService;
    embeddingService.warmUp().catch(() => {
        // Swallow: extensions that rely on embeddings handle absence gracefully.
    });
    return defaultVM;
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = null;
    switch (action.type) {
    case SET_VM:
        return action.vm;
    default:
        return state;
    }
};
const setVM = function (vm) {
    return {
        type: SET_VM,
        vm: vm
    };
};

export {
    reducer as default,
    createVM as vmInitialState,
    setVM
};
