import {
    createBlankSong,
    createBlankTrack,
    newId,
    INSTRUMENT_NAMES,
    DRUM_NAMES
} from './song-defaults.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
// A 4-track song with ~30 notes per track easily exceeds 2k tokens once the
// tool-use JSON envelope, per-note step/pitch/duration/velocity fields, and
// any model text are included. Set this high enough that the model doesn't
// get truncated mid-song (which manifests as the trailing tracks coming back
// empty).
const MAX_TOKENS = 8192;
const LOCAL_STORAGE_KEY = 'scratchAnthropicApiKey';

const TEMPO_MIN = 60;
const TEMPO_MAX = 180;
const LENGTH_MIN = 16;
const LENGTH_MAX = 64;
// Match the piano-roll editor and Music extension's playable sample range.
// (C1..C8 in MIDI.)
const PITCH_MIN = 24;
const PITCH_MAX = 108;
const VELOCITY_MIN = 1;
const VELOCITY_MAX = 127;
const MAX_TRACKS = 4;

// Instruments where stacked / overlapping notes (chords, voicings) feel
// natural. Indices match INSTRUMENT_NAMES (1-based in messages, 0-based here).
const POLYPHONIC_INSTRUMENT_INDICES = new Set([
    1,  // Piano
    2,  // Electric Piano
    3,  // Organ
    4,  // Guitar
    5,  // Electric Guitar
    7,  // Pizzicato
    15, // Choir
    16, // Vibraphone
    17, // Music Box
    18, // Steel Drum
    19, // Marimba
    21  // Synth Pad
]);

const namesByIndices = indices =>
    [...indices]
        .map(i => `${i}=${INSTRUMENT_NAMES[i - 1]}`)
        .join(', ');

const POLYPHONIC_INSTRUMENT_LIST = namesByIndices(POLYPHONIC_INSTRUMENT_INDICES);
const MONOPHONIC_INSTRUMENT_LIST = namesByIndices(
    new Set(
        INSTRUMENT_NAMES
            .map((_, i) => i + 1)
            .filter(i => !POLYPHONIC_INSTRUMENT_INDICES.has(i))
    )
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildInstrumentList = () =>
    INSTRUMENT_NAMES.map((name, idx) => `${idx + 1}=${name}`).join(', ');

const buildDrumList = () =>
    DRUM_NAMES.map((name, idx) => `${idx + 1}=${name}`).join(', ');

// The schema for one track is identical for both "create a whole song" and
// "edit just this track". Defining it once keeps the two tools in sync.
//
// Effects use integer ranges (0..100, -50..50 for pan) to match what the user
// sees in the editor sliders. sanitizeTrack converts these to the floating
// storage format (0..1, -1..1) consumed by the audio scheduler.
const EFFECTS_SCHEMA = {
    type: 'object',
    description:
        'Per-track mix effects, applied to every note on the track. All four ' +
        'fields are optional; omitted fields keep their default (neutral) value. ' +
        'Use effects to shape mood and space, not as a substitute for good note ' +
        'writing.',
    properties: {
        reverb: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description:
                'Wet reverb amount, 0 = dry, 100 = drenched. Use small amounts ' +
                '(10-30) for natural room, larger amounts (40-70) for ambient / ' +
                'cinematic / dream-pop textures. Drums usually need less than pads.'
        },
        delay: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description:
                'Eighth-note echo amount, 0 = none, 100 = heavy. Small amounts ' +
                '(15-30) thicken; larger amounts (40-60) give dub / surf / ambient ' +
                'feel. Avoid on busy parts — echoes pile up and muddle.'
        },
        filter: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description:
                'Low-pass filter, 100 = fully open (no filtering, default), 0 = ' +
                'closed (very dark / muffled). Drop to 60-80 for warm/vintage, ' +
                '30-50 for lo-fi or "behind a wall", below 30 only for special FX.'
        },
        pan: {
            type: 'integer',
            minimum: -50,
            maximum: 50,
            description:
                'Stereo pan, -50 = hard left, 0 = center (default), +50 = hard ' +
                'right. Pan accompaniment tracks slightly off-center (±15..±25) ' +
                'to separate them; keep lead/bass/kick near center.'
        }
    }
};

const TRACK_SCHEMA = {
    type: 'object',
    properties: {
        kind: {type: 'string', enum: ['instrument', 'drum']},
        instrument: {
            type: 'integer',
            minimum: 1,
            maximum: INSTRUMENT_NAMES.length,
            description: 'Required when kind=instrument. See instrument list.'
        },
        drumLanes: {
            type: 'array',
            items: {type: 'integer', minimum: 1, maximum: DRUM_NAMES.length},
            description:
                'For kind=drum, the ordered list of drum sounds (drum-machine ' +
                'lanes) this track plays. Each note carries its own `drum` ' +
                'index choosing which lane it hits. A typical pattern uses ' +
                '4-6 lanes: kick (2), snare (1), closed-hi-hat (6), open-hi-hat ' +
                '(5), crash (4), clap (8).'
        },
        volume: {type: 'integer', minimum: 0, maximum: 100},
        effects: EFFECTS_SCHEMA,
        notes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    step: {type: 'integer', minimum: 0},
                    durationSteps: {type: 'integer', minimum: 1},
                    pitch: {
                        type: 'integer',
                        minimum: PITCH_MIN,
                        maximum: PITCH_MAX,
                        description:
                            'MIDI pitch. Required for instrument tracks, ignored for drum tracks.'
                    },
                    drum: {
                        type: 'integer',
                        minimum: 1,
                        maximum: DRUM_NAMES.length,
                        description:
                            'For drum tracks ONLY: which drum sound this hit ' +
                            'plays. Required for every drum note (the track can ' +
                            'have multiple drum sounds active across notes).'
                    },
                    velocity: {
                        type: 'integer',
                        minimum: VELOCITY_MIN,
                        maximum: VELOCITY_MAX,
                        description:
                            'MIDI velocity (1-127). REQUIRED for every note. ' +
                            'Use velocity to shape phrasing: louder downbeats, ' +
                            'softer pickups, accents on melodic peaks. Typical ' +
                            'range: 50 (soft) to 110 (strong).'
                    }
                },
                required: ['step', 'durationSteps', 'velocity']
            }
        }
    },
    required: ['kind', 'volume', 'notes']
};

const SONG_TOOL = {
    name: 'create_song',
    description: 'Emit a Scratch song matching the user prompt.',
    input_schema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Short song name (<= 40 chars).'
            },
            tempo: {
                type: 'integer',
                minimum: TEMPO_MIN,
                maximum: TEMPO_MAX,
                description: 'Beats per minute.'
            },
            lengthSteps: {
                type: 'integer',
                minimum: LENGTH_MIN,
                maximum: LENGTH_MAX,
                description: 'Total length in steps (4 steps = 1 beat).'
            },
            tracks: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_TRACKS,
                items: TRACK_SCHEMA
            }
        },
        required: ['name', 'tempo', 'lengthSteps', 'tracks']
    }
};

