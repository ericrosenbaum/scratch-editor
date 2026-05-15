import React from 'react';
import PropTypes from 'prop-types';

/**
 * Numeric field used by the song-editor header for BPM and Steps.
 *
 * The displayed input behaves like a text box: clicking puts a caret in it
 * and reveals a horizontal slider underneath. The slider and the input share
 * a local "draft" value while focused; the parent's value is only updated on
 * blur (or Enter) so a stray slider drag doesn't churn React state on every
 * pixel. Escape reverts to the committed value.
 */
class NumericMetaField extends React.Component {
    constructor (props) {
        super(props);
        this.state = {focused: false, draft: ''};
        this._containerRef = React.createRef();
        this.handleInputFocus = this.handleInputFocus.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleSliderChange = this.handleSliderChange.bind(this);
        this.handleInputKeyDown = this.handleInputKeyDown.bind(this);
    }

    _clamp (n) {
        return Math.max(this.props.min, Math.min(this.props.max, n));
    }

    _parsedDraft () {
        const parsed = parseInt(this.state.draft, 10);
        return Number.isFinite(parsed) ? this._clamp(parsed) : this.props.value;
    }

    handleInputFocus () {
        this.setState({focused: true, draft: String(this.props.value)});
    }

    handleBlur (e) {
        // The slider and the input both live in the container. While focus
        // moves between them (or to the slider's drag), we should *not*
        // commit — only on focus leaving the container entirely.
        const newTarget = e.relatedTarget;
        if (newTarget && this._containerRef.current &&
            this._containerRef.current.contains(newTarget)) {
            return;
        }
        this._commit();
    }

    _commit () {
        const next = this._parsedDraft();
        if (next !== this.props.value) {
            this.props.onCommit(next);
        }
        this.setState({focused: false, draft: ''});
    }

    handleInputChange (e) {
        this.setState({draft: e.target.value});
    }

    handleSliderChange (e) {
        this.setState({draft: e.target.value});
    }

    handleInputKeyDown (e) {
        if (e.key === 'Enter') {
            e.target.blur();
        } else if (e.key === 'Escape') {
            this.setState(
                {draft: String(this.props.value)},
                () => e.target.blur()
            );
        }
    }

    render () {
        const {label, value, min, max, sliderStep} = this.props;
        const {focused, draft} = this.state;
        const displayed = focused ? draft : String(value);
        const sliderValue = focused ? this._parsedDraft() : value;
        return (
            <label
                className="song-meta-field song-meta-field-numeric"
                ref={this._containerRef}
            >
                <span className="song-meta-label">{label}</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={displayed}
                    onFocus={this.handleInputFocus}
                    onBlur={this.handleBlur}
                    onChange={this.handleInputChange}
                    onKeyDown={this.handleInputKeyDown}
                    aria-label={label}
                />
                {focused ? (
                    <div className="song-meta-slider-popover">
                        <input
                            className="song-meta-slider"
                            type="range"
                            min={min}
                            max={max}
                            step={sliderStep || 1}
                            value={sliderValue}
                            onChange={this.handleSliderChange}
                            onBlur={this.handleBlur}
                            aria-label={`${label} slider`}
                        />
                        <div className="song-meta-slider-range">
                            <span>{min}</span>
                            <span>{max}</span>
                        </div>
                    </div>
                ) : null}
            </label>
        );
    }
}

NumericMetaField.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    min: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
    sliderStep: PropTypes.number,
    onCommit: PropTypes.func.isRequired
};

export default NumericMetaField;
