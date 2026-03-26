/**
 * ProcessDataChecker — dev tool for evaluating the completeness and quality
 * of captured process data.
 *
 * Usage (from browser console):
 *   window.__processDataChecker.check()           // check most recent session
 *   window.__processDataChecker.check(sessionId)   // check specific session
 *   window.__processDataChecker.checkAll()          // check all sessions
 */

/**
 * All known event types the process recorder can emit.
 */
const ALL_EVENT_TYPES = [
    // Sprite management
    'sprite_added',
    'sprite_deleted',
    'sprite_renamed',

    // Block editing
    'blocks_changed',
    'blocks_moved_between_sprites',

    // Costumes
    'costume_added',
    'costume_edited',
    'costume_deleted',
    'costume_duplicated',
    'backdrop_added',
    'backdrop_edited',
    'backdrop_deleted',

    // Sounds
    'sound_added',
    'sound_deleted',
    'sound_recorded',

    // Execution
    'execution_started',
    'execution_stopped',
    'ui_green_flag',
    'ui_stop_button',
    'ui_stack_click',

    // Variables (new)
    'variable_created',
    'variable_renamed',
    'variable_deleted',

    // Extensions (new)
    'extension_added',

    // Navigation (new)
    'tab_switched',

    // Comments (new)
    'comment_added',
    'comment_deleted',

    // Snapshots
    'stage_snapshot',
    'project_snapshot'
];

/**
 * Event types that represent user actions (not system snapshots).
 */
const ACTION_EVENT_TYPES = ALL_EVENT_TYPES.filter(
    t => t !== 'stage_snapshot' && t !== 'project_snapshot'
);

/**
 * Expected data fields for each event type.
 */
const EXPECTED_FIELDS = {
    sprite_added: ['spriteName'],
    sprite_deleted: ['spriteName'],
    sprite_renamed: ['oldName', 'newName'],
    blocks_changed: ['action', 'blockCount'],
    costume_added: ['costumeName'],
    costume_edited: ['costumeName'],
    costume_deleted: ['costumeName'],
    sound_added: ['soundName'],
    sound_deleted: ['soundName'],
    execution_stopped: ['durationMs'],
    variable_created: ['varName'],
    variable_renamed: ['oldName', 'newName'],
    variable_deleted: ['varName'],
    extension_added: ['extensionId'],
    tab_switched: ['fromTab', 'toTab']
};

/**
 * Check a session's events for completeness and quality.
 * @param {Array} events - array of event objects
 * @returns {object} report
 */
const checkEvents = events => {
    const report = {
        totalEvents: events.length,
        actionEvents: 0,
        eventTypeCounts: {},
        presentTypes: [],
        missingTypes: [],
        missingFields: [],
        timeGaps: [],
        thumbnailCoverage: 0,
        snapshotCount: 0,
        duration: 0,
        issues: [],
        score: 0
    };

    if (events.length === 0) {
        report.issues.push('No events in session');
        return report;
    }

    // Count event types
    for (const event of events) {
        report.eventTypeCounts[event.type] = (report.eventTypeCounts[event.type] || 0) + 1;
    }

    // Present vs missing types
    report.presentTypes = Object.keys(report.eventTypeCounts);
    report.missingTypes = ACTION_EVENT_TYPES.filter(t => !report.eventTypeCounts[t]);

    // Action events (non-snapshot)
    const actionEvents = events.filter(
        e => e.type !== 'stage_snapshot' && e.type !== 'project_snapshot'
    );
    report.actionEvents = actionEvents.length;

    // Check expected data fields
    for (const event of events) {
        const expected = EXPECTED_FIELDS[event.type];
        if (expected) {
            const missing = expected.filter(f => !event.data || typeof event.data[f] === 'undefined');
            if (missing.length > 0) {
                report.missingFields.push({
                    eventId: event.id,
                    eventType: event.type,
                    missingFields: missing,
                    timestamp: event.timestamp
                });
            }
        }
    }

    // Time gaps (sorted by timestamp)
    const sorted = [...actionEvents].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
        if (gap > 30000) { // gaps > 30s
            report.timeGaps.push({
                afterEvent: sorted[i - 1].type,
                beforeEvent: sorted[i].type,
                gapMs: gap,
                gapFormatted: `${(gap / 1000).toFixed(0)}s`,
                timestamp: sorted[i - 1].timestamp
            });
        }
    }

    // Thumbnail/snapshot coverage
    report.snapshotCount = events.filter(
        e => e.type === 'stage_snapshot' && e.thumbnail
    ).length;
    report.thumbnailCoverage = events.filter(e => e.thumbnail).length / Math.max(events.length, 1);

    // Duration
    if (sorted.length >= 2) {
        report.duration = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
    }

    // Compute a simple completeness score (0-100)
    const typesCovered = report.presentTypes.filter(t =>
        t !== 'stage_snapshot' && t !== 'project_snapshot'
    ).length;
    const typesExpected = ACTION_EVENT_TYPES.length;
    const typeCoverage = typesCovered / typesExpected;
    const fieldScore = report.missingFields.length === 0 ?
        1 : Math.max(0, 1 - (report.missingFields.length / events.length));
    const snapshotScore = report.snapshotCount >= 2 ?
        1 : report.snapshotCount / 2;
    report.score = Math.round((typeCoverage * 50) + (fieldScore * 30) + (snapshotScore * 20));

    // Issues
    if (report.actionEvents < 5) report.issues.push('Very few action events');
    if (report.snapshotCount === 0) report.issues.push('No stage snapshots');
    if (report.missingFields.length > 0) {
        report.issues.push(`${report.missingFields.length} events with missing data fields`);
    }

    return report;
};

