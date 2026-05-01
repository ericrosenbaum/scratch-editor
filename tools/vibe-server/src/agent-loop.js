import Anthropic from '@anthropic-ai/sdk';
import {TOOL_DEFS, dispatchTool, createTurnBudget, ToolError} from './tools.js';
import {recordPostEdit, listTurnFiles} from './snapshots.js';
import {relativeToRepo} from './safety.js';
import path from 'node:path';
import {repoRoot} from './safety.js';

const DEFAULT_MODEL = process.env.VIBE_MODEL || 'claude-opus-4-7';
const MAX_LOOPS = 30;

export async function runAgentTurn({
    apiKey,
    systemBlocks,
    priorMessages,
    userPrompt,
    turnId,
    log,
    rebuildKicker,
    emit
}) {
    const client = new Anthropic({apiKey});
    const budget = createTurnBudget();

    const messages = [
        ...priorMessages,
        {role: 'user', content: userPrompt}
    ];

    const editedPaths = new Set();
    let stopReason = null;
    let assistantText = '';

    for (let loopCount = 0; loopCount < MAX_LOOPS; loopCount += 1) {
        let response;
        try {
            response = await client.messages.create({
                model: DEFAULT_MODEL,
                max_tokens: 4096,
                system: systemBlocks,
                tools: TOOL_DEFS,
                messages
            });
        } catch (err) {
            log.error({err}, 'anthropic call failed');
            emit('error', {turnId, message: `Anthropic API error: ${err.message}`});
            throw err;
        }

        const assistantBlocks = response.content;
        messages.push({role: 'assistant', content: assistantBlocks});

        const toolUses = assistantBlocks.filter(b => b.type === 'tool_use');
        const textBlocks = assistantBlocks.filter(b => b.type === 'text');
        for (const t of textBlocks) {
            assistantText += t.text;
            emit('assistant', {turnId, delta: t.text});
        }

        stopReason = response.stop_reason;

        if (toolUses.length === 0 || stopReason === 'end_turn') {
            break;
        }

        const toolResults = [];
        for (const tu of toolUses) {
            emit('tool-call', {turnId, name: tu.name, input: tu.input});
            let result;
            try {
                result = await dispatchTool(
                    {name: tu.name, input: tu.input},
                    {turnId, budget}
                );
            } catch (err) {
                if (err instanceof ToolError && err.recoverable === false) {
                    emit('error', {turnId, message: err.message});
                    throw err;
                }
                throw err;
            }
            emit('tool-result', {
                turnId,
                name: tu.name,
                ok: result.ok,
                summary: result.content.slice(0, 200)
            });
            if (
                result.ok &&
                ['edit_file', 'create_file', 'delete_file'].includes(tu.name) &&
                tu.input?.path
            ) {
                editedPaths.add(tu.input.path);
            }
            toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: result.content,
                is_error: !result.ok
            });
        }

        messages.push({role: 'user', content: toolResults});
    }

    const editedList = [...editedPaths];

    if (editedList.length > 0) {
        await recordPostEdit(turnId);
        emit('edit-applied', {turnId, files: editedList});
        if (rebuildKicker) {
            const kicked = rebuildKicker.schedule(editedList.map(p => {
                const abs = path.isAbsolute(p) ? p : path.join(repoRoot(), p);
                return relativeToRepo(abs);
            }));
            if (kicked.length > 0) {
                emit('rebuild-scheduled', {turnId, workspaces: kicked});
            }
        }
    }

    emit('done', {turnId, stopReason, edits: editedList, assistantText});

    return {
        turnId,
        stopReason,
        assistantText,
        editedFiles: editedList,
        finalMessages: messages,
        snapshotFiles: await listTurnFiles(turnId)
    };
}
