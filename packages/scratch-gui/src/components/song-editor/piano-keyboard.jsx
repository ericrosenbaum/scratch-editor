import React from 'react';
import PropTypes from 'prop-types';

import {fillForPitch} from './pitch-colors.js';
import {pianoKeyLabel, SEMITONES_VISIBLE} from './key-mapping.js';

// White-key semitone offsets in a single octave (relative to C). Black keys
// sit between them at the indicated white-index gaps.
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_OFFSETS = [1, 3, 6, 8, 10]; // C# D# F# G# A#

const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => `${MIDI_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

const WHITES_PER_OCTAVE = 7;
const OCTAVES = SEMITONES_VISIBLE / 12;
const TOTAL_WHITES = WHITES_PER_OCTAVE * OCTAVES; // 14

class PianoKeyboard extends React.Component {
    constructor (props) {
        super(props);
        this.handleWhiteDown = this.handleWhiteDown.bind(this);
        this.handleWhiteUp = this.handleWhiteUp.bind(this);
        this.handleBlackDown = this.handleBlackDown.bind(this);
        this.handleBlackUp = this.handleBlackUp.bind(this);
        this.handleLeave = this.handleLeave.bind(this);
    }

    _pitchFromOffset (offset) {
        return this.props.octaveBase + offset;
    }

    handleWhiteDown (e) {
        e.preventDefault();
        const offset = Number(e.currentTarget.getAttribute('data-offset'));
        this.props.onPitchDown(this._pitchFromOffset(offset));
    }

    handleWhiteUp (e) {
        e.preventDefault();
        const offset = Number(e.currentTarget.getAttribute('data-offset'));
        this.props.onPitchUp(this._pitchFromOffset(offset));
    }

    handleBlackDown (e) {
        e.preventDefault();
        e.stopPropagation();
        const offset = Number(e.currentTarget.getAttribute('data-offset'));
        this.props.onPitchDown(this._pitchFromOffset(offset));
    }

    handleBlackUp (e) {
        e.preventDefault();
        e.stopPropagation();
        const offset = Number(e.currentTarget.getAttribute('data-offset'));
        this.props.onPitchUp(this._pitchFromOffset(offset));
    }

    handleLeave (e) {
        // If a mouse leaves while held, release the note so we don't get stuck.
        if (e.buttons === 0) return;
        const offset = Number(e.currentTarget.getAttribute('data-offset'));
        this.props.onPitchUp(this._pitchFromOffset(offset));
    }

    render () {
        const {octaveBase, heldPitches} = this.props;
        const whiteWidthPct = 100 / TOTAL_WHITES;

        // Build the list of (whiteIndex, semitone offset) for all 14 white keys
        // across 2 octaves.
        const whiteKeys = [];
        for (let oct = 0; oct < OCTAVES; oct++) {
            for (let wi = 0; wi < WHITES_PER_OCTAVE; wi++) {
                const offset = (oct * 12) + WHITE_OFFSETS[wi];
                whiteKeys.push({offset, whiteIndex: (oct * WHITES_PER_OCTAVE) + wi});
            }
        }

        // Build the list of black-key positions for 2 octaves. A black key
        // sits centered between two whites; we store the index of the white
        // it sits "after" (i.e., the lower of the two adjacent whites).
        const blackKeys = [];
        for (let oct = 0; oct < OCTAVES; oct++) {
            for (const offsetInOct of BLACK_OFFSETS) {
                const offset = (oct * 12) + offsetInOct;
                // The black key sits to the right of the white whose semitone is offset-1.
                const lowerWhiteOffsetInOct = offsetInOct - 1;
                const lowerWhiteIndexInOct = WHITE_OFFSETS.indexOf(lowerWhiteOffsetInOct);
                const whiteIndex = (oct * WHITES_PER_OCTAVE) + lowerWhiteIndexInOct;
                blackKeys.push({offset, whiteIndex});
            }
        }

        return (
            <div className="kbe-piano">
                {whiteKeys.map(({offset, whiteIndex}) => {
                    const pitch = octaveBase + offset;
                    const held = heldPitches && heldPitches.has(pitch);
                    const label = pianoKeyLabel(offset).toUpperCase();
                    const style = {
                        left: `${whiteIndex * whiteWidthPct}%`,
                        width: `${whiteWidthPct}%`,
                        borderBottomColor: fillForPitch(pitch)
                    };
                    if (held) {
                        style.background = fillForPitch(pitch);
                    }
                    return (
                        <div
                            key={`w-${offset}`}
                            className={`kbe-piano-key white ${held ? 'held' : ''}`}
                            style={style}
                            data-offset={offset}
                            onMouseDown={this.handleWhiteDown}
                            onMouseUp={this.handleWhiteUp}
                            onMouseLeave={this.handleLeave}
                        >
                            <div className="kbe-piano-key-note">{noteName(pitch)}</div>
                            {label ? (
                                <div className="kbe-piano-key-char">{label}</div>
                            ) : null}
                        </div>
                    );
                })}
                {blackKeys.map(({offset, whiteIndex}) => {
                    const pitch = octaveBase + offset;
                    const held = heldPitches && heldPitches.has(pitch);
                    const label = pianoKeyLabel(offset).toUpperCase();
                    // Center the black key on the gap between whiteIndex and whiteIndex+1.
                    const left = (whiteIndex + 1) * whiteWidthPct;
                    const width = whiteWidthPct * 0.62;
                    const style = {
                        left: `calc(${left}% - ${width / 2}%)`,
                        width: `${width}%`
                    };
                    return (
                        <div
                            key={`b-${offset}`}
                            className={`kbe-piano-key black ${held ? 'held' : ''}`}
                            style={style}
                            data-offset={offset}
                            onMouseDown={this.handleBlackDown}
                            onMouseUp={this.handleBlackUp}
                            onMouseLeave={this.handleLeave}
                        >
                            {label ? (
                                <div className="kbe-piano-key-char">{label}</div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        );
    }
}

PianoKeyboard.propTypes = {
    octaveBase: PropTypes.number.isRequired,
    heldPitches: PropTypes.instanceOf(Set),
    onPitchDown: PropTypes.func.isRequired,
    onPitchUp: PropTypes.func.isRequired
};

export default PianoKeyboard;
