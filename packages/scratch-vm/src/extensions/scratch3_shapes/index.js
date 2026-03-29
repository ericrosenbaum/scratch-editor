const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const Clone = require('../../util/clone');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHJ4PSIyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMS41Ii8+PGNpcmNsZSBjeD0iMjkiIGN5PSIxMCIgcj0iOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEuNSIvPjxwb2x5Z29uIHBvaW50cz0iMTAsMjIgMTgsMzggMiwzOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEuNSIvPjxwb2x5Z29uIHBvaW50cz0iMzAsMjIgMzUsMjYgMzMsMzIgMjcsMzIgMjUsMjYiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC40KSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEuNSIvPjwvc3ZnPg==';

/**
 * Enum for shape style values.
 * @readonly
 * @enum {string}
 */
const ShapeStyle = {
    OUTLINE: 'outline',
    FILLED: 'filled'
};

/**
 * Enum for shape menu values.
 * @readonly
 * @enum {string}
 */
const ShapeType = {
    CIRCLE: 'circle',
    SQUARE: 'square',
    TRIANGLE: 'triangle',
    DIAMOND: 'diamond',
    HEXAGON: 'hexagon',
    OCTAGON: 'octagon'
};

/**
 * Map of shape types to number of sides (and optional angle offset).
 * @type {Object.<string, {sides: number, offsetAngle: number}>}
 */
const ShapeConfig = {
    [ShapeType.CIRCLE]: {sides: 0, offsetAngle: 0},
    [ShapeType.SQUARE]: {sides: 4, offsetAngle: Math.PI / 4},
    [ShapeType.TRIANGLE]: {sides: 3, offsetAngle: 0},
    [ShapeType.DIAMOND]: {sides: 4, offsetAngle: 0},
    [ShapeType.HEXAGON]: {sides: 6, offsetAngle: 0},
    [ShapeType.OCTAGON]: {sides: 8, offsetAngle: Math.PI / 8}
};

/**
 * Enum for font family values.
 * @readonly
 * @enum {string}
 */
const FontFamily = {
    SANS_SERIF: 'Sans Serif',
    SERIF: 'Serif',
    HANDWRITING: 'Handwriting',
    MARKER: 'Marker',
    MONOSPACE: 'Monospace'
};

/**
 * Map of font family values to CSS font-family strings.
 * @type {Object.<string, string>}
 */
const FontFamilyCSS = {
    [FontFamily.SANS_SERIF]: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    [FontFamily.SERIF]: '"Times New Roman", Times, serif',
    [FontFamily.HANDWRITING]: '"Comic Sans MS", cursive',
    [FontFamily.MARKER]: '"Marker Felt", "Permanent Marker", fantasy',
    [FontFamily.MONOSPACE]: '"Courier New", Courier, monospace'
};

/**
 * Enum for text style values.
 * @readonly
 * @enum {string}
 */
const TextStyle = {
    NORMAL: 'normal',
    BOLD: 'bold',
    ITALIC: 'italic',
    BOLD_ITALIC: 'bold italic'
};

/**
 * Default pen attributes used when the pen extension isn't loaded.
 * Matches pen extension defaults (blue, size 1).
 * @type {object}
 */
const DEFAULT_PEN_ATTRIBUTES = {
    color4f: [0, 0, 1, 1],
    diameter: 1
};

/**
 * Host for the Shapes extension blocks in Scratch 3.0.
 * Draws geometric shapes on the pen layer using the sprite's position and heading.
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @class
 */
