import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';

import FlagMarkersComponent from '../components/sound-editor/flag-markers.jsx';
import {getEventXY} from '../lib/touch-utils';
import DragRecognizer from '../lib/drag-recognizer';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class FlagMarkers extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleMarkerMouseDown',
            'handleMarkerMouseMove',
            'handleMarkerMouseUp',
            'handleDocumentMouseDown',
            'storeRef'
        ]);

        this.state = {
            selectedId: null,
            // While dragging, holds {broadcastId, time} so the marker tracks the
            // pointer smoothly before the new time is committed to the VM.
            dragMarker: null
        };

        this.dragRecognizer = new DragRecognizer({
            onDrag: this.handleMarkerMouseMove,
            onDragEnd: this.handleMarkerMouseUp,
            touchDragAngle: 90,
            distanceThreshold: 0
        });
    }
    componentDidMount () {
        document.addEventListener('mousedown', this.handleDocumentMouseDown);
        document.addEventListener('touchstart', this.handleDocumentMouseDown);
    }
    componentWillReceiveProps () {
        // Once the committed marker position has propagated back through props,
        // drop the drag overlay (only when a drag isn't actively in progress).
        if (this.draggingId === null && this.state.dragMarker !== null) {
            this.setState({dragMarker: null});
        }
    }
    componentWillUnmount () {
        document.removeEventListener('mousedown', this.handleDocumentMouseDown);
        document.removeEventListener('touchstart', this.handleDocumentMouseDown);
    }
    handleDocumentMouseDown (e) {
        if (this.state.selectedId === null) return;
        // Deselect when the click is not on a flag handle or its popover.
        if (this.rootElement && this.rootElement.contains(e.target)) return;
        this.setState({selectedId: null});
    }
    handleMarkerMouseDown (broadcastId, e) {
        const marker = this.props.markers.find(m => m.broadcastId === broadcastId);
        if (!marker) return;
        this.containerSize = this.rootElement.getBoundingClientRect().width;
        this.draggingId = broadcastId;
        this.initialTime = marker.time;
        this.initialX = getEventXY(e).x;
        this.dragMoved = false;
        this.currentTime = marker.time;
        this.dragRecognizer.start(e);
        e.stopPropagation();
        e.preventDefault();
    }
    handleMarkerMouseMove (currentOffset, initialOffset) {
        const dx = (currentOffset.x - initialOffset.x) / this.containerSize;
        if (Math.abs(currentOffset.x - this.initialX) > 2) {
            this.dragMoved = true;
        }
        this.currentTime = clamp(this.initialTime + (dx * this.props.duration), 0, this.props.duration);
        this.setState({dragMarker: {broadcastId: this.draggingId, time: this.currentTime}});
    }
    handleMarkerMouseUp () {
        const draggingId = this.draggingId;
        this.draggingId = null;
        if (this.dragMoved) {
            // Keep the overlay pinned to the committed position; componentWillReceiveProps
            // clears it once the new time round-trips through props (avoids a snap-back).
            this.setState({dragMarker: {broadcastId: draggingId, time: this.currentTime}});
            this.props.onSetMarkerTime(draggingId, this.currentTime);
        } else {
            // Treat a click without movement as a select toggle.
            this.setState(state => ({
                dragMarker: null,
                selectedId: state.selectedId === draggingId ? null : draggingId
            }));
        }
    }
    storeRef (el) {
        this.rootElement = el;
    }
    render () {
        const {dragMarker, selectedId} = this.state;
        // Overlay the live drag position on top of the committed markers.
        const effective = this.props.markers.map(marker => (
            dragMarker && dragMarker.broadcastId === marker.broadcastId ?
                {...marker, time: dragMarker.time} :
                marker
        ));
        // Assign sequential numbers by time order, updating live while dragging.
        const numberById = {};
        effective.slice()
            .sort((a, b) => a.time - b.time)
            .forEach((marker, i) => {
                numberById[marker.broadcastId] = i + 1;
            });
        const markers = effective.map(marker => ({...marker, number: numberById[marker.broadcastId]}));
        return (
            <FlagMarkersComponent
                broadcastLabel={this.props.broadcastLabel}
                deleteLabel={this.props.deleteLabel}
                duration={this.props.duration}
                markers={markers}
                playLabel={this.props.playLabel}
                playing={this.props.playing}
                rootRef={this.storeRef}
                selectedId={selectedId}
                stopLabel={this.props.stopLabel}
                onDeleteMarker={this.props.onDeleteMarker}
                onMarkerMouseDown={this.handleMarkerMouseDown}
                onPlayMarker={this.props.onPlayMarker}
                onRenameMarker={this.props.onRenameMarker}
                onStopMarker={this.props.onStopMarker}
            />
        );
    }
}

FlagMarkers.propTypes = {
    broadcastLabel: PropTypes.string,
    deleteLabel: PropTypes.string,
    duration: PropTypes.number,
    markers: PropTypes.arrayOf(PropTypes.shape({
        broadcastId: PropTypes.string,
        name: PropTypes.string,
        time: PropTypes.number
    })),
    onDeleteMarker: PropTypes.func,
    onPlayMarker: PropTypes.func,
    onRenameMarker: PropTypes.func,
    onSetMarkerTime: PropTypes.func,
    onStopMarker: PropTypes.func,
    playLabel: PropTypes.string,
    playing: PropTypes.bool,
    stopLabel: PropTypes.string
};

export default FlagMarkers;
