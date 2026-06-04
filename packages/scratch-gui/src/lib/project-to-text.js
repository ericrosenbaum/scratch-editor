/**
 * Convert a Scratch project (sb3 JSON, e.g. from vm.toJSON()) into a per-target,
 * per-stack text description for feeding to the on-device summarizer.
 *
 * This walks the raw sb3 block dictionaries directly rather than going through a
 * full project parser, so it is resilient to custom blocks, extension blocks, and
 * other shapes that strict parsers choke on. The output is scratchblocks-like text
 * that is good enough for an LLM to summarize, never throwing on an unexpected block.
 */

const CATEGORY = new Set([
    'motion', 'looks', 'sound', 'event', 'control',
    'sensing', 'operator', 'data', 'procedures', 'argument'
]);

// "looks_changeeffectby" -> "changeeffectby"; unknown prefixes are kept as-is.
const humanize = opcode => {
    if (typeof opcode !== 'string') return '';
    const i = opcode.indexOf('_');
    if (i < 0) return opcode.replace(/_/g, ' ');
    const head = opcode.slice(0, i);
    return (CATEGORY.has(head) ? opcode.slice(i + 1) : opcode).replace(/_/g, ' ');
};

// Resolve one input slot to a short string. Literal shadows return their value;
// references to reporter/menu blocks are rendered recursively in parentheses.
const renderValue = (inp, blocks, depth) => {
    if (!Array.isArray(inp)) return '';
    const payload = inp[1];
    if (Array.isArray(payload)) {
        const v = payload[1];
        return (typeof v === 'undefined' || v === null) ? '' : String(v);
    }
    if (typeof payload === 'string') {
        return `(${renderBlock(blocks[payload], blocks, depth + 1)})`;
    }
    return '';
};

// Render a single block (statement or reporter) as one line of text.
const renderBlock = (b, blocks, depth) => {
    if (!b || typeof b !== 'object' || Array.isArray(b) || depth > 12) return '';
    if (b.mutation && b.mutation.proccode) {
        const args = Object.values(b.inputs || {}).map(inp => renderValue(inp, blocks, depth));
        return `call "${b.mutation.proccode}" ${args.join(' ')}`.trim();
    }
    const parts = [humanize(b.opcode)];
    for (const f of Object.values(b.fields || {})) {
        if (Array.isArray(f) && typeof f[0] !== 'undefined' && f[0] !== null) parts.push(`[${f[0]}]`);
    }
    for (const [key, inp] of Object.entries(b.inputs || {})) {
        if (key === 'SUBSTACK' || key === 'SUBSTACK2') continue;
        const v = renderValue(inp, blocks, depth);
        if (v !== '') parts.push(v);
    }
    return parts.join(' ').trim();
};

// Walk a stack starting at startId, appending one indented line per block and
// recursing into C-block substacks.
const walkStack = (startId, blocks, depth, out) => {
    let id = startId;
    let guard = 0;
    while (id && guard++ < 2000) {
        const b = blocks[id];
        if (!b || typeof b !== 'object' || Array.isArray(b)) break;
        out.push(`${'  '.repeat(depth)}${renderBlock(b, blocks, 0)}`);
        for (const sub of ['SUBSTACK', 'SUBSTACK2']) {
            const slot = b.inputs && b.inputs[sub];
            if (slot && typeof slot[1] === 'string') walkStack(slot[1], blocks, depth + 1, out);
        }
        id = b.next;
    }
};

// A friendly label for the hat block that starts a stack.
const eventLabel = (b, blocks) => {
    const field = name => (b.fields && b.fields[name] && b.fields[name][0]) || '';
    switch (b.opcode) {
    case 'event_whenflagclicked': return 'when green flag clicked';
    case 'event_whenthisspriteclicked': return 'when this sprite clicked';
    case 'event_whenstageclicked': return 'when stage clicked';
    case 'event_whenbroadcastreceived': return `when I receive "${field('BROADCAST_OPTION')}"`;
    case 'event_whenkeypressed': return `when ${field('KEY_OPTION')} key pressed`;
    case 'event_whenbackdropswitchesto': return `when backdrop switches to ${field('BACKDROP')}`;
    case 'event_whengreaterthan': return `when ${field('WHENGREATERTHANMENU') || 'loudness'} is greater than a value`;
    case 'control_start_as_clone': return 'when I start as a clone';
    case 'procedures_definition': {
        const protoId = b.inputs && b.inputs.custom_block && b.inputs.custom_block[1];
        const proto = typeof protoId === 'string' ? blocks[protoId] : null;
        const proccode = proto && proto.mutation && proto.mutation.proccode;
        return `define ${proccode || 'block'}`;
    }
    default: return humanize(b.opcode) || 'script';
    }
};

// Convert one target into its name/asset metadata plus a list of stacks.
const targetToStacks = target => {
    const blocks = target.blocks || {};
    const stacks = [];
    for (const [id, b] of Object.entries(blocks)) {
        if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
        if (!b.topLevel || b.shadow) continue;
        let lines = [];
        try {
            walkStack(id, blocks, 0, lines);
        } catch (err) {
            lines = [];
        }
        if (lines.length === 0) continue;
        stacks.push({
            event: eventLabel(b, blocks),
            text: lines.join('\n')
        });
    }
    return stacks;
};

/**
 * @param {string|object} projectJson - The project JSON (string or parsed object).
 * @returns {Array<{name: string, isStage: boolean, costumes: string, sounds: string,
 *   stacks: Array<{event: string, text: string}>}>} One entry per target, Stage last.
 */
const projectToText = projectJson => {
    const json = typeof projectJson === 'string' ? JSON.parse(projectJson) : projectJson;
    const targets = (json.targets || [])
        .slice()
        .sort((a, b) => (a.isStage === b.isStage ? 0 : (a.isStage ? 1 : -1)));

    return targets.map(target => ({
        name: target.isStage ? 'Stage' : target.name,
        isStage: !!target.isStage,
        costumes: (target.costumes || []).map(c => c.name).join(', '),
        sounds: (target.sounds || []).map(s => s.name).join(', '),
        stacks: targetToStacks(target)
    }));
};

export default projectToText;
export {projectToText};
