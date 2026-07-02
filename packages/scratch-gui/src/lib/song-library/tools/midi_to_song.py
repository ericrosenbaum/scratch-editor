#!/usr/bin/env python3
"""Convert CC0 General-MIDI files into Song Maker library "section" items.

This is the offline generator that produced the ``"source": "cc0-midi"`` items
in ``src/lib/libraries/song-tracks.json`` (see ``CC0-MIDI-CREDITS.md`` for the
source files and licensing). It is committed for provenance/reproducibility; it
is not run by the app or CI.

Requirements: Python 3 + ``mido`` (``pip install mido``).

Usage:
    python3 midi_to_song.py --in <dir-of-.mid> --out items.json

Song Maker constraints mirrored here (from sanitize.js / prompts.js):
  - stepsPerBeat is always 4 (a step == one 16th note)
  - lengthSteps in [4, 128]   (128 == 8 bars of 4/4)
  - up to 4 tracks
  - 21 sampled instruments (1-based), 18 sampled drums (1-based)
  - pitch is clamped to 24..108 on import and notes are snapped to the song's
    scale, so we emit scale "chromatic" (which contains every pitch class) and
    keep pitches inside 24..108 -> the import is lossless.

The emitted ``payload`` matches the wire format from stripIdsFromSong, which is
exactly what the library's import.js feeds back through sanitizeSong.
"""
import argparse
import glob
import json
import math
import os
import re
from collections import defaultdict, Counter

import mido

MIN_PITCH, MAX_PITCH = 24, 108
MAX_TRACKS = 4
WINDOW_BARS = 8
STEPS_PER_BAR = 16  # 4 steps/beat * 4 beats
PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


# 1-based index into INSTRUMENT_NAMES (song-defaults.js):
#  1 Piano        2 ElecPiano   3 Organ       4 Guitar     5 ElecGuitar
#  6 Bass         7 Pizzicato   8 Cello       9 Trombone  10 Clarinet
# 11 Saxophone   12 Flute      13 WoodenFlute 14 Bassoon  15 Choir
# 16 Vibraphone  17 MusicBox   18 SteelDrum   19 Marimba  20 SynthLead  21 SynthPad
def gm_to_instrument(prog):
    p = prog
    if p <= 1: return 1            # Ac/Bright grand -> Piano
    if 2 <= p <= 5: return 2       # Electric pianos
    if 6 <= p <= 7: return 1       # Harpsichord/Clav -> Piano
    if 8 <= p <= 10: return 17     # Celesta/Glock/Music Box -> Music Box
    if p == 11: return 16          # Vibraphone
    if 12 <= p <= 13: return 19    # Marimba/Xylophone
    if 14 <= p <= 15: return 16    # Tubular bells/Dulcimer -> Vibraphone
    if 16 <= p <= 23: return 3     # Organs
    if 24 <= p <= 25: return 4     # Acoustic guitars
    if 26 <= p <= 31: return 5     # Electric/jazz/dist guitars
    if 32 <= p <= 39: return 6     # Basses
    if p == 45: return 7           # Pizzicato strings
    if 40 <= p <= 44: return 8     # Violin/viola/cello/contrabass -> Cello
    if p == 46: return 17          # Harp -> Music Box
    if p == 47: return 6           # Timpani -> (low) Bass-ish
    if 48 <= p <= 51: return 21    # String ensembles / synth strings -> Synth Pad
    if 52 <= p <= 54: return 15    # Choir / voice
    if p == 55: return 21          # Orchestra hit -> Synth Pad
    if 56 <= p <= 63: return 9     # Brass -> Trombone
    if 64 <= p <= 67: return 11    # Saxes
    if p in (68, 69): return 10    # Oboe/English horn -> Clarinet
    if p == 70: return 14          # Bassoon
    if p == 71: return 10          # Clarinet
    if 72 <= p <= 73 or p in (78, 79): return 12  # Piccolo/Flute/Whistle/Ocarina -> Flute
    if 74 <= p <= 77: return 13    # Recorder/PanFlute/Bottle/Shakuhachi -> Wooden Flute
    if 80 <= p <= 87: return 20    # Synth leads
    if 88 <= p <= 103: return 21   # Synth pads / FX
    if 104 <= p <= 107: return 4   # Sitar/Banjo/Shamisen/Koto -> Guitar
    if p == 108: return 19         # Kalimba -> Marimba
    if p == 109: return 14         # Bagpipe -> Bassoon
    if p == 110: return 8          # Fiddle -> Cello
    if p == 111: return 10         # Shanai -> Clarinet
    if 112 <= p <= 113: return 16  # Tinkle bell/Agogo -> Vibraphone
    if p == 114: return 18         # Steel drums
    if p == 115: return 19         # Woodblock -> Marimba
    if 116 <= p <= 119: return 18  # Taiko/toms/synth drum -> Steel Drum (pitched perc)
    return 21                      # SFX / fallback -> Synth Pad