/**
 * Format a report for console display.
 * @param {object} report - the report from checkEvents
 * @returns {string} formatted report text
 */
const formatReport = report => {
    const lines = [
        `=== Process Data Report ===`,
        `Score: ${report.score}/100`,
        `Total events: ${report.totalEvents} (${report.actionEvents} actions, ${report.snapshotCount} snapshots)`,
        `Duration: ${(report.duration / 1000).toFixed(0)}s`,
        ``,
        `Event types present (${report.presentTypes.length}):`,
        ...report.presentTypes.map(t => `  + ${t} (${report.eventTypeCounts[t]})`),
        ``,
        `Event types missing (${report.missingTypes.length}):`,
        ...(report.missingTypes.length > 0 ?
            report.missingTypes.map(t => `  - ${t}`) :
            ['  (none -- all types covered!)'])
    ];

    if (report.missingFields.length > 0) {
        lines.push('', `Missing data fields (${report.missingFields.length}):`);
        for (const mf of report.missingFields.slice(0, 5)) {
            lines.push(`  ${mf.eventType}: missing [${mf.missingFields.join(', ')}]`);
        }
        if (report.missingFields.length > 5) {
            lines.push(`  ... and ${report.missingFields.length - 5} more`);
        }
    }

    if (report.timeGaps.length > 0) {
        lines.push('', `Notable time gaps (${report.timeGaps.length}):`);
        for (const gap of report.timeGaps) {
            lines.push(`  ${gap.gapFormatted} gap between ${gap.afterEvent} → ${gap.beforeEvent}`);
        }
    }

    if (report.issues.length > 0) {
        lines.push('', 'Issues:');
        for (const issue of report.issues) {
            lines.push(`  ⚠ ${issue}`);
        }
    }

    return lines.join('\n');
};

/**
 * Install the data checker on window for console access.
 * @param {object} storage - ProcessStorage instance
 */
const installDataChecker = storage => {
    window.__processDataChecker = {
        check: async sessionId => {
            let events;
            if (sessionId) {
                events = await storage.getEventsForSession(sessionId);
            } else {
                // Get most recent session
                const sessions = await storage.getSessions();
                if (sessions.length === 0) {
                    console.log('[DataChecker] No sessions found'); // eslint-disable-line no-console
                    return null;
                }
                const sorted = sessions.sort(
                    (a, b) => (b.startTime || 0) - (a.startTime || 0)
                );
                const latest = sorted[0];
                events = await storage.getEventsForSession(latest.id);
                console.log(`[DataChecker] Checking latest session: ${latest.id}`); // eslint-disable-line no-console
            }
            const report = checkEvents(events);
            console.log(formatReport(report)); // eslint-disable-line no-console
            return report;
        },

        checkAll: async () => {
            const sessions = await storage.getSessions();
            console.log(`[DataChecker] Checking ${sessions.length} sessions...`); // eslint-disable-line no-console
            const reports = [];
            for (const session of sessions) {
                const events = await storage.getEventsForSession(session.id);
                const report = checkEvents(events);
                reports.push({sessionId: session.id, ...report});
                console.log(`\nSession ${session.id}:`); // eslint-disable-line no-console
                console.log(formatReport(report)); // eslint-disable-line no-console
            }
            return reports;
        },

        eventTypes: ALL_EVENT_TYPES
    };
    // eslint-disable-next-line no-console
    console.log('[DataChecker] Installed. Use __processDataChecker.check()');
};

export {
    checkEvents,
    formatReport,
    installDataChecker,
    ALL_EVENT_TYPES,
    ACTION_EVENT_TYPES
};
