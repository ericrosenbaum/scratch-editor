/**
 * Capture blocks from the Scratch workspace and convert them
 * to the captured-blocks array format used in tips.json's
 * `_capturedBlocks` field.
 */

/**
 * Walk a block tree starting from a top-level block and produce
 * an array of captured-block objects.
 * @param {object} blocks - The blocks map from vm.editingTarget.blocks._blocks
 * @param {string} topBlockId - The ID of the top-level block to start from
 * @returns {Array} Array of captured-block objects
 */
const walkBlockTree = function (blocks, topBlockId) {
    const result = [];
    const idMap = {};
    let counter = 1;

    // First pass: assign new IDs to all blocks we'll include
    const assignIds = function (blockId) {
        if (idMap[blockId]) return;
        const block = blocks[blockId];
        if (!block) return;

        const newId = `unstuck_capture_${counter}`;
        counter++;
        idMap[blockId] = newId;

        // Walk next chain
        if (block.next) {
            assignIds(block.next);
        }

        // Walk inputs (nested blocks and shadows)
        if (block.inputs) {
            for (const input of Object.values(block.inputs)) {
                if (input.block) assignIds(input.block);
                if (input.shadow && input.shadow !== input.block) {
                    assignIds(input.shadow);
                }
            }
        }
    };

    assignIds(topBlockId);

    // Second pass: build template objects
    for (const [originalId, newId] of Object.entries(idMap)) {
        const block = blocks[originalId];
        if (!block) continue;

        const templateBlock = {
            id: newId,
            opcode: block.opcode,
            next: block.next ? (idMap[block.next] || null) : null,
            parent: block.parent ? (idMap[block.parent] || null) : null,
            inputs: {},
            fields: {},
            shadow: block.shadow || false,
            topLevel: block.topLevel || false
        };

        if (block.topLevel) {
            templateBlock.x = 0;
            templateBlock.y = 0;
        }

        // Remap input references
        if (block.inputs) {
            for (const [inputName, input] of Object.entries(block.inputs)) {
                templateBlock.inputs[inputName] = {
                    name: inputName,
                    block: input.block ? (idMap[input.block] || null) : null,
                    shadow: input.shadow ? (idMap[input.shadow] || null) : null
                };
            }
        }

        // Copy fields as-is (preserve id/variableType so variable and list
        // reporters round-trip correctly)
        if (block.fields) {
            for (const [fieldName, field] of Object.entries(block.fields)) {
                const copied = {
                    name: fieldName,
                    value: field.value
                };
                if (field.id) copied.id = field.id;
                if (typeof field.variableType === 'string') {
                    copied.variableType = field.variableType;
                }
                templateBlock.fields[fieldName] = copied;
            }
        }

        result.push(templateBlock);
    }

    return result;
};

/**
 * Capture all top-level scripts from the current editing target.
 * Returns an array of {topBlockId, opcodeChain, blocks} for each script.
 * @param {object} vm - The scratch-vm instance
 * @returns {Array} Array of script objects
 */
const captureWorkspaceBlocks = function (vm) {
    if (!vm || !vm.editingTarget || !vm.editingTarget.blocks) {
        return [];
    }

    const allBlocks = vm.editingTarget.blocks._blocks;
    const scripts = [];

    for (const [blockId, block] of Object.entries(allBlocks)) {
        if (!block.topLevel || block.shadow) continue;

        // Build opcode chain for display
        const opcodeChain = [];
        let current = block;
        while (current) {
            if (!current.shadow) {
                opcodeChain.push(current.opcode);
            }
            current = current.next ? allBlocks[current.next] : null;
        }

        const templateBlocks = walkBlockTree(allBlocks, blockId);

        scripts.push({
            topBlockId: blockId,
            opcodeChain,
            blocks: templateBlocks
        });
    }

    return scripts;
};

/**
 * Convert a captured-blocks array (as stored in tips.json's `_capturedBlocks`
 * or freshly captured from a workspace) into a Blockly XML string for
 * rendering in BlockPreview.
 * @param {Array} templateBlocks - Array of block objects
 * @returns {string} Blockly XML string
 */
