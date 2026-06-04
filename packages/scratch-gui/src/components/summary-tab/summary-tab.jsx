import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import styles from './summary-tab.css';
import getCostumeUrl from '../../lib/get-costume-url';
import projectToText from '../../lib/project-to-text';
import {buildStacksPrompt, buildSpritePrompt, buildProjectPrompt} from '../../lib/summary-prompt';
import * as aiModelService from '../../lib/ai-model-service';

// Keep each model call small. A single stack is truncated to this many chars,
// and stacks are grouped into batches up to the character budget / count below.
const MAX_STACK_CHARS = 1200;
const BATCH_CHAR_BUDGET = 1800;
const MAX_STACKS_PER_BATCH = 5;

// Per-sprite summary status.
const STATUS = {
    NONE: 'none', // never generated
    GENERATING: 'generating',
    DONE: 'done',
    STALE: 'stale' // the sprite changed since it was last summarized
};

// Group a sprite's stacks into batches that stay within the context budget.
const batchStacks = stacks => {
    const batches = [];
    let current = [];
    let length = 0;
    for (const stack of stacks) {
        const text = stack.text.slice(0, MAX_STACK_CHARS);
        if (current.length && (length + text.length > BATCH_CHAR_BUDGET || current.length >= MAX_STACKS_PER_BATCH)) {
            batches.push(current);
            current = [];
            length = 0;
        }
        current.push({event: stack.event, text});
        length += text.length;
    }
    if (current.length) batches.push(current);
    return batches;
};

// A fingerprint of a target's scripts, used to detect when a sprite has changed.
const fingerprintTarget = target => JSON.stringify(target.stacks);

// Extract a single JSON object from a model response, repairing common
// small-model mistakes (extra/missing trailing braces).
const extractObject = text => {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON object found in response');
    const jsonStr = text.slice(first, last + 1);

    try {
        return JSON.parse(jsonStr);
    } catch (_) { /* try repairs */ }
    try {
        return JSON.parse(jsonStr.replace(/\}{3,}/g, '}}'));
    } catch (_) { /* keep trying */ }
    for (let trim = 1; trim <= 5; trim++) {
        try {
            return JSON.parse(jsonStr.slice(0, -trim));
        } catch (_) { /* keep trying */ }
    }
    for (let add = 1; add <= 3; add++) {
        try {
            return JSON.parse(jsonStr + '}'.repeat(add));
        } catch (_) { /* keep trying */ }
    }
    return JSON.parse(jsonStr); // throw the original error
};

