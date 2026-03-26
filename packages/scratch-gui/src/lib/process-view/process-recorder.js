/**
 * ProcessRecorder — captures editing events from the VM and GUI
 * and writes them to ProcessStorage.
 *
 * Hooks into: targetsUpdate, PROJECT_CHANGED, PROJECT_RUN_START/STOP,
 * PROJECT_START, and editor tab changes. Uses diffing of target state
 * to detect sprite/costume/sound add/delete/rename and block changes.
 */

import {captureStageSnapshot, captureProjectSnapshot, generateId} from './snapshot-utils';
import {generateBlockSummary} from './block-summary';

const DEBOUNCE_BLOCKS_MS = 2000;
const DEBOUNCE_COSTUME_EDIT_MS = 4000;
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PERIODIC_SNAPSHOT_MS = 3 * 60 * 1000; // 3 minutes

class ProcessRecorder {
    constructor (vm, storage) {
        this.vm = vm;
        this.storage = storage;

        this._running = false;
        this._sessionId = null;
        this._lastActivityTime = 0;
        this._executionStartTime = null;
        this._sessionCheckInterval = null;
        this._periodicSnapshotInterval = null;

        // Block change debouncing
        this._blockChangeTimer = null;
        this._pendingBlockChanges = []; // from targetsUpdate diffing (count deltas)
        this._pendingBlocklyEvents = []; // from Blockly workspace listener (rich detail)

        // Costume edit debouncing
        this._costumeEditTimer = null;

        // Previous target state for diffing
        this._prevTargetState = null;

        // Track editor tab for detecting costume editing mode
        this._activeTabIndex = 0;

        // Workspace reference (set via setWorkspace)
        this._workspace = null;
        this._workspaceChangeListener = null;

        // Bound handlers
        this._handleTargetsUpdate = this._handleTargetsUpdate.bind(this);
        this._handleProjectRunStart = this._handleProjectRunStart.bind(this);
        this._handleProjectRunStop = this._handleProjectRunStop.bind(this);
        this._handleProjectStart = this._handleProjectStart.bind(this);
        this._handleProjectChanged = this._handleProjectChanged.bind(this);
        this._handleBeforeUnload = this._handleBeforeUnload.bind(this);
        this._handleExtensionAdded = this._handleExtensionAdded.bind(this);
        this._handleWorkspaceChange = this._handleWorkspaceChange.bind(this);
    }

    /**
     * Start recording. Creates a new session and attaches event listeners.
     */
    async start () {
        if (this._running) return;
        this._running = true;

        await this._startNewSession();

        // Attach VM event listeners
        this.vm.on('targetsUpdate', this._handleTargetsUpdate);
        this.vm.on('PROJECT_RUN_START', this._handleProjectRunStart);
        this.vm.on('PROJECT_RUN_STOP', this._handleProjectRunStop);
        this.vm.on('PROJECT_START', this._handleProjectStart);
        this.vm.on('PROJECT_CHANGED', this._handleProjectChanged);
        this.vm.on('EXTENSION_ADDED', this._handleExtensionAdded);

        // Session timeout check
        this._sessionCheckInterval = setInterval(() => {
            this._checkSessionTimeout();
        }, 30000); // Check every 30s

        // Periodic snapshots
        this._periodicSnapshotInterval = setInterval(() => {
            this._takePeriodicSnapshot();
        }, PERIODIC_SNAPSHOT_MS);

        // Page unload
        window.addEventListener('beforeunload', this._handleBeforeUnload);

        // Take initial target state snapshot
        this._captureTargetState();
    }

