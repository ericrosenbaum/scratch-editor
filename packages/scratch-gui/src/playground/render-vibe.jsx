import React from 'react';
import ReactDomClient from 'react-dom/client';
import {compose} from 'redux';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';

const onClickLogo = () => {
    window.location = 'https://scratch.mit.edu';
};

/*
 * Render the GUI playground in "vibe" mode — same editor, but with the
 * VibeChat panel mounted on the right side. The panel reads
 * `window.__VIBE_MODE__` to know it should appear.
 */
export default appTarget => {
    GUI.setAppElement(appTarget);

    const WrappedGui = compose(
        AppStateHOC,
        HashParserHOC
    )(GUI);

    const root = ReactDomClient.createRoot(appTarget);

    root.render(
        <WrappedGui
            canEditTitle
            showComingSoon
            canSave={false}
            onClickLogo={onClickLogo}
            vibeMode
        />
    );
};
