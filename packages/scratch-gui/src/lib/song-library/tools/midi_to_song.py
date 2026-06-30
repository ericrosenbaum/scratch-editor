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


def select_channels(notes_by_ch, prog_counter, tpb):
    """Choose <=4 channels: drums (ch9) first, then a bass, then the busiest
    remaining melodic channels, skipping near-duplicate (doubled) parts."""
    chosen = []
    if notes_by_ch.get(9):
        chosen.append(9)
    melodic = [c for c in notes_by_ch if c != 9 and notes_by_ch[c]]

    def median_pitch(c):
        ps = sorted(n['pitch'] for n in notes_by_ch[c])
        return ps[len(ps) // 2]

    bass_candidates = [c for c in melodic if 32 <= dominant_program(prog_counter[c]) <= 39]
    if bass_candidates:
        chosen.append(max(bass_candidates, key=lambda c: len(notes_by_ch[c])))
    elif melodic:
        chosen.append(min(melodic, key=median_pitch))

    chosen_sigs = {c: note_signature(notes_by_ch[c], tpb) for c in chosen if c != 9}
    for c in sorted((c for c in melodic if c not in chosen),
                    key=lambda c: -len(notes_by_ch[c])):
        if len(chosen) >= MAX_TRACKS:
            break
        prog = dominant_program(prog_counter[c])
        sig = note_signature(notes_by_ch[c], tpb)
        dup = any(dominant_program(prog_counter[oc]) == prog and osig and
                  len(sig & osig) / (len(sig | osig) or 1) > 0.55
                  for oc, osig in chosen_sigs.items())
        if not dup:
            chosen.append(c)
            chosen_sigs[c] = sig
    return chosen


def build_payload(path):
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat
    notes_by_ch, prog_counter = extract_notes(mid)
    if not notes_by_ch:
        return None
    bpm = first_tempo_bpm(mid)
    step_ticks = tpb / 4.0
    chosen = select_channels(notes_by_ch, prog_counter, tpb)

    # densest WINDOW_BARS window over the chosen channels
    all_notes = [n for c in chosen for n in notes_by_ch[c]]
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
    for c in chosen:
        is_drum = (c == 9)
        out_notes = []
        lane_counter = Counter()
        for n in notes_by_ch[c]:
            s = round(n['start'] / step_ticks)
            if not (win_start <= s < win_end):
                continue
            step = s - win_start
            dur = max(1, round(n['dur'] / step_ticks))
            dur = max(1, min(dur, win_steps - step))
            vel = max(1, min(127, n['vel']))
            if is_drum:
                lane = DRUM_MAP.get(n['pitch'])
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
            inst = gm_to_instrument(dominant_program(prog_counter[c]))
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


# Curated subset that ships in song-tracks.json: display name + tags. All share
# the 'game' tag; they're grouped as sections by itemType ('song'), not a tag.
# The rest are the existing genre/mood/context vocabulary.
CURATED = [
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


def root_pitch(key_name, octave=4):
    return (octave + 1) * 12 + PITCH_CLASS_NAMES.index(key_name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='indir', required=True, help='directory of .mid files')
    ap.add_argument('--out', dest='out', default='cc0-midi-items.json')
    ap.add_argument('--all', action='store_true',
                    help='convert every .mid found instead of just the curated list')
    args = ap.parse_args()

    items = []
    todo = ([(os.path.basename(p), os.path.splitext(os.path.basename(p))[0],
              ['game']) for p in sorted(glob.glob(os.path.join(args.indir, '*.mid')))]
            if args.all else CURATED)
    for fname, name, tags in todo:
        path = os.path.join(args.indir, fname)
        if not os.path.exists(path):
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
            'payload': payload,
        })
        print(f"  {name:22} {payload['tempo']:>3}bpm  {len(payload['tracks'])} tracks  {tags}")
    with open(args.out, 'w') as f:
        json.dump(items, f, indent=1, ensure_ascii=False)
    print(f'\nWrote {len(items)} items to {args.out}')


if __name__ == '__main__':
    main()
