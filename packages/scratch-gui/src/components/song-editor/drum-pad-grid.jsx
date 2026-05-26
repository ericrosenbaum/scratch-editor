import React from 'react';
import PropTypes from 'prop-types';

import {DRUM_NAMES} from '../../lib/song-defaults.js';
import {drumKeyLabel} from './key-mapping.js';

class DrumPadGrid extends React.Component {
    constructor (props) {
        super(props);
        this.handleDown = this.handleDown.bind(this);
        this.handleUp = this.handleUp.bind(this);
        this.handleLeave = this.handleLeave.bind(this);
    }

    handleDown (e) {
        e.preventDefault();
        const drum = Number(e.currentTarget.getAttribute('data-drum'));
        this.props.onLaneDown(drum);
    }

    handleUp (e) {
        e.preventDefault();
        const drum = Number(e.currentTarget.getAttribute('data-drum'));
        this.props.onLaneUp(drum);
    }

    handleLeave (e) {
        if (e.buttons === 0) return;
        const drum = Number(e.currentTarget.getAttribute('data-drum'));
        this.props.onLaneUp(drum);
    }

    render () {
        const {lanes, heldLanes} = this.props;
        return (
            <div className="kbe-pad-grid">
                {lanes.map((drum, idx) => {
                    const name = DRUM_NAMES[drum - 1] || `Drum ${drum}`;
                    const label = drumKeyLabel(idx).toUpperCase();
                    const held = heldLanes && heldLanes.has(drum);
                    return (
                        <div
                            key={`${drum}-${idx}`}
                            className={`kbe-pad ${held ? 'held' : ''}`}
                            data-drum={drum}
                            onMouseDown={this.handleDown}
                            onMouseUp={this.handleUp}
                            onMouseLeave={this.handleLeave}
                        >
                            <div className="kbe-pad-name">{name}</div>
                            {label ? (
                                <div className="kbe-pad-char">{label}</div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        );
    }
}

DrumPadGrid.propTypes = {
    lanes: PropTypes.arrayOf(PropTypes.number).isRequired,
    heldLanes: PropTypes.instanceOf(Set),
    onLaneDown: PropTypes.func.isRequired,
    onLaneUp: PropTypes.func.isRequired
};

export default DrumPadGrid;
