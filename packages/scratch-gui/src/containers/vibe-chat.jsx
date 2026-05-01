import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import VibeChatComponent from '../components/vibe-chat/vibe-chat.jsx';
import {
    appendTurn,
    updateTurn,
    setVibeStatus,
    setVibeSession,
    hydrateVibeChat,
    markReverted
} from '../reducers/vibe-chat';
import {postPrompt, revertTurn, getHistory, openEventStream} from '../lib/vibe-chat-client';

const STORAGE_KEY = 'vibe:chat:v1';

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveToStorage(state) {
    try {
        const trimmed = {
            sessionId: state.sessionId,
            status: state.status,
            turns: state.turns.slice(-200)
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {/* quota or private mode */}
}

class VibeChat extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, ['handleSend', 'handleRevert']);
        this.eventSource = null;
        this.busy = false;
    }
    componentDidMount() {
        const saved = loadFromStorage();
        if (saved) {
            this.props.onHydrate(saved);
            if (saved.sessionId) this.openStream(saved.sessionId);
            // Best-effort reconciliation with server-side history.
            getHistory(saved.sessionId).then(server => {
                if (server && server.turns) {
                    this.props.onHydrate({
                        sessionId: saved.sessionId,
                        status: saved.status || 'idle',
                        turns: server.turns
                    });
                }
            }).catch(() => {});
        }
    }
    componentDidUpdate(prevProps) {
        if (prevProps !== this.props) {
            saveToStorage({
                sessionId: this.props.sessionId,
                status: this.props.status,
                turns: this.props.turns
            });
        }
    }
    componentWillUnmount() {
        if (this.eventSource) this.eventSource.close();
    }
    openStream(sessionId) {
        if (this.eventSource) this.eventSource.close();
        this.eventSource = openEventStream(sessionId, {
            rebuild: data => {
                if (data.phase === 'start') {
                    this.props.onSetStatus('rebuilding', `${data.workspace}`);
                } else if (data.phase === 'done') {
                    this.props.onSetStatus('applied');
                } else if (data.phase === 'failed') {
                    this.props.onSetStatus('error', `rebuild failed: ${data.workspace}`);
                }
            }
        });
    }
    async handleSend(prompt) {
        if (this.busy) return;
        this.busy = true;
        const sessionId = this.props.sessionId;
        let turnId = null;
        const toolCalls = [];

        this.props.onSetStatus('thinking');

        try {
            await postPrompt(
                {sessionId, prompt},
                {
                    session: data => {
                        if (!this.props.sessionId) {
                            this.props.onSetSession(data.sessionId);
                            this.openStream(data.sessionId);
                        }
                    },
                    'turn-start': data => {
                        turnId = data.turnId;
                        this.props.onAppendTurn({
                            turnId,
                            prompt,
                            createdAt: Date.now(),
                            status: 'in-flight',
                            toolCalls: [],
                            editedFiles: []
                        });
                    },
                    'tool-call': data => {
                        this.props.onSetStatus(
                            data.name === 'edit_file' || data.name === 'create_file' ?
                                'editing' :
                                'thinking',
                            `${data.name}`
                        );
                        toolCalls.push({
                            name: data.name,
                            path: data.input?.path || data.input?.pattern || '',
                            ok: true
                        });
                        this.props.onUpdateTurn(turnId, {toolCalls: [...toolCalls]});
                    },
                    'tool-result': data => {
                        const last = toolCalls[toolCalls.length - 1];
                        if (last && last.name === data.name) {
                            last.ok = data.ok;
                            this.props.onUpdateTurn(turnId, {toolCalls: [...toolCalls]});
                        }
                    },
                    assistant: data => {
                        const turn = this.props.turns.find(t => t.turnId === turnId);
                        const prevText = turn?.assistantText || '';
                        this.props.onUpdateTurn(turnId, {
                            assistantText: prevText + data.delta
                        });
                    },
                    'edit-applied': data => {
                        this.props.onUpdateTurn(turnId, {editedFiles: data.files});
                        this.props.onSetStatus('applied', `${data.files.length} file(s)`);
                    },
                    'rebuild-scheduled': data => {
                        this.props.onSetStatus('rebuilding', data.workspaces.join(', '));
                    },
                    done: () => {
                        this.props.onUpdateTurn(turnId, {status: 'done'});
                    },
                    error: data => {
                        if (turnId) {
                            this.props.onUpdateTurn(turnId, {
                                status: 'failed',
                                error: data.message
                            });
                        }
                        this.props.onSetStatus('error', data.message);
                    }
                }
            );
        } catch (err) {
            if (turnId) {
                this.props.onUpdateTurn(turnId, {status: 'failed', error: err.message});
            }
            this.props.onSetStatus('error', err.message);
        } finally {
            this.busy = false;
        }
    }
    async handleRevert(turnId, force = false) {
        try {
            const result = await revertTurn({
                sessionId: this.props.sessionId,
                turnId,
                force
            });
            if (result.diverged && result.diverged.length > 0 && !force) {
                this.props.onUpdateTurn(turnId, {divergedFiles: result.diverged});
            } else {
                this.props.onMarkReverted(turnId, result.diverged || []);
                this.props.onSetStatus('idle');
            }
        } catch (err) {
            this.props.onSetStatus('error', err.message);
        }
    }
    render() {
        return (
            <VibeChatComponent
                turns={this.props.turns}
                status={this.props.status}
                statusDetail={this.props.statusDetail}
                busy={['thinking', 'editing', 'rebuilding'].includes(this.props.status)}
                onSend={this.handleSend}
                onRevert={this.handleRevert}
            />
        );
    }
}

VibeChat.propTypes = {
    sessionId: PropTypes.string,
    status: PropTypes.string.isRequired,
    statusDetail: PropTypes.string,
    turns: PropTypes.array.isRequired,
    onAppendTurn: PropTypes.func.isRequired,
    onUpdateTurn: PropTypes.func.isRequired,
    onSetStatus: PropTypes.func.isRequired,
    onSetSession: PropTypes.func.isRequired,
    onHydrate: PropTypes.func.isRequired,
    onMarkReverted: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    sessionId: state.scratchGui.vibeChat.sessionId,
    status: state.scratchGui.vibeChat.status,
    statusDetail: state.scratchGui.vibeChat.statusDetail,
    turns: state.scratchGui.vibeChat.turns
});

const mapDispatchToProps = dispatch => ({
    onAppendTurn: turn => dispatch(appendTurn(turn)),
    onUpdateTurn: (turnId, patch) => dispatch(updateTurn(turnId, patch)),
    onSetStatus: (status, detail) => dispatch(setVibeStatus(status, detail)),
    onSetSession: sessionId => dispatch(setVibeSession(sessionId)),
    onHydrate: payload => dispatch(hydrateVibeChat(payload)),
    onMarkReverted: (turnId, divergedFiles) => dispatch(markReverted(turnId, divergedFiles))
});

export default connect(mapStateToProps, mapDispatchToProps)(VibeChat);
