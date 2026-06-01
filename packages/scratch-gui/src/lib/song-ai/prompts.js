import {
    INSTRUMENT_NAMES,
    DRUM_NAMES,
    SYNTH_PRESETS
} from '../song-defaults.js';
import {
    SCALE_OFFSETS,
    PITCH_CLASS_NAMES
} from '../scale-utils.js';

const SCALE_TYPE_NAMES = Object.keys(SCALE_OFFSETS);

const SCALE_PROMPT_LABELS = {
    major: 'Major (1 2 3 4 5 6 7)',
    minor: 'Natural Minor (1 2 b3 4 5 b6 b7)',
    pentatonicMajor: 'Major Pentatonic (1 2 3 5 6)',
    pentatonicMinor: 'Minor Pentatonic (1 b3 4 5 b7)',
    chromatic: 'Chromatic (all 12 semitones)'
};

const buildScaleList = () => SCALE_TYPE_NAMES
    .map(s => `${s} — ${SCALE_PROMPT_LABELS[s] || s}`)
    .join('; ');

const SYNTH_PRESET_NAMES = SYNTH_PRESETS.map(p => p.name);

const buildSynthPresetList = () =>
    SYNTH_PRESET_NAMES
        .map((name, idx) => `${idx + 1}=${name}`)
        .join(', ');

const TEMPO_MIN = 60;
const TEMPO_MAX = 180;
const LENGTH_MIN = 16;
const LENGTH_MAX = 64;
const PITCH_MIN = 24;
const PITCH_MAX = 108;
const VELOCITY_MIN = 1;
const VELOCITY_MAX = 127;
const MAX_TRACKS = 4;

const POLYPHONIC_INSTRUMENT_INDICES = new Set([
    1, // Piano
    2, // Electric Piano
    3, // Organ
    4, // Guitar
    5, // Electric Guitar
    7, // Pizzicato
    15, // Choir
    16, // Vibraphone
    17, // Music Box
    18, // Steel Drum
    19, // Marimba
    21 // Synth Pad
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

const buildInstrumentList = () =>
    INSTRUMENT_NAMES.map((name, idx) => `${idx + 1}=${name}`).join(', ');

const buildDrumList = () =>
    DRUM_NAMES.map((name, idx) => `${idx + 1}=${name}`).join(', ');

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
        },
        distortion: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description:
                'Waveshaper distortion amount, 0 = clean (default), 100 = heavy ' +
                'fuzz/crunch. Small amounts (10-25) add warmth/grit; larger ' +
                'amounts (40-70) suit guitars, leads, and gritty bass. Avoid on ' +
                'soft / acoustic / orchestral parts.'
        }
    }
};

