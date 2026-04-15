/**
 * Capture blocks from the Scratch workspace and convert them
 * to the block-templates.js array format.
 */

/**
 * Walk a block tree starting from a top-level block and produce
 * an array in the block-templates format.
 * @param {object} blocks - The blocks map from vm.editingTarget.blocks._blocks
 * @param {string} topBlockId - The ID of the top-level block to start from
 * @returns {Array} Array of block objects in block-templates format
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

        // Copy fields as-is
        if (block.fields) {
            for (const [fieldName, field] of Object.entries(block.fields)) {
                templateBlock.fields[fieldName] = {
                    name: fieldName,
                    value: field.value
                };
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
 * Convert a block template array (as stored in block-templates.js or captured)
 * into Blockly XML string for rendering in BlockPreview.
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
                xml += `<field name="${escapeXml(fieldName)}">${escapeXml(field.value)}</field>`;
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

    const topBlock = templateBlocks.find(b => b.topLevel && !b.shadow);
    if (!topBlock) return '';

    return `<xml>${blockToXml(topBlock)}</xml>`;
};

export {captureWorkspaceBlocks, blocksToXml};
