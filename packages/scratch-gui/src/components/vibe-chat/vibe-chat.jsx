import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './vibe-chat.css';

const STATUS_LABELS = {
    idle: 'idle',
    thinking: 'thinking…',
    editing: 'editing…',
    rebuilding: 'rebuilding…',
    applied: 'applied',
    error: 'error'
};

const STATUS_CLASSES = {
    thinking: styles.vibeStatusThinking,
    editing: styles.vibeStatusEditing,
    rebuilding: styles.vibeStatusRebuilding,
    applied: styles.vibeStatusApplied,
    error: styles.vibeStatusError
};

class VibeChatComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {input: ''};
        this.handleInput = this.handleInput.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.scrollRef = React.createRef();
    }
    componentDidUpdate() {
        const el = this.scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }
    handleInput(e) {
        this.setState({input: e.target.value});
    }
    handleKeyDown(e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            this.handleSubmit();
        }
    }
    handleSubmit() {
        const text = this.state.input.trim();
        if (!text || this.props.busy) return;
        this.props.onSend(text);
        this.setState({input: ''});
    }
    renderTurn(turn) {
        const status = turn.status || 'pending';
        const isInFlight = status === 'in-flight' || status === 'pending';
        return (
            <div key={turn.turnId} className={styles.vibeTurn}>
                <div className={styles.vibeTurnUser}>{turn.prompt}</div>
                {turn.toolCalls && turn.toolCalls.length > 0 ? (
                    <ul className={styles.vibeToolList}>
                        {turn.toolCalls.map((tc, i) => (
                            <li
                                key={i}
                                className={classNames(
                                    styles.vibeToolItem,
                                    !tc.ok && styles.vibeToolItemError
                                )}
                            >
                                {tc.name}({tc.path || ''}){!tc.ok ? ' ✗' : ''}
                            </li>
                        ))}
                    </ul>
                ) : null}
                {turn.assistantText ? (
                    <div className={styles.vibeTurnAssistant}>{turn.assistantText}</div>
                ) : null}
                {turn.editedFiles && turn.editedFiles.length > 0 ? (
                    <div className={styles.vibeEdited}>
                        Edited: {turn.editedFiles.join(', ')}
                    </div>
                ) : null}
                {turn.error ? (
                    <div className={styles.vibeTurnAssistant} style={{color: '#c00'}}>
                        Error: {turn.error}
                    </div>
                ) : null}
                {turn.editedFiles && turn.editedFiles.length > 0 && !isInFlight ? (
                    turn.reverted ? (
                        <span className={styles.vibeRevertedTag}>reverted</span>
                    ) : (
                        <button
                            className={styles.vibeRevertBtn}
                            onClick={() => this.props.onRevert(turn.turnId)}
                            type="button"
                        >
                            undo this
                        </button>
                    )
                ) : null}
                {turn.divergedFiles && turn.divergedFiles.length > 0 ? (
                    <div className={styles.vibeEdited} style={{color: '#c80'}}>
                        Files changed since: {turn.divergedFiles.join(', ')} —{' '}
                        <button
                            className={styles.vibeRevertBtn}
                            onClick={() => this.props.onRevert(turn.turnId, true)}
                            type="button"
                        >
                            force undo
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }
    render() {
        const {turns, status, statusDetail, busy} = this.props;
        return (
            <div className={styles.vibePanel}>
                <div className={styles.vibeHeader}>
                    <span>Vibe Chat</span>
                    <span
                        className={classNames(
                            styles.vibeStatus,
                            STATUS_CLASSES[status]
                        )}
                        title={statusDetail || ''}
                    >
                        {STATUS_LABELS[status] || status}
                    </span>
                </div>
                <div className={styles.vibeTurns} ref={this.scrollRef}>
                    {turns.length === 0 ? (
                        <div className={styles.vibeEmpty}>
                            Type a prompt to modify the editor.
                            <ul className={styles.vibeEmptyExamples}>
                                <li>"make the green flag bigger"</li>
                                <li>"change the stage background to pink"</li>
                                <li>"add a spiral motion block to the VM"</li>
                            </ul>
                        </div>
                    ) : (
                        turns.map(t => this.renderTurn(t))
                    )}
                </div>
                <div className={styles.vibeInputRow}>
                    <textarea
                        className={styles.vibeTextarea}
                        placeholder="Describe a change… (Cmd/Ctrl+Enter)"
                        value={this.state.input}
                        onChange={this.handleInput}
                        onKeyDown={this.handleKeyDown}
                        disabled={busy}
                    />
                    <button
                        className={styles.vibeSendBtn}
                        onClick={this.handleSubmit}
                        disabled={busy || this.state.input.trim().length === 0}
                        type="button"
                    >
                        Send
                    </button>
                </div>
            </div>
        );
    }
}

VibeChatComponent.propTypes = {
    turns: PropTypes.array.isRequired,
    status: PropTypes.string.isRequired,
    statusDetail: PropTypes.string,
    busy: PropTypes.bool,
    onSend: PropTypes.func.isRequired,
    onRevert: PropTypes.func.isRequired
};

VibeChatComponent.defaultProps = {
    busy: false,
    statusDetail: null
};

export default VibeChatComponent;
