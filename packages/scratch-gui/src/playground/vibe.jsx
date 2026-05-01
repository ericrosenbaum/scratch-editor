// Polyfills
import 'es6-object-assign/auto';
import 'core-js/fn/array/includes';
import 'core-js/fn/promise/finally';
import 'intl'; // For Safari 9

import React from 'react';
import ReactDomClient from 'react-dom/client';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import BrowserModalComponent from '../components/browser-modal/browser-modal.jsx';
import supportedBrowser from '../lib/supported-browser';

import styles from './index.css';

window.__VIBE_MODE__ = true;

const appTarget = document.createElement('div');
appTarget.className = styles.app;
document.body.appendChild(appTarget);

if (supportedBrowser()) {
    require('./render-vibe.jsx').default(appTarget);
} else {
    BrowserModalComponent.setAppElement(appTarget);
    const WrappedBrowserModalComponent = AppStateHOC(BrowserModalComponent, true);
    const handleBack = () => {};
    const root = ReactDomClient.createRoot(appTarget);
    // eslint-disable-next-line react/jsx-no-bind
    root.render(<WrappedBrowserModalComponent onBack={handleBack} />);
}