# GM percussion note (channel 10) -> 1-based DRUM_NAMES:
#  1 Snare  2 Bass  3 SideStick  4 Crash  5 OpenHH  6 ClosedHH  7 Tambourine
#  8 Clap   9 Claves 10 WoodBlock 11 Cowbell 12 Triangle 13 Bongo 14 Conga
# 15 Cabasa 16 Guiro 17 Vibraslap 18 Cuica
DRUM_MAP = {
    35: 2, 36: 2, 37: 3, 38: 1, 39: 8, 40: 1,
    41: 14, 43: 14, 45: 13, 47: 13, 48: 13, 50: 13,   # toms -> bongo/conga
    42: 6, 44: 6, 46: 5,                               # hats
    49: 4, 52: 4, 55: 4, 57: 4,                        # crashes
    51: 6, 59: 6,                                      # rides -> closed hat (rhythmic)
    53: 12, 54: 7, 56: 11, 58: 17,                     # ride bell, tambourine, cowbell, vibraslap
    60: 13, 61: 13, 65: 13,                            # bongos / hi timbale
    62: 14, 63: 14, 64: 14, 66: 14,                    # congas / lo timbale
    67: 11, 68: 11,                                    # agogo -> cowbell
    69: 15, 70: 15,                                    # cabasa / maracas
    71: 16, 72: 16, 73: 16, 74: 16,                    # whistles / guiro -> guiro
    75: 9, 76: 10, 77: 10,                             # claves, wood blocks
    78: 18, 79: 18, 80: 12, 81: 12,                    # cuica, triangle
}

# Some CC0 packs (e.g. LMMS/Komiku exports) put every instrument on its own
# named *track* on channel 0 rather than spreading them across GM channels, and
# emit no program_change. For those files we read the instrument from the track
# name. Keyword -> 1-based INSTRUMENT_NAMES index; first matching keyword wins,
# so list the more specific keywords first.
NAME_INSTRUMENT_RULES = [
    ('bass', 6),
    ('rhodes', 2), ('mellowpiano', 1), ('piano', 1),
    ('overdrive', 5), ('distortion', 5), ('elecguitar', 5), ('electric guitar', 5),
    ('steelguitar', 4), ('acoustic', 4), ('guitar', 4), ('banjo', 4), ('sitar', 4),
    ('synthlead', 20), ('square', 20), ('sawtooth', 20), ('saw', 20),
    ('lead', 20), ('synth', 20),
    ('strings', 21), ('pad', 21), ('choir', 15), ('voice', 15), ('vox', 15),
    ('trumpet', 9), ('trombone', 9), ('french horn', 9), ('horn', 9), ('brass', 9),
    ('sax', 11), ('clarinet', 10), ('oboe', 10),
    ('whistle', 12), ('flute', 12), ('piccolo', 12),
    ('recorder', 13), ('panflute', 13), ('pan flute', 13),
    ('bassoon', 14),
    ('vibra', 16), ('musicbox', 17), ('music box', 17), ('bell', 16),
    ('steeldrum', 18), ('steel drum', 18),
    ('marimba', 19), ('xylophone', 19), ('xylo', 19), ('kalimba', 19),
    ('accordeon', 3), ('accordion', 3), ('orgue', 3), ('organ', 3),
    ('cello', 8), ('violin', 8), ('viola', 8), ('contrabass', 6),
    ('pizz', 7),
]


def instrument_from_name(name):
    n = (name or '').lower()
    for kw, inst in NAME_INSTRUMENT_RULES:
        if kw in n:
            return inst
    return 1  # default -> Piano


