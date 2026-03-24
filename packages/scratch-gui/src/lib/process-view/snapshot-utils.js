/**
 * Snapshot utilities for the process view.
 *
 * Captures stage thumbnails and full project JSON snapshots.
 */

/**
 * Capture a stage snapshot as a data URL, scaled to the given dimensions.
 * @param {VirtualMachine} vm - The scratch-vm instance
 * @param {number} width - Target width (default 240)
 * @param {number} height - Target height (default 180)
 * @returns {Promise<string|null>} data URL of the snapshot, or null if unavailable
 */
const captureStageSnapshot = (vm, width = 240, height = 180) => new Promise(resolve => {
    if (!vm || !vm.renderer) {
        resolve(null);
        return;
    }

    try {
        vm.postIOData('video', {forceTransparentPreview: true});
        vm.renderer.requestSnapshot(dataURI => {
            vm.postIOData('video', {forceTransparentPreview: false});

            if (!dataURI) {
                resolve(null);
                return;
            }

            // Downscale to target size
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(dataURI); // fall back to full-size
            img.src = dataURI;
        });
        vm.renderer.draw();
    } catch (e) {
        resolve(null);
    }
});

/**
 * Capture a small thumbnail (80x60) of the stage.
 * @param {VirtualMachine} vm
 * @returns {Promise<string|null>}
 */
const captureSmallThumbnail = (vm) => captureStageSnapshot(vm, 80, 60);

/**
 * Capture a full project JSON snapshot.
 * @param {VirtualMachine} vm
 * @returns {string|null} JSON string of the project
 */
const captureProjectSnapshot = vm => {
    if (!vm) return null;
    try {
        return vm.toJSON();
    } catch (e) {
        return null;
    }
};

/**
 * Generate a UUID v4.
 * @returns {string}
 */
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export {
    captureStageSnapshot,
    captureSmallThumbnail,
    captureProjectSnapshot,
    generateId
};
