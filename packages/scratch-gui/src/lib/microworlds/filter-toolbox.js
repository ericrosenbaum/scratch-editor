/**
 * @file Restrict a toolbox XML document to a small set of allowed block opcodes.
 * Used by the Microworlds wizard to show only the blocks relevant to the current
 * step. Categories left with no allowed blocks are removed entirely.
 */

/**
 * @param {string} xml the full toolbox XML produced by makeToolboxXML()
 * @param {?Array<string>} allowedOpcodes opcodes to keep (null = keep everything)
 * @returns {string} the filtered toolbox XML
 */
const filterToolboxXML = (xml, allowedOpcodes) => {
    if (!allowedOpcodes || typeof DOMParser === 'undefined') return xml;
    const allowed = new Set(allowedOpcodes);
    const dom = new DOMParser().parseFromString(xml, 'text/xml');

    Array.from(dom.getElementsByTagName('category')).forEach(category => {
        const children = Array.from(category.children);
        const keptBlocks = children.filter(child =>
            child.tagName === 'block' && allowed.has(child.getAttribute('type')));
        if (keptBlocks.length === 0) {
            // No allowed blocks in this category — drop the whole category.
            category.parentNode.removeChild(category);
        } else {
            // Keep only the allowed blocks (drop labels, buttons, other blocks).
            children.forEach(child => {
                if (child.tagName !== 'block' || !allowed.has(child.getAttribute('type'))) {
                    category.removeChild(child);
                }
            });
        }
    });

    return new XMLSerializer().serializeToString(dom);
};

export {
    filterToolboxXML as default
};