    /**
     * Stop recording. Finalizes current session and removes listeners.
     */
    async stop () {
        if (!this._running) return;
        this._running = false;

        await this._endCurrentSession();

        this.vm.removeListener('targetsUpdate', this._handleTargetsUpdate);
        this.vm.removeListener('PROJECT_RUN_START', this._handleProjectRunStart);
        this.vm.removeListener('PROJECT_RUN_STOP', this._handleProjectRunStop);
        this.vm.removeListener('PROJECT_START', this._handleProjectStart);
        this.vm.removeListener('PROJECT_CHANGED', this._handleProjectChanged);
        this.vm.removeListener('EXTENSION_ADDED', this._handleExtensionAdded);

        // Remove workspace listener
        if (this._workspace && this._workspaceChangeListener) {
            this._workspace.removeChangeListener(this._workspaceChangeListener);
        }

        if (this._sessionCheckInterval) {
            clearInterval(this._sessionCheckInterval);
            this._sessionCheckInterval = null;
        }
        if (this._periodicSnapshotInterval) {
            clearInterval(this._periodicSnapshotInterval);
            this._periodicSnapshotInterval = null;
        }
        if (this._blockChangeTimer) {
            clearTimeout(this._blockChangeTimer);
            this._blockChangeTimer = null;
        }
        if (this._costumeEditTimer) {
            clearTimeout(this._costumeEditTimer);
            this._costumeEditTimer = null;
        }

        window.removeEventListener('beforeunload', this._handleBeforeUnload);
    }

    /**
     * Set the active editor tab index (called from HOC when Redux state changes).
     */
    setActiveTab (tabIndex) {
        const TAB_NAMES = ['Code', 'Costumes', 'Sounds'];
        const oldTab = this._activeTabIndex;
        this._activeTabIndex = tabIndex;

        if (this._running && this._sessionId && oldTab !== tabIndex) {
            this._emitEvent({
                type: 'tab_switched',
                sprite: this.vm.editingTarget ? this.vm.editingTarget.getName() : null,
                data: {
                    fromTab: TAB_NAMES[oldTab] || `Tab ${oldTab}`,
                    toTab: TAB_NAMES[tabIndex] || `Tab ${tabIndex}`,
                    fromTabIndex: oldTab,
                    toTabIndex: tabIndex
                }
            });
        }
    }

    /**
     * Set the Blockly workspace reference for fine-grained event capture.
     * Called from blocks.jsx after workspace is created.
     */
    setWorkspace (workspace) {
        // Remove old listener if workspace changed
        if (this._workspace && this._workspaceChangeListener) {
            this._workspace.removeChangeListener(this._workspaceChangeListener);
        }

        this._workspace = workspace;
        this._workspaceChangeListener = this._handleWorkspaceChange;
        this._workspace.addChangeListener(this._workspaceChangeListener);
    }

    // ---- Session management ----

    async _startNewSession () {
        this._sessionId = generateId();
        this._lastActivityTime = Date.now();

        const thumbnail = await captureStageSnapshot(this.vm);

        const session = {
            id: this._sessionId,
            projectId: this.storage.projectId,
            startTime: Date.now(),
            endTime: null,
            stageSnapshotStart: thumbnail,
            stageSnapshotEnd: null,
            eventCount: 0,
            spritesAtEnd: this._getSpriteNames(),
            totalBlocksChanged: 0,
            aiLabel: null,
            aiClassification: null,
            aiDescription: null
        };

        await this.storage.createSession(session);

        // Stage and project snapshots at session start
        await this._emitEvent({
            type: 'stage_snapshot',
            sprite: null,
            data: {trigger: 'session_start'},
            thumbnail
        });

        const json = captureProjectSnapshot(this.vm);
        if (json) {
            await this._emitEvent({
                type: 'project_snapshot',
                sprite: null,
                data: {trigger: 'session_start', json},
                thumbnail: null
            });
        }
    }

    async _endCurrentSession () {
        if (!this._sessionId) return;

        // Flush pending block changes
        this._flushBlockChanges();

        const thumbnail = await captureStageSnapshot(this.vm);

        // Stage snapshot at session end
        await this._emitEvent({
            type: 'stage_snapshot',
            sprite: null,
            data: {trigger: 'session_end'},
            thumbnail
        });

        // Project snapshot at session end
        const json = captureProjectSnapshot(this.vm);
        if (json) {
            await this._emitEvent({
                type: 'project_snapshot',
                sprite: null,
                data: {trigger: 'session_end', json},
                thumbnail: null
            });
        }

        await this.storage.updateSession(this._sessionId, {
            endTime: Date.now(),
            stageSnapshotEnd: thumbnail,
            spritesAtEnd: this._getSpriteNames()
        });

        this._sessionId = null;
    }

