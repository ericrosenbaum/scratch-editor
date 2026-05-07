import {parseWavMeta} from './wav-meta.js';

/**
 * Wrap WAV bytes into a vmSound and add to a target. Mirrors the shape that
 * `soundUpload` (file-uploader.js) and `encodeAndAddSoundToVM` (audio-util.js)
 * produce, so the asset round-trips correctly through save/load.
 *
 * Returns the *actual* final sound name. The VM's `target.addSound` mutates
 * `vmSound.name` via `StringUtil.unusedName` to dedupe collisions, so the
 * post-await name may differ from the requested one.
 *
 * @param {VM} vm
 * @param {Uint8Array} wavBytes
 * @param {string} name
 * @param {string|null} targetId  if null, vm.addSound uses the current editingTarget
 * @returns {Promise<{soundName: string}>}
 */
const addGeneratedSoundToTarget = async (vm, wavBytes, name, targetId) => {
    const meta = parseWavMeta(wavBytes);
    const storage = vm.runtime.storage;
    const asset = storage.createAsset(
        storage.AssetType.Sound,
        storage.DataFormat.WAV,
        wavBytes,
        null,
        true
    );
    const vmSound = {
        name,
        format: '',
        dataFormat: 'wav',
        rate: meta.sampleRate,
        sampleCount: meta.sampleCount,
        asset,
        assetId: asset.assetId,
        md5: `${asset.assetId}.wav`
    };
    await vm.addSound(vmSound, targetId);
    return {soundName: vmSound.name};
};

export {addGeneratedSoundToTarget};
