import cookie from 'cookie';

import {DARK_MODE, DEFAULT_MODE, HIGH_CONTRAST_MODE} from '.';

const PREFERS_HIGH_CONTRAST_QUERY = '(prefers-contrast: more)';
// Technically what we are persisting is the color mode, but for historical reasons,
// we should continue using 'scratchtheme' as the cookie key.
const COOKIE_KEY = 'scratchtheme';

const isValidColorMode = colorMode => [DEFAULT_MODE, DARK_MODE, HIGH_CONTRAST_MODE].includes(colorMode);

// Dark is the unconditional default; high-contrast wins when the OS asks for it.
const systemPreferencesColorMode = () => {
    if (window.matchMedia && window.matchMedia(PREFERS_HIGH_CONTRAST_QUERY).matches) return HIGH_CONTRAST_MODE;

    return DARK_MODE;
};

const detectColorMode = () => {
    const obj = cookie.parse(document.cookie) || {};
    const colorModeCookie = obj.scratchtheme;

    const mode = isValidColorMode(colorModeCookie) ? colorModeCookie : systemPreferencesColorMode();

    // Apply the attribute synchronously so dark-mode CSS paints on first frame
    // (before React mounts and the useEffect in gui.jsx runs).
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-colormode', mode);
    }
    return mode;
};

const persistColorMode = mode => {
    if (!isValidColorMode(mode)) {
        throw new Error(`Invalid color mode: ${mode}`);
    }

    if (systemPreferencesColorMode() === mode) {
        // Clear the cookie to represent using the system preferences
        document.cookie = `${COOKIE_KEY}=;path=/`;
        return;
    }

    const expires = new Date(new Date().setYear(new Date().getFullYear() + 1)).toUTCString();
    document.cookie = `${COOKIE_KEY}=${mode};expires=${expires};path=/`;
};

export {
    detectColorMode,
    persistColorMode
};