    _checkSessionTimeout () {
        if (!this._sessionId) return;
        if (Date.now() - this._lastActivityTime > SESSION_TIMEOUT_MS) {
            // End current session due to inactivity
            this._endCurrentSession();
        }
    }

    async _ensureSession () {
        this._lastActivityTime = Date.now();
        if (!this._sessionId && this._running) {
            await this._startNewSession();
        }
    }

    // ---- Event emission ----

    async _emitEvent (eventData) {
        if (!this._sessionId) return;

        const event = {
            id: generateId(),
            sessionId: this._sessionId,
            timestamp: Date.now(),
            type: eventData.type,
            sprite: eventData.sprite || null,
            data: eventData.data || {},
            thumbnail: eventData.thumbnail || null,
            aiLabel: null
        };

        try {
            await this.storage.addEvent(event);
        } catch (e) {
            // Storage errors should not break recording
            // eslint-disable-next-line no-console
            console.warn('ProcessRecorder: failed to store event', e);
        }
    }

    // ---- VM Event Handlers ----

    _handleTargetsUpdate (data) {
        if (!this._running) return;
        this._ensureSession();
        this._diffTargets(data);
    }

    async _handleProjectRunStart () {
        if (!this._running) return;
        await this._ensureSession();
        this._executionStartTime = Date.now();

        await this._emitEvent({
            type: 'execution_started',
            sprite: null,
            data: {timestamp: Date.now()}
        });

        // Take stage + project snapshot on every execution start
        const thumbnail = await captureStageSnapshot(this.vm);
        await this._emitEvent({
            type: 'stage_snapshot',
            sprite: null,
            data: {trigger: 'execution'},
            thumbnail
        });

        const json = captureProjectSnapshot(this.vm);
        if (json) {
            await this._emitEvent({
                type: 'project_snapshot',
                sprite: null,
                data: {trigger: 'execution', json},
                thumbnail: null
            });
        }
    }

    async _handleProjectRunStop () {
        if (!this._running) return;
        await this._ensureSession();

        const durationMs = this._executionStartTime ?
            Date.now() - this._executionStartTime : 0;

        await this._emitEvent({
            type: 'execution_stopped',
            sprite: null,
            data: {
                timestamp: Date.now(),
                durationMs
            }
        });

        this._executionStartTime = null;
    }

    async _handleProjectStart () {
        if (!this._running) return;
        await this._ensureSession();

        await this._emitEvent({
            type: 'ui_green_flag',
            sprite: null,
            data: {}
        });
    }

    async _handleProjectChanged () {
        if (!this._running) return;
        await this._ensureSession();

        // Detect costume editing: PROJECT_CHANGED while on costumes tab
        if (this._activeTabIndex === 1) {
            this._debounceCostumeEdit();
        }
    }

    _handleBeforeUnload () {
        // Best-effort: try to end session synchronously-ish
        if (this._sessionId) {
            // We can't reliably await async ops in beforeunload,
            // but we try to update the session record
            this.storage.updateSession(this._sessionId, {
                endTime: Date.now()
            }).catch(() => {});
        }
    }

    // ---- Extension events ----

    async _handleExtensionAdded (categoryInfo) {
        if (!this._running) return;
        await this._ensureSession();

        await this._emitEvent({
            type: 'extension_added',
            sprite: null,
            data: {
                extensionId: categoryInfo.id,
                extensionName: categoryInfo.name || categoryInfo.id
            }
        });
    }

    // ---- Workspace (Blockly) event handlers ----

