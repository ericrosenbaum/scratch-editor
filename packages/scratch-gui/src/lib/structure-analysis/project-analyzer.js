/**
 * ProjectAnalyzer — Static analysis of Scratch project structure.
 *
 * Extracts sprites, events, broadcasts, global variables/lists,
 * clone relationships, and sensing relationships from VM targets.
 */

const HAT_OPCODES = [
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked',
    'event_whenstageclicked',
    'event_whenbroadcastreceived',
    'event_whenbackdropswitchesto',
    'event_whengreaterthan',
    'control_start_as_clone'
];

const VARIABLE_WRITE_OPCODES = [
    'data_setvariableto',
    'data_changevariableby'
];

const VARIABLE_READ_OPCODES = [
    'data_variable'
];

const LIST_WRITE_OPCODES = [
    'data_addtolist',
    'data_deleteoflist',
    'data_deletealloflist',
    'data_replaceitemoflist',
    'data_insertatlist'
];

const LIST_READ_OPCODES = [
    'data_itemoflist',
    'data_lengthoflist',
    'data_listcontainsitem',
    'data_itemnumoflist',
    'data_list'
];

const SENSING_OPCODES = {
    sensing_touchingobject: 'touching',
    sensing_distanceto: 'distance',
    sensing_touchingcolor: 'color'
};

/**
 * Hat block short labels and human-readable labels.
 */
const HAT_LABELS = {
    event_whenflagclicked: {label: 'Green Flag', shortLabel: '🟢'},
    event_whenkeypressed: {label: param => `key '${param}' pressed`, shortLabel: param => param},
    event_whenthisspriteclicked: {label: 'this sprite clicked', shortLabel: '👆'},
    event_whenstageclicked: {label: 'stage clicked', shortLabel: '🎭👆'},
    event_whenbroadcastreceived: {label: param => `receive '${param}'`, shortLabel: param => param},
    event_whenbackdropswitchesto: {label: param => `backdrop '${param}'`, shortLabel: param => param},
    event_whengreaterthan: {label: param => `${param} > threshold`, shortLabel: param => param},
    control_start_as_clone: {label: 'start as clone', shortLabel: '🐑'}
};

function isHatBlock (opcode) {
    return HAT_OPCODES.includes(opcode);
}

function isVariableBlock (opcode) {
    return VARIABLE_WRITE_OPCODES.includes(opcode) ||
        VARIABLE_READ_OPCODES.includes(opcode) ||
        LIST_WRITE_OPCODES.includes(opcode) ||
        LIST_READ_OPCODES.includes(opcode);
}

function isVariableWriteBlock (opcode) {
    return VARIABLE_WRITE_OPCODES.includes(opcode) ||
        LIST_WRITE_OPCODES.includes(opcode);
}

function extractHatParameter (block) {
    switch (block.opcode) {
    case 'event_whenkeypressed':
        return block.fields.KEY_OPTION ? block.fields.KEY_OPTION.value : null;
    case 'event_whenbroadcastreceived':
        return block.fields.BROADCAST_OPTION ? block.fields.BROADCAST_OPTION.value : null;
    case 'event_whenbackdropswitchesto':
        return block.fields.BACKDROP ? block.fields.BACKDROP.value : null;
    case 'event_whengreaterthan':
        return block.fields.WHENGREATERTHANMENU ? block.fields.WHENGREATERTHANMENU.value : null;
    default:
        return null;
    }
}

function makeEventId (opcode, parameter) {
    if (parameter !== null && parameter !== undefined) {
        return `${opcode}:${parameter}`;
    }
    return opcode;
}

function makeHatLabel (opcode, parameter) {
    const config = HAT_LABELS[opcode];
    if (!config) return opcode;
    if (typeof config.label === 'function') {
        return config.label(parameter || '?');
    }
    return config.label;
}

function makeHatShortLabel (opcode, parameter) {
    const config = HAT_LABELS[opcode];
    if (!config) return opcode;
    if (typeof config.shortLabel === 'function') {
        return config.shortLabel(parameter || '?');
    }
    return config.shortLabel;
}

/**
 * Resolve the broadcast message name from a broadcast/broadcastandwait block.
 */