# Name-based drum tracks that use the small LMMS beat/bassline pitch cluster
# (48..51) rather than GM percussion numbers. Kick / snare / closed hat / open
# hat. Tracks whose pitches fall outside this cluster are treated as GM (DRUM_MAP).
LMMS_DRUM_MAP = {48: 2, 49: 1, 50: 6, 51: 5}

# Krumhansl-Kessler key profiles, for the display-only major/minor key label.
KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def estimate_key(pc_weights):
    total = sum(pc_weights) or 1.0
    x = [w / total for w in pc_weights]

    def corr(profile, rot):
        prof = [profile[(i - rot) % 12] for i in range(12)]
        mp = sum(prof) / 12
        mx = sum(x) / 12
        num = sum((prof[i] - mp) * (x[i] - mx) for i in range(12))
        den = math.sqrt(sum((prof[i] - mp) ** 2 for i in range(12)) *
                        sum((x[i] - mx) ** 2 for i in range(12))) or 1e-9
        return num / den

    best = (0, 'major', -1e9)
    for rot in range(12):
        for profile, scale in ((KK_MAJOR, 'major'), (KK_MINOR, 'minor')):
            c = corr(profile, rot)
            if c > best[2]:
                best = (rot, scale, c)
    return best[0], best[1]


def extract_notes(mid):
    """channel -> [{start, dur, pitch, vel, prog}] in absolute ticks."""
    notes_by_ch = defaultdict(list)
    prog_counter = defaultdict(Counter)
    for tr in mid.tracks:
        t = 0
        active = {}
        local_prog = defaultdict(int)
        for msg in tr:
            t += msg.time
            if msg.type == 'program_change':
                local_prog[msg.channel] = msg.program
            elif msg.type == 'note_on' and msg.velocity > 0:
                active[(msg.channel, msg.note)] = (t, msg.velocity, local_prog[msg.channel])
                prog_counter[msg.channel][local_prog[msg.channel]] += 1
            elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                k = (msg.channel, msg.note)
                if k in active:
                    start, vel, prog = active.pop(k)
                    notes_by_ch[msg.channel].append(
                        {'start': start, 'dur': max(1, t - start),
                         'pitch': msg.note, 'vel': vel, 'prog': prog})
    return notes_by_ch, prog_counter


def first_tempo_bpm(mid):
    for tr in mid.tracks:
        for msg in tr:
            if msg.type == 'set_tempo':
                return max(20, min(500, round(mido.tempo2bpm(msg.tempo))))
    return 120


def dominant_program(counter):
    return counter.most_common(1)[0][0] if counter else 0


def fit_pitch(p):
    while p < MIN_PITCH:
        p += 12
    while p > MAX_PITCH:
        p -= 12
    return p


def note_signature(notes, tpb):
    step = tpb / 4.0
    return set((round(n['start'] / step), n['pitch'] % 12) for n in notes)


def extract_parts(mid):
    """Reduce a MIDI file to a list of instrument "parts", each a dict:

        {notes: [{start, dur, pitch, vel}], program: int|None, name: str,
         is_drum: bool, drum_lmms: bool}

    Two layouts are handled. Channel-distributed files (the GM norm: >=2 MIDI
    channels carry notes) group by channel and read the instrument from the
    dominant program_change -- this reproduces the original behaviour exactly.
    Track-distributed files (everything on one channel, instruments split into
    named tracks with no program_change, e.g. LMMS/Komiku exports) group by
    track and read the instrument from the track name.
    """
    notes_by_ch, prog_counter = extract_notes(mid)
    nonempty = [c for c in notes_by_ch if notes_by_ch[c]]
    if len(nonempty) >= 2:
        return [{'notes': notes_by_ch[c], 'program': dominant_program(prog_counter[c]),
                 'name': '', 'is_drum': c == 9, 'drum_lmms': False}
                for c in nonempty]

    parts = []
    for tr in mid.tracks:
        name = ''
        t = 0
        active = {}
        progs = set()
        chans = set()
        notes = []
        for msg in tr:
            t += msg.time
            if msg.type == 'track_name':
                name = msg.name
            elif msg.type == 'program_change':
                progs.add(msg.program)
            elif msg.type == 'note_on' and msg.velocity > 0:
                active[(msg.channel, msg.note)] = (t, msg.velocity)
                chans.add(msg.channel)
            elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                k = (msg.channel, msg.note)
                if k in active:
                    start, vel = active.pop(k)
                    notes.append({'start': start, 'dur': max(1, t - start),
                                  'pitch': msg.note, 'vel': vel})
        if not notes:
            continue
        nm = (name or '').strip()
        is_drum = (9 in chans) or bool(re.search(r'drum|perc', nm, re.I))
        drum_lmms = is_drum and all(n['pitch'] in LMMS_DRUM_MAP for n in notes)
        parts.append({'notes': notes, 'program': (max(progs) if progs else None),
                      'name': nm, 'is_drum': is_drum, 'drum_lmms': drum_lmms})
    return parts


