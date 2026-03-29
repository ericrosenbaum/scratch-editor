const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const Clone = require('../../util/clone');
const formatMessage = require('format-message');
const MathUtil = require('../../util/math-util');
const RenderedTarget = require('../../sprites/rendered-target');
const Matter = require('matter-js');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI0IiBmaWxsPSIjNEE5MEQ5Ii8+PGNpcmNsZSBjeD0iMjAiIGN5PSIxNCIgcj0iOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48bGluZSB4MT0iMjAiIHkxPSIyMiIgeDI9IjIwIiB5Mj0iMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtZGFzaGFycmF5PSIyIDIiLz48bGluZSB4MT0iOCIgeTE9IjM0IiB4Mj0iMzIiIHkyPSIzNCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=';

/**
 * Scratch coordinate system: center (0,0), x right+, y up+, 480x360
 * Matter.js: top-left origin, y down+, angles in radians
 *
 * Conversions:
 *   matterX = scratchX + 240
 *   matterY = 180 - scratchY
 *   matterAngle = (90 - scratchDirection) * Math.PI / 180
 */

const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;

const SCRATCH_TO_MATTER_X = x => x + (STAGE_WIDTH / 2);
const SCRATCH_TO_MATTER_Y = y => (STAGE_HEIGHT / 2) - y;
const MATTER_TO_SCRATCH_X = x => x - (STAGE_WIDTH / 2);
const MATTER_TO_SCRATCH_Y = y => (STAGE_HEIGHT / 2) - y;

const SCRATCH_DIR_TO_MATTER_ANGLE = dir => ((90 - dir) * Math.PI) / 180;
const MATTER_ANGLE_TO_SCRATCH_DIR = angle => 90 - ((angle * 180) / Math.PI);

const DEFAULT_GRAVITY_X = 0;
const DEFAULT_GRAVITY_Y = 1;
const DEFAULT_RESTITUTION = 0.3;
const DEFAULT_FRICTION = 0.5;