const TRACK_SCHEMA = {
    type: 'object',
    properties: {
        kind: {type: 'string', enum: ['instrument', 'drum', 'synth']},
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
        synthPreset: {
            type: 'string',
            enum: SYNTH_PRESET_NAMES,
            description:
                'For kind=synth ONLY: the named preset that defines the ' +
                'subtractive-synth voice for this track. Notes are pitched ' +
                '(same as instrument tracks). Pick the preset that best fits ' +
                'the musical role you have in mind.'
        },
        volume: {type: 'integer', minimum: 0, maximum: 100},
        effects: EFFECTS_SCHEMA,
        notes: {
            type: 'array',
            description:
                'Ordered list of entries. Each entry is either a NOTE (a sound ' +
                'to play) or a REST (a planned silence, rest=true). Rests are ' +
                'stripped before playback, but you should write them out ' +
                'explicitly so you can see and shape the silence between ' +
                'phrases. Cover every step of the track with notes and rests ' +
                'so the part reads as a continuous musical line.',
            items: {
                type: 'object',
                properties: {
                    step: {type: 'integer', minimum: 0},
                    durationSteps: {type: 'integer', minimum: 1},
                    rest: {
                        type: 'boolean',
                        description:
                            'Set to true to mark this entry as a REST ' +
                            '(silence) rather than a sounding note. Rest ' +
                            'entries are stripped before playback, but ' +
                            'writing them out forces you to consciously plan ' +
                            'silence rather than leaving accidental gaps. ' +
                            'When rest=true, pitch / drum / velocity are ' +
                            'ignored; durationSteps gives the length of the ' +
                            'silence. Use rests BETWEEN phrases (2-6 steps) ' +
                            'and WITHIN them (1-2 step breaths).'
                    },
                    pitch: {
                        type: 'integer',
                        minimum: PITCH_MIN,
                        maximum: PITCH_MAX,
                        description:
                            'MIDI pitch. Required for instrument and synth ' +
                            'notes; ignored for drum tracks and for rests.'
                    },
                    drum: {
                        type: 'integer',
                        minimum: 1,
                        maximum: DRUM_NAMES.length,
                        description:
                            'For drum tracks ONLY: which drum sound this hit ' +
                            'plays. Required for every drum note (the track can ' +
                            'have multiple drum sounds active across notes). ' +
                            'Ignored for rests.'
                    },
                    velocity: {
                        type: 'integer',
                        minimum: VELOCITY_MIN,
                        maximum: VELOCITY_MAX,
                        description:
                            'MIDI velocity (1-127). REQUIRED for every ' +
                            'sounding note; ignored for rests. Use velocity ' +
                            'to shape phrasing: louder downbeats, softer ' +
                            'pickups, accents on melodic peaks. Typical ' +
                            'range: 50 (soft) to 110 (strong).'
                    }
                },
                required: ['step', 'durationSteps']
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
            key: {
                type: 'string',
                enum: PITCH_CLASS_NAMES,
                description:
                    'The pitch class of the song\'s tonic (key center). ' +
                    'Pick one that fits the mood: e.g. C / G / D for bright, ' +
                    'A / E / D for minor moods, F / Bb for warm. Combined ' +
                    'with octave + scale, this determines the rootPitch the ' +
                    'piano roll snaps to.'
            },
            octave: {
                type: 'integer',
                minimum: 1,
                maximum: 7,
                description:
                    'Octave of the song\'s tonic (using the editor convention ' +
                    'C4 = MIDI 60). Default 4 unless the piece is bass-heavy ' +
                    '(use 3) or sparkly/high (use 5). Notes can still span ' +
                    'multiple octaves around this tonic.'
            },
            scale: {
                type: 'string',
                enum: SCALE_TYPE_NAMES,
                description:
                    'Scale / mode for the song. Every pitched note in the ' +
                    'song MUST be a member of this scale built on `key`. ' +
                    'Pick to fit the mood: major (bright/happy), minor ' +
                    '(sad/spooky/serious), pentatonicMajor (folk/upbeat/ ' +
                    'asian-flavored), pentatonicMinor (blues/rock/lo-fi), ' +
                    'chromatic (atonal or fully chromatic only — avoid by ' +
                    'default since the editor visually emphasizes in-scale ' +
                    'rows).'
            },
            tracks: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_TRACKS,
                items: TRACK_SCHEMA
            }
        },
        required: ['name', 'tempo', 'lengthSteps', 'key', 'octave', 'scale', 'tracks']
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
    '  - kind="drum" — a drum-machine track that plays MULTIPLE drum sounds.',
    '    Set drumLanes to the list of drum-sound indices the track uses.',
    `    Drum sounds: ${buildDrumList()}.`,
    '    Each note has `drum` (1..18) choosing which drum sound it hits;',
    '    pitch is ignored. A typical groove uses 4-6 lanes:',
    '    [2, 1, 6, 5, 4, 8] = kick, snare, closed-hh, open-hh, crash, clap.',
    '  - kind="synth" — pitched track played by a built-in subtractive synthesizer.',
    '    Set `synthPreset` to one of the named voices (full list below). Notes',
    '    have `pitch` (same MIDI range as instrument tracks). Synth tracks are',
    '    fully polyphonic — stack notes for pads/chords as needed.',
    `    Synth presets: ${buildSynthPresetList()}.`,
    '    Use synth tracks for sounds that the sampled instruments cannot do well:',
    '    pads, wobbles, sub bass, plucks, leads, bells, etc.',
    '',
    'Each entry in a track\'s `notes` array is either a NOTE or a REST.',
    '- A NOTE has step (0-based, < lengthSteps), durationSteps (>=1),',
    '  velocity (1-127, see below), and either pitch (instrument/synth) or',
    '  drum (drum tracks).',
    '- A REST has step, durationSteps, and rest=true (no pitch/drum/velocity',
    '  required). Rests are stripped before playback — they exist so you can',
    '  WRITE OUT the silence in your part instead of leaving it implicit.',
    '  Writing rests explicitly forces you to consciously plan phrasing,',
    '  pickups, and the space between musical ideas.',
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
    '- If the user asks for a single instrument or melody, emit ONE track.',
    '  If they ask for a "song", "groove", "beat", or describe multiple instruments,',
    '  emit MULTIPLE tracks (often: lead + bass + drums).',
    '',
    'Key & scale — pick FIRST, then write notes that conform:',
    `- Choose \`key\` (one of: ${PITCH_CLASS_NAMES.join(', ')}), \`octave\` (1-7,`,
    '  using C4 = MIDI 60; default 4), and `scale` based on the prompt\'s mood',
    '  BEFORE writing any notes. Treat the chosen (key, scale) as a hard',
    '  constraint for every pitched note in every track.',
    `- Available scales: ${buildScaleList()}.`,
    '- Mood → scale cheat sheet:',
    '    * happy / bright / upbeat / triumphant / pop → major',
    '    * sad / dark / spooky / mysterious / serious / cinematic → minor',
    '    * folk / open / asian-flavored / kid-friendly / wholesome → pentatonicMajor',
    '    * bluesy / rock / hip-hop / lo-fi / soulful / gritty → pentatonicMinor',
    '    * dissonant / atonal / 12-tone / horror sting → chromatic (use sparingly)',
    '- If the user names a key explicitly ("in F# minor", "G major", "blues',
    '  in A"), HONOR it exactly. Otherwise pick a key that suits the mood',
    '  and the typical singing/playing range of the instruments you chose.',
    '- A note is IN-SCALE when (pitch - rootPitch) mod 12 is one of the scale',
    '  offsets. rootPitch = (octave + 1) * 12 + pitch-class index, where C=0,',
    '  C#=1, D=2 ... B=11. Example: key=A, octave=3, scale=minor →',
    '  rootPitch = 57, in-scale pitches per octave start at 57, 59, 60, 62,',
    '  64, 65, 67, then 69, 71, 72, ... .',
    '- Every pitched note (instrument and synth tracks) MUST be a member of the',
    '  scale you chose. Drum notes are unaffected. Out-of-scale pitches will',
    '  be auto-snapped to the nearest scale tone, which can produce parallel',
    '  fifths, mis-voiced chords, or wrong-sounding leaps — so get them right',
    '  the first time rather than relying on the snap.',
    '- Bass notes still need to land on the bass register (MIDI <= 48), but',
    '  they must also stay in scale. Walk through scale degrees, not chromatic',
    '  passing tones, unless you picked chromatic.',
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
    '- WRITE RESTS EXPLICITLY. For every gap of silence in a part — between phrases,',
    '  before a downbeat entry, mid-phrase breath, or a whole bar where the part drops',
    '  out — emit an entry with rest=true and durationSteps covering the silence.',
    '  Doing this forces you to compose the silence on purpose. A track\'s entries',
    '  (notes + rests, in step order) should account for every step the part occupies;',
    '  do not leave undeclared gaps and hope they sound like rests.',
    '- Leave generous rests BETWEEN phrases (2-6 steps of silence) so the melody can',
    '  breathe and so the other parts have room to be heard. A melody that fills every',
    '  step smothers the rest of the arrangement.',
    '- In multi-track songs, the lead does NOT need to play through the whole song.',
    '  Drop out for a bar or two (emit a long rest); let the bass and drums carry;',
    '  re-enter with a fresh idea. Trading space between parts is one of the most',
    '  powerful tools you have.',
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
    'Harmony — borrow from many traditions, BUT stay in the chosen scale:',
    '- Build chords from scale degrees of the song\'s key+scale (I, IV, V in major;',
    '  i, iv, v or i, VI, VII in minor; for pentatonic, voice triads on degrees 1/4/5',
    '  with 4ths and 5ths instead of 3rds when 3rds aren\'t in the scale).',
    '- Land melody notes on CHORD TONES on strong beats; use non-chord tones (passing',
    '  tones, neighbor tones, suspensions, appoggiaturas) on weak beats — but the',
    '  passing/neighbor tones MUST also be in the song\'s scale (no chromatic',
    '  approach tones unless you chose `scale=chromatic`).',
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
    'Velocity (REQUIRED on every sounding note; ignored on rests):',
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
    '- Keep the same kind (instrument vs drum vs synth) as the original — do not switch a',
    '  piano track into a drum track or vice versa.',
    '- Do NOT change the instrument index, synth preset, or drum kit. The user chose the',
    '  sound; your job is to write notes that fit it. (If kind=instrument, emit the exact',
    '  same `instrument` value as the original. If kind=synth, emit the exact same',
    '  `synthPreset` as the original. If kind=drum, emit the same `drumLanes`; only the',
    '  per-note `drum` field can vary, and it must be one of those lane indices.)',
    '- Keep the music coherent with the rest of the song: same key, compatible rhythm,',
    '  and tempo. If the user asks for something that would clash (e.g. "make it atonal"),',
    '  honor the request anyway — they\'re the boss.',
    '- The song JSON includes top-level `key`, `octave`, and `scale` fields',
    '  identifying the song\'s tonic and scale. Every pitched note you emit',
    '  MUST be in that scale (offset from rootPitch = (octave+1)*12 + pitch-',
    '  class-index, where C=0 ... B=11). Out-of-scale pitches will be',
    `  auto-snapped, which can muddy your phrasing. Available scales: ${buildScaleList()}.`,
    '- All note steps must be < lengthSteps. Use the song\'s existing lengthSteps; do not',
    '  invent new song-level values.',
    '',
    'Shared format & musical rules (same as composing from scratch):',
    '',
    'A song uses 4 steps per beat, so 4 steps = 1 beat and lengthSteps=32 is 8 beats (4/4).',
    'Each track is either:',
    `  - kind="instrument" with instrument index (${buildInstrumentList()}).`,
    '    Notes have pitch (MIDI: C1=24, C2=36, C3=48, C4=60, C5=72, C6=84, C7=96, C8=108).',
    '  - kind="drum" — a multi-lane drum-machine track. drumLanes lists the',
    '    drum sounds it uses (e.g. [2,1,6,5,4,8] = kick, snare, closed-hh,',
    '    open-hh, crash, clap). Each note has its own `drum` (1..18) field',
    `    choosing which drum sound it hits. Available sounds: ${buildDrumList()}.`,
    '  - kind="synth" — pitched subtractive-synth track. `synthPreset` names the voice.',
    `    Notes have pitch like instrument tracks. Presets: ${buildSynthPresetList()}.`,
    '',
    'Each entry in a track\'s `notes` array is either a NOTE or a REST.',
    '- A NOTE has step (0-based, < lengthSteps), durationSteps (>=1),',
    '  velocity (1-127), and either pitch (instrument/synth) or drum (drum).',
    '- A REST has step, durationSteps, and rest=true. Rests are stripped',
    '  before playback — they exist so you can WRITE OUT the silences in',
    '  this part instead of leaving them implicit. Writing rests explicitly',
    '  forces you to plan phrasing and the space between musical ideas.',
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
    '- WRITE RESTS EXPLICITLY. For every gap of silence in this part — between',
    '  phrases, before a re-entry, mid-phrase breath, or a whole bar where the',
    '  part drops out — emit an entry with rest=true and durationSteps covering',
    '  the silence. The notes + rests together should account for every step the',
    '  part occupies; do not leave undeclared gaps and hope they sound like rests.',
    '- A lead does not need to play through the whole song. Dropping out for a',
    '  bar (a long rest) and re-entering with a fresh idea is usually better',
    '  than wall-to-wall notes.',
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
    'Velocity (REQUIRED on every sounding note; ignored on rests): vary velocity',
    'for phrasing (loud downbeats, soft pickups, accented peaks). Avoid setting',
    'every note to the same velocity.',
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
        kind === 'synth' ?
            '- You DO choose the `synthPreset` — pick whichever preset best fits the prompt' :
            '- You DO choose the `drumLanes` — pick the kit pieces that fit the prompt and the',
    '  existing arrangement. The user picked the KIND (instrument vs drum vs synth); the',
    '  specific sound is yours to pick.',
    '- Keep the music coherent with the existing tracks: same key, complementary rhythm,',
    '  compatible tempo. The new track should fill a role the existing tracks DO NOT —',
    '  if there\'s already a lead, write a bass or pad; if there\'s a bass and drums,',
    '  write a lead. Listen for what is missing.',
    '- The song JSON includes top-level `key`, `octave`, and `scale` fields',
    '  identifying the song\'s tonic and scale. Every pitched note in this',
    '  new track MUST be in that scale (offset from rootPitch = (octave+1)*12',
    '  + pitch-class-index, where C=0 ... B=11). Out-of-scale pitches will be',
    `  auto-snapped. Available scales: ${buildScaleList()}.`,
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
        kind === 'synth' ?
            `Synth presets: ${buildSynthPresetList()}.` :
            `Drum sounds (1..${DRUM_NAMES.length}): ${buildDrumList()}.`,
    kind === 'drum' ?
        'drumLanes lists the drum sounds the track uses (e.g. [2,1,6,5,4,8] = kick, snare,' +
            ' closed-hh, open-hh, crash, clap). Each note has its own `drum` (1..18) field' +
            ' choosing which drum sound it hits.' :
        'Notes have pitch (MIDI: C1=24, C2=36, C3=48, C4=60, C5=72, C6=84, C7=96, C8=108).',
    kind === 'synth' ?
        'Synth tracks are FULLY POLYPHONIC — stack notes (overlap step ranges) wherever the ' +
            'preset suggests it (pads, chords, plucks with sustain). Plucks/leads/basses can ' +
            'stay mostly monophonic. Match polyphony density to the preset character.' :
        '',
    '',
    'Each entry in `notes` is either a NOTE or a REST.',
    '- A NOTE has step (0-based, < lengthSteps), durationSteps (>=1),',
    `  velocity (1-127), and ${kind === 'drum' ? 'drum (1..18)' : 'pitch (MIDI)'}.`,
    '- A REST has step, durationSteps, and rest=true. Rests are stripped',
    '  before playback — they exist so you can WRITE OUT the silences in',
    '  this new part instead of leaving them implicit. Writing rests',
    '  explicitly forces you to plan when the new track plays vs. when it',
    '  gets out of the way of the existing tracks.',
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
    '- WRITE RESTS EXPLICITLY. For every gap of silence in this new part — between',
    '  phrases, before an entry, mid-phrase breath, or a whole bar where the new',
    '  track sits out so the existing tracks shine — emit an entry with rest=true',
    '  and durationSteps covering the silence. The notes + rests together should',
    '  account for every step the part occupies; do not leave undeclared gaps.',
    '- A new part does not need to play through the whole song. Dropping out for a',
    '  bar (a long rest) and re-entering with a fresh idea is usually better than',
    '  wall-to-wall notes.',
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
    'Velocity (REQUIRED on every sounding note; ignored on rests): vary velocity',
    'for phrasing (loud downbeats, soft pickups, accented peaks). Avoid setting',
    'every note to the same velocity.',
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

export {
    SCALE_TYPE_NAMES,
    SYNTH_PRESET_NAMES,
    TEMPO_MIN,
    TEMPO_MAX,
    LENGTH_MIN,
    LENGTH_MAX,
    PITCH_MIN,
    PITCH_MAX,
    VELOCITY_MIN,
    VELOCITY_MAX,
    MAX_TRACKS,
    EFFECTS_SCHEMA,
    TRACK_SCHEMA,
    SONG_TOOL,
    EDIT_TRACK_TOOL,
    GENERATE_TRACK_TOOL,
    buildSystemPrompt,
    buildEditSystemPrompt,
    buildGenerateTrackSystemPrompt
};