def _is_bass_part(part):
    p = part['program']
    if p is not None and 32 <= p <= 39:
        return True
    return bool(re.search(r'bass', part['name'], re.I))


def select_parts(parts, tpb):
    """Choose <=4 parts: drums first, then a bass, then the busiest remaining
    melodic parts, skipping near-duplicate (doubled) parts."""
    chosen = []
    drums = [p for p in parts if p['is_drum'] and p['notes']]
    if drums:
        chosen.append(max(drums, key=lambda p: len(p['notes'])))
    melodic = [p for p in parts if not p['is_drum'] and p['notes']]

    def median_pitch(p):
        ps = sorted(n['pitch'] for n in p['notes'])
        return ps[len(ps) // 2]

    bass_candidates = [p for p in melodic if _is_bass_part(p)]
    if bass_candidates:
        chosen.append(max(bass_candidates, key=lambda p: len(p['notes'])))
    elif melodic:
        chosen.append(min(melodic, key=median_pitch))

    chosen_ids = {id(p) for p in chosen}
    chosen_sigs = [(p, note_signature(p['notes'], tpb)) for p in chosen if not p['is_drum']]
    for p in sorted((p for p in melodic if id(p) not in chosen_ids),
                    key=lambda p: -len(p['notes'])):
        if len(chosen) >= MAX_TRACKS:
            break
        sig = note_signature(p['notes'], tpb)
        # Channel-distributed parts only count as duplicates of a same-program
        # part (matches the original behaviour); name/track parts (program None)
        # dedupe purely on rhythm+pitch-class overlap, which catches the common
        # doubled lead (e.g. square + sawtooth playing the same line).
        dup = any(osig and len(sig & osig) / (len(sig | osig) or 1) > 0.55 and
                  (p['program'] is None or p['program'] == op['program'])
                  for op, osig in chosen_sigs)
        if not dup:
            chosen.append(p)
            chosen_ids.add(id(p))
            chosen_sigs.append((p, sig))
    return chosen


def build_payload(path):
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat
    parts = extract_parts(mid)
    if not parts:
        return None
    bpm = first_tempo_bpm(mid)
    step_ticks = tpb / 4.0
    chosen = select_parts(parts, tpb)

    # densest WINDOW_BARS window over the chosen parts
    all_notes = [n for p in chosen for n in p['notes']]
    if not all_notes:
        return None
    max_step = max(round(n['start'] / step_ticks) for n in all_notes)
    num_bars = max(1, math.ceil((max_step + 1) / STEPS_PER_BAR))
    win_bars = min(WINDOW_BARS, num_bars)
    win_steps = win_bars * STEPS_PER_BAR
    bar_counts = Counter(round(n['start'] / step_ticks) // STEPS_PER_BAR for n in all_notes)
    best_start_bar = max(range(0, num_bars - win_bars + 1),
                         key=lambda sb: sum(bar_counts[sb + i] for i in range(win_bars)),
                         default=0)
    win_start = best_start_bar * STEPS_PER_BAR
    win_end = win_start + win_steps

    tracks = []
    pc_weights = [0.0] * 12
    for part in chosen:
        is_drum = part['is_drum']
        drum_map = LMMS_DRUM_MAP if part['drum_lmms'] else DRUM_MAP
        out_notes = []
        lane_counter = Counter()
        for n in part['notes']:
            s = round(n['start'] / step_ticks)
            if not (win_start <= s < win_end):
                continue
            step = s - win_start
            dur = max(1, round(n['dur'] / step_ticks))
            dur = max(1, min(dur, win_steps - step))
            vel = max(1, min(127, n['vel']))
            if is_drum:
                lane = drum_map.get(n['pitch'])
                if lane is None:
                    continue
                out_notes.append({'step': step, 'durationSteps': dur, 'velocity': vel, 'drum': lane})
                lane_counter[lane] += 1
            else:
                pitch = fit_pitch(n['pitch'])
                out_notes.append({'step': step, 'durationSteps': dur, 'velocity': vel, 'pitch': pitch})
                pc_weights[pitch % 12] += dur
        if not out_notes:
            continue
        effects = {'reverb': 0, 'delay': 0, 'filter': 100, 'pan': 0}
        if is_drum:
            keep = [lane for lane, _ in lane_counter.most_common(6)]  # 6 busiest lanes
            out_notes = [n for n in out_notes if n['drum'] in set(keep)]
            if not out_notes:
                continue
            tracks.append({'kind': 'drum', 'volume': 100, 'muted': False,
                           'effects': effects, 'notes': out_notes, 'drumLanes': keep})
        else:
            inst = (gm_to_instrument(part['program']) if part['program'] is not None
                    else instrument_from_name(part['name']))
            tracks.append({'kind': 'instrument', 'volume': 100, 'muted': False,
                           'effects': effects, 'notes': out_notes, 'instrument': inst})
    if not tracks:
        return None
    tracks.sort(key=lambda t: 1 if t['kind'] in ('drum', 'synthDrum') else 0)  # drums last

    rot, scale = estimate_key(pc_weights)
    payload = {
        'tempo': bpm, 'lengthSteps': win_steps, 'stepsPerBeat': 4,
        'key': PITCH_CLASS_NAMES[rot], 'octave': 4,
        'scale': 'chromatic',  # lossless import: snapToScale is a no-op
        'tracks': tracks,
    }
    return payload, PITCH_CLASS_NAMES[rot], scale


# Curated subsets that ship in song-tracks.json: source file -> display name +
# tags. They're grouped as sections by itemType ('song'), not a tag. Tags are
# the existing genre/mood/context vocabulary (plus 'disco'/'funk' for the dance
# pack). Display names are kid-friendly -- CC0 imposes no naming obligation, and
# Song Maker targets young learners -- with the original file name kept here for
# provenance. See CC0-MIDI-CREDITS.md for the three source collections.

# github.com/m-malandro/CC0-midis -- General-MIDI game themes.
MALANDRO_CURATED = [
    ('overture-2021.mid',             'Overture',            ['cinematic', 'epic', 'intro', 'game']),
    ('gather-your-party.mid',         'Gather Your Party',   ['chiptune', 'epic', 'exploration', 'game']),
    ('arena-rock.mid',                'Arena Rock',          ['rock', 'epic', 'boss', 'game']),
    ('frantic-boss-battle.mid',       'Frantic Boss Battle', ['electronic', 'epic', 'boss', 'game']),
    ('lighthearted-battle-theme.mid', 'Lighthearted Battle', ['chiptune', 'upbeat', 'boss', 'game']),
    ('math-metal.mid',                'Math Metal',          ['rock', 'epic', 'boss', 'game']),
    ('mine-all-mine.mid',             'Mine All Mine',       ['rock', 'upbeat', 'platformer', 'game']),
    ('gears.mid',                     'Gears',               ['electronic', 'epic', 'racing', 'game']),
    ('movin-on.mid',                  "Movin' On",           ['rock', 'happy', 'racing', 'game']),
    ('maybe.mid',                     'Maybe',               ['pop', 'happy', 'dance', 'game']),
    ('android-observation-room.mid',  'Observation Room',    ['electronic', 'chill', 'story', 'game']),
    ('sitar-jam.mid',                 'Sitar Jam',           ['chill', 'story', 'game']),
    ('do-you-remember.mid',           'Do You Remember',     ['lofi', 'sad', 'story', 'game']),
]

# opengameart.org "Original MIDI Album" by Roppy Chop Studios -- chill/ambient.
ROPPY_CURATED = [
    ('Casual Afternoon.mid',  'Casual Afternoon', ['chill', 'happy', 'lofi', 'game']),
    ('Icy Garden.mid',        'Icy Garden',       ['chill', 'spooky', 'game']),
    ('Journey Forgotten.mid', 'Forgotten Path',   ['chill', 'exploration', 'game']),
    ('No One.mid',            'Quiet Reflection', ['lofi', 'sad', 'story', 'game']),
]

# opengameart.org "Helice Incredible Adventure" by Komiku / Loyalty Freak Music
# -- a disco/funk RPG soundtrack. Track-distributed MIDIs (named tracks, LMMS
# drum kits); display names are renamed from the originals for a kid audience.
HELICE_CURATED = [
    ('Disco Challenge.mid',                                'Disco Challenge',    ['electronic', 'disco', 'boss', 'game']),
    ("Fighting the Sellers's machine.mid",                 'Machine Battle',     ['rock', 'epic', 'boss', 'game']),
    ('Big Boss Hélice.mid',                                'Big Boss',           ['electronic', 'epic', 'boss', 'game']),
    ("The biggest capitalist machine you've ever seen.mid", 'Mega Machine',      ['electronic', 'epic', 'boss', 'game']),
    ('Everything is groovy (How to move your body).mid',   'Get Groovy',         ['funk', 'happy', 'dance', 'game']),
    ('The big dancefloor.mid',                             'Big Dancefloor',     ['disco', 'happy', 'dance', 'game']),
    ("I'm in the Not-a-Club.mid",                          'Dance Club',         ['disco', 'dance', 'game']),
    ('dropda basstion.mid',                                'Bass Station',       ['funk', 'upbeat', 'game']),
    ('Cliff Road Chill.mid',                               'Cliff Road',         ['chill', 'exploration', 'game']),
    ('Little town before Big city.mid',                    'Little Town',        ['happy', 'exploration', 'game']),
    ('The journey begins.mid',                             'The Journey Begins', ['chill', 'intro', 'exploration', 'game']),
    ('An anarchist utopia.mid',                            'Peaceful Days',      ['chill', 'story', 'game']),
]

# (fname, display name, tags, author credit) — the credit is shown in the
# library UI; CC0 requires no attribution but we give it as good practice.
CURATED = (
    [(f, n, t, 'm-malandro') for f, n, t in MALANDRO_CURATED] +
    [(f, n, t, 'Roppy Chop Studios') for f, n, t in ROPPY_CURATED] +
    [(f, n, t, 'Komiku / Loyalty Freak Music') for f, n, t in HELICE_CURATED]
)


def root_pitch(key_name, octave=4):
    return (octave + 1) * 12 + PITCH_CLASS_NAMES.index(key_name)


def find_file(indirs, fname):
    """First match for fname across the given source directories."""
    for d in indirs:
        path = os.path.join(d, fname)
        if os.path.exists(path):
            return path
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='indirs', required=True, nargs='+',
                    help='one or more directories of .mid files (searched in order)')
    ap.add_argument('--out', dest='out', default='cc0-midi-items.json')
    ap.add_argument('--all', action='store_true',
                    help='convert every .mid found instead of just the curated list')
    args = ap.parse_args()

    if args.all:
        todo = []
        for d in args.indirs:
            for p in sorted(glob.glob(os.path.join(d, '*.mid'))):
                todo.append((os.path.basename(p), os.path.splitext(os.path.basename(p))[0], ['game'], None))
    else:
        todo = CURATED

    items = []
    for fname, name, tags, credit in todo:
        path = find_file(args.indirs, fname)
        if not path:
            print(f'  skip (missing): {fname}')
            continue
        res = build_payload(path)
        if not res:
            print(f'  skip (no tracks): {fname}')
            continue
        payload, key_name, scale = res
        items.append({
            'name': name, 'itemType': 'song', 'tags': tags,
            'tempo': payload['tempo'],
            'rootPitch': root_pitch(key_name), 'scaleType': scale,  # display label only
            'lengthSteps': payload['lengthSteps'], 'stepsPerBeat': 4,
            'trackCount': len(payload['tracks']), 'source': 'cc0-midi',
            **({'credit': credit} if credit else {}),
            'payload': payload,
        })
        print(f"  {name:22} {payload['tempo']:>3}bpm  {len(payload['tracks'])} tracks  {tags}")
    with open(args.out, 'w') as f:
        json.dump(items, f, indent=1, ensure_ascii=False)
    print(f'\nWrote {len(items)} items to {args.out}')


if __name__ == '__main__':
    main()
