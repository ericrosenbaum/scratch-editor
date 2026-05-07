import {generateMusic, LyriaError} from './lyria-api.js';
import {addGeneratedSoundToTarget} from './add-generated-sound.js';
import {decodeToWav} from './decode-to-wav.js';
import {
    startMusicGeneration,
    musicGenerationSuccess,
    musicGenerationError
} from '../../reducers/music-generation.js';
import {
    showStandardAlert,
    showAlertWithData,
    closeAlertWithId,
    closeAlertsWithId
} from '../../reducers/alerts.js';

const COMPLETE_TOAST_SECS = 12;

const getTargetName = target => {
    if (!target) return null;
    if (typeof target.getName === 'function') return target.getName();
    return target.sprite && target.sprite.name;
};

/**
 * Orchestrates the full Lyria generation flow: capture target → API call →
 * decode WAV → addSound → swap spinner alert for completion alert. Lives
 * outside React so the request survives modal close and sprite switches.
 *
 * @param {object} args
 * @param {string} args.prompt
 * @param {VM} args.vm
 * @param {Function} args.dispatch
 * @param {boolean} args.isGenerating  current value of musicGeneration.isGenerating
 * @returns {Promise<boolean>}  true if started; false if already in progress
 */
const startMusicGenerationFlow = async ({prompt, vm, dispatch, isGenerating}) => {
    if (isGenerating) return false;
    if (!vm.editingTarget) return false;

    const capturedTargetId = vm.editingTarget.id;
    const capturedTargetName = getTargetName(vm.editingTarget);

    dispatch(startMusicGeneration({
        targetId: capturedTargetId,
        targetName: capturedTargetName,
        prompt
    }));
    dispatch(showStandardAlert('aiMusicGenerating'));

    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        const {audioBytes} = await generateMusic(prompt, apiKey);
        const wavBytes = await decodeToWav(audioBytes);

        // Re-look-up the target so we can use the live name and detect deletion.
        const liveTarget = vm.runtime.getTargetById(capturedTargetId);
        const effectiveTargetId = liveTarget ?
            capturedTargetId :
            (vm.editingTarget && vm.editingTarget.id) || null;
        const liveTargetName = liveTarget ?
            getTargetName(liveTarget) :
            (capturedTargetName || (vm.editingTarget && getTargetName(vm.editingTarget)));

        const requestedName = `Music: ${prompt.trim().slice(0, 24)}`;
        // The VM dedupes via StringUtil.unusedName; capture the actual final
        // name so the "Open" action can find this exact sound by name.
        const {soundName} = await addGeneratedSoundToTarget(
            vm, wavBytes, requestedName, effectiveTargetId
        );

        dispatch(musicGenerationSuccess({
            targetId: effectiveTargetId,
            soundName
        }));
        dispatch(closeAlertWithId('aiMusicGenerating'));
        dispatch(showAlertWithData('aiMusicComplete', {
            targetId: effectiveTargetId,
            spriteName: liveTargetName || '',
            soundName
        }));
        // Auto-dismiss the completion toast after a few seconds.
        setTimeout(
            () => dispatch(closeAlertsWithId('aiMusicComplete')),
            COMPLETE_TOAST_SECS * 1000
        );
    } catch (err) {
        const message = err instanceof LyriaError ?
            err.message : (err && err.message) || String(err);
        dispatch(musicGenerationError({
            code: (err && err.code) || 'unknown',
            message,
            details: (err && err.details) || null
        }));
        dispatch(closeAlertWithId('aiMusicGenerating'));
        dispatch(showAlertWithData('aiMusicError', {message}));
    }
    return true;
};

export {startMusicGenerationFlow};
