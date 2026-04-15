/**
 * Extracts a compact representation of the current project state from the VM.
 * Used to provide context to the tip matching system.
 * @param {object} vm - The scratch-vm instance
 * @param {number} activeTabIndex - The current editor tab (0=Code, 1=Costumes, 2=Sounds)
 * @returns {object} Compact project context
 */
const extractProjectContext = function (vm, activeTabIndex) {
    const runtime = vm.runtime;
    const targets = runtime.targets.filter(t => !t.isOriginal || t.isOriginal);
    const stage = runtime.getTargetForStage();
    const editingTarget = runtime.getEditingTarget();

    const TAB_NAMES = ['code', 'costumes', 'sounds'];

    const getTargetSummary = function (target) {
        const blocks = target.blocks;
        const scripts = blocks.getScripts();
        const categories = new Set();
        let blockCount = 0;
        const hatOpcodes = [];

        // Walk all blocks to count and categorize
        for (const scriptId of scripts) {
            let blockId = scriptId;
            while (blockId) {
                const block = blocks.getBlock(blockId);
                if (!block) break;
                blockCount++;
                // Extract category from opcode (e.g., "motion_movesteps" -> "motion")
                const category = block.opcode.split('_')[0];
                categories.add(category);
                // Track hat blocks (top-level blocks that start scripts)
                if (blockId === scriptId) {
                    hatOpcodes.push(block.opcode);
                }
                blockId = block.next;
            }
        }

        return {
            name: target.getName(),
            isStage: target.isStage,
            costumeCount: target.getCostumes().length,
            soundCount: target.getSounds().length,
            scriptCount: scripts.length,
            blockCount,
            blockCategories: Array.from(categories),
            hatOpcodes
        };
    };

    const getVariables = function (target) {
        const variables = [];
        const lists = [];
        for (const varId in target.variables) {
            const v = target.variables[varId];
            if (v.type === 'list') {
                lists.push({name: v.name, length: Array.isArray(v.value) ? v.value.length : 0});
            } else if (v.type === '' || v.type === 'scalar') {
                variables.push({name: v.name, value: v.value});
            }
        }
        return {variables, lists};
    };

    // Build sprite summaries (non-stage, non-clone targets)
    const sprites = targets
        .filter(t => !t.isStage && t.isOriginal)
        .map(t => {
            const summary = getTargetSummary(t);
            const {variables, lists} = getVariables(t);
            return Object.assign({}, summary, {
                localVariables: variables,
                localLists: lists
            });
        });

    // Stage summary + global variables
    const stageSummary = stage ? getTargetSummary(stage) : null;
    const globalVars = stage ? getVariables(stage) : {variables: [], lists: []};

    // Loaded extensions
    const extensions = Array.from(runtime._loadedExtensions ?
        runtime._loadedExtensions.keys() : []);

    // Total block count across all targets
    const totalBlockCount = sprites.reduce((sum, s) => sum + s.blockCount, 0) +
        (stageSummary ? stageSummary.blockCount : 0);

    return {
        sprites,
        stage: stageSummary,
        globalVariables: globalVars.variables,
        globalLists: globalVars.lists,
        extensions,
        activeTab: TAB_NAMES[activeTabIndex] || 'code',
        editingTarget: editingTarget ? editingTarget.getName() : null,
        totalBlockCount,
        hasVariables: globalVars.variables.length > 0 ||
            sprites.some(s => s.localVariables.length > 0),
        hasLists: globalVars.lists.length > 0 ||
            sprites.some(s => s.localLists.length > 0)
    };
};

export default extractProjectContext;
