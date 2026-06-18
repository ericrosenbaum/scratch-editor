/**
 * @file
 * Utility function to detect tutorial id from query paramenter on the URL.
 */

import tutorials from './libraries/decks/index.jsx';
import {getMicroworld} from './microworlds';
import analytics from './analytics';

/**
 * Get the tutorial id from the given numerical id (representing the
 * url id of the tutorial).
 * @param {number} urlId The URL Id for the tutorial
 * @returns {string} The string id for the tutorial, or null if the URL ID
 * was not found.
 */
const getDeckIdFromUrlId = urlId => {
    for (const deckId in tutorials) {
        if (tutorials[deckId].urlId === urlId) {
            analytics.event({
                category: 'how-to',
                action: 'load from url',
                label: `${deckId}`
            });
            return deckId;
        }
    }
    return null;
};

/**
 * Check if there's a tutorial id provided as a query parameter in the URL.
 * Return the corresponding tutorial id or null if not found.
 * @param {object} queryParams the results of parsing the query string
 * @returns {string} The ID of the requested tutorial or null if no tutorial was
 * requested or found.
 */
const detectTutorialId = queryParams => {
    const tutorialID = Array.isArray(queryParams.tutorial) ?
        queryParams.tutorial[0] :
        queryParams.tutorial;
    if (typeof tutorialID === 'undefined') return null;
    if (tutorialID === 'all') return tutorialID;
    return getDeckIdFromUrlId(tutorialID);
};

/**
 * Check if the mini editor intro wizard is requested via a query parameter in
 * the URL (e.g. `?mini-editor-intro=true`). Returns the `intro` microworld id
 * when enabled, or null otherwise.
 * @param {object} queryParams the results of parsing the query string
 * @returns {?string} the requested microworld id, or null
 */
const detectMicroworldId = queryParams => {
    const value = Array.isArray(queryParams['mini-editor-intro']) ?
        queryParams['mini-editor-intro'][0] :
        queryParams['mini-editor-intro'];
    if (typeof value === 'undefined' || value === 'false') return null;
    return getMicroworld('intro') ? 'intro' : null;
};

export {
    detectTutorialId,
    detectMicroworldId
};
