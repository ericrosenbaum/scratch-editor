/**
 * @file Registry of custom scratch-blocks fields that ship with built-in
 * extensions.
 *
 * Extensions declare a custom field type in their `getInfo().customFieldTypes`,
 * which the VM turns into block/shadow JSON and announces via the
 * EXTENSION_FIELD_ADDED event. The field's *implementation* is a Blockly.Field
 * subclass, which can only be defined here in the GUI (the VM is renderer-
 * agnostic and has no access to scratch-blocks). So the VM passes a null
 * implementation and the GUI resolves the class by field name from this map.
 *
 * The event carries the namespaced field name `field_<extensionId>_<typeName>`
 * (see Runtime._buildCustomFieldInfo), so keys here use that exact form.
 *
 * Externally-loaded extensions that *can* supply a real Field subclass through
 * the event bypass this map (see handleExtensionFieldAdded in blocks.jsx).
 */
import build3DAngleFields, {setSpriteImageProvider} from './field-3d-angle';

/**
 * Lazily-built, memoized map of field name → Field class. Built lazily because
 * the field classes must extend classes from the ScratchBlocks module, which is
 * only available once the editor has it.
 * @type {?object}
 */
let cache = null;

/**
 * Get the map of built-in extension field names to their Blockly.Field classes.
 * @param {object} ScratchBlocks - the scratch-blocks module.
 * @returns {object.<string, Function>} field name → Field class.
 */
const getExtensionFieldClasses = ScratchBlocks => {
    if (cache) return cache;
    const angle3d = build3DAngleFields(ScratchBlocks);
    cache = {
        // 3D Pop-Up extension (id 'popup'): spin = yaw, tilt = pitch.
        field_popup_spinAngle: angle3d.yaw,
        field_popup_tiltAngle: angle3d.pitch
    };
    return cache;
};

export {getExtensionFieldClasses, setSpriteImageProvider};