class Scratch3ShapesBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * The ID of the renderer Drawable corresponding to the pen layer.
         * @type {int}
         * @private
         */
        this._penDrawableId = -1;

        /**
         * The ID of the renderer Skin corresponding to the pen layer.
         * @type {int}
         * @private
         */
        this._penSkinId = -1;

        this._onTargetCreated = this._onTargetCreated.bind(this);
        runtime.on('targetWasCreated', this._onTargetCreated);
        runtime.on('RUNTIME_DISPOSED', this.eraseAll.bind(this));
    }

    /**
     * The key to load & store a target's shapes-related state.
     * @type {string}
     */
    static get STATE_KEY () {
        return 'Scratch.shapes';
    }

    /**
     * The default shapes state, to be used when a target has no existing shapes state.
     * @type {object}
     */
    static get DEFAULT_STATE () {
        return {
            style: ShapeStyle.OUTLINE,
            fontFamily: FontFamily.SANS_SERIF,
            textStyle: TextStyle.NORMAL
        };
    }

    /**
     * Retrieve the ID of the renderer "Skin" corresponding to the pen layer.
     * Shares the pen layer with the pen extension if it exists.
     * @returns {int} the Skin ID of the pen layer, or -1 on failure.
     * @private
     */
    _getPenLayerID () {
        if (this._penSkinId >= 0) {
            return this._penSkinId;
        }
        // Try to share the pen extension's layer
        if (this.runtime.ext_pen && this.runtime.ext_pen._penSkinId >= 0) {
            this._penSkinId = this.runtime.ext_pen._penSkinId;
            return this._penSkinId;
        }
        // Create our own pen layer
        if (this.runtime.renderer) {
            this._penSkinId = this.runtime.renderer.createPenSkin();
            this._penDrawableId = this.runtime.renderer.createDrawable(StageLayering.PEN_LAYER);
            this.runtime.renderer.updateDrawableSkinId(this._penDrawableId, this._penSkinId);
        }
        return this._penSkinId;
    }

    /**
     * @param {Target} target - collect shapes state for this target.
     * @returns {object} the mutable shapes state associated with that target.
     * @private
     */
    _getShapesState (target) {
        let shapesState = target.getCustomState(Scratch3ShapesBlocks.STATE_KEY);
        if (!shapesState) {
            shapesState = Clone.simple(Scratch3ShapesBlocks.DEFAULT_STATE);
            target.setCustomState(Scratch3ShapesBlocks.STATE_KEY, shapesState);
        }
        return shapesState;
    }

    /**
     * Get pen attributes (color and diameter) from the pen extension's state,
     * or use defaults if the pen extension isn't loaded.
     * @param {Target} target - the target to get pen attributes for.
     * @returns {object} penAttributes with color4f and diameter.
     * @private
     */
    _getPenAttributes (target) {
        const penState = target.getCustomState('Scratch.pen');
        if (penState) {
            return penState.penAttributes;
        }
        return DEFAULT_PEN_ATTRIBUTES;
    }

    /**
     * When a target is cloned, clone the shapes state.
     * @param {Target} newTarget - the newly created target.
     * @param {Target} [sourceTarget] - the target used as a source for the new clone.
     * @private
     */
    _onTargetCreated (newTarget, sourceTarget) {
        if (sourceTarget) {
            const shapesState = sourceTarget.getCustomState(Scratch3ShapesBlocks.STATE_KEY);
            if (shapesState) {
                newTarget.setCustomState(Scratch3ShapesBlocks.STATE_KEY, Clone.simple(shapesState));
            }
        }
    }

    /**
     * Rotate a point (dx, dy) around the origin by the given angle in radians.
     * @param {number} dx - x offset from center.
     * @param {number} dy - y offset from center.
     * @param {number} rad - rotation angle in radians.
     * @returns {Array.<number>} rotated [x, y] offsets.
     * @private
     */
    _rotatePoint (dx, dy, rad) {
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return [
            (dx * cos) - (dy * sin),
            (dx * sin) + (dy * cos)
        ];
    }

    /**
     * Convert Scratch direction (0=up, 90=right) to radians for rotation math.
     * @param {number} direction - Scratch direction in degrees.
     * @returns {number} angle in radians.
     * @private
     */
    _directionToRadians (direction) {
        return ((90 - direction) * Math.PI) / 180;
    }

    /**
     * Compute vertices of a regular polygon.
     * @param {number} cx - center x.
     * @param {number} cy - center y.
     * @param {number} radius - distance from center to vertex.
     * @param {number} sides - number of sides.
     * @param {number} rad - rotation angle in radians (from sprite direction).
     * @param {number} offsetAngle - additional angle offset for shape orientation.
     * @returns {Array.<Array.<number>>} array of [x, y] vertex positions.
     * @private
     */
    _getRegularPolygonVertices (cx, cy, radius, sides, rad, offsetAngle) {
        const vertices = [];
        for (let i = 0; i < sides; i++) {
            const angle = ((2 * Math.PI * i) / sides) + offsetAngle;
            const dx = radius * Math.sin(angle);
            const dy = radius * Math.cos(angle);
            const [rx, ry] = this._rotatePoint(dx, dy, rad);
            vertices.push([cx + rx, cy + ry]);
        }
        return vertices;
    }

    /**
     * Compute vertices of a star shape.
     * @param {number} cx - center x.
     * @param {number} cy - center y.
     * @param {number} outerRadius - outer point radius.
     * @param {number} innerRadius - inner point radius.
     * @param {number} points - number of star points.
     * @param {number} rad - rotation angle in radians.
     * @returns {Array.<Array.<number>>} array of [x, y] vertex positions.
     * @private
     */
    _getStarVertices (cx, cy, outerRadius, innerRadius, points, rad) {
        const vertices = [];
        const totalPoints = points * 2;
        for (let i = 0; i < totalPoints; i++) {
            const angle = (2 * Math.PI * i) / totalPoints;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const dx = radius * Math.sin(angle);
            const dy = radius * Math.cos(angle);
            const [rx, ry] = this._rotatePoint(dx, dy, rad);
            vertices.push([cx + rx, cy + ry]);
        }
        return vertices;
    }

    /**
     * Compute vertices of a rectangle.
     * @param {number} cx - center x.
     * @param {number} cy - center y.
     * @param {number} width - rectangle width.
     * @param {number} height - rectangle height.
     * @param {number} rad - rotation angle in radians.
     * @returns {Array.<Array.<number>>} array of [x, y] vertex positions.
     * @private
     */
    _getRectangleVertices (cx, cy, width, height, rad) {
        const hw = width / 2;
        const hh = height / 2;
        const corners = [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]];
        return corners.map(([dx, dy]) => {
            const [rx, ry] = this._rotatePoint(dx, dy, rad);
            return [cx + rx, cy + ry];
        });
    }

    /**
     * Draw an outline connecting the given vertices with penLine calls.
     * @param {Array.<Array.<number>>} vertices - array of [x, y] positions.
     * @param {int} penSkinId - the pen skin ID.
     * @param {object} penAttributes - pen attributes for rendering.
     * @private
     */
    _drawOutlineFromVertices (vertices, penSkinId, penAttributes) {
        const renderer = this.runtime.renderer;
        for (let i = 0; i < vertices.length; i++) {
            const next = (i + 1) % vertices.length;
            renderer.penLine(
                penSkinId, penAttributes,
                vertices[i][0], vertices[i][1],
                vertices[next][0], vertices[next][1]
            );
        }
    }

    /**
     * Fill a polygon using scanline fill algorithm.
     * Draws horizontal lines to fill the interior of the shape.
     * @param {Array.<Array.<number>>} vertices - array of [x, y] positions.
     * @param {int} penSkinId - the pen skin ID.
     * @param {Array.<number>} color4f - RGBA color array [r, g, b, a].
     * @private
     */
    _scanlineFill (vertices, penSkinId, color4f) {
        const renderer = this.runtime.renderer;
        const n = vertices.length;
        if (n < 3) return;

        // Find y bounds
        let yMin = vertices[0][1];
        let yMax = vertices[0][1];
        for (let i = 1; i < n; i++) {
            if (vertices[i][1] < yMin) yMin = vertices[i][1];
            if (vertices[i][1] > yMax) yMax = vertices[i][1];
        }

        const fillAttributes = {color4f: color4f, diameter: 1};
        const step = 0.5;

        for (let y = yMin; y <= yMax; y += step) {
            // Find intersections with all edges
            const intersections = [];
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const yi = vertices[i][1];
                const yj = vertices[j][1];
                if ((yi <= y && yj > y) || (yj <= y && yi > y)) {
                    const t = (y - yi) / (yj - yi);
                    intersections.push(vertices[i][0] + (t * (vertices[j][0] - vertices[i][0])));
                }
            }
            intersections.sort((a, b) => a - b);

            // Draw between pairs of intersections
            for (let k = 0; k < intersections.length - 1; k += 2) {
                renderer.penLine(
                    penSkinId, fillAttributes,
                    intersections[k], y,
                    intersections[k + 1], y
                );
            }
        }
    }

    /**
     * Compute vertices for an ellipse (approximated as polygon).
     * @param {number} cx - center x.
     * @param {number} cy - center y.
     * @param {number} rx - horizontal radius.
     * @param {number} ry - vertical radius.
     * @param {number} rad - rotation angle in radians.
     * @returns {Array.<Array.<number>>} array of [x, y] vertex positions.
     * @private
     */
    _getEllipseVertices (cx, cy, rx, ry, rad) {
        const circumference = Math.PI * (
            (3 * (rx + ry)) - Math.sqrt(((3 * rx) + ry) * (rx + (3 * ry)))
        );
        const segments = Math.max(36, Math.ceil(circumference / 3));
        const vertices = [];
        for (let i = 0; i < segments; i++) {
            const angle = (2 * Math.PI * i) / segments;
            const dx = rx * Math.cos(angle);
            const dy = ry * Math.sin(angle);
            const [rotX, rotY] = this._rotatePoint(dx, dy, rad);
            vertices.push([cx + rotX, cy + rotY]);
        }
        return vertices;
    }

    /**
     * Compute vertices for an arc (open path, not closed).
     * @param {number} cx - center x.
     * @param {number} cy - center y.
     * @param {number} radius - arc radius.
     * @param {number} startAngle - start angle in radians.
     * @param {number} sweepAngle - sweep angle in radians.
     * @returns {Array.<Array.<number>>} array of [x, y] vertex positions.
     * @private
     */
    _getArcVertices (cx, cy, radius, startAngle, sweepAngle) {
        const arcLength = Math.abs(radius * sweepAngle);
        const segments = Math.max(12, Math.ceil(arcLength / 3));
        const vertices = [];
        for (let i = 0; i <= segments; i++) {
            const angle = startAngle + ((sweepAngle * i) / segments);
            vertices.push([
                cx + (radius * Math.cos(angle)),
                cy + (radius * Math.sin(angle))
            ]);
        }
        return vertices;
    }

    /**
     * Initialize the shape type menu with localized strings.
     * @returns {Array} localized menu items.
     * @private
     */
    _initShapeMenu () {
        return [
            {
                text: formatMessage({
                    id: 'shapes.shapeMenu.circle',
                    default: 'circle',
                    description: 'label for circle shape in shapes extension'
                }),
                value: ShapeType.CIRCLE
            },
            {
                text: formatMessage({
                    id: 'shapes.shapeMenu.square',
                    default: 'square',
                    description: 'label for square shape in shapes extension'
                }),
                value: ShapeType.SQUARE
            },
            {
                text: formatMessage({
                    id: 'shapes.shapeMenu.triangle',
                    default: 'triangle',
                    description: 'label for triangle shape in shapes extension'
                }),
                value: ShapeType.TRIANGLE
            },
            {
                text: formatMessage({
                    id: 'shapes.shapeMenu.diamond',
                    default: 'diamond',
                    description: 'label for diamond shape in shapes extension'
                }),
                value: ShapeType.DIAMOND
            },
            {
                text: formatMessage({
                    id: 'shapes.shapeMenu.hexagon',
                    default: 'hexagon',
                    description: 'label for hexagon shape in shapes extension'
                }),
                value: ShapeType.HEXAGON
            },
            {
                text: formatMessage({
                    id: 'shapes.shapeMenu.octagon',
                    default: 'octagon',
                    description: 'label for octagon shape in shapes extension'
                }),
                value: ShapeType.OCTAGON
            }
        ];
    }

    /**
     * Initialize the style menu with localized strings.
     * @returns {Array} localized menu items.
     * @private
     */
    _initStyleMenu () {
        return [
            {
                text: formatMessage({
                    id: 'shapes.styleMenu.outline',
                    default: 'outline',
                    description: 'label for outline style in shapes extension'
                }),
                value: ShapeStyle.OUTLINE
            },
            {
                text: formatMessage({
                    id: 'shapes.styleMenu.filled',
                    default: 'filled',
                    description: 'label for filled style in shapes extension'
                }),
                value: ShapeStyle.FILLED
            }
        ];
    }

    /**
     * Initialize the font family menu with localized strings.
     * @returns {Array} localized menu items.
     * @private
     */
    _initFontMenu () {
        return [
            {
                text: formatMessage({
                    id: 'shapes.fontMenu.sansSerif',
                    default: 'Sans Serif',
                    description: 'label for sans-serif font in shapes extension'
                }),
                value: FontFamily.SANS_SERIF
            },
            {
                text: formatMessage({
                    id: 'shapes.fontMenu.serif',
                    default: 'Serif',
                    description: 'label for serif font in shapes extension'
                }),
                value: FontFamily.SERIF
            },
            {
                text: formatMessage({
                    id: 'shapes.fontMenu.handwriting',
                    default: 'Handwriting',
                    description: 'label for handwriting font in shapes extension'
                }),
                value: FontFamily.HANDWRITING
            },
            {
                text: formatMessage({
                    id: 'shapes.fontMenu.marker',
                    default: 'Marker',
                    description: 'label for marker font in shapes extension'
                }),
                value: FontFamily.MARKER
            },
            {
                text: formatMessage({
                    id: 'shapes.fontMenu.monospace',
                    default: 'Monospace',
                    description: 'label for monospace font in shapes extension'
                }),
                value: FontFamily.MONOSPACE
            }
        ];
    }

    /**
     * Initialize the text style menu with localized strings.
     * @returns {Array} localized menu items.
     * @private
     */
    _initTextStyleMenu () {
        return [
            {
                text: formatMessage({
                    id: 'shapes.textStyleMenu.normal',
                    default: 'normal',
                    description: 'label for normal text style'
                }),
                value: TextStyle.NORMAL
            },
            {
                text: formatMessage({
                    id: 'shapes.textStyleMenu.bold',
                    default: 'bold',
                    description: 'label for bold text style'
                }),
                value: TextStyle.BOLD
            },
            {
                text: formatMessage({
                    id: 'shapes.textStyleMenu.italic',
                    default: 'italic',
                    description: 'label for italic text style'
                }),
                value: TextStyle.ITALIC
            },
            {
                text: formatMessage({
                    id: 'shapes.textStyleMenu.boldItalic',
                    default: 'bold italic',
                    description: 'label for bold italic text style'
                }),
                value: TextStyle.BOLD_ITALIC
            }
        ];
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'shapes',
            name: formatMessage({
                id: 'shapes.categoryName',
                default: 'Shapes',
                description: 'Label for the shapes extension category'
            }),
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'drawShape',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawShape',
                        default: 'draw [SHAPE] of size [SIZE]',
                        description: 'draw a basic shape at the sprite position'
                    }),
                    arguments: {
                        SHAPE: {
                            type: ArgumentType.STRING,
                            menu: 'shapeMenu',
                            defaultValue: ShapeType.CIRCLE
                        },
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawRectangle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawRectangle',
                        default: 'draw rectangle width [WIDTH] height [HEIGHT]',
                        description: 'draw a rectangle at the sprite position'
                    }),
                    arguments: {
                        WIDTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        },
                        HEIGHT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawEllipse',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawEllipse',
                        default: 'draw ellipse width [WIDTH] height [HEIGHT]',
                        description: 'draw an ellipse at the sprite position'
                    }),
                    arguments: {
                        WIDTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        },
                        HEIGHT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawPolygon',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawPolygon',
                        default: 'draw polygon with [SIDES] sides of size [SIZE]',
                        description: 'draw a regular polygon at the sprite position'
                    }),
                    arguments: {
                        SIDES: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 6
                        },
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawStar',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawStar',
                        default: 'draw star with [POINTS] points size [SIZE] inner [INNER]',
                        description: 'draw a star at the sprite position'
                    }),
                    arguments: {
                        POINTS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 5
                        },
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        },
                        INNER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 40
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawArc',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawArc',
                        default: 'draw arc [ANGLE] degrees radius [RADIUS]',
                        description: 'draw an arc from the sprite heading'
                    }),
                    arguments: {
                        ANGLE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 90
                        },
                        RADIUS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawLine',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawLine',
                        default: 'draw line length [LENGTH]',
                        description: 'draw a line from the sprite in its heading direction'
                    }),
                    arguments: {
                        LENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setStyle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.setStyle',
                        default: 'set shape style [STYLE]',
                        description: 'set whether shapes are filled or outline'
                    }),
                    arguments: {
                        STYLE: {
                            type: ArgumentType.STRING,
                            menu: 'styleMenu',
                            defaultValue: ShapeStyle.OUTLINE
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'drawText',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.drawText',
                        default: 'draw text [TEXT] size [SIZE]',
                        description: 'draw text at the sprite position'
                    }),
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'hello'
                        },
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 24
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setFont',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.setFont',
                        default: 'set font to [FONT]',
                        description: 'set the font family for text drawing'
                    }),
                    arguments: {
                        FONT: {
                            type: ArgumentType.STRING,
                            menu: 'fontMenu',
                            defaultValue: FontFamily.SANS_SERIF
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setTextStyle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.setTextStyle',
                        default: 'set text style [TEXT_STYLE]',
                        description: 'set text style (bold, italic, etc.)'
                    }),
                    arguments: {
                        TEXT_STYLE: {
                            type: ArgumentType.STRING,
                            menu: 'textStyleMenu',
                            defaultValue: TextStyle.NORMAL
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'eraseAll',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'shapes.eraseAll',
                        default: 'erase all shapes',
                        description: 'erase all shapes drawn on the pen layer'
                    })
                }
            ],
            menus: {
                shapeMenu: {
                    acceptReporters: true,
                    items: this._initShapeMenu()
                },
                styleMenu: {
                    acceptReporters: true,
                    items: this._initStyleMenu()
                },
                fontMenu: {
                    acceptReporters: true,
                    items: this._initFontMenu()
                },
                textStyleMenu: {
                    acceptReporters: true,
                    items: this._initTextStyleMenu()
                }
            }
        };
    }

    /**
     * Draw a basic shape from the shape menu (circle, square, triangle, etc.).
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawShape (args, util) {
        const target = util.target;
        const size = Cast.toNumber(args.SIZE);
        if (size <= 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const shapesState = this._getShapesState(target);
        const penAttributes = this._getPenAttributes(target);
        const isFilled = shapesState.style === ShapeStyle.FILLED;
        const shapeType = Cast.toString(args.SHAPE);
        const cx = target.x;
        const cy = target.y;
        const rad = this._directionToRadians(target.direction);
        const radius = size / 2;

        if (shapeType === ShapeType.CIRCLE) {
            if (isFilled) {
                // Efficient: single penPoint draws a filled circle
                this.runtime.renderer.penPoint(
                    penSkinId,
                    {color4f: penAttributes.color4f, diameter: size},
                    cx, cy
                );
            } else {
                const vertices = this._getEllipseVertices(cx, cy, radius, radius, rad);
                this._drawOutlineFromVertices(vertices, penSkinId, penAttributes);
            }
        } else {
            const config = ShapeConfig[shapeType];
            if (!config) return;
            const vertices = this._getRegularPolygonVertices(
                cx, cy, radius, config.sides, rad, config.offsetAngle
            );
            if (isFilled) {
                this._scanlineFill(vertices, penSkinId, penAttributes.color4f);
            }
            this._drawOutlineFromVertices(vertices, penSkinId, penAttributes);
        }
        this.runtime.requestRedraw();
    }

    /**
     * Draw a rectangle.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawRectangle (args, util) {
        const target = util.target;
        const width = Cast.toNumber(args.WIDTH);
        const height = Cast.toNumber(args.HEIGHT);
        if (width <= 0 || height <= 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const shapesState = this._getShapesState(target);
        const penAttributes = this._getPenAttributes(target);
        const rad = this._directionToRadians(target.direction);
        const vertices = this._getRectangleVertices(target.x, target.y, width, height, rad);

        if (shapesState.style === ShapeStyle.FILLED) {
            this._scanlineFill(vertices, penSkinId, penAttributes.color4f);
        }
        this._drawOutlineFromVertices(vertices, penSkinId, penAttributes);
        this.runtime.requestRedraw();
    }

    /**
     * Draw an ellipse.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawEllipse (args, util) {
        const target = util.target;
        const width = Cast.toNumber(args.WIDTH);
        const height = Cast.toNumber(args.HEIGHT);
        if (width <= 0 || height <= 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const shapesState = this._getShapesState(target);
        const penAttributes = this._getPenAttributes(target);
        const isFilled = shapesState.style === ShapeStyle.FILLED;
        const rad = this._directionToRadians(target.direction);
        const rx = width / 2;
        const ry = height / 2;

        // Special case: if it's a circle (equal radii) and filled, use penPoint
        if (isFilled && Math.abs(rx - ry) < 0.5) {
            this.runtime.renderer.penPoint(
                penSkinId,
                {color4f: penAttributes.color4f, diameter: width},
                target.x, target.y
            );
        } else {
            const vertices = this._getEllipseVertices(target.x, target.y, rx, ry, rad);
            if (isFilled) {
                this._scanlineFill(vertices, penSkinId, penAttributes.color4f);
            }
            this._drawOutlineFromVertices(vertices, penSkinId, penAttributes);
        }
        this.runtime.requestRedraw();
    }

    /**
     * Draw a regular polygon with a custom number of sides.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawPolygon (args, util) {
        const target = util.target;
        const sides = Math.max(3, Math.round(Cast.toNumber(args.SIDES)));
        const size = Cast.toNumber(args.SIZE);
        if (size <= 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const shapesState = this._getShapesState(target);
        const penAttributes = this._getPenAttributes(target);
        const rad = this._directionToRadians(target.direction);
        const radius = size / 2;
        const vertices = this._getRegularPolygonVertices(target.x, target.y, radius, sides, rad, 0);

        if (shapesState.style === ShapeStyle.FILLED) {
            this._scanlineFill(vertices, penSkinId, penAttributes.color4f);
        }
        this._drawOutlineFromVertices(vertices, penSkinId, penAttributes);
        this.runtime.requestRedraw();
    }

    /**
     * Draw a star shape.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawStar (args, util) {
        const target = util.target;
        const points = Math.max(3, Math.round(Cast.toNumber(args.POINTS)));
        const size = Cast.toNumber(args.SIZE);
        const inner = Cast.toNumber(args.INNER);
        if (size <= 0 || inner <= 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const shapesState = this._getShapesState(target);
        const penAttributes = this._getPenAttributes(target);
        const rad = this._directionToRadians(target.direction);
        const outerRadius = size / 2;
        const innerRadius = inner / 2;
        const vertices = this._getStarVertices(
            target.x, target.y, outerRadius, innerRadius, points, rad
        );

        if (shapesState.style === ShapeStyle.FILLED) {
            this._scanlineFill(vertices, penSkinId, penAttributes.color4f);
        }
        this._drawOutlineFromVertices(vertices, penSkinId, penAttributes);
        this.runtime.requestRedraw();
    }

    /**
     * Draw an arc from the sprite's current heading.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawArc (args, util) {
        const target = util.target;
        const angleDeg = Cast.toNumber(args.ANGLE);
        const radius = Cast.toNumber(args.RADIUS);
        if (radius <= 0 || angleDeg === 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const penAttributes = this._getPenAttributes(target);

        // Convert Scratch direction to math angle for arc start
        // Scratch: 0=up, 90=right. Math: 0=right, 90=up (counter-clockwise).
        // Arc starts from sprite heading direction.
        const startAngleRad = ((90 - target.direction) * Math.PI) / 180;
        const sweepRad = (angleDeg * Math.PI) / 180;

        const vertices = this._getArcVertices(
            target.x, target.y, radius, startAngleRad, sweepRad
        );

        // Arc is an open path - draw lines between consecutive points (no closing)
        const renderer = this.runtime.renderer;
        for (let i = 0; i < vertices.length - 1; i++) {
            renderer.penLine(
                penSkinId, penAttributes,
                vertices[i][0], vertices[i][1],
                vertices[i + 1][0], vertices[i + 1][1]
            );
        }
        this.runtime.requestRedraw();
    }

    /**
     * Draw a line from the sprite in its heading direction.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawLine (args, util) {
        const target = util.target;
        const length = Cast.toNumber(args.LENGTH);
        if (length === 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;

        const penAttributes = this._getPenAttributes(target);

        // Compute end point along sprite's heading direction
        const rad = this._directionToRadians(target.direction);
        const endX = target.x + (length * Math.cos(rad));
        const endY = target.y + (length * Math.sin(rad));

        this.runtime.renderer.penLine(
            penSkinId, penAttributes,
            target.x, target.y,
            endX, endY
        );
        this.runtime.requestRedraw();
    }

    /**
     * Set the shape drawing style (filled or outline).
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    setStyle (args, util) {
        const shapesState = this._getShapesState(util.target);
        const style = Cast.toString(args.STYLE);
        if (style === ShapeStyle.FILLED || style === ShapeStyle.OUTLINE) {
            shapesState.style = style;
        }
    }

    /**
     * Draw text at the sprite position using an offscreen canvas and bitmap stamping.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    drawText (args, util) {
        const target = util.target;
        const text = Cast.toString(args.TEXT);
        const fontSize = Math.max(1, Math.min(200, Cast.toNumber(args.SIZE)));
        if (text.length === 0) return;

        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return;
        const renderer = this.runtime.renderer;
        if (!renderer) return;

        const shapesState = this._getShapesState(target);
        const penAttributes = this._getPenAttributes(target);

        // Get font settings
        const fontCSS = FontFamilyCSS[shapesState.fontFamily] || FontFamilyCSS[FontFamily.SANS_SERIF];
        const stylePrefix = shapesState.textStyle === TextStyle.NORMAL ? '' : `${shapesState.textStyle} `;
        const fontSpec = `${stylePrefix}${fontSize}px ${fontCSS}`;

        // Create offscreen canvas and render text
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Measure text to size canvas
        ctx.font = fontSpec;
        const metrics = ctx.measureText(text);
        const textWidth = Math.ceil(metrics.width) + 2;
        const textHeight = Math.ceil(fontSize * 1.3) + 2;

        canvas.width = textWidth;
        canvas.height = textHeight;

        // Re-apply font after resize (canvas clears on resize)
        ctx.font = fontSpec;
        ctx.textBaseline = 'top';

        // Use pen color for text
        const c = penAttributes.color4f;
        const r = Math.round(c[0] * 255);
        const g = Math.round(c[1] * 255);
        const b = Math.round(c[2] * 255);
        const a = c[3];
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillText(text, 1, 1);

        // Create temporary skin and drawable to stamp text onto pen layer
        const rotationCenter = [textWidth / 2, textHeight / 2];
        const skinId = renderer.createBitmapSkin(canvas, 1, rotationCenter);
        const drawableId = renderer.createDrawable(StageLayering.SPRITE_LAYER);
        renderer.updateDrawableSkinId(drawableId, skinId);
        renderer.updateDrawablePosition(drawableId, [target.x, target.y]);
        renderer.updateDrawableDirection(drawableId, target.direction);

        // Stamp onto pen layer
        renderer.penStamp(penSkinId, drawableId);

        // Clean up temporary resources
        renderer.destroyDrawable(drawableId, StageLayering.SPRITE_LAYER);
        renderer.destroySkin(skinId);

        this.runtime.requestRedraw();
    }

    /**
     * Set the font family for text drawing.
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    setFont (args, util) {
        const shapesState = this._getShapesState(util.target);
        const font = Cast.toString(args.FONT);
        if (FontFamilyCSS[font]) {
            shapesState.fontFamily = font;
        }
    }

    /**
     * Set the text style (normal, bold, italic, bold italic).
     * @param {object} args - the block arguments.
     * @param {object} util - utility object provided by the runtime.
     */
    setTextStyle (args, util) {
        const shapesState = this._getShapesState(util.target);
        const style = Cast.toString(args.TEXT_STYLE);
        if (style === TextStyle.NORMAL || style === TextStyle.BOLD ||
            style === TextStyle.ITALIC || style === TextStyle.BOLD_ITALIC) {
            shapesState.textStyle = style;
        }
    }

    /**
     * Erase all shapes on the pen layer.
     */
    eraseAll () {
        const penSkinId = this._getPenLayerID();
        if (penSkinId >= 0) {
            this.runtime.renderer.penClear(penSkinId);
            this.runtime.requestRedraw();
        }
    }
}

module.exports = Scratch3ShapesBlocks;