class Scratch3PhysicsBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        /**
         * Matter.js engine instance, created lazily on first use.
         * @type {Matter.Engine|null}
         */
        this._engine = null;

        /**
         * Map from target ID to Matter.js body.
         * @type {object}
         */
        this._bodies = {};

        /**
         * Set of target IDs currently being synced FROM physics TO sprite.
         * Used to avoid feedback loops with EVENT_TARGET_MOVED.
         * @type {Set<string>}
         */
        this._syncing = new Set();

        /**
         * Whether the simulation loop is running.
         * @type {boolean}
         */
        this._running = false;

        /**
         * Timestamp of last physics step.
         * @type {number}
         */
        this._lastStepTime = 0;

        /**
         * Debug canvas overlay element, or null if debug is off.
         * @type {HTMLCanvasElement|null}
         */
        this._debugCanvas = null;

        /**
         * Timeout handle for the simulation loop.
         * @type {number|null}
         */
        this._loopTimeout = null;

        /**
         * Set of collision pairs active this frame, as "idA-idB" strings.
         * @type {Set<string>}
         */
        this._activeCollisions = new Set();

        // Bind event handlers
        this._onTargetCreated = this._onTargetCreated.bind(this);
        this._onTargetMoved = this._onTargetMoved.bind(this);

        runtime.on('targetWasCreated', this._onTargetCreated);
        runtime.on('RUNTIME_DISPOSED', this._dispose.bind(this));

        // Expose on runtime so GUI/tests can access
        runtime.ext_physics = this;
    }

    /**
     * Physics state key for per-target custom state.
     * @returns {string} The state key.
     */
    static get STATE_KEY () {
        return 'Scratch.physics';
    }

    static get DEFAULT_PHYSICS_STATE () {
        return {
            enabled: false,
            mode: 'dynamic',
            restitution: DEFAULT_RESTITUTION,
            friction: DEFAULT_FRICTION
        };
    }

    // -- Engine lifecycle --

    _ensureEngine () {
        if (this._engine) return;
        this._engine = Matter.Engine.create({
            gravity: {x: DEFAULT_GRAVITY_X, y: DEFAULT_GRAVITY_Y}
        });

        // Track collisions
        Matter.Events.on(this._engine, 'collisionStart', event => {
            for (const pair of event.pairs) {
                const keyA = pair.bodyA.scratch_targetId;
                const keyB = pair.bodyB.scratch_targetId;
                if (keyA && keyB) {
                    this._activeCollisions.add(`${keyA}-${keyB}`);
                    this._activeCollisions.add(`${keyB}-${keyA}`);
                }
            }
        });

        Matter.Events.on(this._engine, 'collisionEnd', event => {
            for (const pair of event.pairs) {
                const keyA = pair.bodyA.scratch_targetId;
                const keyB = pair.bodyB.scratch_targetId;
                if (keyA && keyB) {
                    this._activeCollisions.delete(`${keyA}-${keyB}`);
                    this._activeCollisions.delete(`${keyB}-${keyA}`);
                }
            }
        });

        this._startLoop();
    }

    _startLoop () {
        if (this._running) return;
        this._running = true;
        this._lastStepTime = Date.now();
        this._loop();
    }

    _stopLoop () {
        this._running = false;
        if (this._loopTimeout !== null) {
            clearTimeout(this._loopTimeout);
            this._loopTimeout = null;
        }
    }

    _loop () {
        if (!this._running) return;

        const now = Date.now();
        const dt = Math.min(now - this._lastStepTime, 50);
        this._lastStepTime = now;

        if (this._engine) {
            Matter.Engine.update(this._engine, dt);
            this._syncBodiesToSprites();
            this._drawDebug();
        }

        const interval = (this.runtime.currentStepTime || 1000 / 60);
        this._loopTimeout = setTimeout(() => this._loop(), interval);
    }

    _dispose () {
        this._stopLoop();
        if (this._debugCanvas && this._debugCanvas.parentNode) {
            this._debugCanvas.parentNode.removeChild(this._debugCanvas);
        }
        this._debugCanvas = null;

        // Remove move listeners from all targets
        const targets = this.runtime.targets;
        if (targets) {
            for (const target of targets) {
                target.removeListener(
                    RenderedTarget.EVENT_TARGET_MOVED,
                    this._onTargetMoved
                );
            }
        }

        if (this._engine) {
            Matter.World.clear(this._engine.world);
            Matter.Engine.clear(this._engine);
            this._engine = null;
        }
        this._bodies = {};
        this._activeCollisions.clear();
    }

    // -- Per-target state --

    _getPhysicsState (target) {
        let state = target.getCustomState(Scratch3PhysicsBlocks.STATE_KEY);
        if (!state) {
            state = Clone.simple(Scratch3PhysicsBlocks.DEFAULT_PHYSICS_STATE);
            target.setCustomState(Scratch3PhysicsBlocks.STATE_KEY, state);
        }
        return state;
    }

    _onTargetCreated (newTarget, sourceTarget) {
        if (sourceTarget) {
            const sourceState = sourceTarget.getCustomState(
                Scratch3PhysicsBlocks.STATE_KEY
            );
            if (sourceState) {
                const clonedState = Clone.simple(sourceState);
                newTarget.setCustomState(
                    Scratch3PhysicsBlocks.STATE_KEY,
                    clonedState
                );
                if (clonedState.enabled) {
                    // Create a physics body for the clone
                    this._createBodyForTarget(newTarget);
                    newTarget.addListener(
                        RenderedTarget.EVENT_TARGET_MOVED,
                        this._onTargetMoved
                    );
                }
            }
        }
    }

    // -- Body creation / destruction --

    _createBodyForTarget (target) {
        if (this._bodies[target.id]) {
            Matter.Composite.remove(
                this._engine.world,
                this._bodies[target.id]
            );
            delete this._bodies[target.id];
        }

        const state = this._getPhysicsState(target);
        const isStatic = state.mode === 'static';
        const vertices = this._getHullVertices(target);

        let body;
        if (vertices && vertices.length >= 3) {
            try {
                body = Matter.Bodies.fromVertices(
                    SCRATCH_TO_MATTER_X(target.x),
                    SCRATCH_TO_MATTER_Y(target.y),
                    vertices,
                    {
                        isStatic: isStatic,
                        restitution: state.restitution,
                        friction: state.friction,
                        angle: SCRATCH_DIR_TO_MATTER_ANGLE(target.direction)
                    }
                );
            } catch {
                // fromVertices can fail on degenerate hulls; fall back to rectangle
                body = null;
            }
        }

        // Fallback to bounding box
        if (!body) {
            const bounds = this._getTargetBounds(target);
            const w = Math.max(bounds.width, 1);
            const h = Math.max(bounds.height, 1);
            body = Matter.Bodies.rectangle(
                SCRATCH_TO_MATTER_X(target.x),
                SCRATCH_TO_MATTER_Y(target.y),
                w,
                h,
                {
                    isStatic: isStatic,
                    restitution: state.restitution,
                    friction: state.friction,
                    angle: SCRATCH_DIR_TO_MATTER_ANGLE(target.direction)
                }
            );
        }

        // Tag the body with the target ID for collision lookup
        body.scratch_targetId = target.id;

        this._bodies[target.id] = body;
        Matter.Composite.add(this._engine.world, body);

        return body;
    }

    _removeBodyForTarget (target) {
        const body = this._bodies[target.id];
        if (body && this._engine) {
            Matter.Composite.remove(this._engine.world, body);
        }
        delete this._bodies[target.id];
    }

    _getHullVertices (target) {
        const renderer = this.runtime.renderer;
        if (!renderer) return null;

        const drawableID = target.drawableID;
        // Force hull computation via getBounds
        renderer.getBounds(drawableID);

        const drawable = renderer._allDrawables[drawableID];
        if (!drawable || !drawable._convexHullPoints ||
            drawable._convexHullPoints.length < 3) {
            return null;
        }

        const skinSize = drawable.skin.size;
        if (!skinSize || skinSize[0] === 0 || skinSize[1] === 0) return null;

        const scale = target.size / 100;

        // Convert pixel-space hull to vertices centered on the body origin.
        // Hull points are in texture pixel coordinates.
        return drawable._convexHullPoints.map(point => ({
            x: (point[0] - (skinSize[0] / 2)) * scale,
            y: (point[1] - (skinSize[1] / 2)) * scale
        }));
    }

    _getTargetBounds (target) {
        const renderer = this.runtime.renderer;
        if (renderer) {
            const bounds = renderer.getBounds(target.drawableID);
            return {
                width: Math.abs(bounds.right - bounds.left),
                height: Math.abs(bounds.top - bounds.bottom)
            };
        }
        return {width: 50, height: 50};
    }

    // -- Physics → Sprite sync --

    _syncBodiesToSprites () {
        const targets = this.runtime.targets;
        if (!targets) return;

        for (const target of targets) {
            if (target.isStage) continue;
            const state = target.getCustomState(Scratch3PhysicsBlocks.STATE_KEY);
            if (!state || !state.enabled) continue;

            const body = this._bodies[target.id];
            if (!body) continue;

            // Don't overwrite a sprite being dragged
            if (target.dragging) {
                // Instead, teleport the body to the drag position
                Matter.Body.setPosition(body, {
                    x: SCRATCH_TO_MATTER_X(target.x),
                    y: SCRATCH_TO_MATTER_Y(target.y)
                });
                Matter.Body.setVelocity(body, {x: 0, y: 0});
                Matter.Body.setAngularVelocity(body, 0);
                continue;
            }

            // Skip static bodies (they don't move from physics)
            if (body.isStatic) continue;

            const newX = MATTER_TO_SCRATCH_X(body.position.x);
            const newY = MATTER_TO_SCRATCH_Y(body.position.y);
            const newDir = MATTER_ANGLE_TO_SCRATCH_DIR(body.angle);

            // Mark that we're syncing so the move listener won't fight us
            this._syncing.add(target.id);

            target.setXY(newX, newY);
            target.setDirection(newDir);

            this._syncing.delete(target.id);
        }
    }

    // -- Sprite → Physics sync (external moves) --

    _onTargetMoved (target) {
        // Ignore moves that came from our own sync
        if (this._syncing.has(target.id)) return;

        const body = this._bodies[target.id];
        if (!body) return;

        // An external move happened (motion block, dragging, etc.)
        // Teleport the body and zero velocity
        Matter.Body.setPosition(body, {
            x: SCRATCH_TO_MATTER_X(target.x),
            y: SCRATCH_TO_MATTER_Y(target.y)
        });
        Matter.Body.setVelocity(body, {x: 0, y: 0});
        Matter.Body.setAngularVelocity(body, 0);
    }

    // -- Stage boundary walls --

    _ensureStageBounds () {
        if (this._stageBoundsAdded) return;
        this._stageBoundsAdded = true;

        const thickness = 60;
        const walls = [
            // Floor
            Matter.Bodies.rectangle(
                STAGE_WIDTH / 2, STAGE_HEIGHT + (thickness / 2),
                STAGE_WIDTH + (thickness * 2), thickness,
                {isStatic: true}
            ),
            // Ceiling
            Matter.Bodies.rectangle(
                STAGE_WIDTH / 2, -(thickness / 2),
                STAGE_WIDTH + (thickness * 2), thickness,
                {isStatic: true}
            ),
            // Left wall
            Matter.Bodies.rectangle(
                -(thickness / 2), STAGE_HEIGHT / 2,
                thickness, STAGE_HEIGHT + (thickness * 2),
                {isStatic: true}
            ),
            // Right wall
            Matter.Bodies.rectangle(
                STAGE_WIDTH + (thickness / 2), STAGE_HEIGHT / 2,
                thickness, STAGE_HEIGHT + (thickness * 2),
                {isStatic: true}
            )
        ];

        for (const wall of walls) {
            wall.scratch_targetId = '__wall__';
        }

        Matter.Composite.add(this._engine.world, walls);
    }

    // -- Debug visualization --

    _getOrCreateDebugCanvas () {
        if (this._debugCanvas) return this._debugCanvas;

        const renderer = this.runtime.renderer;
        if (!renderer || !renderer._gl) return null;

        const glCanvas = renderer._gl.canvas;
        const parent = glCanvas.parentElement;
        if (!parent) return null;

        const canvas = document.createElement('canvas');
        canvas.width = glCanvas.width;
        canvas.height = glCanvas.height;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '100';
        parent.style.position = 'relative';
        parent.appendChild(canvas);

        this._debugCanvas = canvas;
        return canvas;
    }

    _removeDebugCanvas () {
        if (this._debugCanvas && this._debugCanvas.parentNode) {
            this._debugCanvas.parentNode.removeChild(this._debugCanvas);
        }
        this._debugCanvas = null;
    }

    _drawDebug () {
        if (!this._debugCanvas) return;

        const canvas = this._debugCanvas;
        const renderer = this.runtime.renderer;
        if (renderer && renderer._gl) {
            const glCanvas = renderer._gl.canvas;
            if (canvas.width !== glCanvas.width ||
                canvas.height !== glCanvas.height) {
                canvas.width = glCanvas.width;
                canvas.height = glCanvas.height;
            }
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this._engine) return;

        // Scale from matter coords (480x360) to canvas pixels
        const scaleX = canvas.width / STAGE_WIDTH;
        const scaleY = canvas.height / STAGE_HEIGHT;

        const bodies = Matter.Composite.allBodies(this._engine.world);
        for (const body of bodies) {
            // Skip walls
            if (body.scratch_targetId === '__wall__') {
                this._drawBodyOutline(ctx, body, scaleX, scaleY, '#888888', 1);
                continue;
            }

            const color = body.isStatic ? '#00FF00' : '#FF4444';
            this._drawBodyOutline(ctx, body, scaleX, scaleY, color, 2);

            // Velocity vector for dynamic bodies
            if (!body.isStatic) {
                const cx = body.position.x * scaleX;
                const cy = body.position.y * scaleY;
                const vx = body.velocity.x * scaleX * 3;
                const vy = body.velocity.y * scaleY * 3;

                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + vx, cy + vy);
                ctx.strokeStyle = '#FFFF00';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Arrowhead
                const angle = Math.atan2(vy, vx);
                ctx.beginPath();
                ctx.moveTo(cx + vx, cy + vy);
                ctx.lineTo(
                    cx + vx - (8 * Math.cos(angle - 0.4)),
                    cy + vy - (8 * Math.sin(angle - 0.4))
                );
                ctx.moveTo(cx + vx, cy + vy);
                ctx.lineTo(
                    cx + vx - (8 * Math.cos(angle + 0.4)),
                    cy + vy - (8 * Math.sin(angle + 0.4))
                );
                ctx.stroke();
            }
        }

        // Draw constraints
        const constraints = Matter.Composite.allConstraints(this._engine.world);
        for (const constraint of constraints) {
            if (!constraint.bodyA || !constraint.bodyB) continue;
            const ax = constraint.bodyA.position.x * scaleX;
            const ay = constraint.bodyA.position.y * scaleY;
            const bx = constraint.bodyB.position.x * scaleX;
            const by = constraint.bodyB.position.y * scaleY;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw collision contact points
        if (this._engine.pairs && this._engine.pairs.list) {
            for (const pair of this._engine.pairs.list) {
                if (!pair.isActive) continue;
                for (const contact of pair.activeContacts) {
                    const px = contact.vertex.x * scaleX;
                    const py = contact.vertex.y * scaleY;
                    ctx.beginPath();
                    ctx.arc(px, py, 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#FF00FF';
                    ctx.fill();
                }
            }
        }
    }

    _drawBodyOutline (ctx, body, scaleX, scaleY, color, lineWidth) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        for (const part of body.parts) {
            const verts = part.vertices;
            if (verts.length < 2) continue;

            ctx.beginPath();
            ctx.moveTo(verts[0].x * scaleX, verts[0].y * scaleY);
            for (let i = 1; i < verts.length; i++) {
                ctx.lineTo(verts[i].x * scaleX, verts[i].y * scaleY);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    // -- Block definitions --

    getInfo () {
        return {
            id: 'physics',
            name: formatMessage({
                id: 'physics.categoryName',
                default: 'Physics',
                description: 'Label for the physics extension category'
            }),
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'enablePhysics',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.enablePhysics',
                        default: 'enable physics',
                        description: 'Enable physics simulation for this sprite'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'disablePhysics',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.disablePhysics',
                        default: 'disable physics',
                        description: 'Disable physics simulation for this sprite'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setPhysicsMode',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setPhysicsMode',
                        default: 'set physics mode [MODE]',
                        description: 'Set whether sprite is dynamic or static'
                    }),
                    arguments: {
                        MODE: {
                            type: ArgumentType.STRING,
                            menu: 'PHYSICS_MODE',
                            defaultValue: 'dynamic'
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'push',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.push',
                        default: 'push with force [FORCE] in direction [DIR]',
                        description: 'Apply force in a direction'
                    }),
                    arguments: {
                        FORCE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 5
                        },
                        DIR: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setVelocity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setVelocity',
                        default: 'set velocity x: [VX] y: [VY]',
                        description: 'Set linear velocity'
                    }),
                    arguments: {
                        VX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        VY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 5
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'applyTorque',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.applyTorque',
                        default: 'spin with force [TORQUE]',
                        description: 'Apply rotational torque'
                    }),
                    arguments: {
                        TORQUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.1
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setGravity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setGravity',
                        default: 'set gravity x: [X] y: [Y]',
                        description: 'Set world gravity'
                    }),
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: -10
                        }
                    }
                },
                {
                    opcode: 'setBounce',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setBounce',
                        default: 'set bounciness [BOUNCE]',
                        description: 'Set restitution'
                    }),
                    arguments: {
                        BOUNCE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.5
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setFriction',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setFriction',
                        default: 'set friction [FRICTION]',
                        description: 'Set friction coefficient'
                    }),
                    arguments: {
                        FRICTION: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.5
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'getSpeed',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'physics.getSpeed',
                        default: 'speed',
                        description: 'Report current speed'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'getVelocityX',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'physics.getVelocityX',
                        default: 'x velocity',
                        description: 'Report x velocity'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'getVelocityY',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'physics.getVelocityY',
                        default: 'y velocity',
                        description: 'Report y velocity'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'isTouchingPhysics',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'physics.isTouchingPhysics',
                        default: 'touching [SPRITE] ?',
                        description: 'Is this sprite colliding with another?'
                    }),
                    arguments: {
                        SPRITE: {
                            type: ArgumentType.STRING,
                            menu: 'SPRITE_MENU'
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setDebugDraw',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setDebugDraw',
                        default: 'set physics debug [ON_OFF]',
                        description: 'Toggle debug overlay'
                    }),
                    arguments: {
                        ON_OFF: {
                            type: ArgumentType.STRING,
                            menu: 'ON_OFF',
                            defaultValue: 'on'
                        }
                    }
                }
            ],
            menus: {
                PHYSICS_MODE: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'physics.mode.dynamic',
                                default: 'dynamic',
                                description: 'Dynamic physics mode'
                            }),
                            value: 'dynamic'
                        },
                        {
                            text: formatMessage({
                                id: 'physics.mode.static',
                                default: 'static',
                                description: 'Static physics mode'
                            }),
                            value: 'static'
                        }
                    ]
                },
                ON_OFF: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'physics.onOff.on',
                                default: 'on',
                                description: 'Turn on'
                            }),
                            value: 'on'
                        },
                        {
                            text: formatMessage({
                                id: 'physics.onOff.off',
                                default: 'off',
                                description: 'Turn off'
                            }),
                            value: 'off'
                        }
                    ]
                },
                SPRITE_MENU: {
                    acceptReporters: true,
                    items: '_getSpriteMenu'
                }
            }
        };
    }

    _getSpriteMenu () {
        const targets = this.runtime.targets;
        if (!targets) return [{text: '', value: ''}];
        const menu = [];
        for (const target of targets) {
            if (target.isStage || !target.isOriginal) continue;
            menu.push({text: target.sprite.name, value: target.id});
        }
        if (menu.length === 0) {
            menu.push({text: '', value: ''});
        }
        return menu;
    }

    // -- Block implementations --

    enablePhysics (args, util) {
        const target = util.target;
        if (target.isStage) return;

        this._ensureEngine();
        this._ensureStageBounds();

        const state = this._getPhysicsState(target);
        state.enabled = true;

        this._createBodyForTarget(target);

        // Listen for external moves
        target.removeListener(
            RenderedTarget.EVENT_TARGET_MOVED,
            this._onTargetMoved
        );
        target.addListener(
            RenderedTarget.EVENT_TARGET_MOVED,
            this._onTargetMoved
        );
    }

    disablePhysics (args, util) {
        const target = util.target;
        const state = this._getPhysicsState(target);
        state.enabled = false;

        this._removeBodyForTarget(target);

        target.removeListener(
            RenderedTarget.EVENT_TARGET_MOVED,
            this._onTargetMoved
        );
    }

    setPhysicsMode (args, util) {
        const target = util.target;
        const state = this._getPhysicsState(target);
        const mode = Cast.toString(args.MODE);

        if (mode !== 'dynamic' && mode !== 'static') return;
        state.mode = mode;

        const body = this._bodies[target.id];
        if (body) {
            Matter.Body.setStatic(body, mode === 'static');
        }
    }

    push (args, util) {
        const target = util.target;
        const body = this._bodies[target.id];
        if (!body || body.isStatic) return;

        const force = Cast.toNumber(args.FORCE);
        // Scratch direction: 0 = up, 90 = right
        // Convert to standard math angle where 0 = right, counter-clockwise
        const dirDeg = Cast.toNumber(args.DIR);
        const dirRad = ((90 - dirDeg) * Math.PI) / 180;

        // Scale force down for Matter.js (which works with small force values)
        const scale = 0.001;
        Matter.Body.applyForce(body, body.position, {
            x: Math.cos(dirRad) * force * scale,
            y: -Math.sin(dirRad) * force * scale // negative because Matter y is down
        });
    }

    setVelocity (args, util) {
        const target = util.target;
        const body = this._bodies[target.id];
        if (!body || body.isStatic) return;

        const vx = Cast.toNumber(args.VX);
        const vy = Cast.toNumber(args.VY);

        // Scratch y is inverted relative to Matter
        Matter.Body.setVelocity(body, {x: vx, y: -vy});
    }

    applyTorque (args, util) {
        const target = util.target;
        const body = this._bodies[target.id];
        if (!body || body.isStatic) return;

        const torque = Cast.toNumber(args.TORQUE);
        // Negative because Scratch rotation is CW for positive direction increase
        body.torque = -torque * 0.001;
    }

    setGravity (args) {
        this._ensureEngine();
        const x = Cast.toNumber(args.X);
        const y = Cast.toNumber(args.Y);
        // Scratch y-up → Matter y-down
        this._engine.gravity.x = x;
        this._engine.gravity.y = -y;
    }

    setBounce (args, util) {
        const target = util.target;
        const state = this._getPhysicsState(target);
        const bounce = MathUtil.clamp(Cast.toNumber(args.BOUNCE), 0, 1);
        state.restitution = bounce;

        const body = this._bodies[target.id];
        if (body) {
            body.restitution = bounce;
        }
    }

    setFriction (args, util) {
        const target = util.target;
        const state = this._getPhysicsState(target);
        const friction = MathUtil.clamp(Cast.toNumber(args.FRICTION), 0, 1);
        state.friction = friction;

        const body = this._bodies[target.id];
        if (body) {
            body.friction = friction;
        }
    }

    getSpeed (args, util) {
        const body = this._bodies[util.target.id];
        if (!body) return 0;
        return Math.round(
            Math.sqrt(
                (body.velocity.x * body.velocity.x) +
                (body.velocity.y * body.velocity.y)
            ) * 100
        ) / 100;
    }

    getVelocityX (args, util) {
        const body = this._bodies[util.target.id];
        if (!body) return 0;
        return Math.round(body.velocity.x * 100) / 100;
    }

    getVelocityY (args, util) {
        const body = this._bodies[util.target.id];
        if (!body) return 0;
        // Invert because Matter y-down → Scratch y-up
        return Math.round(-body.velocity.y * 100) / 100;
    }

    isTouchingPhysics (args, util) {
        const myId = util.target.id;
        const otherId = Cast.toString(args.SPRITE);
        if (!myId || !otherId) return false;
        return this._activeCollisions.has(`${myId}-${otherId}`);
    }

    setDebugDraw (args) {
        const onOff = Cast.toString(args.ON_OFF);
        if (onOff === 'on') {
            this._getOrCreateDebugCanvas();
        } else {
            this._removeDebugCanvas();
        }
    }
}

module.exports = Scratch3PhysicsBlocks;
