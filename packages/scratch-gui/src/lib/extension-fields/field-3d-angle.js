/**
 * @file A custom scratch-blocks field: an angle picker (modeled on the core
 * "point in direction" protractor) with a little 3D cat card in the center
 * that rotates on the axis relevant to the block using it.
 *
 * Two variants are produced:
 *   - yaw   ("spin to" / "spin by")  → the cat turns left/right (rotateY)
 *   - pitch ("tilt to" / "tilt by")  → the cat tips forward/back (rotateX)
 *
 * The class extends Blockly.FieldNumber, so the number is shown on the block
 * itself and the picker appears in the drop-down, exactly like the core angle
 * field. Because a Blockly Field subclass can only be defined where scratch-
 * blocks is available (the GUI, not the renderer-agnostic VM), this is built
 * from a factory that receives the ScratchBlocks module at call time.
 */

/**
 * Provider that returns a data URI for the current editing sprite's costume,
 * or null. Wired up by the editor (which has the VM); see blocks.jsx. Kept at
 * module scope so all field instances share it.
 * @type {?function(): ?string}
 */
let spriteImageProvider = null;

/**
 * Register the callback used to fetch the current sprite costume image for the
 * picker preview. Pass null to clear it.
 * @param {?function(): ?string} provider - returns a costume data URI or null.
 */
const setSpriteImageProvider = provider => {
    spriteImageProvider = provider;
};

/**
 * Build an SVG data URI of a little cat. When `detailed` is false the cat is a
 * flat silhouette in the given colour (used for the extruded "thickness"
 * layers); when true it also carries the face features (used for the front
 * face of the card).
 * @param {boolean} detailed - whether to draw the face features.
 * @param {object} colors - the palette to draw with.
 * @returns {string} an `data:image/svg+xml` URI.
 */
