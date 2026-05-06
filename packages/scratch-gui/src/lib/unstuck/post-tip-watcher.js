import {summarizeProject, postActionWindow} from './tip-events.js';

const WINDOW_MS = 60000;

const VM_EVENTS = [
    'PROJECT_RUN_START',
    'PROJECT_CHANGED',
    'EXTENSION_ADDED',
    'BLOCK_DRAG_END',
    'targetWasCreated'
];

let active = null;

const stop = () => {
    if (!active) return;
    const w = active;
    active = null;
    if (w.timer) clearTimeout(w.timer);
    if (w.vm) {
        for (const evt of VM_EVENTS) {
            if (w.handlers[evt]) w.vm.removeListener(evt, w.handlers[evt]);
        }
    }
    if (w.unsubscribe) w.unsubscribe();
    const endSnapshot = summarizeProject(w.vm, w.activeTabIndex);
    const projectDelta = (w.startSnapshot && endSnapshot) ? {
        blockCountDelta: endSnapshot.totalBlockCount - w.startSnapshot.totalBlockCount,
        spriteCountDelta: endSnapshot.spriteCount - w.startSnapshot.spriteCount,
        addedExtensions: endSnapshot.extensions.filter(e => !w.startSnapshot.extensions.includes(e))
    } : null;
    postActionWindow({
        tipId: w.tipId,
        trigger: w.trigger,
        windowMs: Date.now() - w.startedAt,
        vmEventCounts: w.counts,
        projectDelta,
        projectSaved: w.projectSaved,
        tutorialAdvanced: w.tutorialAdvanced,
        tutorialClosed: w.tutorialClosed
    });
};

const start = ({tipId, trigger, vm, activeTabIndex}) => {
    if (active) stop();
    if (!vm) return;
    const w = {
        tipId: tipId || null,
        trigger: trigger || 'unknown',
        vm,
        activeTabIndex,
        startedAt: Date.now(),
        startSnapshot: summarizeProject(vm, activeTabIndex),
        counts: VM_EVENTS.reduce((acc, e) => {
            acc[e] = 0;
            return acc;
        }, {}),
        handlers: {},
        projectSaved: false,
        tutorialAdvanced: 0,
        tutorialClosed: false,
        unsubscribe: null,
        timer: null
    };
    for (const evt of VM_EVENTS) {
        const handler = () => {
            w.counts[evt] += 1;
        };
        w.handlers[evt] = handler;
        vm.on(evt, handler);
    }
    if (typeof window !== 'undefined' && window.__scratchStore) {
        const store = window.__scratchStore;
        let lastProjectState = store.getState().scratchGui.projectState;
        let lastCardsState = store.getState().scratchGui.cards;
        w.unsubscribe = store.subscribe(() => {
            const state = store.getState();
            const ps = state.scratchGui.projectState;
            const cs = state.scratchGui.cards;
            if (ps && lastProjectState && ps.loadingState !== lastProjectState.loadingState) {
                const wasUpdating = lastProjectState.loadingState === 'AUTO_UPDATING' ||
                    lastProjectState.loadingState === 'MANUAL_UPDATING';
                const nowSettled = ps.loadingState === 'SHOWING_WITH_ID';
                if (wasUpdating && nowSettled) w.projectSaved = true;
            }
            if (cs && lastCardsState) {
                if (cs.activeDeckId && cs.step !== lastCardsState.step) w.tutorialAdvanced += 1;
                if (lastCardsState.visible && !cs.visible) w.tutorialClosed = true;
            }
            lastProjectState = ps;
            lastCardsState = cs;
        });
    }
    w.timer = setTimeout(stop, WINDOW_MS);
    active = w;
};

export {start, stop};
