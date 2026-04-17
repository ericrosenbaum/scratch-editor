// Dark mode palette. Keeps category brand hues for block legibility, darkens
// all surrounding chrome (workspace, toolbox, flyout, menus, scrollbars).
// This object is passed directly to Blockly, hence the colour* fields need to
// be named exactly as they are, including the UK spelling of "colour".
const blockColors = {
    motion: {
        colourPrimary: '#4C97FF',
        colourSecondary: '#3373CC',
        colourTertiary: '#1E4D99',
        colourQuaternary: '#1E4D99'
    },
    looks: {
        colourPrimary: '#9966FF',
        colourSecondary: '#774DCB',
        colourTertiary: '#5C3B9C',
        colourQuaternary: '#5C3B9C'
    },
    sounds: {
        colourPrimary: '#CF63CF',
        colourSecondary: '#BD42BD',
        colourTertiary: '#8A2E8A',
        colourQuaternary: '#8A2E8A'
    },
    control: {
        colourPrimary: '#FFAB19',
        colourSecondary: '#CF8B17',
        colourTertiary: '#A16C10',
        colourQuaternary: '#A16C10'
    },
    event: {
        colourPrimary: '#FFBF00',
        colourSecondary: '#CC9900',
        colourTertiary: '#996F00',
        colourQuaternary: '#996F00'
    },
    sensing: {
        colourPrimary: '#5CB1D6',
        colourSecondary: '#2E8EB8',
        colourTertiary: '#21678B',
        colourQuaternary: '#21678B'
    },
    pen: {
        colourPrimary: '#0FBD8C',
        colourSecondary: '#0B8E69',
        colourTertiary: '#086548',
        colourQuaternary: '#086548'
    },
    operators: {
        colourPrimary: '#59C059',
        colourSecondary: '#389438',
        colourTertiary: '#276C27',
        colourQuaternary: '#276C27'
    },
    data: {
        colourPrimary: '#FF8C1A',
        colourSecondary: '#DB6E00',
        colourTertiary: '#A35200',
        colourQuaternary: '#A35200'
    },
    // This is not a new category, but rather for differentiation
    // between lists and scalar variables.
    data_lists: {
        colourPrimary: '#FF661A',
        colourSecondary: '#E64D00',
        colourTertiary: '#AD3A00',
        colourQuaternary: '#AD3A00'
    },
    more: {
        colourPrimary: '#FF6680',
        colourSecondary: '#FF3355',
        colourTertiary: '#C41F3E',
        colourQuaternary: '#C41F3E'
    },

    // Workspace / toolbox / flyout chrome
    workspace: '#14141A',
    toolbox: '#1E1E2E',
    toolboxHover: '#3FB08A',
    toolboxSelected: '#2A2A3E',
    toolboxText: '#E5E5E5',
    flyout: '#14141A',
    scrollbar: '#3A3A4A',
    scrollbarHover: '#55556A',

    // Text and fields
    text: '#FFFFFF',
    textField: '#2A2A3E',
    textFieldText: '#E5E5E5',

    // Interaction affordances
    insertionMarker: '#FFFFFF',
    insertionMarkerOpacity: 0.3,
    dragShadowOpacity: 0.7,
    stackGlow: '#3FB08A',
    stackGlowSize: 4,
    stackGlowOpacity: 1,
    replacementGlow: '#3FB08A',
    replacementGlowSize: 2,
    replacementGlowOpacity: 1,
    colourPickerStroke: '#E5E5E5',

    // CSS colours: support RGBA
    fieldShadow: 'rgba(0, 0, 0, 0.3)',
    dropDownShadow: 'rgba(0, 0, 0, 0.6)',
    numPadBackground: '#2A2A3E',
    numPadBorder: '#3A3A4A',
    numPadActiveBackground: '#3FB08A',
    numPadText: 'white', // Do not use hex here, it cannot be inlined with data-uri SVG
    valueReportBackground: '#1E1E2E',
    valueReportBorder: '#3A3A4A',
    menuHover: 'rgba(255, 255, 255, 0.15)'
};

const extensions = {};

export {
    blockColors,
    extensions
};