const EDIT_TRACK_TOOL = {
    name: 'edit_track',
    description:
        'Return the new contents of a single track in an existing song, with the ' +
        'user-requested edit applied. Output ONLY this one track; you cannot modify ' +
        'other tracks or song-level fields.',
    input_schema: TRACK_SCHEMA
};

const GENERATE_TRACK_TOOL = {
    name: 'generate_track',
    description:
        'Return the contents of ONE new track to add to an existing song. Choose an ' +
        'instrument (or drum-kit lanes) that fits the prompt and complements the ' +
        'existing tracks.',
    input_schema: TRACK_SCHEMA
};

const buildSystemPrompt = () => [
    'You compose short songs for the Scratch song maker, a grid-based step sequencer for kids.',
    '',
    'A song is a flat sequence of "steps". stepsPerBeat is always 4,',
    'so 4 steps = 1 beat and lengthSteps=32 is 8 beats (~2 bars of 4/4).',
    `A song has 1-${MAX_TRACKS} tracks. Each track is either:`,
    `  - kind="instrument" with instrument index (${buildInstrumentList()}).`,
    '    Notes have pitch (MIDI: C1=24, C2=36, C3=48, C4=60, C5=72, C6=84, C7=96, C8=108).',
    `  - kind="drum" — a drum-machine track that plays MULTIPLE drum sounds.`,
    '    Set drumLanes to the list of drum-sound indices the track uses.',
    `    Drum sounds: ${buildDrumList()}.`,
    '    Each note has `drum` (1..18) choosing which drum sound it hits;',
    '    pitch is ignored. A typical groove uses 4-6 lanes:',
    '    [2, 1, 6, 5, 4, 8] = kick, snare, closed-hh, open-hh, crash, clap.',
    '',
    'Each note has step (0-based position, must be < lengthSteps), durationSteps (>=1),',
    'pitch (only for instruments), and velocity (1-127, see below).',
    '',
    'Compose musically:',
    `- Pick a tempo that fits the vibe (slow=${TEMPO_MIN}-90, medium=90-130, fast=130-${TEMPO_MAX}).`,
    '- Pick lengthSteps that gives the melody room to breathe (32 is a good default;',
    '  48 or 64 for longer pieces).',
    '- For multi-track songs, keep tracks rhythmically related (a bassline that lands on beats,',
    '  a drum pattern that grooves with the melody).',
    '- Place each track in the register that matches its musical role:',
    '    * Bass / bassline tracks: low register — MIDI 28-48 (E1-C3). Bass should',
    '      genuinely sound low, not just be the lowest of a cluster of mid-range notes.',
    '    * Lead melody / vocal-like / solo: C4-C6 (60-84), the singable range.',
    '    * Pads / chords / accompaniment: C3-C5 (48-72) so they sit below the lead.',
    '    * Sparkles, bells, high counter-lines: C6-C8 (84-108).',
    '  If a track is labelled or sounds like "bass" (e.g., name contains "bass",',
    '  or it\'s the lowest part of a multi-track song), its pitches MUST stay',
    '  at or below MIDI 48 except for occasional walking-bass passing tones.',
    '- Stay in a coherent key',
    '  (e.g., C major: 60,62,64,65,67,69,71,72; A minor: 57,59,60,62,64,65,67,69).',
    '- If the user asks for a single instrument or melody, emit ONE track.',
    '  If they ask for a "song", "groove", "beat", or describe multiple instruments,',
    '  emit MULTIPLE tracks (often: lead + bass + drums).',
    '',
    'Polyphony within a single track:',
    '- Polyphonic-friendly instruments — STACK notes (overlap their step ranges) to form',
    '  chords, dyads, or sustained pads where appropriate.',
    `  These include: ${POLYPHONIC_INSTRUMENT_LIST}.`,
    '  A piano accompaniment, a strummed guitar, or a choir pad should usually have multiple',
    '  notes ringing at the same step.',
    '- Monophonic-natural instruments — keep them mostly to one note at a time, the way a',
    '  human player would. Occasional 2-note harmonies are fine but not chords.',
    `  These include: ${MONOPHONIC_INSTRUMENT_LIST}.`,
    '  A flute melody, sax line, or bassline should usually be one note per step range.',
    '',
    'Phrasing — let the melody breathe:',
    '- Think in phrases: 2- to 4-beat musical sentences with a clear arc — a beginning,',
    '  a peak, and a place to land. A 32-step song typically holds 2-4 phrases, not one',
    '  continuous run of notes.',
    '- Leave generous rests BETWEEN phrases (2-6 steps of silence) so the melody can',
    '  breathe and so the other parts have room to be heard. A melody that fills every',
    '  step smothers the rest of the arrangement.',
    '- In multi-track songs, the lead does NOT need to play through the whole song.',
    '  Drop out for a bar or two; let the bass and drums carry; re-enter with a fresh',
    '  idea. Trading space between parts is one of the most powerful tools you have.',
    '- Use shorter rests (1-2 steps) WITHIN a phrase to articulate it — like commas',
    '  inside a sentence. Longer rests (4-8+ steps) act as full stops between phrases.',
    '',
    'Rhythmic variety — shape each phrase with motion:',
    '- Mix note lengths within a phrase. A good phrase combines:',
    '    * Long sustained notes (4-8+ steps) that hang in the air, usually on strong',
    '      beats or at phrase endings.',
    '    * Short pickup or passing notes (1-2 steps) leading INTO a longer note.',
    '    * Runs of evenly-spaced short notes (4-8 in a row at 1-2 steps each) that',
    '      build momentum, then resolve to a sustained note.',
    '    * Ornaments — quick neighbor tones, grace notes, or turns just before a',
    '      strong beat (e.g. a 1-step note a step or two away from the target, then',
    '      the target on the beat).',
    '    * Dotted figures, triplet-feel groupings, or anticipations when the style',
    '      invites them.',
    '- Syncopation: land important notes on off-beats (steps 1, 3, 5, 7 within a beat)',
    '  for groove. Pop/rock/funk thrive on this; classical leans toward downbeats.',
    '- Never set every note to the same duration — uniform rhythm is the #1 cause of',
    '  stiff, sequencer-y output.',
    '- Drums and basslines can be more regular than the lead, but still add ghost',
    '  notes, off-beat hi-hats, or fills at phrase boundaries instead of repeating',
    '  one cell verbatim.',
    '',
    'Melodic shape — vary intervals and patterns:',
    '- Mix step-wise motion (intervals of 1-2 semitones) with leaps (3-8+ semitones).',
    '  Aim for roughly 60-70% steps and 30-40% leaps, with leaps placed deliberately.',
    '  Mostly-stepwise feels lyrical; mostly-leaping often feels unfocused.',
    '- After a large leap, RESOLVE by stepping back in the opposite direction — a',
    '  classic voice-leading move. After a stepwise run, a well-placed leap lands',
    '  like an exclamation.',
    '- Give each phrase a contour: rising, falling, arched (up then down), or inverted',
    '  arch. Repeating the same contour for every phrase is monotonous; varying',
    '  contour gives the melody emotional shape.',
    '- Repetition + variation is the engine of memorable melody. State a short motif',
    '  (3-6 notes), then repeat it with a change — transposed, rhythmically altered,',
    '  ornamented, inverted, or sequenced one step up/down. Pure repetition is boring;',
    '  pure novelty is forgettable; varied repetition is the sweet spot.',
    '',
    'Harmony — borrow from many traditions:',
    '- Land melody notes on CHORD TONES on strong beats; use non-chord tones (passing',
    '  tones, neighbor tones, suspensions, appoggiaturas) on weak beats. This is the',
    '  glue between melody and harmony in every Western style.',
    '- Classical: functional progressions (I-IV-V-I, ii-V-I, vi-IV-I-V), clear',
    '  cadences, suspensions that resolve down by step, smooth voice-leading between',
    '  chords (hold common tones, move other voices by step where possible).',
    '- Jazz: 7th chords (maj7, m7, dom7), extensions (9, 11, 13), chromatic approach',
    '  tones into chord tones, ii-V-I motion, occasional tritone substitution,',
    '  walking basslines that outline the chord changes one step at a time.',
    '- Popular / rock / pop: modal vamps (Dorian, Mixolydian, Aeolian), pedal-tone',
    '  basslines that hold one note while chords change above, four-chord loops',
    '  (I-V-vi-IV, vi-IV-I-V), suspended 2nds and 4ths over root motion, blues-',
    '  inflected b3 / b5 / b7 in solos over major keys.',
    '- For chord-playing tracks (piano, guitar, pad), voice the chord with the root',
    '  near the bottom and inner voices that move SMOOTHLY between chords (small',
    '  intervals, common tones held) rather than parallel jumps.',
    '',
    'Velocity (REQUIRED on every note):',
    '- Use velocity to shape phrasing and make the piece feel human.',
    '- Stronger beats (1 and 3 of a bar) tend to have higher velocity than upbeats.',
    '- Accent melodic peaks (~100-120). Soften pickup/passing notes (~50-75).',
    '- For chords, the top voice (melody) is often a bit louder than inner voices.',
    '- Drum hits also need velocity: backbeat snare loud, hi-hats varied to swing.',
    '- Avoid setting every note to the same velocity.',
    '',
    'Effects (OPTIONAL per track) — reverb, delay, filter, pan:',
    '- Set per-track effects to match the vibe. Defaults are neutral (no effect),',
    '  so omit the effects field for any track that should sound dry & dead-center.',
    '- Reverb (0-100): small (10-25) for natural room on most parts; larger',
    '  (40-70) for ambient pads, dreamy leads, cinematic moments. Drums usually',
    '  take less reverb than melodic/sustain instruments.',
    '- Delay (0-100, syncs to 1/8 note): small (15-30) to thicken; larger',
    '  (40-60) for dub/surf/ambient echo. Skip on busy fast lines.',
    '- Filter (0-100, default 100=open): 60-80 for warm/vintage darkening,',
    '  30-50 for lo-fi / "behind a wall", below 30 only for dramatic effect.',
    '- Pan (-50..+50, default 0=center): keep lead, bass, and kick near center.',
    '  Pan rhythm-section or counter-line parts ±15..±25 to widen the stereo',
    '  image. Don\'t hard-pan unless you have a specific reason.',
    '- Pick effects that fit the genre cue: ambient/dreamy → more reverb/delay;',
    '  rock/pop → modest reverb, mostly dry; lo-fi/hip-hop → filter down,',
    '  modest reverb; dub/reggae → noticeable delay; cinematic → big reverb.',
    '',
    'Call the create_song tool. Do not include any other text.'
].join('\n');