function resolveBroadcastMessage (block, allBlocks) {
    const input = block.inputs && block.inputs.BROADCAST_INPUT;
    if (!input) return null;
    // input.block references the inner menu block
    const innerBlockId = input.block;
    if (!innerBlockId) return null;
    const innerBlock = allBlocks[innerBlockId];
    if (innerBlock && innerBlock.fields && innerBlock.fields.BROADCAST_OPTION) {
        return innerBlock.fields.BROADCAST_OPTION.value;
    }
    // Dynamic broadcast — can't resolve statically
    return null;
}

/**
 * Walk up the parent chain from a block to find its containing hat block.
 */
function findContainingHat (blockId, allBlocks) {
    let current = allBlocks[blockId];
    let iterations = 0;
    while (current && current.parent && iterations < 500) {
        current = allBlocks[current.parent];
        iterations++;
    }
    if (current && isHatBlock(current.opcode)) {
        const param = extractHatParameter(current);
        return current.opcode + (param ? `:${param}` : '');
    }
    return null;
}

/**
 * Extract the variable/list ID from a data block.
 */
function extractVariableId (block) {
    if (block.fields.VARIABLE) return block.fields.VARIABLE.id;
    if (block.fields.LIST) return block.fields.LIST.id;
    return null;
}

/**
 * Resolve clone target from a control_create_clone_of block.
 */
function resolveCloneTarget (block, allBlocks) {
    const input = block.inputs && block.inputs.CLONE_OPTION;
    if (!input) return null;
    const innerBlockId = input.block;
    if (!innerBlockId) return null;
    const innerBlock = allBlocks[innerBlockId];
    if (innerBlock && innerBlock.fields && innerBlock.fields.CLONE_OPTION) {
        return innerBlock.fields.CLONE_OPTION.value;
    }
    return null;
}

/**
 * Resolve sensing target from a sensing block.
 */
function resolveSensingTarget (block, allBlocks) {
    const input = block.inputs && block.inputs.TOUCHINGOBJECTMENU;
    if (!input) {
        const distInput = block.inputs && block.inputs.DISTANCETOMENU;
        if (!distInput) return null;
        const innerBlock = allBlocks[distInput.block];
        if (innerBlock && innerBlock.fields && innerBlock.fields.DISTANCETOMENU) {
            return innerBlock.fields.DISTANCETOMENU.value;
        }
        return null;
    }
    const innerBlockId = input.block;
    if (!innerBlockId) return null;
    const innerBlock = allBlocks[innerBlockId];
    if (innerBlock && innerBlock.fields && innerBlock.fields.TOUCHINGOBJECTMENU) {
        return innerBlock.fields.TOUCHINGOBJECTMENU.value;
    }
    return null;
}

/**
 * Extract sprite info from a target.
 */
function extractSpriteInfo (target) {
    const blocks = target.blocks._blocks || target.blocks;
    let scriptCount = 0;
    let blockCount = 0;

    const blockKeys = Object.keys(blocks);
    for (const blockId of blockKeys) {
        const block = blocks[blockId];
        if (!block || block.shadow) continue;
        blockCount++;
        if (block.topLevel && isHatBlock(block.opcode)) {
            scriptCount++;
        }
    }

    // Count sprite-local variables and lists
    const variables = target.variables || {};
    let variableCount = 0;
    let listCount = 0;
    for (const varId of Object.keys(variables)) {
        const v = variables[varId];
        if (v.type === 'list' || (Array.isArray(v) && v.length >= 3 && v[0] === 'list')) {
            listCount++;
        } else {
            variableCount++;
        }
    }

    return {
        id: target.id,
        name: target.getName ? target.getName() : (target.name || target.sprite?.name || 'Unknown'),
        isStage: target.isStage || false,
        costumeCount: target.costumes ? target.costumes.length :
            (target.sprite ? (target.sprite.costumes || []).length : 0),
        soundCount: target.sounds ? target.sounds.length :
            (target.sprite ? (target.sprite.sounds || []).length : 0),
        scriptCount,
        blockCount,
        variableCount,
        listCount
    };
}

/**
 * Collect the set of global variable/list IDs from the stage target.
 */
function getGlobalVariableIds (targets) {
    const globals = new Map(); // id -> {name, type}
    for (const target of targets) {
        if (!target.isStage) continue;
        const variables = target.variables || {};
        for (const varId of Object.keys(variables)) {
            const v = variables[varId];
            // VM runtime target variables: {id, name, type, value, ...}
            // Or array format from project JSON: [name, value] or [name, value, isCloud]
            let name, type;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                name = v.name;
                type = v.type === 'list' ? 'list' : 'variable';
            } else if (Array.isArray(v)) {
                name = v[0];
                type = (v.length >= 3 && v[0] === 'list') ? 'list' : 'variable';
            } else {
                continue;
            }
            globals.set(varId, {name, type});
        }
    }
    return globals;
}