    _handleWorkspaceChange (event) {
        if (!this._running || !event) return;

        const eventType = event.type;

        // Block events — accumulate for debounced flush
        if (eventType === 'create' && event.blockId) {
            this._accumulateBlocklyEvent({
                action: 'created',
                blockId: event.blockId,
                opcode: this._getBlockOpcode(event.blockId),
                timestamp: Date.now()
            });
        }

        if (eventType === 'delete' && event.blockId) {
            // On delete, the block is already gone from workspace,
            // so we can't look up its opcode. Use oldXml if available.
            let opcode = 'unknown';
            if (event.oldXml) {
                opcode = event.oldXml.getAttribute('type') || 'unknown';
            }
            this._accumulateBlocklyEvent({
                action: 'deleted',
                blockId: event.blockId,
                opcode,
                timestamp: Date.now()
            });
        }

        if (eventType === 'change' && event.blockId) {
            this._accumulateBlocklyEvent({
                action: 'changed',
                blockId: event.blockId,
                opcode: this._getBlockOpcode(event.blockId),
                element: event.element,
                name: event.name,
                newValue: event.newValue,
                timestamp: Date.now()
            });
        }

        if (eventType === 'move' && event.blockId) {
            const connected = event.newParentId !== event.oldParentId;
            this._accumulateBlocklyEvent({
                action: 'moved',
                blockId: event.blockId,
                opcode: this._getBlockOpcode(event.blockId),
                connected,
                timestamp: Date.now()
            });
        }

        // Variable events
        if (eventType === 'var_create') {
            this._ensureSession().then(() => {
                this._emitEvent({
                    type: 'variable_created',
                    sprite: this.vm.editingTarget ? this.vm.editingTarget.getName() : null,
                    data: {
                        varName: event.varName,
                        varType: event.varType || 'scalar',
                        isLocal: event.isLocal || false,
                        isCloud: event.isCloud || false
                    }
                });
            });
        }

        if (eventType === 'var_rename') {
            this._ensureSession().then(() => {
                this._emitEvent({
                    type: 'variable_renamed',
                    sprite: this.vm.editingTarget ? this.vm.editingTarget.getName() : null,
                    data: {
                        oldName: event.oldName,
                        newName: event.newName,
                        varId: event.varId
                    }
                });
            });
        }

        if (eventType === 'var_delete') {
            this._ensureSession().then(() => {
                this._emitEvent({
                    type: 'variable_deleted',
                    sprite: this.vm.editingTarget ? this.vm.editingTarget.getName() : null,
                    data: {
                        varName: event.varName,
                        varType: event.varType || 'scalar',
                        varId: event.varId
                    }
                });
            });
        }

        // Comment events
        if (eventType === 'comment_create') {
            this._ensureSession().then(() => {
                this._emitEvent({
                    type: 'comment_added',
                    sprite: this.vm.editingTarget ? this.vm.editingTarget.getName() : null,
                    data: {commentId: event.commentId}
                });
            });
        }

        if (eventType === 'comment_delete') {
            this._ensureSession().then(() => {
                this._emitEvent({
                    type: 'comment_deleted',
                    sprite: this.vm.editingTarget ? this.vm.editingTarget.getName() : null,
                    data: {commentId: event.commentId}
                });
            });
        }
    }

    // ---- Target state diffing ----

    _captureTargetState () {
        if (!this.vm || !this.vm.runtime) return;

        const targets = this.vm.runtime.targets.filter(
            t => !Object.prototype.hasOwnProperty.call(t, 'isOriginal') || t.isOriginal
        );

        this._prevTargetState = {};
        for (const target of targets) {
            this._prevTargetState[target.id] = {
                name: target.getName(),
                isStage: target.isStage,
                costumeNames: target.getCostumes().map(c => c.name),
                costumeMd5s: target.getCostumes().map(c => c.md5),
                soundNames: target.getSounds().map(s => s.name),
                blockCount: Object.keys(target.blocks._blocks).length
            };
        }
    }