const resolveApiKey = () => {
    if (typeof localStorage !== 'undefined') {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) return stored;
        } catch (e) {
            // ignore localStorage access errors (e.g. disabled in private mode)
        }
    }
    if (typeof process !== 'undefined' && process.env && process.env.ANTHROPIC_API_KEY) {
        return process.env.ANTHROPIC_API_KEY;
    }
    return null;
};

/**
 * Sanitize a single track object returned by the model. Pulled out so both
 * `sanitizeSong` and `editTrackWithPrompt` can reuse the same validation rules.
 *
 * @param {object} rt - raw track from the tool input
 * @param {number} lengthSteps - the song's lengthSteps, used to drop out-of-range notes
 * @param {object} [baseEffects] - effect values to start from when the model
 *   emits a partial effects object (used by the edit_track path so a request
 *   like "add reverb" doesn't reset the other fields). Defaults to the blank-
 *   track defaults.
 * @returns {object} a track shaped like `createBlankTrack(...)` output
 */
const sanitizeTrack = (rt, lengthSteps, baseEffects) => {
    const kind = rt?.kind === 'drum' ? 'drum' : 'instrument';
    const track = createBlankTrack(kind);
    if (kind === 'instrument') {
        track.instrument = clamp(
            Math.round(Number(rt?.instrument) || 1),
            1,
            INSTRUMENT_NAMES.length
        );
        delete track.drum;
        delete track.drumLanes;
    } else {
        // Multi-lane drum track. Prefer drumLanes when present; fall back to
        // the legacy single `drum` field by promoting it to a one-lane kit.
        let lanes = Array.isArray(rt?.drumLanes) ? rt.drumLanes : null;
        if (lanes) {
            lanes = lanes
                .map(d => clamp(Math.round(Number(d)), 1, DRUM_NAMES.length))
                .filter((d, i, a) => a.indexOf(d) === i); // de-dup
        }
        if (!lanes || lanes.length === 0) {
            const legacy = clamp(Math.round(Number(rt?.drum) || 1), 1, DRUM_NAMES.length);
            lanes = [legacy];
        }
        track.drumLanes = lanes;
        delete track.instrument;
        delete track.drum;
    }
    const rawVolume = Number(rt?.volume);
    track.volume = clamp(
        Math.round(Number.isFinite(rawVolume) ? rawVolume : 80),
        0,
        100
    );
    track.muted = false;

    // Effects: the model emits integer ranges (0..100, -50..50 for pan); we
    // convert to the float storage format (0..1, -1..1). Fields the model
    // omits stay at the supplied base (either the blank-track defaults or, in
    // the edit_track path, the original track's effects) so partial updates
    // don't accidentally reset untouched fields.
    if (baseEffects) {
        track.effects = {...baseEffects};
    }
    if (rt && rt.effects && typeof rt.effects === 'object') {
        const fx = rt.effects;
        const out = {...track.effects};
        if (Number.isFinite(Number(fx.reverb))) {
            out.reverb = clamp(Number(fx.reverb), 0, 100) / 100;
        }
        if (Number.isFinite(Number(fx.delay))) {
            out.delay = clamp(Number(fx.delay), 0, 100) / 100;
        }
        if (Number.isFinite(Number(fx.filter))) {
            out.filter = clamp(Number(fx.filter), 0, 100) / 100;
        }
        if (Number.isFinite(Number(fx.pan))) {
            out.pan = clamp(Number(fx.pan), -50, 50) / 50;
        }
        track.effects = out;
    }

    const rawNotes = Array.isArray(rt?.notes) ? rt.notes : [];
    track.notes = [];
    for (const rn of rawNotes) {
        const step = Math.round(Number(rn?.step));
        if (!Number.isFinite(step) || step < 0 || step >= lengthSteps) continue;
        const durationSteps = Math.max(1, Math.round(Number(rn?.durationSteps) || 1));
        const rawVelocity = Number(rn?.velocity);
        const velocity = clamp(
            Math.round(Number.isFinite(rawVelocity) ? rawVelocity : 80),
            VELOCITY_MIN,
            VELOCITY_MAX
        );
        const note = {step, durationSteps, velocity};
        if (kind === 'instrument') {
            const pitch = Math.round(Number(rn?.pitch));
            if (!Number.isFinite(pitch)) continue;
            note.pitch = clamp(pitch, 0, 127);
        } else {
            // Drum note: snap the drum index to one of the track's lanes if
            // possible, otherwise to the first lane.
            const rawDrum = Math.round(Number(rn?.drum));
            const lanes = track.drumLanes;
            let drum;
            if (Number.isFinite(rawDrum) && lanes.indexOf(rawDrum) >= 0) {
                drum = rawDrum;
            } else if (Number.isFinite(rawDrum) && rawDrum >= 1 && rawDrum <= DRUM_NAMES.length) {
                drum = rawDrum;
                // Auto-extend lanes if the model targets a drum not declared.
                if (lanes.indexOf(drum) < 0) lanes.push(drum);
            } else {
                drum = lanes[0];
            }
            note.drum = drum;
        }
        track.notes.push(note);
    }

    return track;
};