const catDataUri = (detailed, colors) => {
    const {face, side, ear, eye, pupil, nose} = colors;
    const fill = detailed ? face : side;
    const parts = [
        // Ears.
        `<path d="M22,42 L33,9 L49,37 Z" fill="${fill}"/>`,
        `<path d="M78,42 L67,9 L51,37 Z" fill="${fill}"/>`,
        // Head.
        `<ellipse cx="50" cy="59" rx="34" ry="35" fill="${fill}"/>`
    ];
    if (detailed) {
        parts.push(
            // Inner ears.
            `<path d="M30,36 L35,17 L44,35 Z" fill="${ear}"/>`,
            `<path d="M70,36 L65,17 L56,35 Z" fill="${ear}"/>`,
            // Eyes.
            `<ellipse cx="38" cy="55" rx="7.5" ry="9.5" fill="${eye}"/>`,
            `<ellipse cx="62" cy="55" rx="7.5" ry="9.5" fill="${eye}"/>`,
            `<circle cx="39" cy="56" r="3.4" fill="${pupil}"/>`,
            `<circle cx="61" cy="56" r="3.4" fill="${pupil}"/>`,
            // Nose + mouth.
            `<path d="M46,67 L54,67 L50,73 Z" fill="${nose}"/>`,
            `<path d="M50,73 Q44,79 39,75 M50,73 Q56,79 61,75" ` +
                `stroke="${pupil}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
            // Whiskers.
            `<g stroke="${pupil}" stroke-width="1.3" stroke-linecap="round">` +
                `<line x1="18" y1="63" x2="35" y2="65"/><line x1="18" y1="71" x2="35" y2="70"/>` +
                `<line x1="82" y1="63" x2="65" y2="65"/><line x1="82" y1="71" x2="65" y2="70"/></g>`
        );
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parts.join('')}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/**
 * Build the yaw and pitch variants of the 3D angle field.
 * @param {object} ScratchBlocks - the scratch-blocks module (re-exports blockly/core).
 * @returns {{yaw: Function, pitch: Function}} the two field classes.
 */
const build3DAngleFields = ScratchBlocks => {
    const CAT_COLORS = {
        face: '#F9A03F',
        side: '#C46A12',
        ear: '#F7C6A0',
        eye: '#FFFFFF',
        pupil: '#1E2B31',
        nose: '#E0663A'
    };
    // Pre-encode the two cat images once; they never change.
    const CAT_FACE_URI = catDataUri(true, CAT_COLORS);
    const CAT_SIDE_URI = catDataUri(false, CAT_COLORS);

    /**
     * Shared base: the core angle picker (ported from scratch_field_angle) plus
     * a 3D cat card rendered in the center. Subclasses set AXIS.
     */
    class Field3DAngle extends ScratchBlocks.FieldNumber {
        /**
         * Which axis the center cat rotates on: 'yaw' (rotateY) or 'pitch' (rotateX).
         * Overridden by subclasses.
         */
        AXIS = 'yaw';

        // --- Angle-picker geometry (matches the core field_angle) ---
        ROUND = 15;
        HALF = 120 / 2;
        CLOCKWISE = true;
        OFFSET = 90;
        WRAP = 180;
        HANDLE_RADIUS = 10;
        ARROW_WIDTH = 10;
        HANDLE_GLOW_WIDTH = 3;
        RADIUS = this.HALF - this.HANDLE_RADIUS - this.HANDLE_GLOW_WIDTH;
        CENTER_RADIUS = 2;
        ARROW_SVG_PATH = 'icons/arrow.svg';

        // --- 3D cat card geometry ---
        CARD_WIDTH = 44;
        CARD_HEIGHT = 48;
        CARD_DEPTH = 16;
        CARD_LAYERS = 11;

        dispose () {
            super.dispose();
            this.gauge = null;
            this.cat3d = null;
            if (this.mouseDownWrapper_) {
                ScratchBlocks.browserEvents.unbind(this.mouseDownWrapper_);
                this.mouseDownWrapper_ = null;
            }
            if (this.mouseUpWrapper) {
                ScratchBlocks.browserEvents.unbind(this.mouseUpWrapper);
                this.mouseUpWrapper = null;
            }
            if (this.mouseMoveWrapper) {
                ScratchBlocks.browserEvents.unbind(this.mouseMoveWrapper);
                this.mouseMoveWrapper = null;
            }
        }

        showEditor_ (event) {
            const noFocus =
                ScratchBlocks.utils.userAgent.MOBILE ||
                ScratchBlocks.utils.userAgent.ANDROID ||
                ScratchBlocks.utils.userAgent.IPAD;
            super.showEditor_(event, noFocus, false);

            ScratchBlocks.DropDownDiv.hideWithoutAnimation();
            ScratchBlocks.DropDownDiv.clearContent();
            const div = ScratchBlocks.DropDownDiv.getContentDiv();
            const sourceBlock = this.getSourceBlock();
            if (!(sourceBlock instanceof ScratchBlocks.BlockSvg)) {
                throw new Error('[field-3d-angle] Missing source BlockSvg for showEditor_');
            }
            const parentBlock = sourceBlock.getParent();
            if (!parentBlock) {
                throw new Error('[field-3d-angle] Missing parent block for showEditor_');
            }

            const svg = ScratchBlocks.utils.dom.createSvgElement('svg', {
                'xmlns': 'http://www.w3.org/2000/svg',
                'xmlns:html': 'http://www.w3.org/1999/xhtml',
                'xmlns:xlink': 'http://www.w3.org/1999/xlink',
                'version': '1.1',
                'height': `${this.HALF * 2}px`,
                'width': `${this.HALF * 2}px`
            }, div);
            ScratchBlocks.utils.dom.createSvgElement('circle', {
                cx: this.HALF,
                cy: this.HALF,
                r: this.RADIUS,
                fill: parentBlock.getColourSecondary(),
                stroke: parentBlock.getColourTertiary(),
                class: 'blocklyAngleCircle'
            }, svg);
            this.gauge = ScratchBlocks.utils.dom.createSvgElement('path', {class: 'blocklyAngleGauge'}, svg);
            // The moving line; x2/y2 set in updateGraph.
            this.line = ScratchBlocks.utils.dom.createSvgElement('line', {
                x1: this.HALF,
                y1: this.HALF,
                class: 'blocklyAngleLine'
            }, svg);
            // The fixed line at the offset.
            const offsetRadians = (Math.PI * this.OFFSET) / 180;
            ScratchBlocks.utils.dom.createSvgElement('line', {
                x1: this.HALF,
                y1: this.HALF,
                x2: this.HALF + (this.RADIUS * Math.cos(offsetRadians)),
                y2: this.HALF - (this.RADIUS * Math.sin(offsetRadians)),
                class: 'blocklyAngleLine'
            }, svg);
            // Markers around the edge.
            for (let angle = 0; angle < 360; angle += 15) {
                ScratchBlocks.utils.dom.createSvgElement('line', {
                    x1: this.HALF + this.RADIUS - 13,
                    y1: this.HALF,
                    x2: this.HALF + this.RADIUS - 7,
                    y2: this.HALF,
                    class: 'blocklyAngleMarks',
                    transform: `rotate(${angle},${this.HALF},${this.HALF})`
                }, svg);
            }

            // The 3D cat card in the center (drawn under the drag handle).
            this.renderCat_(svg);

            // Handle group: a circle and the arrow image.
            this.handle = ScratchBlocks.utils.dom.createSvgElement('g', {}, svg);
            ScratchBlocks.utils.dom.createSvgElement('circle', {
                cx: 0,
                cy: 0,
                r: this.HANDLE_RADIUS,
                class: 'blocklyAngleDragHandle'
            }, this.handle);
            this.arrow = ScratchBlocks.utils.dom.createSvgElement('image', {
                width: this.ARROW_WIDTH,
                height: this.ARROW_WIDTH,
                x: -this.ARROW_WIDTH / 2,
                y: -this.ARROW_WIDTH / 2,
                class: 'blocklyAngleDragArrow'
            }, this.handle);
            this.arrow.setAttributeNS(
                'http://www.w3.org/1999/xlink',
                'xlink:href',
                ScratchBlocks.getMainWorkspace().options.pathToMedia + this.ARROW_SVG_PATH
            );

            ScratchBlocks.DropDownDiv.setColour(parentBlock.getColour(), parentBlock.getColourTertiary());
            ScratchBlocks.DropDownDiv.showPositionedByBlock(this, sourceBlock);

            this.mouseDownWrapper_ = ScratchBlocks.browserEvents.bind(
                this.handle, 'mousedown', this, this.onMouseDown.bind(this));

            this.updateGraph();
        }

        /**
         * Draw the little 3D cat card in the center of the picker using a
         * <foreignObject> holding CSS-3D-transformed HTML. Thickness is faked by
         * stacking silhouette layers along the Z axis; the front layer carries
         * the face. `updateGraph` rotates the card to match the current angle.
         * @param {SVGElement} svg - the picker's root SVG element.
         */
        renderCat_ (svg) {
            const size = 64;
            const fo = ScratchBlocks.utils.dom.createSvgElement('foreignObject', {
                x: this.HALF - (size / 2),
                y: this.HALF - (size / 2),
                width: size,
                height: size
            }, svg);

            // Prefer the actual editing sprite's current costume; fall back to
            // the built-in cat drawing when no sprite image is available.
            const spriteUri = spriteImageProvider ? spriteImageProvider() : null;
            const frontUri = spriteUri || CAT_FACE_URI;
            const sideUri = spriteUri || CAT_SIDE_URI;
            // With a real costume every layer is the same image, so darken the
            // interior layers to read as the extruded "side"; the drawn fallback
            // already ships a pre-darkened silhouette so it needs no filter.
            const sideFilter = spriteUri ? 'filter:brightness(0.55);' : '';

            const layers = [];
            for (let i = 0; i < this.CARD_LAYERS; i++) {
                const z = ((-this.CARD_DEPTH) / 2) + ((this.CARD_DEPTH * i) / (this.CARD_LAYERS - 1));
                const front = i === this.CARD_LAYERS - 1;
                const uri = front ? frontUri : sideUri;
                layers.push(
                    `<div style="position:absolute;inset:0;background-image:url('${uri}');` +
                    `background-size:contain;background-repeat:no-repeat;background-position:center;` +
                    `${front ? '' : sideFilter}transform:translateZ(${z}px);"></div>`
                );
            }
            const rotate = this.AXIS === 'pitch' ? 'rotateX' : 'rotateY';
            const card =
                `<div class="scratch3dAngleCat" style="position:relative;` +
                `width:${this.CARD_WIDTH}px;height:${this.CARD_HEIGHT}px;` +
                `transform-style:preserve-3d;transform:${rotate}(0deg);">${layers.join('')}</div>`;
            fo.innerHTML =
                `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;` +
                `display:flex;align-items:center;justify-content:center;` +
                `perspective:180px;pointer-events:none;">${card}</div>`;
            this.cat3d = fo.querySelector('.scratch3dAngleCat');
        }

        onMouseDown () {
            this.mouseMoveWrapper = ScratchBlocks.browserEvents.bind(
                document.body, 'mousemove', this, this.onMouseMove.bind(this));
            this.mouseUpWrapper = ScratchBlocks.browserEvents.bind(
                document.body, 'mouseup', this, this.onMouseUp.bind(this));
        }

        onMouseUp () {
            if (this.mouseMoveWrapper) {
                ScratchBlocks.browserEvents.unbind(this.mouseMoveWrapper);
                this.mouseMoveWrapper = null;
            }
            if (this.mouseUpWrapper) {
                ScratchBlocks.browserEvents.unbind(this.mouseUpWrapper);
                this.mouseUpWrapper = null;
            }
        }

        onMouseMove (e) {
            e.preventDefault();
            const ownerSvg = this.gauge && this.gauge.ownerSVGElement;
            if (!ownerSvg) return;
            const bBox = ownerSvg.getBoundingClientRect();
            const dx = e.clientX - bBox.left - this.HALF;
            const dy = e.clientY - bBox.top - this.HALF;
            let angle = Math.atan(-dy / dx);
            if (isNaN(angle)) return;
            angle = this.toDegrees(angle);
            if (dx < 0) {
                angle += 180;
            } else if (dy > 0) {
                angle += 360;
            }
            if (this.CLOCKWISE) {
                angle = this.OFFSET + 360 - angle;
            } else {
                angle -= this.OFFSET;
            }
            if (this.ROUND) {
                angle = Math.round(angle / this.ROUND) * this.ROUND;
            }
            this.setValue(angle);
            this.setEditorValue_(this.getValue());
            this.resizeEditor_();
        }

        updateGraph () {
            if (!this.gauge) return;
            const angleDegrees = (Number(this.getValue()) % 360) + this.OFFSET;
            let angleRadians = this.toRadians(angleDegrees);
            const path = ['M ', this.HALF, ',', this.HALF];
            let x2 = this.HALF;
            let y2 = this.HALF;
            if (!isNaN(angleRadians)) {
                const angle1 = this.toRadians(this.OFFSET);
                const x1 = Math.cos(angle1) * this.RADIUS;
                const y1 = Math.sin(angle1) * -this.RADIUS;
                if (this.CLOCKWISE) {
                    angleRadians = (2 * angle1) - angleRadians;
                }
                x2 += Math.cos(angleRadians) * this.RADIUS;
                y2 -= Math.sin(angleRadians) * this.RADIUS;
                const largeFlag = Math.abs(angleDegrees - this.OFFSET) > 180 ? 1 : 0;
                let sweepFlag = Number(this.CLOCKWISE);
                if (angleDegrees < this.OFFSET) {
                    sweepFlag = 1 - sweepFlag;
                }
                path.push(
                    ' l ', x1, ',', y1,
                    ' A ', this.RADIUS, ',', this.RADIUS,
                    ' 0 ', largeFlag, ' ', sweepFlag, ' ', x2, ',', y2, ' z');
                let imageRotation;
                if (this.CLOCKWISE) {
                    imageRotation = angleDegrees + (2 * this.OFFSET);
                } else {
                    imageRotation = -angleDegrees;
                }
                if (this.arrow) this.arrow.setAttribute('transform', `rotate(${imageRotation})`);
            }
            this.gauge.setAttribute('d', path.join(''));
            if (this.line) {
                this.line.setAttribute('x2', `${x2}`);
                this.line.setAttribute('y2', `${y2}`);
            }
            if (this.handle) this.handle.setAttribute('transform', `translate(${x2},${y2})`);

            // Spin the center cat to match the picked angle, on this field's axis.
            if (this.cat3d) {
                const value = Number(this.getValue()) || 0;
                const rotate = this.AXIS === 'pitch' ? 'rotateX' : 'rotateY';
                // Negate pitch so a positive "tilt" tips the cat's face upward,
                // matching the sprite tipping toward the camera.
                const deg = this.AXIS === 'pitch' ? -value : value;
                this.cat3d.style.transform = `${rotate}(${deg}deg)`;
            }
        }

        doClassValidation_ (text) {
            if (text === null) return null;
            let n = parseFloat(text || '0');
            if (isNaN(n)) return null;
            n = n % 360;
            if (n < 0) n += 360;
            if (n > this.WRAP) n -= 360;
            return Number(n);
        }

        doValueUpdate_ (newValue) {
            super.doValueUpdate_(newValue);
            this.updateGraph();
        }

        toDegrees (radians) {
            return (radians * 180) / Math.PI;
        }

        toRadians (degrees) {
            return (degrees * Math.PI) / 180;
        }
    }

    class Field3DAngleYaw extends Field3DAngle {
        AXIS = 'yaw';
        static fromJson (options) {
            return new this(options.value);
        }
    }

    class Field3DAnglePitch extends Field3DAngle {
        AXIS = 'pitch';
        static fromJson (options) {
            return new this(options.value);
        }
    }

    return {yaw: Field3DAngleYaw, pitch: Field3DAnglePitch};
};

export default build3DAngleFields;
export {setSpriteImageProvider};
