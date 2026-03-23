/**
 * Converts the current project's blocks to human-readable scratchblocks text
 * using the sb-edit library. Lazy-loads sb-edit to avoid bloating the initial bundle.
 *
 * @param {object} vm - The scratch-vm instance
 * @returns {Promise<Object<string, string>>} Map of target name → scratchblocks text
 */
const getProjectText = async function (vm) {
    try {
        const {Project} = await import('sb-edit');
        const json = JSON.parse(vm.toJSON());
        const project = await Project.fromSb3JSON(json, {
            getAsset: () => Promise.resolve(new ArrayBuffer(0))
        });
        return project.toScratchblocks({indent: '  '});
    } catch (e) {
        console.warn('[blocks-to-text] Failed to convert project to text:', e);
        return {};
    }
};

export default getProjectText;