const sanitizeSong = (raw, fallbackName) => {
    const safeName = (typeof raw?.name === 'string' && raw.name.trim()) ?
        raw.name.trim().slice(0, 40) :
        fallbackName;

    const song = createBlankSong(safeName);
    song.tracks = [];

    song.tempo = clamp(
        Math.round(Number(raw?.tempo) || 120),
        20,
        500
    );
    song.lengthSteps = clamp(
        Math.round(Number(raw?.lengthSteps) || 32),
        4,
        128
    );
    song.stepsPerBeat = 4;

    const rawTracks = Array.isArray(raw?.tracks) ? raw.tracks.slice(0, MAX_TRACKS) : [];
    for (const rt of rawTracks) {
        song.tracks.push(sanitizeTrack(rt, song.lengthSteps));
    }

    if (song.tracks.length === 0) {
        song.tracks = [createBlankTrack('instrument')];
    }

    // Always regenerate IDs so we never inherit anything from the model.
    song.songId = newId('song');
    for (const track of song.tracks) {
        track.trackId = newId('track');
    }

    return song;
};

const extractToolInput = (anthropicResponse, toolName) => {
    const content = anthropicResponse?.content;
    if (!Array.isArray(content)) return null;
    const toolUse = content.find(c => c?.type === 'tool_use' && c?.name === toolName);
    return toolUse?.input || null;
};

class SongAiError extends Error {
    constructor (message, code) {
        super(message);
        this.name = 'SongAiError';
        this.code = code;
    }
}

const generateSongFromPrompt = async ({prompt, signal, fallbackName = 'AI Song'} = {}) => {
    const text = (prompt || '').trim();
    if (!text) {
        throw new SongAiError('Prompt is empty.', 'EMPTY_PROMPT');
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
        throw new SongAiError(
            'No Anthropic API key found. Set ANTHROPIC_API_KEY in .env (and rebuild), or run ' +
                `localStorage.setItem('${LOCAL_STORAGE_KEY}', 'sk-ant-...') in the browser console.`,
            'NO_API_KEY'
        );
    }

    let response;
    try {
        response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            signal,
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: buildSystemPrompt(),
                tools: [SONG_TOOL],
                tool_choice: {type: 'tool', name: SONG_TOOL.name},
                messages: [{role: 'user', content: text}]
            })
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw new SongAiError(`Network error: ${err.message}`, 'NETWORK');
    }

    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.text();
            detail = body ? `: ${body.slice(0, 200)}` : '';
        } catch (e) {
            // ignore
        }
        throw new SongAiError(`Anthropic API error ${response.status}${detail}`, 'HTTP');
    }

    let payload;
    try {
        payload = await response.json();
    } catch (e) {
        throw new SongAiError('Could not parse Anthropic response.', 'PARSE');
    }

    const toolInput = extractToolInput(payload, SONG_TOOL.name);
    if (!toolInput) {
        logAiResponse({prompt: text, payload, toolInput: null, sanitized: null});
        if (payload && payload.stop_reason === 'max_tokens') {
            throw new SongAiError(
                'The model hit its output token limit before finishing the song. ' +
                    'Try a shorter prompt or ask for a simpler arrangement.',
                'MAX_TOKENS'
            );
        }
        throw new SongAiError('Model did not return a song.', 'NO_TOOL_USE');
    }

    const sanitized = sanitizeSong(toolInput, fallbackName);
    logAiResponse({prompt: text, payload, toolInput, sanitized});

    // A truncated tool_use often parses but loses trailing tracks/notes, so
    // surface the cause instead of returning a half-empty song.
    if (payload && payload.stop_reason === 'max_tokens') {
        throw new SongAiError(
            'The model hit its output token limit before finishing the song. ' +
                'Try a shorter prompt or ask for a simpler arrangement.',
            'MAX_TOKENS'
        );
    }
    return sanitized;
};