function SummaryTab ({dispatch, vm, sprites, stage, editingTarget, projectTitle, aiModelStatus}) {
    // Per-sprite summaries keyed by sprite name (names are unique in Scratch and
    // match what projectToText emits). Each value: {name, status, description, stacks, fingerprint}.
    const [summaries, setSummaries] = useState({});
    const [projectDescription, setProjectDescription] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(new Set()); // expanded sprite names
    const spriteRefs = useRef({}); // keyed by target id
    const staleTimer = useRef(null);

    const getThumbnailUrl = target => {
        const storage = vm && vm.runtime && vm.runtime.storage;
        if (storage && target && target.costume && target.costume.asset) {
            return getCostumeUrl(storage, target.costume.asset);
        }
        return null;
    };

    // Clear all summaries when a new project is loaded, so nothing is out of sync.
    useEffect(() => {
        if (!vm) return () => {};
        const runtime = vm.runtime;
        const handleLoaded = () => {
            setSummaries({});
            setProjectDescription('');
            setStatusMessage('');
            setExpanded(new Set());
        };
        runtime.on('PROJECT_LOADED', handleLoaded);
        return () => runtime.removeListener('PROJECT_LOADED', handleLoaded);
    }, [vm]);

    // When the project changes, mark any sprite whose scripts changed as stale.
    useEffect(() => {
        if (!vm) return () => {};
        const handleChanged = () => {
            if (staleTimer.current) clearTimeout(staleTimer.current);
            staleTimer.current = setTimeout(() => {
                let targets;
                try {
                    targets = projectToText(vm.toJSON());
                } catch (err) {
                    return;
                }
                const fpByName = {};
                targets.forEach(t => {
                    fpByName[t.name] = fingerprintTarget(t);
                });
                setSummaries(prev => {
                    let changed = false;
                    const next = {...prev};
                    Object.keys(prev).forEach(name => {
                        const s = prev[name];
                        if (s.status === STATUS.DONE &&
                            typeof fpByName[name] !== 'undefined' &&
                            fpByName[name] !== s.fingerprint) {
                            next[name] = {...s, status: STATUS.STALE};
                            changed = true;
                        }
                    });
                    return changed ? next : prev;
                });
            }, 800);
        };
        vm.on('PROJECT_CHANGED', handleChanged);
        return () => {
            vm.removeListener('PROJECT_CHANGED', handleChanged);
            if (staleTimer.current) clearTimeout(staleTimer.current);
        };
    }, [vm]);

    // Scroll the currently-edited sprite into view.
    useEffect(() => {
        if (editingTarget && spriteRefs.current[editingTarget]) {
            spriteRefs.current[editingTarget].scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
    }, [editingTarget]);

    const toggleExpand = name => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const ensureModel = async () => {
        setStatusMessage('Preparing AI model…');
        await aiModelService.init(dispatch);
        if (!aiModelService.isLoaded()) {
            setStatusMessage(
                aiModelService.getStatus() === 'unavailable' ?
                    'The on-device AI model is unavailable (a WebGPU-capable browser is required).' :
                    'The AI model could not be loaded.'
            );
            return false;
        }
        return true;
    };

    // Summarize one target (from projectToText) in bounded chunks, updating state live.
    const summarizeTarget = async target => {
        const stackSummaries = [];
        const batches = batchStacks(target.stacks);
        for (let bi = 0; bi < batches.length; bi++) {
            const batch = batches[bi];
            setStatusMessage(
                `Summarizing ${target.name} — ` +
                `scripts ${stackSummaries.length + 1}-${stackSummaries.length + batch.length}…`
            );
            const byN = {};
            try {
                const response = await aiModelService.generate(buildStacksPrompt(target.name, batch));
                const parsed = extractObject(response);
                if (parsed && Array.isArray(parsed.stacks)) {
                    parsed.stacks.forEach((s, idx) => {
                        const n = Number(s && s.n);
                        byN[Number.isNaN(n) ? idx + 1 : n] = (s && s.description) || '';
                    });
                }
            } catch (err) {
                // Leave this batch's descriptions blank on failure.
            }
            batch.forEach((stack, j) => {
                stackSummaries.push({event: stack.event, description: byN[j + 1] || ''});
            });
            setSummaries(prev => ({
                ...prev,
                [target.name]: {
                    name: target.name,
                    status: STATUS.GENERATING,
                    description: (prev[target.name] && prev[target.name].description) || '',
                    stacks: [...stackSummaries],
                    fingerprint: ''
                }
            }));
        }

        let description = '';
        try {
            const response = await aiModelService.generate(buildSpritePrompt(target.name, stackSummaries));
            description = extractObject(response).description || '';
        } catch (err) {
            // Leave the sprite description blank on failure.
        }

        setSummaries(prev => ({
            ...prev,
            [target.name]: {
                name: target.name,
                status: STATUS.DONE,
                description,
                stacks: stackSummaries,
                fingerprint: fingerprintTarget(target)
            }
        }));
        return {name: target.name, description};
    };

    // Generate the summary for a single sprite (from its row button).
    const generateOne = async name => {
        if (busy || !vm) return;
        setBusy(true);
        try {
            if (!(await ensureModel())) return;
            const targets = projectToText(vm.toJSON());
            const target = targets.find(t => t.name === name);
            if (!target) return;
            await summarizeTarget(target);
            setStatusMessage('');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to generate sprite summary:', err);
            setStatusMessage(`Failed to generate summary: ${err.message}`);
        } finally {
            setBusy(false);
        }
    };

    // Generate the whole project: every sprite, then the project-level description.
    const generateAll = async () => {
        if (busy || !vm) return;
        setBusy(true);
        try {
            if (!(await ensureModel())) return;
            const targets = projectToText(vm.toJSON());
            const current = summaries; // snapshot: keep sprites that are already up to date
            const spriteSummaries = [];
            for (const target of targets) {
                const existing = current[target.name];
                if (existing && existing.status === STATUS.DONE) {
                    spriteSummaries.push({name: target.name, description: existing.description});
                } else {
                    const result = await summarizeTarget(target);
                    spriteSummaries.push(result);
                }
            }
            setStatusMessage('Summarizing the project…');
            try {
                const response = await aiModelService.generate(buildProjectPrompt(spriteSummaries));
                setProjectDescription(extractObject(response).description || '');
            } catch (err) {
                // Leave the project description blank if this pass fails.
            }
            setStatusMessage('');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to generate project summary:', err);
            setStatusMessage(`Failed to generate summary: ${err.message}`);
        } finally {
            setBusy(false);
        }
    };

    const handleRowClick = target => {
        if (vm) vm.setEditingTarget(target.id);
        toggleExpand(target.name);
    };

    const buttonLabelFor = status => {
        switch (status) {
        case STATUS.GENERATING: return 'Generating…';
        case STATUS.STALE: return 'Update';
        case STATUS.DONE: return 'Regenerate';
        default: return 'Generate';
        }
    };

    const renderRow = target => {
        const summary = summaries[target.name];
        const status = summary ? summary.status : STATUS.NONE;
        const isExpanded = expanded.has(target.name);
        const isSelected = target.id === editingTarget;
        const thumbnailUrl = getThumbnailUrl(target);
        const showStacks = isExpanded && status === STATUS.DONE && summary.stacks.length > 0;

        let subtitle = null;
        if (status === STATUS.DONE) subtitle = summary.description;
        else if (status === STATUS.GENERATING) subtitle = 'Generating…';
        else if (status === STATUS.STALE) subtitle = 'Changed — needs an update.';
        else subtitle = 'No summary yet.';

        return (
            <div
                key={target.id}
                ref={el => {
                    spriteRefs.current[target.id] = el;
                }}
                className={`${styles.spriteSection}${isSelected ? ` ${styles.isSelected}` : ''}`}
            >
                <div
                    className={styles.spriteHeader}
                    onClick={() => handleRowClick(target)}
                >
                    <span className={styles.chevron}>
                        {isExpanded ? '▼' : '▶'}
                    </span>
                    <span className={styles.spriteThumbnailContainer}>
                        {thumbnailUrl && (
                            <img
                                className={styles.spriteThumbnail}
                                draggable={false}
                                src={thumbnailUrl}
                            />
                        )}
                    </span>
                    <span className={styles.spriteHeaderText}>
                        <span className={styles.spriteName}>{target.name}</span>
                        <span
                            className={status === STATUS.DONE ? styles.spriteDescription : styles.spriteStatus}
                        >
                            {subtitle}
                        </span>
                    </span>
                    <button
                        className={styles.rowButton}
                        disabled={busy}
                        onClick={e => {
                            e.stopPropagation();
                            generateOne(target.name);
                        }}
                    >
                        {buttonLabelFor(status)}
                    </button>
                </div>

                {showStacks && (
                    <div className={styles.stackList}>
                        {summary.stacks.map((stack, si) => (
                            <div
                                key={si}
                                className={styles.stackSection}
                            >
                                <div className={styles.stackEvent}>{stack.event}</div>
                                <div className={styles.stackDescription}>{stack.description}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const spriteRows = Object.values(sprites || {}).sort((a, b) => a.order - b.order);
    const rows = [...spriteRows, stage && stage.id ? stage : null].filter(Boolean);

    return (
        <div className={styles.summaryTab}>
            <div className={styles.projectHeader}>
                <div className={styles.projectTitle}>{projectTitle || 'Project Summary'}</div>
                {projectDescription && (
                    <div className={styles.projectDescription}>{projectDescription}</div>
                )}
                <button
                    className={styles.generateButton}
                    onClick={generateAll}
                    disabled={busy}
                >
                    {busy && aiModelStatus === 'loading' ? 'Loading model…' : 'Generate full summary'}
                </button>
                {statusMessage && (
                    <div className={styles.statusMessage}>{statusMessage}</div>
                )}
            </div>

            <div className={styles.spriteList}>
                {rows.map(renderRow)}
            </div>
        </div>
    );
}

SummaryTab.propTypes = {
    aiModelStatus: PropTypes.string,
    dispatch: PropTypes.func,
    editingTarget: PropTypes.string,
    projectTitle: PropTypes.string,
    sprites: PropTypes.object,
    stage: PropTypes.object,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    editingTarget: state.scratchGui.targets.editingTarget,
    projectTitle: state.scratchGui.projectTitle,
    aiModelStatus: state.scratchGui.aiModel.status
});

export default connect(mapStateToProps)(SummaryTab);