    async _diffTargets (data) {
        if (!this.vm || !this.vm.runtime) return;

        const targets = this.vm.runtime.targets.filter(
            t => !Object.prototype.hasOwnProperty.call(t, 'isOriginal') || t.isOriginal
        );

        const newState = {};
        for (const target of targets) {
            newState[target.id] = {
                name: target.getName(),
                isStage: target.isStage,
                costumeNames: target.getCostumes().map(c => c.name),
                costumeMd5s: target.getCostumes().map(c => c.md5),
                soundNames: target.getSounds().map(s => s.name),
                blockCount: Object.keys(target.blocks._blocks).length
            };
        }

        if (!this._prevTargetState) {
            this._prevTargetState = newState;
            return;
        }

        const prev = this._prevTargetState;

        // Update state synchronously before any async work to prevent
        // duplicate events when targetsUpdate fires multiple times rapidly.
        this._prevTargetState = newState;

        // Detect sprite additions
        for (const id of Object.keys(newState)) {
            if (!prev[id] && !newState[id].isStage) {
                await this._emitEvent({
                    type: 'sprite_added',
                    sprite: newState[id].name,
                    data: {
                        spriteName: newState[id].name,
                        source: 'unknown'
                    }
                });
            }
        }

        // Detect sprite deletions
        for (const id of Object.keys(prev)) {
            if (!newState[id] && !prev[id].isStage) {
                await this._emitEvent({
                    type: 'sprite_deleted',
                    sprite: prev[id].name,
                    data: {spriteName: prev[id].name}
                });
            }
        }

        // Detect changes on existing targets
        for (const id of Object.keys(newState)) {
            if (!prev[id]) continue;
            const p = prev[id];
            const n = newState[id];

            // Sprite rename
            if (p.name !== n.name && !n.isStage) {
                await this._emitEvent({
                    type: 'sprite_renamed',
                    sprite: n.name,
                    data: {oldName: p.name, newName: n.name}
                });
            }

            // Costume additions
            const addedCostumes = n.costumeNames.filter(c => !p.costumeNames.includes(c));
            for (const costumeName of addedCostumes) {
                const eventType = n.isStage ? 'backdrop_added' : 'costume_added';
                await this._emitEvent({
                    type: eventType,
                    sprite: n.name,
                    data: {
                        sprite: n.name,
                        costumeName,
                        source: 'unknown'
                    }
                });
            }

            // Costume deletions
            const removedCostumes = p.costumeNames.filter(c => !n.costumeNames.includes(c));
            for (const costumeName of removedCostumes) {
                const eventType = n.isStage ? 'backdrop_deleted' : 'costume_deleted';
                await this._emitEvent({
                    type: eventType,
                    sprite: n.name,
                    data: {sprite: n.name, costumeName}
                });
            }

            // Costume edits (md5 changed but name stayed)
            for (let i = 0; i < Math.min(p.costumeNames.length, n.costumeNames.length); i++) {
                if (p.costumeNames[i] === n.costumeNames[i] &&
                    p.costumeMd5s[i] !== n.costumeMd5s[i]) {
                    // Costume was edited — handled by debounced costume edit below
                }
            }

            // Sound additions
            const addedSounds = n.soundNames.filter(s => !p.soundNames.includes(s));
            for (const soundName of addedSounds) {
                await this._emitEvent({
                    type: 'sound_added',
                    sprite: n.name,
                    data: {
                        sprite: n.name,
                        soundName,
                        source: 'unknown'
                    }
                });
            }

            // Sound deletions
            const removedSounds = p.soundNames.filter(s => !n.soundNames.includes(s));
            for (const soundName of removedSounds) {
                await this._emitEvent({
                    type: 'sound_deleted',
                    sprite: n.name,
                    data: {sprite: n.name, soundName}
                });
            }

            // Block count changes
            const blockDiff = n.blockCount - p.blockCount;
            if (blockDiff !== 0) {
                this._accumulateBlockChange(n.name, blockDiff);
            }
        }

    }

    // ---- Block change debouncing ----

    /**
     * Look up a block's opcode from the workspace.
     */
    _getBlockOpcode (blockId) {
        if (!this._workspace) return 'unknown';
        const block = this._workspace.getBlockById(blockId);
        return block ? block.type : 'unknown';
    }

    /**
     * Accumulate a Blockly event into the pending buffer and reset debounce.
     */
    _accumulateBlocklyEvent (eventData) {
        this._pendingBlocklyEvents.push(eventData);
        this._resetBlockChangeTimer();
    }

    _accumulateBlockChange (spriteName, blockCountDelta) {
        this._pendingBlockChanges.push({
            sprite: spriteName,
            blockCount: blockCountDelta,
            timestamp: Date.now()
        });
        this._resetBlockChangeTimer();
    }

    _resetBlockChangeTimer () {
        if (this._blockChangeTimer) {
            clearTimeout(this._blockChangeTimer);
        }
        this._blockChangeTimer = setTimeout(() => {
            this._flushBlockChanges();
        }, DEBOUNCE_BLOCKS_MS);
    }