/**
 * Main analysis function.
 * @param {Array} targets - Array of VM runtime targets (vm.runtime.targets)
 * @returns {object} ProjectStructure
 */
function analyzeProject (targets) {
    if (!targets || targets.length === 0) {
        return {
            sprites: [],
            events: [],
            broadcasts: [],
            globals: [],
            cloneRelationships: [],
            sensingRelationships: []
        };
    }

    const globalVarIds = getGlobalVariableIds(targets);

    // Raw collected data
    const rawHats = [];
    const rawBroadcastSends = [];
    const rawVariableRefs = [];
    const rawCloneCreations = [];
    const rawSensingRefs = [];
    const sprites = [];

    for (const target of targets) {
        const sprite = extractSpriteInfo(target);
        sprites.push(sprite);

        const blocks = target.blocks._blocks || target.blocks;
        const spriteName = sprite.name;

        for (const blockId of Object.keys(blocks)) {
            const block = blocks[blockId];
            if (!block || block.shadow) continue;

            const {opcode} = block;

            // Hat blocks
            if (isHatBlock(opcode)) {
                const parameter = extractHatParameter(block);
                rawHats.push({
                    sprite: spriteName,
                    opcode,
                    parameter
                });
            }

            // Broadcast sends
            if (opcode === 'event_broadcast' || opcode === 'event_broadcastandwait') {
                const message = resolveBroadcastMessage(block, blocks);
                rawBroadcastSends.push({
                    sprite: spriteName,
                    message,
                    isAndWait: opcode === 'event_broadcastandwait',
                    hatContext: findContainingHat(blockId, blocks)
                });
            }

            // Variable/list references
            if (isVariableBlock(opcode)) {
                const varId = extractVariableId(block);
                if (varId && globalVarIds.has(varId)) {
                    rawVariableRefs.push({
                        sprite: spriteName,
                        variableId: varId,
                        isWrite: isVariableWriteBlock(opcode)
                    });
                }
            }

            // Clone creation
            if (opcode === 'control_create_clone_of') {
                const cloneTarget = resolveCloneTarget(block, blocks);
                if (cloneTarget) {
                    rawCloneCreations.push({
                        creator: spriteName,
                        target: cloneTarget === '_myself_' ? spriteName : cloneTarget
                    });
                }
            }

            // Sensing
            if (SENSING_OPCODES[opcode]) {
                const sensedTarget = resolveSensingTarget(block, blocks);
                if (sensedTarget && sensedTarget !== '_mouse_' && sensedTarget !== '_edge_') {
                    rawSensingRefs.push({
                        sensor: spriteName,
                        target: sensedTarget,
                        type: SENSING_OPCODES[opcode]
                    });
                }
            }
        }
    }

    return groupAndConsolidate(sprites, rawHats, rawBroadcastSends, rawVariableRefs,
        rawCloneCreations, rawSensingRefs, globalVarIds);
}

/**
 * Group raw data into the final ProjectStructure.
 */
