// Dark mode palette. Uses the high-contrast block colors for better
// legibility on dark backgrounds, with dark chrome for everything else.
// This object is passed directly to Blockly, hence the colour* fields need to
// be named exactly as they are, including the UK spelling of "colour".
import {
    blockColors as highContrastBlockColors,
    extensions as highContrastExtensions
} from '../high-contrast';

const blockColors = {
    // Pull block category colors directly from high-contrast mode
    motion: highContrastBlockColors.motion,
    looks: highContrastBlockColors.looks,
    sounds: highContrastBlockColors.sounds,
    control: highContrastBlockColors.control,
    event: highContrastBlockColors.event,
    sensing: highContrastBlockColors.sensing,
    pen: highContrastBlockColors.pen,
    operators: highContrastBlockColors.operators,
    data: highContrastBlockColors.data,
    data_lists: highContrastBlockColors.data_lists,
    more: highContrastBlockColors.more,

    // Workspace / toolbox / flyout chrome
    workspace: '#14141A',
    toolbox: '#1E1E2E',
    toolboxHover: '#855CD6',
    toolboxSelected: '#2A2A3E',
    toolboxText: '#E5E5E5',
    flyout: '#14141A',
    scrollbar: '#3A3A4A',
    scrollbarHover: '#55556A',

    // Text and fields — use high-contrast text colors (dark on light blocks)
    text: highContrastBlockColors.text,
    textFieldText: highContrastBlockColors.textFieldText,
    toolboxText: '#E5E5E5', // Keep toolbox text light (it's on dark chrome, not on blocks)
    textField: '#2A2A3E',

    // Interaction affordances
    insertionMarker: '#FFFFFF',
    insertionMarkerOpacity: 0.3,
    dragShadowOpacity: 0.7,
    stackGlow: '#855CD6',
    stackGlowSize: 4,
    stackGlowOpacity: 1,
    replacementGlow: '#855CD6',
    replacementGlowSize: 2,
    replacementGlowOpacity: 1,
    colourPickerStroke: '#E5E5E5',

    // CSS colours: support RGBA
    fieldShadow: 'rgba(0, 0, 0, 0.3)',
    dropDownShadow: 'rgba(0, 0, 0, 0.6)',
    numPadBackground: '#2A2A3E',
    numPadBorder: '#3A3A4A',
    numPadActiveBackground: '#855CD6',
    numPadText: 'white', // Do not use hex here, it cannot be inlined with data-uri SVG
    valueReportBackground: '#1E1E2E',
    valueReportBorder: '#3A3A4A',
    menuHover: 'rgba(255, 255, 255, 0.15)'
};

// Use same dark extension icons as high-contrast mode
const extensions = highContrastExtensions;

export {
    blockColors,
    extensions
};
