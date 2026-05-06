import {track} from './analytics-client.js';
import extractProjectContext from './context-extractor.js';

const APP_VERSION = (typeof process !== 'undefined' && process.env && process.env.npm_package_version) || 'unknown';

const cardSession = {
    openedAt: 0,
    tipsViewed: 0,
    tipsAddedToProject: 0
};

const trackedDecks = new Map();
let storeUnsubscribe = null;
let lastCardsState = null;

const summarizeProject = (vm, activeTabIndex) => {
    if (!vm || !vm.runtime) return null;
    try {
        const ctx = extractProjectContext(vm, activeTabIndex);
        return {
            spriteCount: ctx.sprites ? ctx.sprites.length : 0,
            totalBlockCount: ctx.totalBlockCount,
            extensions: ctx.extensions,
            activeTab: ctx.activeTab,
            editingTarget: ctx.editingTarget,
            hasVariables: ctx.hasVariables,
            hasLists: ctx.hasLists,
            hatOpcodes: (ctx.sprites || []).reduce((acc, s) => acc.concat(s.hatOpcodes || []), [])
        };
    } catch (_e) {
        return null;
    }
};

const baseProps = extra => Object.assign({appVersion: APP_VERSION}, extra || {});

const ensureStoreSubscription = () => {
    if (storeUnsubscribe || typeof window === 'undefined' || !window.__scratchStore) return;
    const store = window.__scratchStore;
    lastCardsState = store.getState().scratchGui && store.getState().scratchGui.cards;
    storeUnsubscribe = store.subscribe(() => {
        if (trackedDecks.size === 0) return;
        const state = store.getState();
        const cards = state.scratchGui && state.scratchGui.cards;
        if (!cards || cards === lastCardsState) return;
        const prev = lastCardsState || {};
        const trackedDeckId = cards.activeDeckId && trackedDecks.has(cards.activeDeckId) ?
            cards.activeDeckId :
            (prev.activeDeckId && trackedDecks.has(prev.activeDeckId) ? prev.activeDeckId : null);
        if (trackedDeckId) {
            const meta = trackedDecks.get(trackedDeckId);
            if (cards.activeDeckId === trackedDeckId && cards.step !== prev.step) {
                track('tip_tutorial_step', baseProps({
                    tipId: meta.tipId,
                    deckId: trackedDeckId,
                    step: cards.step,
                    direction: cards.step > prev.step ? 'next' : 'prev'
                }));
            }
            const closed = prev.activeDeckId === trackedDeckId &&
                (cards.activeDeckId !== trackedDeckId || !cards.visible);
            if (closed) {
                track('tip_tutorial_closed', baseProps({
                    tipId: meta.tipId,
                    deckId: trackedDeckId,
                    lastStep: prev.step,
                    dwellMs: Date.now() - meta.openedAt
                }));
                trackedDecks.delete(trackedDeckId);
            }
        }
        lastCardsState = cards;
    });
};

const cardOpened = (vm, activeTabIndex, modelReady) => {
    cardSession.openedAt = Date.now();
    cardSession.tipsViewed = 0;
    cardSession.tipsAddedToProject = 0;
    track('tip_card_opened', baseProps({
        projectSnapshot: summarizeProject(vm, activeTabIndex),
        modelReady: !!modelReady
    }));
};

const cardClosed = () => {
    track('tip_card_closed', baseProps({
        durationMs: cardSession.openedAt ? Date.now() - cardSession.openedAt : 0,
        tipsViewed: cardSession.tipsViewed,
        tipsAddedToProject: cardSession.tipsAddedToProject
    }));
    cardSession.openedAt = 0;
};

const querySubmitted = (query, source) => {
    track('tip_query_submitted', baseProps({
        query,
        queryLen: query ? query.length : 0,
        source
    }));
};

const resultsReturned = (query, results, latencyMs) => {
    track('tip_results_returned', baseProps({
        query,
        resultIds: (results || []).map(r => r.tipId),
        scores: (results || []).map(r => Number(r.score && r.score.toFixed ? r.score.toFixed(3) : r.score)),
        resultCount: (results || []).length,
        latencyMs
    }));
};

const voiceStarted = () => track('tip_voice_started', baseProps());
const voiceCompleted = transcript => track('tip_voice_completed', baseProps({transcript}));
const voiceAborted = reason => track('tip_voice_aborted', baseProps({reason: reason || 'unknown'}));

const resultClicked = (tipId, position, source) => {
    cardSession.tipsViewed += 1;
    track('tip_result_clicked', baseProps({tipId, position, source}));
};

const browseOpened = () => track('tip_browse_opened', baseProps());
const browseFilter = tag => track('tip_browse_filter', baseProps({tag}));

const showMeClicked = (tipId, pointerIndex, pointerLabel) => {
    track('tip_show_me_clicked', baseProps({tipId, pointerIndex, pointerLabel}));
};

const codeExpanded = tipId => track('tip_code_expanded', baseProps({tipId}));

const addToProject = (tipId, blocks) => {
    cardSession.tipsAddedToProject += 1;
    track('tip_add_to_project', baseProps({
        tipId,
        blockCount: blocks ? blocks.length : 0,
        opcodes: (blocks || []).map(b => b.opcode)
    }));
};

const starterLinkClicked = (tipId, projectUrl) => {
    track('tip_starter_link_clicked', baseProps({tipId, projectUrl}));
};

const tutorialOpened = (tipId, deckId) => {
    ensureStoreSubscription();
    trackedDecks.set(deckId, {tipId, openedAt: Date.now()});
    if (typeof window !== 'undefined' && window.__scratchStore) {
        lastCardsState = window.__scratchStore.getState().scratchGui.cards;
    }
    track('tip_tutorial_opened', baseProps({tipId, deckId}));
};

const postActionWindow = payload => {
    track('tip_postaction_window', baseProps(payload));
};

export {
    summarizeProject,
    cardOpened,
    cardClosed,
    querySubmitted,
    resultsReturned,
    voiceStarted,
    voiceCompleted,
    voiceAborted,
    resultClicked,
    browseOpened,
    browseFilter,
    showMeClicked,
    codeExpanded,
    addToProject,
    starterLinkClicked,
    tutorialOpened,
    postActionWindow
};