const blocksToXml = function (templateBlocks) {
    if (!templateBlocks || templateBlocks.length === 0) return '';

    const byId = {};
    for (const b of templateBlocks) {
        byId[b.id] = b;
    }

    const escapeXml = function (str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    const blockToXml = function (block) {
        if (!block) return '';

        const tag = block.shadow ? 'shadow' : 'block';
        let xml = `<${tag} type="${escapeXml(block.opcode)}"`;
        if (block.topLevel) {
            xml += ` x="${block.x || 10}" y="${block.y || 10}"`;
        }
        xml += '>';

        // Fields
        if (block.fields) {
            for (const [fieldName, field] of Object.entries(block.fields)) {
                xml += `<field name="${escapeXml(fieldName)}"`;
                if (field.id) {
                    xml += ` id="${escapeXml(field.id)}"`;
                }
                if (typeof field.variableType === 'string') {
                    xml += ` variabletype="${escapeXml(field.variableType)}"`;
                }
                xml += `>${escapeXml(field.value)}</field>`;
            }
        }

        // Inputs (values and statements)
        if (block.inputs) {
            for (const [inputName, input] of Object.entries(block.inputs)) {
                const innerBlock = input.block ? byId[input.block] : null;
                const shadowBlock = input.shadow ? byId[input.shadow] : null;

                // Determine if this is a statement (SUBSTACK) or value input
                const isStatement = inputName.startsWith('SUBSTACK');
                const wrapTag = isStatement ? 'statement' : 'value';

                xml += `<${wrapTag} name="${escapeXml(inputName)}">`;
                if (shadowBlock && shadowBlock !== innerBlock) {
                    xml += blockToXml(shadowBlock);
                }
                if (innerBlock) {
                    xml += blockToXml(innerBlock);
                } else if (shadowBlock) {
                    xml += blockToXml(shadowBlock);
                }
                xml += `</${wrapTag}>`;
            }
        }

        // Next block in chain
        if (block.next) {
            const nextBlock = byId[block.next];
            if (nextBlock) {
                xml += `<next>${blockToXml(nextBlock)}</next>`;
            }
        }

        xml += `</${tag}>`;
        return xml;
    };

    const topBlocks = templateBlocks.filter(b => b.topLevel && !b.shadow);
    if (topBlocks.length === 0) return '';

    // Collect variable/list/broadcast references from fields so Blockly
    // can pre-create them on the preview workspace. Without this, loading
    // a variable reporter into a workspace that lacks the variable throws
    // "Cannot read properties of null (reading 'getId')" when Blockly
    // later tries to serialize the field.
    const varsById = {};
    for (const b of templateBlocks) {
        if (!b.fields) continue;
        for (const field of Object.values(b.fields)) {
            if (field.id && typeof field.variableType === 'string') {
                varsById[field.id] = {
                    id: field.id,
                    type: field.variableType,
                    name: field.value
                };
            }
        }
    }
    const varEntries = Object.values(varsById);
    let variablesXml = '';
    if (varEntries.length > 0) {
        variablesXml = '<variables>';
        for (const v of varEntries) {
            variablesXml += `<variable type="${escapeXml(v.type)}" id="${escapeXml(v.id)}">${escapeXml(v.name)}</variable>`;
        }
        variablesXml += '</variables>';
    }

    return `<xml>${variablesXml}${topBlocks.map(blockToXml).join('')}</xml>`;
};

/**
 * Combine multiple captured scripts (from captureWorkspaceBlocks) into a
 * single flat block array suitable for saving as one template. Each script's
 * block IDs are re-prefixed so IDs don't collide across scripts.
 * @param {Array} scripts - Array of {blocks} script objects
 * @returns {Array} Flat array of block-template objects
 */
const combineScripts = function (scripts) {
    const combined = [];
    scripts.forEach((script, scriptIdx) => {
        const idRemap = {};
        for (const b of script.blocks) {
            idRemap[b.id] = `unstuck_s${scriptIdx}_${b.id.replace(/^unstuck_capture_/, '')}`;
        }
        for (const b of script.blocks) {
            const remapped = {
                ...b,
                id: idRemap[b.id],
                next: b.next ? idRemap[b.next] || null : null,
                parent: b.parent ? idRemap[b.parent] || null : null,
                inputs: {},
                fields: {...(b.fields || {})}
            };
            for (const [name, input] of Object.entries(b.inputs || {})) {
                remapped.inputs[name] = {
                    name,
                    block: input.block ? idRemap[input.block] || null : null,
                    shadow: input.shadow ? idRemap[input.shadow] || null : null
                };
            }
            combined.push(remapped);
        }
    });
    return combined;
};

export {captureWorkspaceBlocks, blocksToXml, combineScripts};