const buildEditSystemPrompt = () => [
    'You are editing ONE track inside an existing Scratch song-maker song.',
    '',
    'You will receive (in the user message):',
    '  1. The full song JSON: tempo, lengthSteps, stepsPerBeat=4, and all tracks.',
    '  2. trackIndex: which track in song.tracks the user wants to edit.',
    '  3. The user\'s edit request in natural language.',
    '',
    'Your job: return ONE updated track via the edit_track tool.',
    '- Output only the new contents of the chosen track. You cannot modify other tracks,',
    '  the tempo, lengthSteps, or any song-level field.',
    '- Keep the same kind (instrument vs drum) as the original — do not switch a piano',
    '  track into a drum track or vice versa.',
    '- Do NOT change the instrument index. The user chose the sound; your job is to write',
    '  notes that fit it. (If kind=instrument, emit the exact same `instrument` value as',
    '  the original. If kind=drum, emit the same `drumLanes`; only the per-note `drum`',
    '  field can vary, and it must be one of those lane indices.)',
    '- Keep the music coherent with the rest of the song: same key, compatible rhythm,',
    '  and tempo. If the user asks for something that would clash (e.g. "make it atonal"),',
    '  honor the request anyway — they\'re the boss.',
    '- All note steps must be < lengthSteps. Use the song\'s existing lengthSteps; do not',
    '  invent new song-level values.',
    '',
    'Shared format & musical rules (same as composing from scratch):',
    '',
    'A song uses 4 steps per beat, so 4 steps = 1 beat and lengthSteps=32 is 8 beats (4/4).',
    'Each track is either:',
    `  - kind="instrument" with instrument index (${buildInstrumentList()}).`,
    '    Notes have pitch (MIDI: C1=24, C2=36, C3=48, C4=60, C5=72, C6=84, C7=96, C8=108).',
    `  - kind="drum" — a multi-lane drum-machine track. drumLanes lists the`,
    `    drum sounds it uses (e.g. [2,1,6,5,4,8] = kick, snare, closed-hh,`,
    `    open-hh, crash, clap). Each note has its own \`drum\` (1..18) field`,
    `    choosing which drum sound it hits. Available sounds: ${buildDrumList()}.`,
    '',
    'Each note has step (0-based, < lengthSteps), durationSteps (>=1),',
    'pitch (only for instruments), drum (only for drum tracks), and velocity (1-127).',
    '',
    'Register: place pitches in the right octave for the track\'s role.',
    '  Bass tracks (name contains "bass", or the lowest part of the song):',
    '  pitches MUST stay at or below MIDI 48 (C3) except for occasional walking',
    '  passing tones. Leads/solos sit in C4-C6 (60-84); pads in C3-C5 (48-72);',
    '  sparkles in C6-C8 (84-108). If you are editing a bass track, do NOT',
    '  drift it up into the mid-range — keep it genuinely low.',
    '',
    'Polyphony within a single track:',
    '- Polyphonic-friendly instruments — STACK notes (overlap their step ranges) to form',
    '  chords, dyads, or sustained pads where appropriate.',
    `  These include: ${POLYPHONIC_INSTRUMENT_LIST}.`,
    '- Monophonic-natural instruments — keep them mostly to one note at a time.',
    `  These include: ${MONOPHONIC_INSTRUMENT_LIST}.`,
    '',
    'Phrasing — let the part breathe:',
    '- Think in 2- to 4-beat phrases with a clear arc and a place to land. Leave',
    '  generous rests (2-6 steps) BETWEEN phrases, and shorter rests (1-2 steps)',
    '  within them, so the part has room and the other tracks can be heard.',
    '- A lead does not need to play through the whole song. Dropping out for a',
    '  bar and re-entering with a fresh idea is usually better than wall-to-wall',
    '  notes.',
    '',
    'Rhythmic variety — shape each phrase with motion:',
    '- Mix long sustained notes (4-8+ steps) with short pickups (1-2 steps),',
    '  runs of evenly-spaced short notes, ornaments / neighbor tones before',
    '  strong beats, and occasional syncopation on off-beats.',
    '- Never use the same note duration throughout — uniform rhythm is the #1',
    '  cause of robotic, sequencer-y output.',
    '',
    'Melodic shape — vary intervals and patterns:',
    '- Mix mostly step-wise motion (60-70%) with deliberate leaps (30-40%).',
    '  Resolve large leaps by stepping back the opposite direction.',
    '- Give phrases varied contours (rising, falling, arched). Use repetition +',
    '  variation: state a short motif, then repeat it transposed, rhythmically',
    '  altered, ornamented, or sequenced.',
    '',
    'Harmony — fit the existing song:',
    '- Land notes on CHORD TONES on strong beats; use passing tones, neighbor',
    '  tones, and suspensions on weak beats. Stay in the song\'s key.',
    '- Borrow freely from classical (functional cadences, voice-leading),',
    '  jazz (7th-chord arpeggios, chromatic approach tones, ii-V-I shapes),',
    '  and popular music (modal/pentatonic licks, pedal tones, blue notes)',
    '  as long as the result coheres with the other tracks.',
    '',
    'Velocity (REQUIRED on every note): vary velocity for phrasing (loud downbeats, soft',
    'pickups, accented peaks). Avoid setting every note to the same velocity.',
    '',
    'Effects (OPTIONAL — reverb, delay, filter, pan):',
    '- The track\'s current effects values are visible in the song JSON. By',
    '  DEFAULT, leave them alone: omit the effects field, or pass the same',
    '  values back. The user set them; do not change them unless asked.',
    '- ONLY change effects when the edit request explicitly mentions them or',
    '  implies a mood/space change (e.g. "make this dreamier", "more ambient",',
    '  "drier", "dub-style echo", "lo-fi warm"). In that case, emit ONLY the',
    '  fields you want to change; unchanged fields stay at the original values.',
    '- Ranges: reverb 0-100, delay 0-100, filter 0-100 (100 = open),',
    '  pan -50..+50 (0 = center).',
    '',
    'Call the edit_track tool. Do not include any other text.'
].join('\n');

// Convert effects from the float storage format back to the AI-facing integer
// representation, so the model sees the same numbers a user would in the UI.
const effectsForModel = track => {
    const fx = (track && track.effects) || {};
    return {
        reverb: Math.round((typeof fx.reverb === 'number' ? fx.reverb : 0) * 100),
        delay: Math.round((typeof fx.delay === 'number' ? fx.delay : 0) * 100),
        filter: Math.round((typeof fx.filter === 'number' ? fx.filter : 1) * 100),
        pan: Math.round((typeof fx.pan === 'number' ? fx.pan : 0) * 50)
    };
};

