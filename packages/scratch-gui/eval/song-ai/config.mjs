// Central paths + constants for the eval harness. Kept dependency-free so any
// module can import it cheaply.
import path from 'path';

// launch.cjs sets EVAL_ROOT because esbuild's CJS bundle loses import.meta.url.
const HERE = process.env.EVAL_ROOT || process.cwd();

export const PATHS = {
    root: HERE,
    settings: path.join(HERE, 'settings', 'settings.json'),
    cases: path.join(HERE, 'cases'),
    seeds: path.join(HERE, 'seeds'),
    goldens: path.join(HERE, 'goldens'),
    baselines: path.join(HERE, 'baselines'),
    baselineFile: path.join(HERE, 'baselines', 'magenta.baseline.json'),
    weights: path.join(HERE, 'scoring', 'weights.json'),
    results: path.join(HERE, 'results'),
    checkpoints: path.join(HERE, 'checkpoints')
};

// Categories, in report order. `knownGap` flags those that the *current*
// MusicRNN-only provider cannot serve — they baseline low until Coconet /
// MusicVAE are wired in (Phase C), and are excluded from the CI regression gate.
export const CATEGORIES = [
    {id: 'single-track-gen', label: 'Single-track generation', knownGap: false},
    {id: 'single-track-edit', label: 'Single-track edit (continue/vary)', knownGap: false},
    {id: 'multitrack-song', label: 'Multitrack song', knownGap: false},
    {id: 'harmonize', label: 'Harmonization (Coconet)', knownGap: true},
    {id: 'infill', label: 'Infill (Coconet)', knownGap: true}
];

export const CATEGORY_IDS = CATEGORIES.map(c => c.id);

// MusicRNN/Coconet/MusicVAE checkpoints used by the provider (CDN).
export const CHECKPOINTS = {
    melodyRnn: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn',
    drumsRnn: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn',
    coconet: 'https://storage.googleapis.com/magentadata/js/checkpoints/coconet/bach',
    musicVaeMel: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small',
    musicVaeTrio: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/trio_4bar'
};

// continueSequence/sample are stochastic; aggregate this many runs per case.
export const DEFAULT_SAMPLES = 5;

// The reference (golden) model and the optional judge model.
export const GOLDEN_PROVIDER_ID = 'anthropic-opus';
export const JUDGE_PROVIDER_ID = 'anthropic-opus';

// The provider under test.
export const SUT_PROVIDER_ID = 'magenta';