function groupAndConsolidate (
    sprites, rawHats, rawBroadcastSends, rawVariableRefs,
    rawCloneCreations, rawSensingRefs, globalVarIds
) {
    // --- Group hat blocks into events ---
    const eventMap = new Map(); // eventId -> EventInfo
    for (const hat of rawHats) {
        const eventId = makeEventId(hat.opcode, hat.parameter);
        if (!eventMap.has(eventId)) {
            eventMap.set(eventId, {
                id: eventId,
                type: hat.opcode,
                parameter: hat.parameter,
                label: makeHatLabel(hat.opcode, hat.parameter),
                shortLabel: makeHatShortLabel(hat.opcode, hat.parameter),
                sprites: []
            });
        }
        const event = eventMap.get(eventId);
        if (!event.sprites.includes(hat.sprite)) {
            event.sprites.push(hat.sprite);
        }
    }

    // Sort events: green flag first, then broadcasts, then keys, then others
    const eventOrder = {
        event_whenflagclicked: 0,
        event_whenbroadcastreceived: 1,
        event_whenkeypressed: 2,
        event_whenthisspriteclicked: 3,
        event_whenstageclicked: 3,
        event_whenbackdropswitchesto: 4,
        event_whengreaterthan: 5,
        control_start_as_clone: 6
    };
    const events = Array.from(eventMap.values()).sort((a, b) => {
        const orderA = eventOrder[a.type] ?? 99;
        const orderB = eventOrder[b.type] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        // Within same type, sort alphabetically by parameter
        return (a.parameter || '').localeCompare(b.parameter || '');
    });

    // --- Group broadcast sends with receives ---
    const broadcastMap = new Map(); // message -> BroadcastInfo
    for (const send of rawBroadcastSends) {
        const msg = send.message || '(dynamic)';
        if (!broadcastMap.has(msg)) {
            broadcastMap.set(msg, {
                message: msg,
                isDynamic: send.message === null,
                senders: [],
                receivers: []
            });
        }
        const bc = broadcastMap.get(msg);
        // Avoid duplicate senders from same sprite
        const existingSender = bc.senders.find(
            s => s.sprite === send.sprite && s.hatContext === send.hatContext
        );
        if (!existingSender) {
            bc.senders.push({
                sprite: send.sprite,
                isAndWait: send.isAndWait,
                scriptContext: send.hatContext
            });
        }
    }

    // Add receivers from hat blocks
    for (const hat of rawHats) {
        if (hat.opcode === 'event_whenbroadcastreceived' && hat.parameter) {
            if (!broadcastMap.has(hat.parameter)) {
                broadcastMap.set(hat.parameter, {
                    message: hat.parameter,
                    isDynamic: false,
                    senders: [],
                    receivers: []
                });
            }
            const bc = broadcastMap.get(hat.parameter);
            if (!bc.receivers.includes(hat.sprite)) {
                bc.receivers.push(hat.sprite);
            }
        }
    }

    const broadcasts = Array.from(broadcastMap.values())
        .filter(b => b.senders.length > 0 || b.receivers.length > 0);

    // --- Group variable references into globals ---
    const globalRefMap = new Map(); // varId -> {writers: Set, readers: Set}
    for (const ref of rawVariableRefs) {
        if (!globalRefMap.has(ref.variableId)) {
            globalRefMap.set(ref.variableId, {writers: new Set(), readers: new Set()});
        }
        const entry = globalRefMap.get(ref.variableId);
        if (ref.isWrite) {
            entry.writers.add(ref.sprite);
        } else {
            entry.readers.add(ref.sprite);
        }
    }

    const globals = [];
    for (const [varId, info] of globalVarIds.entries()) {
        const refs = globalRefMap.get(varId);
        if (!refs) continue;
        const allSprites = new Set([...refs.writers, ...refs.readers]);
        // Only include globals referenced by 2+ sprites
        if (allSprites.size >= 2) {
            globals.push({
                id: varId,
                name: info.name,
                type: info.type,
                writers: Array.from(refs.writers),
                readers: Array.from(refs.readers)
            });
        }
    }
    // Sort by total connections descending
    globals.sort((a, b) => {
        const connA = a.writers.length + a.readers.length;
        const connB = b.writers.length + b.readers.length;
        return connB - connA;
    });

    // --- Deduplicate clone relationships ---
    const cloneSet = new Set();
    const cloneRelationships = [];
    for (const clone of rawCloneCreations) {
        const key = `${clone.creator}->${clone.target}`;
        if (!cloneSet.has(key)) {
            cloneSet.add(key);
            // Check if target has a clone handler
            const hasHandler = rawHats.some(
                h => h.opcode === 'control_start_as_clone' && h.sprite === clone.target
            );
            cloneRelationships.push({
                creator: clone.creator,
                target: clone.target,
                hasCloneHandler: hasHandler
            });
        }
    }

    // --- Deduplicate sensing relationships ---
    const sensingSet = new Set();
    const sensingRelationships = [];
    for (const sense of rawSensingRefs) {
        const key = `${sense.sensor}->${sense.target}:${sense.type}`;
        if (!sensingSet.has(key)) {
            sensingSet.add(key);
            sensingRelationships.push({
                sensor: sense.sensor,
                target: sense.target,
                type: sense.type
            });
        }
    }

    return {
        sprites,
        events,
        broadcasts,
        globals,
        cloneRelationships,
        sensingRelationships
    };
}

export {analyzeProject, isHatBlock, extractHatParameter};
export default analyzeProject;