const stripIdsFromSong = song => {
    // Strip the runtime-only ids so we send a clean musical description.
    const out = {
        tempo: song.tempo,
        lengthSteps: song.lengthSteps,
        stepsPerBeat: song.stepsPerBeat || 4,
        tracks: (song.tracks || []).map(t => {
            const isDrum = t.kind === 'drum';
            const ot = {
                kind: t.kind,
                volume: t.volume,
                muted: !!t.muted,
                effects: effectsForModel(t),
                notes: (t.notes || []).map(n => {
                    const on = {
                        step: n.step,
                        durationSteps: n.durationSteps,
                        velocity: typeof n.velocity === 'number' ? n.velocity : 80
                    };
                    if (isDrum) {
                        // Per-note drum: explicit if present, otherwise fall
                        // back to the legacy track-level drum.
                        on.drum = typeof n.drum === 'number' ? n.drum : (t.drum || 1);
                    } else if (typeof n.pitch === 'number') {
                        on.pitch = n.pitch;
                    }
                    return on;
                })
            };
            if (isDrum) {
                ot.drumLanes = Array.isArray(t.drumLanes) && t.drumLanes.length > 0 ?
                    t.drumLanes.slice() :
                    [t.drum || 1];
            } else {
                ot.instrument = t.instrument;
            }
            return ot;
        })
    };
    return out;
};

const editTrackWithPrompt = async ({prompt, song, trackIndex, signal} = {}) => {
    const text = (prompt || '').trim();
    if (!text) {
        throw new SongAiError('Prompt is empty.', 'EMPTY_PROMPT');
    }
    if (!song || !Array.isArray(song.tracks) || song.tracks.length === 0) {
        throw new SongAiError('No song to edit.', 'NO_SONG');
    }
    if (typeof trackIndex !== 'number' || trackIndex < 0 || trackIndex >= song.tracks.length) {
        throw new SongAiError('Invalid track index.', 'BAD_TRACK_INDEX');
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
        throw new SongAiError(
            'No Anthropic API key found. Set ANTHROPIC_API_KEY in .env (and rebuild), or run ' +
                `localStorage.setItem('${LOCAL_STORAGE_KEY}', 'sk-ant-...') in the browser console.`,
            'NO_API_KEY'
        );
    }

    const originalTrack = song.tracks[trackIndex];
    const cleanSong = stripIdsFromSong(song);
    // Surface the locked fields (kind + instrument or drum kit) prominently
    // in the user message so the model knows it must NOT change them.
    const lockedFields = originalTrack.kind === 'instrument' ?
        `instrument index: ${originalTrack.instrument} ` +
            `(${INSTRUMENT_NAMES[(originalTrack.instrument || 1) - 1]})` :
        `drum kit lanes: ${JSON.stringify(
            Array.isArray(originalTrack.drumLanes) && originalTrack.drumLanes.length > 0 ?
                originalTrack.drumLanes :
                [originalTrack.drum || 1]
        )}`;
    const userMessage = [
        `trackIndex to edit: ${trackIndex}`,
        `original track kind: ${originalTrack.kind} (DO NOT CHANGE)`,
        `${lockedFields} (DO NOT CHANGE)`,
        '',
        'Full song JSON:',
        '```json',
        JSON.stringify(cleanSong, null, 2),
        '```',
        '',
        'Edit request:',
        text
    ].join('\n');

    let response;
    try {
        response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            signal,
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: buildEditSystemPrompt(),
                tools: [EDIT_TRACK_TOOL],
                tool_choice: {type: 'tool', name: EDIT_TRACK_TOOL.name},
                messages: [{role: 'user', content: userMessage}]
            })
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw new SongAiError(`Network error: ${err.message}`, 'NETWORK');
    }

    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.text();
            detail = body ? `: ${body.slice(0, 200)}` : '';
        } catch (e) { /* ignore */ }
        throw new SongAiError(`Anthropic API error ${response.status}${detail}`, 'HTTP');
    }

    let payload;
    try {
        payload = await response.json();
    } catch (e) {
        throw new SongAiError('Could not parse Anthropic response.', 'PARSE');
    }

    const toolInput = extractToolInput(payload, EDIT_TRACK_TOOL.name);
    if (!toolInput) {
        logAiEditResponse({prompt: text, payload, toolInput: null, sanitized: null});
        if (payload && payload.stop_reason === 'max_tokens') {
            throw new SongAiError(
                'The model hit its output token limit before finishing the edit. ' +
                    'Try a simpler change.',
                'MAX_TOKENS'
            );
        }
        throw new SongAiError('Model did not return an edited track.', 'NO_TOOL_USE');
    }

    // Force the edited track to keep its original kind — silently ignore the
    // model if it tried to swap kinds (would otherwise produce nonsense like a
    // drum track with pitched notes).
    if (toolInput && toolInput.kind && toolInput.kind !== originalTrack.kind) {
        toolInput.kind = originalTrack.kind;
    }
    const sanitized = sanitizeTrack(toolInput, song.lengthSteps, originalTrack.effects);
    // Lock the instrument / drum kit so AI edits can't quietly swap the
    // sound out from under the user. They asked the model to change *what
    // this track plays*, not *what instrument plays it*.
    if (originalTrack.kind === 'instrument') {
        sanitized.instrument = originalTrack.instrument;
    } else {
        // Restore the original drum kit lanes. Any per-note `drum` field the
        // model emitted gets re-snapped into the original kit.
        const origLanes = Array.isArray(originalTrack.drumLanes) && originalTrack.drumLanes.length > 0 ?
            originalTrack.drumLanes.slice() :
            [originalTrack.drum || 1];
        sanitized.drumLanes = origLanes;
        sanitized.notes = (sanitized.notes || []).map(n => {
            if (typeof n.drum === 'number' && origLanes.indexOf(n.drum) >= 0) return n;
            // Drop into the first lane if the model picked a drum that isn't
            // in our kit — better than playing the wrong sound silently.
            return {...n, drum: origLanes[0]};
        });
    }
    // Preserve the original trackId / muted state — those are editor state, not
    // musical content. Effects merging is handled inside sanitizeTrack via the
    // baseEffects argument above.
    sanitized.trackId = originalTrack.trackId;
    sanitized.muted = !!originalTrack.muted;
    logAiEditResponse({prompt: text, payload, toolInput, sanitized});

    if (payload && payload.stop_reason === 'max_tokens') {
        throw new SongAiError(
            'The model hit its output token limit before finishing the edit. ' +
                'Try a simpler change.',
            'MAX_TOKENS'
        );
    }
    return sanitized;
};

