import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import WavEncoder from 'wav-encoder';
import VM from '@scratch/scratch-vm';

import {connect} from 'react-redux';

import {
    computeChunkedRMS,
    encodeAndAddSoundToVM,
    downsampleIfNeeded,
    dropEveryOtherSample
} from '../lib/audio/audio-util.js';
import AudioEffects from '../lib/audio/audio-effects.js';
import SoundEditorComponent from '../components/sound-editor/sound-editor.jsx';
import AudioBufferPlayer from '../lib/audio/audio-buffer-player.js';
import log from '../lib/log.js';

const UNDO_STACK_SIZE = 99;

const MAX_RMS = 1.2;

// Small epsilon (seconds) so markers exactly at the new end aren't dropped.
const MARKER_EPSILON = 1e-4;

// Markers whose time falls inside a removed region [cutStart, cutEnd] are
// dropped; markers after the region shift earlier by the removed length.
const remapMarkersCut = (markers, cutStart, cutEnd) => markers
    .filter(m => m.time <= cutStart || m.time >= cutEnd)
    .map(m => (m.time >= cutEnd ? {...m, time: m.time - (cutEnd - cutStart)} : m));

// Keep only markers within [cutStart, cutEnd], shifted so cutStart becomes 0.
const remapMarkersCrop = (markers, cutStart, cutEnd) => markers
    .filter(m => m.time >= cutStart && m.time <= cutEnd)
    .map(m => ({...m, time: m.time - cutStart}));

// Scale all marker times by a duration ratio, dropping any past the new end.
const remapMarkersScale = (markers, ratio, newDuration) => markers
    .map(m => ({...m, time: m.time * ratio}))
    .filter(m => m.time <= newDuration + MARKER_EPSILON);

// Replace region [cutStart, cutEnd] with an inserted clip of length insertLen:
// drop markers inside the region, shift later markers by the net length change.
const remapMarkersReplace = (markers, cutStart, cutEnd, insertLen) => markers
    .filter(m => m.time <= cutStart || m.time >= cutEnd)
    .map(m => (m.time >= cutEnd ? {...m, time: m.time - (cutEnd - cutStart) + insertLen} : m));

class SoundEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'copy',
            'copyCurrentBuffer',
            'handleCopyToNew',
            'handleStoppedPlaying',
            'handleChangeName',
            'handlePlay',
            'handleStopPlaying',
            'handleUpdatePlayhead',
            'handleDelete',
            'handleUpdateTrim',
            'handleEffect',
            'handleUndo',
            'handleRedo',
            'submitNewSamples',
            'handleCopy',
            'handlePaste',
            'paste',
            'handleKeyPress',
            'handleContainerClick',
            'handleAddMarker',
            'handleDeleteMarker',
            'handlePlayMarker',
            'handleRenameMarker',
            'handleSetMarkerTime',
            'setRef',
            'resampleBufferToRate'
        ]);
        this.state = {
            copyBuffer: null,
            chunkLevels: computeChunkedRMS(this.props.samples),
            playhead: null, // null is not playing, [0 -> 1] is playing percent
            trimStart: null,
            trimEnd: null
        };

        this.redoStack = [];
        this.undoStack = [];

        this.ref = null;
    }
    componentDidMount () {
        this.audioBufferPlayer = new AudioBufferPlayer(this.props.samples, this.props.sampleRate);

        document.addEventListener('keydown', this.handleKeyPress);
    }
    componentWillReceiveProps (newProps) {
        if (newProps.soundId !== this.props.soundId) { // A different sound has been selected
            this.redoStack = [];
            this.undoStack = [];
            this.resetState(newProps.samples, newProps.sampleRate);
            this.setState({
                trimStart: null,
                trimEnd: null
            });
        }
    }
    componentWillUnmount () {
        this.audioBufferPlayer.stop();

        document.removeEventListener('keydown', this.handleKeyPress);
    }
    handleKeyPress (event) {
        if (event.target instanceof HTMLInputElement) {
            // Ignore keyboard shortcuts if a text input field is focused
            return;
        }
        if (this.props.isFullScreen) {
            // Ignore keyboard shortcuts if the stage is fullscreen mode
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            if (this.state.playhead) {
                this.handleStopPlaying();
            } else {
                this.handlePlay();
            }
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            if (event.shiftKey) {
                this.handleDeleteInverse();
            } else {
                this.handleDelete();
            }
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.handleUpdateTrim(null, null);
        }
        if (event.metaKey || event.ctrlKey) {
            if (event.shiftKey && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (this.redoStack.length > 0) {
                    this.handleRedo();
                }
            } else if (event.key === 'z') {
                if (this.undoStack.length > 0) {
                    event.preventDefault();
                    this.handleUndo();
                }
            } else if (event.key === 'c') {
                event.preventDefault();
                this.handleCopy();
            } else if (event.key === 'v') {
                event.preventDefault();
                this.handlePaste();
            } else if (event.key === 'a') {
                event.preventDefault();
                this.handleUpdateTrim(0, 1);
            }
        }
    }
    resetState (samples, sampleRate) {
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer = new AudioBufferPlayer(samples, sampleRate);
        this.setState({
            chunkLevels: computeChunkedRMS(samples),
            playhead: null
        });
    }
    submitNewSamples (samples, sampleRate, skipUndo) {
        return downsampleIfNeeded({samples, sampleRate}, this.resampleBufferToRate)
            .then(({samples: newSamples, sampleRate: newSampleRate}) =>
                WavEncoder.encode({
                    sampleRate: newSampleRate,
                    channelData: [newSamples]
                }).then(wavBuffer => {
                    if (!skipUndo) {
                        this.redoStack = [];
                        if (this.undoStack.length >= UNDO_STACK_SIZE) {
                            this.undoStack.shift(); // Drop the first element off the array
                        }
                        this.undoStack.push(this.getUndoItem());
                    }
                    this.resetState(newSamples, newSampleRate);
                    this.props.vm.updateSoundBuffer(
                        this.props.soundIndex,
                        this.audioBufferPlayer.buffer,
                        new Uint8Array(wavBuffer));
                    return true; // Edit was successful
                })
            )
            .catch(e => {
                // Encoding failed, or the sound was too large to save so edit is rejected
                log.error(`Encountered error while trying to encode sound update: ${e.message}`);
                return false; // Edit was not applied
            });
    }
    handlePlay () {
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer.play(
            this.state.trimStart || 0,
            this.state.trimEnd || 1,
            this.handleUpdatePlayhead,
            this.handleStoppedPlaying);
    }
    handleStopPlaying () {
        this.audioBufferPlayer.stop();
        this.handleStoppedPlaying();
    }
    handleStoppedPlaying () {
        this.setState({playhead: null});
    }
    handleUpdatePlayhead (playhead) {
        this.setState({playhead});
    }
    handleChangeName (name) {
        this.props.vm.renameSound(this.props.soundIndex, name);
    }
    handleDelete () {
        const {samples, sampleRate} = this.copyCurrentBuffer();
        const sampleCount = samples.length;
        const startIndex = Math.floor(this.state.trimStart * sampleCount);
        const endIndex = Math.floor(this.state.trimEnd * sampleCount);
        const firstPart = samples.slice(0, startIndex);
        const secondPart = samples.slice(endIndex, sampleCount);
        const newLength = firstPart.length + secondPart.length;
        const oldDuration = sampleCount / sampleRate;
        const cutStart = this.state.trimStart * oldDuration;
        const cutEnd = this.state.trimEnd * oldDuration;
        const remappedMarkers = remapMarkersCut(this.props.markers, cutStart, cutEnd);
        let newSamples;
        if (newLength === 0) {
            newSamples = new Float32Array(1);
        } else {
            newSamples = new Float32Array(newLength);
            newSamples.set(firstPart, 0);
            newSamples.set(secondPart, firstPart.length);
        }
        this.submitNewSamples(newSamples, sampleRate).then(success => {
            if (success) this.commitMarkers(remappedMarkers);
            this.setState({
                trimStart: null,
                trimEnd: null
            });
        });
    }
    handleDeleteInverse () {
        // Delete everything outside of the trimmers
        const {samples, sampleRate} = this.copyCurrentBuffer();
        const sampleCount = samples.length;
        const startIndex = Math.floor(this.state.trimStart * sampleCount);
        const endIndex = Math.floor(this.state.trimEnd * sampleCount);
        const oldDuration = sampleCount / sampleRate;
        const cutStart = this.state.trimStart * oldDuration;
        const cutEnd = this.state.trimEnd * oldDuration;
        const remappedMarkers = remapMarkersCrop(this.props.markers, cutStart, cutEnd);
        let clippedSamples = samples.slice(startIndex, endIndex);
        if (clippedSamples.length === 0) {
            clippedSamples = new Float32Array(1);
        }
        this.submitNewSamples(clippedSamples, sampleRate).then(success => {
            if (success) {
                this.commitMarkers(remappedMarkers);
                this.setState({
                    trimStart: null,
                    trimEnd: null
                });
            }
        });
    }
    handleUpdateTrim (trimStart, trimEnd) {
        this.setState({trimStart, trimEnd});
        this.handleStopPlaying();
    }
    effectFactory (name) {
        return () => this.handleEffect(name);
    }
    copyCurrentBuffer () {
        // Cannot reliably use props.samples because it gets detached by Firefox
        return {
            samples: this.audioBufferPlayer.buffer.getChannelData(0),
            sampleRate: this.audioBufferPlayer.buffer.sampleRate
        };
    }
    handleEffect (name) {
        const trimStart = this.state.trimStart === null ? 0.0 : this.state.trimStart;
        const trimEnd = this.state.trimEnd === null ? 1.0 : this.state.trimEnd;

        // Offline audio context needs at least 2 samples
        if (this.audioBufferPlayer.buffer.length < 2) {
            return;
        }

        const oldMarkers = this.props.markers;
        const oldDuration = this.audioBufferPlayer.buffer.length / this.audioBufferPlayer.buffer.sampleRate;

        const effects = new AudioEffects(this.audioBufferPlayer.buffer, name, trimStart, trimEnd);
        effects.process((renderedBuffer, adjustedTrimStart, adjustedTrimEnd) => {
            const samples = renderedBuffer.getChannelData(0);
            const sampleRate = renderedBuffer.sampleRate;
            // Effects may change the sound's length (faster/slower/echo). Remap
            // markers proportionally to the new duration; length-preserving
            // effects leave marker positions unchanged (ratio === 1).
            const newDuration = renderedBuffer.length / renderedBuffer.sampleRate;
            const ratio = oldDuration > 0 ? (newDuration / oldDuration) : 1;
            const remappedMarkers = remapMarkersScale(oldMarkers, ratio, newDuration);
            this.submitNewSamples(samples, sampleRate).then(success => {
                if (success) {
                    this.commitMarkers(remappedMarkers);
                    if (this.state.trimStart === null) {
                        this.handlePlay();
                    } else {
                        this.setState({trimStart: adjustedTrimStart, trimEnd: adjustedTrimEnd}, this.handlePlay);
                    }
                }
            });
        });
    }
    tooLoud () {
        const numChunks = this.state.chunkLevels.length;
        const startIndex = this.state.trimStart === null ?
            0 : Math.floor(this.state.trimStart * numChunks);
        const endIndex = this.state.trimEnd === null ?
            numChunks - 1 : Math.ceil(this.state.trimEnd * numChunks);
        const trimChunks = this.state.chunkLevels.slice(startIndex, endIndex);
        return Math.max(...trimChunks) > MAX_RMS;
    }
    getUndoItem () {
        return {
            ...this.copyCurrentBuffer(),
            trimStart: this.state.trimStart,
            trimEnd: this.state.trimEnd,
            // Snapshot markers (with names) so broadcasts can be re-created on undo.
            markers: this.props.markers.map(m => ({
                time: m.time,
                broadcastId: m.broadcastId,
                name: m.name
            }))
        };
    }
    handleUndo () {
        this.redoStack.push(this.getUndoItem());
        const {samples, sampleRate, trimStart, trimEnd, markers} = this.undoStack.pop();
        if (samples) {
            return this.submitNewSamples(samples, sampleRate, true).then(success => {
                if (success) {
                    if (markers) this.commitMarkers(markers);
                    this.setState({trimStart: trimStart, trimEnd: trimEnd}, this.handlePlay);
                }
            });
        }
    }
    handleRedo () {
        const {samples, sampleRate, trimStart, trimEnd, markers} = this.redoStack.pop();
        if (samples) {
            this.undoStack.push(this.getUndoItem());
            return this.submitNewSamples(samples, sampleRate, true).then(success => {
                if (success) {
                    if (markers) this.commitMarkers(markers);
                    this.setState({trimStart: trimStart, trimEnd: trimEnd}, this.handlePlay);
                }
            });
        }
    }
    handleCopy () {
        this.copy();
    }
    copy (callback) {
        const trimStart = this.state.trimStart === null ? 0.0 : this.state.trimStart;
        const trimEnd = this.state.trimEnd === null ? 1.0 : this.state.trimEnd;

        const newCopyBuffer = this.copyCurrentBuffer();
        const trimStartSamples = trimStart * newCopyBuffer.samples.length;
        const trimEndSamples = trimEnd * newCopyBuffer.samples.length;
        newCopyBuffer.samples = newCopyBuffer.samples.slice(trimStartSamples, trimEndSamples);

        this.setState({
            copyBuffer: newCopyBuffer
        }, callback);
    }
    handleCopyToNew () {
        this.copy(() => {
            encodeAndAddSoundToVM(this.props.vm, this.state.copyBuffer.samples,
                this.state.copyBuffer.sampleRate, this.props.name);
        });
    }
    resampleBufferToRate (buffer, newRate) {
        return new Promise((resolve, reject) => {
            const sampleRateRatio = newRate / buffer.sampleRate;
            const newLength = sampleRateRatio * buffer.samples.length;
            let offlineContext;
            // Try to use either OfflineAudioContext or webkitOfflineAudioContext to resample
            // The constructors will throw if trying to resample at an unsupported rate
            // (e.g. Safari/webkitOAC does not support lower than 44khz).
            try {
                if (window.OfflineAudioContext) {
                    offlineContext = new window.OfflineAudioContext(1, newLength, newRate);
                } else if (window.webkitOfflineAudioContext) {
                    offlineContext = new window.webkitOfflineAudioContext(1, newLength, newRate);
                }
            } catch {
                // If no OAC available and downsampling by 2, downsample by dropping every other sample.
                if (newRate === buffer.sampleRate / 2) {
                    return resolve(dropEveryOtherSample(buffer));
                }
                return reject(new Error('Could not resample'));
            }
            const source = offlineContext.createBufferSource();
            const audioBuffer = offlineContext.createBuffer(1, buffer.samples.length, buffer.sampleRate);
            audioBuffer.getChannelData(0).set(buffer.samples);
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            offlineContext.startRendering();
            offlineContext.oncomplete = ({renderedBuffer}) => {
                resolve({
                    samples: renderedBuffer.getChannelData(0),
                    sampleRate: newRate
                });
            };
        });
    }
    paste () {
        // If there's no selection, paste at the end of the sound
        const {samples} = this.copyCurrentBuffer();
        if (this.state.trimStart === null) {
            const newLength = samples.length + this.state.copyBuffer.samples.length;
            const newSamples = new Float32Array(newLength);
            newSamples.set(samples, 0);
            newSamples.set(this.state.copyBuffer.samples, samples.length);
            this.submitNewSamples(newSamples, this.props.sampleRate, false).then(success => {
                if (success) {
                    this.handlePlay();
                }
            });
        } else {
            // else replace the selection with the pasted sound
            const trimStartSamples = this.state.trimStart * samples.length;
            const trimEndSamples = this.state.trimEnd * samples.length;
            const firstPart = samples.slice(0, trimStartSamples);
            const lastPart = samples.slice(trimEndSamples);
            const newLength = firstPart.length + this.state.copyBuffer.samples.length + lastPart.length;
            const newSamples = new Float32Array(newLength);
            newSamples.set(firstPart, 0);
            newSamples.set(this.state.copyBuffer.samples, firstPart.length);
            newSamples.set(lastPart, firstPart.length + this.state.copyBuffer.samples.length);

            const trimStartSeconds = trimStartSamples / this.props.sampleRate;
            const trimEndSeconds = trimStartSeconds +
                (this.state.copyBuffer.samples.length / this.state.copyBuffer.sampleRate);
            const newDurationSeconds = newSamples.length / this.state.copyBuffer.sampleRate;
            const adjustedTrimStart = trimStartSeconds / newDurationSeconds;
            const adjustedTrimEnd = trimEndSeconds / newDurationSeconds;
            // Replace [cutStart, cutEnd] with the pasted clip: drop markers inside
            // the replaced region, shift later markers by the net length change.
            const oldDuration = samples.length / this.props.sampleRate;
            const cutStart = this.state.trimStart * oldDuration;
            const cutEnd = this.state.trimEnd * oldDuration;
            const insertLen = this.state.copyBuffer.samples.length / this.state.copyBuffer.sampleRate;
            const remappedMarkers = remapMarkersReplace(this.props.markers, cutStart, cutEnd, insertLen);
            this.submitNewSamples(newSamples, this.props.sampleRate, false).then(success => {
                if (success) {
                    this.commitMarkers(remappedMarkers);
                    this.setState({
                        trimStart: adjustedTrimStart,
                        trimEnd: adjustedTrimEnd
                    }, this.handlePlay);
                }
            });
        }
    }
    handlePaste () {
        if (!this.state.copyBuffer) return;
        if (this.state.copyBuffer.sampleRate === this.props.sampleRate) {
            this.paste();
        } else {
            this.resampleBufferToRate(this.state.copyBuffer, this.props.sampleRate).then(buffer => {
                this.setState({
                    copyBuffer: buffer
                }, this.paste);
            });
        }
    }
    setRef (element) {
        this.ref = element;
    }
    handleContainerClick (e) {
        // If the click is on the sound editor's div (and not any other element), delesect
        if (e.target === this.ref && this.state.trimStart !== null) {
            this.handleUpdateTrim(null, null);
        }
    }
    getDuration () {
        if (!this.props.samples || !this.props.sampleRate) return 0;
        return this.props.samples.length / this.props.sampleRate;
    }
    handleAddMarker () {
        const duration = this.getDuration();
        // Use the playhead while playing, or the selection start if trimming;
        // otherwise default to the middle of the sound.
        let time;
        let isDefaultPosition = false;
        if (this.state.playhead !== null) {
            time = this.state.playhead * duration;
        } else if (this.state.trimStart !== null) {
            time = this.state.trimStart * duration;
        } else {
            time = duration / 2;
            isDefaultPosition = true;
        }
        // Only nudge to avoid stacking when dropping at the default center spot;
        // an explicit position (playhead while playing, or selection start) is
        // placed exactly as requested. Gap is ~8% of the waveform width, enough
        // to clear a flag's number badge + body.
        if (isDefaultPosition && duration > 0) {
            const minGap = 0.08 * duration;
            const times = (this.props.markers || []).map(m => m.time);
            // Small epsilon avoids a floating-point off-by-one extra nudge.
            const overlaps = t => times.some(existing => Math.abs(existing - t) < minGap - 1e-6);
            let guard = 0;
            while (overlaps(time) && time < duration && guard < 1000) {
                time = Math.min(duration, time + minGap);
                guard++;
            }
        }
        this.props.vm.addSoundMarker(this.props.soundIndex, time);
    }
    handlePlayMarker (time) {
        const duration = this.getDuration();
        const startFraction = duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer.play(
            startFraction,
            1,
            this.handleUpdatePlayhead,
            this.handleStoppedPlaying);
    }
    handleDeleteMarker (broadcastId) {
        this.props.vm.deleteSoundMarker(this.props.soundIndex, broadcastId);
    }
    handleRenameMarker (broadcastId, newName) {
        this.props.vm.renameSoundMarkerBroadcast(broadcastId, newName);
    }
    handleSetMarkerTime (broadcastId, time) {
        this.props.vm.setSoundMarkerTime(this.props.soundIndex, broadcastId, time);
    }
    /**
     * Commit a remapped set of markers (used after destructive edits and undo/redo).
     * Markers may carry an optional `name` so that broadcasts garbage-collected
     * during the edit can be re-created on undo.
     * @param {Array.<object>} markers - the new markers [{time, broadcastId, name?}].
     */
    commitMarkers (markers) {
        this.props.vm.setSoundMarkers(this.props.soundIndex, markers);
    }
    render () {
        const {effectTypes} = AudioEffects;
        return (
            <SoundEditorComponent
                canPaste={this.state.copyBuffer !== null}
                canRedo={this.redoStack.length > 0}
                canUndo={this.undoStack.length > 0}
                chunkLevels={this.state.chunkLevels}
                duration={this.getDuration()}
                markers={this.props.markers}
                name={this.props.name}
                playhead={this.state.playhead}
                setRef={this.setRef}
                tooLoud={this.tooLoud()}
                trimEnd={this.state.trimEnd}
                trimStart={this.state.trimStart}
                onAddMarker={this.handleAddMarker}
                onChangeName={this.handleChangeName}
                onContainerClick={this.handleContainerClick}
                onCopy={this.handleCopy}
                onCopyToNew={this.handleCopyToNew}
                onDelete={this.handleDelete}
                onDeleteMarker={this.handleDeleteMarker}
                onPlayMarker={this.handlePlayMarker}
                onRenameMarker={this.handleRenameMarker}
                onSetMarkerTime={this.handleSetMarkerTime}
                onEcho={this.effectFactory(effectTypes.ECHO)}
                onFadeIn={this.effectFactory(effectTypes.FADEIN)}
                onFadeOut={this.effectFactory(effectTypes.FADEOUT)}
                onFaster={this.effectFactory(effectTypes.FASTER)}
                onLouder={this.effectFactory(effectTypes.LOUDER)}
                onMute={this.effectFactory(effectTypes.MUTE)}
                onPaste={this.handlePaste}
                onPlay={this.handlePlay}
                onRedo={this.handleRedo}
                onReverse={this.effectFactory(effectTypes.REVERSE)}
                onRobot={this.effectFactory(effectTypes.ROBOT)}
                onSetTrim={this.handleUpdateTrim}
                onSlower={this.effectFactory(effectTypes.SLOWER)}
                onSofter={this.effectFactory(effectTypes.SOFTER)}
                onStop={this.handleStopPlaying}
                onUndo={this.handleUndo}
            />
        );
    }
}