    async _flushBlockChanges () {
        const blocklyEvents = this._pendingBlocklyEvents;
        const countChanges = this._pendingBlockChanges;
        this._pendingBlocklyEvents = [];
        this._pendingBlockChanges = [];
        this._blockChangeTimer = null;

        // If we have Blockly events, use them for rich detail
        if (blocklyEvents.length > 0) {
            await this._flushRichBlockChanges(blocklyEvents, countChanges);
            return;
        }

        // Fallback: only count-based changes (no workspace access)
        if (countChanges.length === 0) return;

        const bySprite = {};
        for (const change of countChanges) {
            if (!bySprite[change.sprite]) {
                bySprite[change.sprite] = {totalDelta: 0};
            }
            bySprite[change.sprite].totalDelta += change.blockCount;
        }

        for (const [sprite, info] of Object.entries(bySprite)) {
            let action = 'modified';
            if (info.totalDelta > 0) action = 'added';
            if (info.totalDelta < 0) action = 'deleted';

            await this._emitEvent({
                type: 'blocks_changed',
                sprite,
                data: {
                    sprite,
                    action,
                    blockCount: info.totalDelta,
                    summary: null,
                    opcodes: [],
                    created: [],
                    deleted: [],
                    changed: [],
                    moved: []
                }
            });
        }
    }

    /**
     * Flush block changes with rich detail from Blockly events.
     */
    async _flushRichBlockChanges (blocklyEvents, countChanges) {
        const sprite = this.vm.editingTarget ?
            this.vm.editingTarget.getName() : null;

        // Categorize Blockly events, filtering out shadow blocks
        const created = blocklyEvents
            .filter(e => e.action === 'created' && e.opcode !== 'unknown')
            .map(e => ({opcode: e.opcode, blockId: e.blockId}));
        const deleted = blocklyEvents
            .filter(e => e.action === 'deleted' && e.opcode !== 'unknown')
            .map(e => ({opcode: e.opcode, blockId: e.blockId}));
        const changed = blocklyEvents
            .filter(e => e.action === 'changed')
            .map(e => ({
                opcode: e.opcode,
                blockId: e.blockId,
                field: e.name,
                newValue: e.newValue
            }));
        const moved = blocklyEvents
            .filter(e => e.action === 'moved')
            .map(e => ({
                opcode: e.opcode,
                blockId: e.blockId,
                connected: e.connected
            }));

        // Net block count from the richer source
        const netBlockCount = created.length - deleted.length;

        // Compute action
        let action = 'modified';
        if (netBlockCount > 0) action = 'added';
        if (netBlockCount < 0) action = 'deleted';
        if (created.length === 0 && deleted.length === 0) {
            if (changed.length > 0) action = 'modified';
            else if (moved.length > 0) action = 'moved';
        }

        // Collect unique opcodes
        const opcodes = [...new Set([
            ...created.map(c => c.opcode),
            ...deleted.map(d => d.opcode)
        ])];

        // Generate human-readable summary
        const summary = generateBlockSummary({
            created, deleted, changed, moved
        });

        // Capture block snapshot for significant creates
        let thumbnail = null;
        if (created.length > 0) {
            thumbnail = await this._captureBlockSnapshot(created);
        }

        await this._emitEvent({
            type: 'blocks_changed',
            sprite,
            data: {
                sprite,
                action,
                blockCount: netBlockCount,
                summary,
                opcodes,
                created: created.map(c => ({opcode: c.opcode})),
                deleted: deleted.map(d => ({opcode: d.opcode})),
                changed: changed.map(c => ({
                    field: c.field,
                    newValue: c.newValue
                })),
                moved: moved.map(m => ({connected: m.connected}))
            },
            thumbnail
        });
    }