const buildGenerateTrackSystemPrompt = kind => [
    `You are adding ONE NEW ${kind} track to an existing Scratch song-maker song.`,
    '',
    'You will receive (in the user message):',
    '  1. The full song JSON: tempo, lengthSteps, stepsPerBeat=4, and the existing tracks.',
    `  2. The kind of new track to add: ${kind}.`,
    '  3. The user\'s description of what the new track should sound like.',
    '',
    `Your job: return ONE new ${kind} track via the generate_track tool, designed to`,
    'sit alongside the existing tracks.',
    kind === 'instrument' ?
        '- You DO choose the `instrument` index — pick whatever fits the prompt and the' :
        '- You DO choose the `drumLanes` — pick the kit pieces that fit the prompt and the',
    '  existing arrangement. The user picked the KIND (instrument vs drum); the specific',
    '  sound is yours to pick.',
    '- Keep the music coherent with the existing tracks: same key, complementary rhythm,',
    '  compatible tempo. The new track should fill a role the existing tracks DO NOT —',
    '  if there\'s already a lead, write a bass or pad; if there\'s a bass and drums,',
    '  write a lead. Listen for what is missing.',
    '- Leave space for the existing parts. Do not double their rhythms unless the prompt',
    '  explicitly asks for that. Rest while other parts play their signature moments.',
    '- All note steps must be < lengthSteps. Use the song\'s existing lengthSteps; do not',
    '  invent a new one.',
    '- If the song is currently empty (no existing tracks with notes), treat this as',
    '  composing a fresh single-track piece based on the prompt.',
    '',
    'Shared format & musical rules (same as composing from scratch):',
    '',
    'A song uses 4 steps per beat, so 4 steps = 1 beat and lengthSteps=32 is 8 beats (4/4).',
    kind === 'instrument' ?
        `Instrument indices (1..${INSTRUMENT_NAMES.length}): ${buildInstrumentList()}.` :
        `Drum sounds (1..${DRUM_NAMES.length}): ${buildDrumList()}.`,
    kind === 'instrument' ?
        'Notes have pitch (MIDI: C1=24, C2=36, C3=48, C4=60, C5=72, C6=84, C7=96, C8=108).' :
        'drumLanes lists the drum sounds the track uses (e.g. [2,1,6,5,4,8] = kick, snare,' +
            ' closed-hh, open-hh, crash, clap). Each note has its own `drum` (1..18) field' +
            ' choosing which drum sound it hits.',
    '',
    'Each note has step (0-based, < lengthSteps), durationSteps (>=1),',
    `${kind === 'instrument' ? 'pitch (required)' : 'drum (required)'}, and velocity (1-127).`,
    '',
    'Register: place pitches in the right octave for the track\'s role.',
    '  Bass role: MIDI 28-48 (E1-C3). Lead/solo: C4-C6 (60-84). Pad/accompaniment:',
    '  C3-C5 (48-72). Sparkles / counter-line: C6-C8 (84-108). If the prompt asks for',
    '  a bass, the pitches MUST stay at or below MIDI 48 except for occasional walking',
    '  passing tones.',
    '',
    'Polyphony within a single track:',
    '- Polyphonic-friendly instruments — STACK notes (overlap their step ranges) to form',
    '  chords, dyads, or sustained pads where appropriate.',
    `  These include: ${POLYPHONIC_INSTRUMENT_LIST}.`,
    '- Monophonic-natural instruments — keep them mostly to one note at a time.',
    `  These include: ${MONOPHONIC_INSTRUMENT_LIST}.`,
    '',
    'Phrasing — let the part breathe:',
    '- Think in 2- to 4-beat phrases with a clear arc and a place to land. Leave',
    '  generous rests (2-6 steps) BETWEEN phrases, and shorter rests (1-2 steps)',
    '  within them, so the part has room and the existing tracks can be heard.',
    '- A new part does not need to play through the whole song. Dropping out for a',
    '  bar and re-entering with a fresh idea is usually better than wall-to-wall',
    '  notes.',
    '',
    'Rhythmic variety — shape each phrase with motion:',
    '- Mix long sustained notes (4-8+ steps) with short pickups (1-2 steps),',
    '  runs of evenly-spaced short notes, ornaments / neighbor tones before',
    '  strong beats, and occasional syncopation on off-beats.',
    '- Never use the same note duration throughout — uniform rhythm is the #1',
    '  cause of robotic, sequencer-y output.',
    '',
    'Melodic shape — vary intervals and patterns:',
    '- Mix mostly step-wise motion (60-70%) with deliberate leaps (30-40%).',
    '  Resolve large leaps by stepping back the opposite direction.',
    '- Give phrases varied contours (rising, falling, arched). Use repetition +',
    '  variation: state a short motif, then repeat it transposed, rhythmically',
    '  altered, ornamented, or sequenced.',
    '',
    'Harmony — fit the existing song:',
    '- Land notes on CHORD TONES on strong beats; use passing tones, neighbor',
    '  tones, and suspensions on weak beats. Stay in the song\'s key.',
    '- Borrow freely from classical (functional cadences, voice-leading),',
    '  jazz (7th-chord arpeggios, chromatic approach tones, ii-V-I shapes),',
    '  and popular music (modal/pentatonic licks, pedal tones, blue notes)',
    '  as long as the result coheres with the existing tracks.',
    '',
    'Velocity (REQUIRED on every note): vary velocity for phrasing (loud downbeats, soft',
    'pickups, accented peaks). Avoid setting every note to the same velocity.',
    '',
    'Effects (OPTIONAL — reverb, delay, filter, pan):',
    '- Set per-track effects to match the vibe and to make the new track sit',
    '  in the stereo image alongside the existing ones (which you can see in',
    '  the song JSON, including their current effects).',
    '- Ranges: reverb 0-100 (10-25 natural, 40-70 ambient/cinematic),',
    '  delay 0-100 (small=thicken, larger=dub/echo, skip on busy parts),',
    '  filter 0-100 (100=open default, lower=darker/lo-fi),',
    '  pan -50..+50 (lead/bass/kick near 0, counter-line ±15..±25).',
    '- Omit the effects field to use neutral defaults; that\'s fine for most',
    '  dry, central tracks. Genre cues: ambient/dreamy → more reverb/delay;',
    '  rock/pop → mostly dry; lo-fi → filter down; dub → noticeable delay.',
    '',
    'Call the generate_track tool. Do not include any other text.'
].join('\n');