SoundEditor.propTypes = {
    isFullScreen: PropTypes.bool,
    markers: PropTypes.arrayOf(PropTypes.shape({
        broadcastId: PropTypes.string,
        name: PropTypes.string,
        time: PropTypes.number
    })),
    name: PropTypes.string.isRequired,
    sampleRate: PropTypes.number,
    samples: PropTypes.instanceOf(Float32Array),
    soundId: PropTypes.string,
    soundIndex: PropTypes.number,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = (state, {soundIndex}) => {
    const sprite = state.scratchGui.vm.editingTarget.sprite;
    // Make sure the sound index doesn't go out of range.
    const index = soundIndex < sprite.sounds.length ? soundIndex : sprite.sounds.length - 1;
    const sound = state.scratchGui.vm.editingTarget.sprite.sounds[index];
    const audioBuffer = state.scratchGui.vm.getSoundBuffer(index);
    // Resolve each marker's broadcast name from the stage's variables.
    const stage = state.scratchGui.vm.runtime.getTargetForStage();
    const markers = (sound?.markers || []).map(marker => {
        const broadcastVar = stage && stage.variables[marker.broadcastId];
        return {
            time: marker.time,
            broadcastId: marker.broadcastId,
            name: broadcastVar ? broadcastVar.name : ''
        };
    });
    return {
        soundId: sound?.soundId,
        sampleRate: audioBuffer?.sampleRate,
        samples: audioBuffer?.getChannelData(0),
        isFullScreen: state.scratchGui.mode.isFullScreen,
        markers,
        name: sound?.name,
        vm: state.scratchGui.vm
    };
};

export default connect(
    mapStateToProps
)(SoundEditor);
