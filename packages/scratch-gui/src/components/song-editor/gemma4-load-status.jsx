import PropTypes from 'prop-types';
import React, {useEffect, useState} from 'react';

import {getGemma4LoadStatus, subscribeGemma4LoadStatus} from '../../lib/song-ai.js';

const formatMb = bytes => `${(bytes / 1e6).toFixed(0)} MB`;

const statusLine = status => {
    if (!status) return null;
    if (status.phase === 'downloading') {
        if (status.total > 0) {
            const pct = Math.round((status.received / status.total) * 100);
            return `Downloading Gemma 4… ${formatMb(status.received)} / ${formatMb(status.total)} (${pct}%)`;
        }
        return `Downloading Gemma 4… ${formatMb(status.received)}`;
    }
    if (status.phase === 'loading') return 'Loading Gemma 4 into memory…';
    if (status.phase === 'error') return `Could not load Gemma 4: ${status.error}`;
    return null;
};

const Gemma4LoadStatus = ({providerId}) => {
    const [status, setStatus] = useState(getGemma4LoadStatus());
    useEffect(() => subscribeGemma4LoadStatus(setStatus), []);
    if (providerId !== 'gemma4') return null;
    if (!status || status.phase === 'idle' || status.phase === 'ready') return null;

    const text = statusLine(status);
    const determinate = status.phase === 'downloading' && status.total > 0;
    const pct = determinate ? Math.round((status.received / status.total) * 100) : null;
    const isError = status.phase === 'error';

    return (
        <div className={`ai-song-modal-gemma-load${isError ? ' ai-song-modal-gemma-load-error' : ''}`}>
            <div className="ai-song-modal-gemma-bar">
                <div
                    className={determinate ?
                        'ai-song-modal-gemma-bar-fill' :
                        'ai-song-modal-gemma-bar-fill ai-song-modal-gemma-bar-indeterminate'}
                    style={determinate ? {width: `${pct}%`} : null}
                />
            </div>
            <div className="ai-song-modal-gemma-status">{text}</div>
        </div>
    );
};

Gemma4LoadStatus.propTypes = {
    providerId: PropTypes.string
};

export default Gemma4LoadStatus;