const generateTrackWithPrompt = async ({prompt, song, kind, signal} = {}) => {
    const text = (prompt || '').trim();
    if (!text) {
        throw new SongAiError('Prompt is empty.', 'EMPTY_PROMPT');
    }
    if (!song || !Array.isArray(song.tracks)) {
        throw new SongAiError('No song to add to.', 'NO_SONG');
    }
    if (kind !== 'instrument' && kind !== 'drum') {
        throw new SongAiError('Invalid track kind.', 'BAD_KIND');
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
        throw new SongAiError(
            'No Anthropic API key found. Set ANTHROPIC_API_KEY in .env (and rebuild), or run ' +
                `localStorage.setItem('${LOCAL_STORAGE_KEY}', 'sk-ant-...') in the browser console.`,
            'NO_API_KEY'
        );
    }

    const cleanSong = stripIdsFromSong(song);
    const userMessage = [
        `kind of new track to add: ${kind}`,
        '',
        'Existing song JSON:',
        '```json',
        JSON.stringify(cleanSong, null, 2),
        '```',
        '',
        'Description of the new track:',
        text
    ].join('\n');

    let response;
    try {
        response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            signal,
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: buildGenerateTrackSystemPrompt(kind),
                tools: [GENERATE_TRACK_TOOL],
                tool_choice: {type: 'tool', name: GENERATE_TRACK_TOOL.name},
                messages: [{role: 'user', content: userMessage}]
            })
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw new SongAiError(`Network error: ${err.message}`, 'NETWORK');
    }

    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.text();
            detail = body ? `: ${body.slice(0, 200)}` : '';
        } catch (e) { /* ignore */ }
        throw new SongAiError(`Anthropic API error ${response.status}${detail}`, 'HTTP');
    }

    let payload;
    try {
        payload = await response.json();
    } catch (e) {
        throw new SongAiError('Could not parse Anthropic response.', 'PARSE');
    }

    const toolInput = extractToolInput(payload, GENERATE_TRACK_TOOL.name);
    if (!toolInput) {
        logAiEditResponse({prompt: text, payload, toolInput: null, sanitized: null});
        if (payload && payload.stop_reason === 'max_tokens') {
            throw new SongAiError(
                'The model hit its output token limit before finishing the track. ' +
                    'Try a simpler description.',
                'MAX_TOKENS'
            );
        }
        throw new SongAiError('Model did not return a track.', 'NO_TOOL_USE');
    }

    // Force the requested kind — silently fix the model if it picked the wrong
    // one (e.g. user clicked "Generate Drum Track" and the model emitted an
    // instrument track).
    if (toolInput.kind !== kind) {
        toolInput.kind = kind;
    }
    const sanitized = sanitizeTrack(toolInput, song.lengthSteps);
    logAiEditResponse({prompt: text, payload, toolInput, sanitized});

    if (payload && payload.stop_reason === 'max_tokens') {
        throw new SongAiError(
            'The model hit its output token limit before finishing the track. ' +
                'Try a simpler description.',
            'MAX_TOKENS'
        );
    }
    return sanitized;
};

/**
 * Dump the AI round-trip to the browser console so we can see exactly what the
 * model emitted vs. what the sanitizer kept. Useful for diagnosing empty-track
 * outputs and schema violations.
 */
const logAiResponse = ({prompt, payload, toolInput, sanitized}) => {
    if (typeof console === 'undefined' || typeof console.group !== 'function') return;
    /* eslint-disable no-console */
    try {
        console.groupCollapsed(
            `%c[song-ai] response${sanitized ? '' : ' (no tool_use)'}`,
            'color: #4C97FF; font-weight: bold;'
        );
        console.log('prompt:', prompt);
        console.log('stop_reason:', payload && payload.stop_reason);
        console.log('usage:', payload && payload.usage);
        if (payload && Array.isArray(payload.content)) {
            for (const block of payload.content) {
                if (block && block.type === 'text' && block.text) {
                    console.log('model text:', block.text);
                }
            }
        }
        console.log('raw payload:', payload);
        console.log('raw tool_use input:', toolInput);
        if (toolInput && Array.isArray(toolInput.tracks)) {
            const summary = toolInput.tracks.map((t, i) => ({
                idx: i,
                kind: t && t.kind,
                instrument: t && t.instrument,
                drum: t && t.drum,
                noteCount: t && Array.isArray(t.notes) ? t.notes.length : 0
            }));
            console.table(summary);
            const empties = summary.filter(s => s.noteCount === 0);
            if (empties.length > 0) {
                console.warn('Empty tracks from model:', empties);
            }
        }
        if (sanitized) {
            console.log('sanitized song:', sanitized);
            const sanSummary = (sanitized.tracks || []).map((t, i) => ({
                idx: i,
                kind: t.kind,
                noteCount: (t.notes || []).length
            }));
            console.table(sanSummary);
            const droppedNotes = (toolInput.tracks || []).map((rt, i) => {
                const before = rt && Array.isArray(rt.notes) ? rt.notes.length : 0;
                const after = sanitized.tracks[i] ? (sanitized.tracks[i].notes || []).length : 0;
                return {idx: i, before, after, dropped: before - after};
            }).filter(d => d.dropped > 0);
            if (droppedNotes.length > 0) {
                console.warn('Notes dropped by sanitizer:', droppedNotes);
            }
        }
    } catch (e) {
        // Logging must never throw.
    } finally {
        try { console.groupEnd(); } catch (e) { /* noop */ }
    }
    /* eslint-enable no-console */
};

const logAiEditResponse = ({prompt, payload, toolInput, sanitized}) => {
    if (typeof console === 'undefined' || typeof console.group !== 'function') return;
    /* eslint-disable no-console */
    try {
        console.groupCollapsed(
            `%c[song-ai] edit response${sanitized ? '' : ' (no tool_use)'}`,
            'color: #4C97FF; font-weight: bold;'
        );
        console.log('prompt:', prompt);
        console.log('stop_reason:', payload && payload.stop_reason);
        console.log('usage:', payload && payload.usage);
        if (payload && Array.isArray(payload.content)) {
            for (const block of payload.content) {
                if (block && block.type === 'text' && block.text) {
                    console.log('model text:', block.text);
                }
            }
        }
        console.log('raw tool_use input:', toolInput);
        if (toolInput) {
            console.log('raw note count:', Array.isArray(toolInput.notes) ? toolInput.notes.length : 0);
        }
        if (sanitized) {
            console.log('sanitized track:', sanitized);
            console.log('sanitized note count:', (sanitized.notes || []).length);
            if (toolInput && Array.isArray(toolInput.notes)) {
                const before = toolInput.notes.length;
                const after = sanitized.notes.length;
                if (before !== after) {
                    console.warn(`Sanitizer dropped ${before - after} note(s).`);
                }
            }
        }
    } catch (e) { /* logging must never throw */ } finally {
        try { console.groupEnd(); } catch (e) { /* noop */ }
    }
    /* eslint-enable no-console */
};

export {
    generateSongFromPrompt,
    editTrackWithPrompt,
    generateTrackWithPrompt,
    sanitizeSong,
    sanitizeTrack,
    SongAiError,
    LOCAL_STORAGE_KEY
};