    /**
     * Try to capture an SVG snapshot of a top-level script from the workspace.
     */
    async _captureBlockSnapshot (createdBlocks) {
        if (!this._workspace) return null;

        // Find the first created block that's still in the workspace
        // and is top-level (a script root)
        for (const block of createdBlocks) {
            const wsBlock = this._workspace.getBlockById(block.blockId);
            if (!wsBlock) continue;

            // Walk up to the top-level block
            let topBlock = wsBlock;
            while (topBlock.getParent()) {
                topBlock = topBlock.getParent();
            }

            try {
                return await this._blockToThumbnail(topBlock);
            } catch (e) {
                // Snapshot failed — not critical
                return null;
            }
        }

        return null;
    }

    /**
     * Generate a small SVG data URI from a workspace block.
     * Adapted from lib/backpack/block-to-image.js.
     */
    _blockToThumbnail (block) {
        return new Promise(resolve => {
            try {
                const blockSvg = block.getSvgRoot().cloneNode(true);
                blockSvg.innerHTML = blockSvg.innerHTML
                    .replace(/&nbsp;/g, ' ');

                const NS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(NS, 'svg');
                svg.appendChild(blockSvg);
                document.body.appendChild(svg);

                const padding = 4;
                const hatPad = blockSvg.getAttribute('data-shapes') === 'hat' ?
                    12 : 0;
                blockSvg.setAttribute('transform',
                    `translate(${padding} ${padding + hatPad})`);

                const bounds = blockSvg.getBoundingClientRect();
                svg.setAttribute('width', bounds.width + (2 * padding));
                svg.setAttribute('height', bounds.height + (2 * padding));

                // Inline key CSS properties
                const inlineStyles = (el) => {
                    if (el.nodeType !== 1) return;
                    const computed = window.getComputedStyle(el);
                    ['fill', 'font-family', 'font-size', 'font-weight']
                        .forEach(prop => {
                            el.style[prop] = computed[prop];
                        });
                    for (const child of el.children) {
                        inlineStyles(child);
                    }
                };
                inlineStyles(svg);

                const svgStr = new XMLSerializer().serializeToString(svg);
                svg.parentNode.removeChild(svg);

                // Scale down to max 120px wide for storage efficiency
                const dataUri = `data:image/svg+xml;utf-8,${
                    encodeURIComponent(svgStr)}`;
                resolve(dataUri);
            } catch (e) {
                resolve(null);
            }
        });
    }

    // ---- Costume edit debouncing ----

    _debounceCostumeEdit () {
        if (this._costumeEditTimer) {
            clearTimeout(this._costumeEditTimer);
        }

        this._costumeEditTimer = setTimeout(async () => {
            this._costumeEditTimer = null;
            const target = this.vm.editingTarget;
            if (!target) return;

            const costumeName = target.getCostumes()[target.currentCostume]?.name || 'unknown';

            await this._emitEvent({
                type: target.isStage ? 'backdrop_edited' : 'costume_edited',
                sprite: target.getName(),
                data: {
                    sprite: target.getName(),
                    costumeName
                }
            });
        }, DEBOUNCE_COSTUME_EDIT_MS);
    }

    // ---- Periodic snapshots ----

    async _takePeriodicSnapshot () {
        if (!this._sessionId || !this._running) return;

        // Only take if there's been recent activity
        if (Date.now() - this._lastActivityTime > PERIODIC_SNAPSHOT_MS) return;

        const thumbnail = await captureStageSnapshot(this.vm);
        await this._emitEvent({
            type: 'stage_snapshot',
            sprite: null,
            data: {trigger: 'periodic'},
            thumbnail
        });

        const json = captureProjectSnapshot(this.vm);
        if (json) {
            await this._emitEvent({
                type: 'project_snapshot',
                sprite: null,
                data: {trigger: 'periodic', json},
                thumbnail: null
            });
        }
    }

    // ---- Helpers ----

    _getSpriteNames () {
        if (!this.vm || !this.vm.runtime) return [];
        return this.vm.runtime.targets
            .filter(t => !t.isStage &&
                (!Object.prototype.hasOwnProperty.call(t, 'isOriginal') || t.isOriginal))
            .map(t => t.getName());
    }

    /**
     * Get the current session ID (for external use).
     */
    getSessionId () {
        return this._sessionId;
    }

    /**
     * Get the storage instance (for the UI to query data).
     */
    getStorage () {
        return this.storage;
    }
}

export default ProcessRecorder;
