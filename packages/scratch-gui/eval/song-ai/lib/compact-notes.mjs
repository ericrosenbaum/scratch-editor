// Render a scoring-view song into a compact, token-cheap text form for the
// optional Opus judge. One line per track; notes as `step:pitch:dur` (or
// `step:drumN` for lane tracks). Far smaller than raw JSON.
import {PITCH_CLASS_NAMES} from '../../../src/lib/scale-utils.js';

const pitchName = p => `${PITCH_CLASS_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;

const trackLine = track => {
    const head = track.kind === 'drum' || track.kind === 'synthDrum' ?
        `[${track.kind}]` :
        `[${track.kind}${typeof track.instrument === 'number' ? ` instr=${track.instrument}` : ''}]`;
    const notes = (track.notes || [])
        .slice()
        .sort((a, b) => (a.step - b.step) || ((a.pitch || a.drum || 0) - (b.pitch || b.drum || 0)))
        .map(n => (typeof n.pitch === 'number' ?
            `${n.step}:${pitchName(n.pitch)}:${n.durationSteps}` :
            `${n.step}:d${n.drum}`))
        .join(' ');
    return `${head} ${notes}`;
};

export const songToCompactText = view => {
    const lines = [
        `tempo=${view.tempo} length=${view.lengthSteps} key=${PITCH_CLASS_NAMES[((view.rootPitch % 12) + 12) % 12]} scale=${view.scaleType}`
    ];
    for (const t of view.tracks) lines.push(trackLine(t));
    return lines.join('\n');
};
