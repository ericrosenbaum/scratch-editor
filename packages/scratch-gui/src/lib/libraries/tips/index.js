/**
 * Static tip library for the "Get Unstuck" feature.
 *
 * Each tip has:
 * - id: unique identifier
 * - text: brief, kid-friendly explanation (one sentence)
 * - tags: categories for filtering
 * - followUps: IDs of related tips to suggest next
 * - relevance.keywords: words that match user queries
 * - relevance.projectSignals: project state signals for context-aware matching
 *
 * - blockExample: key into blockTemplates for preview + "add to project"
 */

/* eslint-disable @stylistic/max-len */
const tips = {

    // ──────────────────────────────────────────────
    // ORIGINAL TIPS (updated followUps where noted)
    // ──────────────────────────────────────────────

    'nothing-happens': {
        id: 'nothing-happens',
        followUpLabel: 'Start your code',
        text: 'Your code needs a "hat block" on top to know when to start — try "when green flag clicked"!',
        tags: ['events', 'start', 'beginner', 'hat'],
        followUps: ['green-flag', 'add-event-block', 'no-visible-effect', 'block-already-there'],
        blockExample: 'whenFlagMove',
        pointers: [
            {
                label: 'Find "when green flag clicked" here',
                target: '.blocklyToolboxCategory#events',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['nothing', 'happens', 'work', 'broken', 'start', 'run', 'won\'t'],
            projectSignals: {
                missing: ['event_whenflagclicked', 'event_whenkeypressed', 'event_whenthisspriteclicked']
            }
        }
    },
    'green-flag': {
        id: 'green-flag',
        followUpLabel: 'Run your project',
        text: 'Click the green flag above the stage to run your project!',
        tags: ['events', 'start', 'beginner'],
        followUps: ['nothing-happens', 'stop-project', 'reset-at-start'],
        pointers: [
            {
                label: 'Click this green flag to start!',
                target: 'button[class*="green-flag"]',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['green', 'flag', 'start', 'run', 'play', 'begin']
        }
    },
    'move-sprite': {
        id: 'move-sprite',
        followUpLabel: 'Move a sprite',
        text: 'Use "move 10 steps" from the Motion category to make your sprite move!',
        tags: ['motion', 'movement', 'beginner'],
        followUps: ['move-with-keys', 'glide-to-position', 'negative-numbers'],
        blockExample: 'whenFlagMove',
        pointers: [
            {
                label: 'Motion blocks are here',
                target: '.blocklyToolboxCategory#motion',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['move', 'walk', 'go', 'motion', 'forward'],
            projectSignals: {
                missing: ['motion_movesteps']
            }
        }
    },
    'move-with-keys': {
        id: 'move-with-keys',
        followUpLabel: 'Keyboard controls',
        text: 'Use "when key pressed" with a "move" block to control your sprite with the keyboard!',
        tags: ['motion', 'events', 'keyboard', 'beginner'],
        followUps: ['move-sprite', 'change-xy-position'],
        blockExample: 'whenKeyMoveRight',
        pointers: [
            {
                label: 'Find "when key pressed" in Events',
                target: '.blocklyToolboxCategory#events',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['key', 'keyboard', 'arrow', 'wasd', 'control', 'press'],
            projectSignals: {
                missing: ['event_whenkeypressed']
            }
        }
    },
    'change-xy-position': {
        id: 'change-xy-position',
        followUpLabel: 'X and Y position',
        text: 'Use "change x by" and "change y by" for smooth left/right and up/down movement!',
        tags: ['motion', 'coordinates', 'position'],
        followUps: ['move-with-keys', 'go-to-position'],
        blockExample: 'whenKeyMoveRight',
        relevance: {
            keywords: ['position', 'x', 'y', 'coordinate', 'left', 'right', 'up', 'down', 'direction']
        }
    },
    'go-to-position': {
        id: 'go-to-position',
        followUpLabel: 'Go to a spot',
        text: 'Use "go to x: y:" to place your sprite at an exact spot on the stage!',
        tags: ['motion', 'position'],
        followUps: ['change-xy-position', 'glide-to-position'],
        blockExample: 'goToCenter',
        relevance: {
            keywords: ['go to', 'place', 'position', 'where', 'location', 'center']
        }
    },
    'glide-to-position': {
        id: 'glide-to-position',
        followUpLabel: 'Smooth movement',
        text: 'Use "glide" instead of "go to" for smooth, animated movement!',
        tags: ['motion', 'animation'],
        followUps: ['move-sprite', 'too-fast'],
        blockExample: 'glideTo',
        relevance: {
            keywords: ['glide', 'smooth', 'slide', 'animate', 'slow']
        }
    },
    'add-sound': {
        id: 'add-sound',
        followUpLabel: 'Add a sound',
        text: 'Go to the Sounds tab to add sounds, then use "play sound" from the Sound category!',
        tags: ['sound', 'audio', 'beginner'],
        followUps: ['record-sound', 'play-sound-until-done', 'play-vs-play-until-done'],
        blockExample: 'playSound',
        pointers: [
            {
                label: 'Click the Sounds tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(3)',
                side: 'bottom'
            },
            {
                label: 'Sound blocks are here',
                target: '.blocklyToolboxCategory#sound',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['sound', 'music', 'audio', 'noise', 'play', 'hear']
        }
    },
    'record-sound': {
        id: 'record-sound',
        followUpLabel: 'Record a sound',
        text: 'In the Sounds tab, click the microphone button to record your own sound!',
        tags: ['sound', 'recording'],
        followUps: ['add-sound', 'play-sound-until-done'],
        relevance: {
            keywords: ['record', 'microphone', 'voice', 'own sound']
        }
    },
    'play-sound-until-done': {
        id: 'play-sound-until-done',
        followUpLabel: 'Wait for sound',
        text: 'Use "play sound until done" if you want to wait for the sound to finish before continuing!',
        tags: ['sound'],
        followUps: ['add-sound', 'too-fast'],
        relevance: {
            keywords: ['sound', 'overlap', 'wait', 'finish', 'until done']
        }
    },
    'say-think': {
        id: 'say-think',
        followUpLabel: 'Speech bubbles',
        text: 'Use "say" or "think" from the Looks category to make your sprite talk with a speech bubble!',
        tags: ['looks', 'speech', 'beginner'],
        followUps: ['change-costume', 'say-for-seconds', 'debug-with-say'],
        blockExample: 'saySomething',
        pointers: [
            {
                label: 'Find "say" and "think" in Looks',
                target: '.blocklyToolboxCategory#looks',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['say', 'talk', 'speak', 'think', 'speech', 'bubble', 'text', 'message']
        }
    },
    'say-for-seconds': {
        id: 'say-for-seconds',
        followUpLabel: 'Timed messages',
        text: 'Use "say for 2 seconds" to show a message that disappears — great for conversations!',
        tags: ['looks', 'speech'],
        followUps: ['say-think', 'too-fast'],
        relevance: {
            keywords: ['disappear', 'temporary', 'seconds', 'conversation', 'dialogue']
        }
    },
    'change-costume': {
        id: 'change-costume',
        followUpLabel: 'Change costume',
        text: 'Use "switch costume" or "next costume" from Looks to change how your sprite looks!',
        tags: ['looks', 'costumes', 'animation', 'beginner'],
        followUps: ['add-costume', 'animate-costume', 'costume-center'],
        pointers: [
            {
                label: 'Costume blocks are in Looks',
                target: '.blocklyToolboxCategory#looks',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['costume', 'look', 'change', 'appearance', 'switch', 'outfit', 'picture']
        }
    },
    'add-costume': {
        id: 'add-costume',
        followUpLabel: 'Add costumes',
        text: 'Go to the Costumes tab and click the cat button to add a new costume to your sprite!',
        tags: ['costumes', 'drawing'],
        followUps: ['change-costume', 'animate-costume'],
        pointers: [
            {
                label: 'Click the Costumes tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['add costume', 'new costume', 'draw', 'paint', 'edit']
        }
    },
    'animate-costume': {
        id: 'animate-costume',
        followUpLabel: 'Animate',
        text: 'Put "next costume" inside a "forever" loop with a "wait" block to make a simple animation!',
        tags: ['looks', 'costumes', 'animation', 'loops'],
        followUps: ['change-costume', 'forever-loop'],
        blockExample: 'foreverNextCostume',
        relevance: {
            keywords: ['animate', 'animation', 'flip', 'walk cycle', 'frame']
        }
    },
    'forever-loop': {
        id: 'forever-loop',
        followUpLabel: 'Repeat forever',
        text: 'Use a "forever" block from Control to make something repeat over and over!',
        tags: ['control', 'loops', 'beginner'],
        followUps: ['repeat-loop', 'too-fast', 'if-not-forever'],
        blockExample: 'foreverMove',
        pointers: [
            {
                label: 'Find "forever" in Control',
                target: '.blocklyToolboxCategory#control',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['forever', 'loop', 'repeat', 'again', 'keep', 'continuous', 'always'],
            projectSignals: {
                missing: ['control_forever']
            }
        }
    },
    'repeat-loop': {
        id: 'repeat-loop',
        followUpLabel: 'Repeat N times',
        text: 'Use "repeat 10" to do something a specific number of times!',
        tags: ['control', 'loops'],
        followUps: ['forever-loop', 'too-fast'],
        blockExample: 'repeatTurn',
        relevance: {
            keywords: ['repeat', 'times', 'loop', 'count', 'number of times']
        }
    },
    'too-fast': {
        id: 'too-fast',
        followUpLabel: 'Slow it down',
        text: 'Add a "wait 1 seconds" block inside your loop to slow things down!',
        tags: ['control', 'timing', 'beginner'],
        followUps: ['forever-loop', 'glide-to-position', 'wait-vs-no-wait', 'understand-seconds'],
        relevance: {
            keywords: ['fast', 'slow', 'speed', 'wait', 'pause', 'too quick', 'instant']
        }
    },
    'use-variables': {
        id: 'use-variables',
        followUpLabel: 'Make a variable',
        text: 'Click "Make a Variable" in the Variables category to keep track of things like score!',
        tags: ['variables', 'data', 'beginner'],
        followUps: ['change-variable', 'use-lists'],
        pointers: [
            {
                label: 'Variables are here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['variable', 'score', 'count', 'track', 'number', 'save', 'remember', 'store', 'points', 'lives', 'health'],
            projectSignals: {
                missing: ['data_setvariableto']
            }
        }
    },
    'change-variable': {
        id: 'change-variable',
        followUpLabel: 'Update a variable',
        text: 'Use "set my variable to 0" at the start, then "change my variable by 1" to update it!',
        tags: ['variables', 'data'],
        followUps: ['use-variables', 'detect-collision'],
        relevance: {
            keywords: ['change variable', 'increase', 'decrease', 'add', 'subtract', 'update', 'reset']
        }
    },
    'use-lists': {
        id: 'use-lists',
        followUpLabel: 'Use lists',
        text: 'Click "Make a List" in Variables to store multiple things, like a collection of names!',
        tags: ['variables', 'lists', 'data'],
        followUps: ['use-variables'],
        relevance: {
            keywords: ['list', 'array', 'collection', 'multiple', 'items', 'inventory']
        }
    },
    'detect-collision': {
        id: 'detect-collision',
        followUpLabel: 'Detect collisions',
        text: 'Use "if touching" from Sensing inside a forever loop to detect when sprites bump into each other!',
        tags: ['sensing', 'collision', 'game'],
        followUps: ['forever-loop', 'make-game', 'touching-wrong-color'],
        blockExample: 'foreverIfTouching',
        pointers: [
            {
                label: 'Find "touching" in Sensing',
                target: '.blocklyToolboxCategory#sensing',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['touch', 'collision', 'hit', 'bump', 'detect', 'collide', 'touching', 'overlap']
        }
    },
    'broadcast-message': {
        id: 'broadcast-message',
        followUpLabel: 'Send messages',
        text: 'Use "broadcast" and "when I receive" to send messages between sprites!',
        tags: ['events', 'broadcast', 'communication'],
        followUps: ['add-sprite', 'make-game', 'broadcast-for-levels'],
        blockExample: 'broadcastGo',
        relevance: {
            keywords: ['broadcast', 'message', 'communicate', 'tell', 'signal', 'between sprites', 'other sprite']
        }
    },
    'add-sprite': {
        id: 'add-sprite',
        followUpLabel: 'Add a sprite',
        text: 'Click the cat button below the stage to add a new sprite to your project!',
        tags: ['sprites', 'beginner'],
        followUps: ['broadcast-message', 'detect-collision'],
        pointers: [
            {
                label: 'Add a new sprite here',
                target: '[class*="sprite-selector_sprite-selector"] [class*="add-button"]',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['add sprite', 'new sprite', 'character', 'another sprite', 'more sprites']
        }
    },
    'change-backdrop': {
        id: 'change-backdrop',
        followUpLabel: 'Change backdrop',
        text: 'Click the picture button below the stage to add a backdrop, then use "switch backdrop"!',
        tags: ['looks', 'backdrop', 'stage', 'beginner'],
        followUps: ['add-sprite', 'backdrop-events'],
        relevance: {
            keywords: ['backdrop', 'background', 'scene', 'stage', 'scenery', 'level']
        }
    },
    'make-game': {
        id: 'make-game',
        followUpLabel: 'Make a game',
        text: 'A simple game needs: keyboard controls, something to collect or avoid, and a score variable!',
        tags: ['game', 'project-ideas'],
        followUps: ['move-with-keys', 'detect-collision', 'use-variables'],
        relevance: {
            keywords: ['game', 'play', 'make a game', 'create game', 'build game']
        }
    },
    'clone-sprite': {
        id: 'clone-sprite',
        followUpLabel: 'Clone sprites',
        text: 'Use "create clone of myself" to make copies of a sprite — great for projectiles or enemies!',
        tags: ['control', 'clones', 'advanced'],
        followUps: ['make-game', 'detect-collision', 'clone-basics', 'clone-delete'],
        blockExample: 'cloneForever',
        relevance: {
            keywords: ['clone', 'copy', 'duplicate', 'many', 'projectile', 'bullet', 'enemy', 'enemies', 'spawn']
        }
    },
    'add-extension': {
        id: 'add-extension',
        followUpLabel: 'Add extensions',
        text: 'Click the blue "Add Extension" button at the bottom-left to get extra blocks like Music or Pen!',
        tags: ['extensions', 'beginner'],
        followUps: ['pen-extension', 'music-extension', 'text-to-speech-extension'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['extension', 'music', 'pen', 'draw', 'extra blocks', 'more blocks', 'text to speech']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 1: "Nothing is Happening" / Debugging
    // ──────────────────────────────────────────────

    'no-visible-effect': {
        id: 'no-visible-effect',
        followUpLabel: 'No visible effect',
        text: 'Some blocks don\'t have a visible effect on their own — try connecting them to other blocks in a stack!',
        tags: ['debugging', 'beginner'],
        followUps: ['nothing-happens', 'block-already-there', 'add-event-block'],
        relevance: {
            keywords: ['nothing', 'happen', 'work', 'try', 'click', 'broken', 'effect']
        }
    },
    'block-already-there': {
        id: 'block-already-there',
        followUpLabel: 'Already there',
        text: 'If a block doesn\'t seem to do anything, the sprite might already be where the block is telling it to go — try changing the number first!',
        tags: ['debugging', 'beginner'],
        followUps: ['no-visible-effect', 'nothing-happens'],
        relevance: {
            keywords: ['nothing', 'happen', 'already', 'same', 'doesn\'t do', 'no change']
        }
    },
    'sound-volume-zero': {
        id: 'sound-volume-zero',
        followUpLabel: 'Fix volume',
        text: 'Can\'t hear anything? Check if the volume was set to 0 — use "set volume to 100%" to fix it!',
        tags: ['sound', 'debugging'],
        followUps: ['add-sound', 'play-vs-play-until-done'],
        pointers: [
            {
                label: 'Sound blocks are here',
                target: '.blocklyToolboxCategory#sound',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['sound', 'hear', 'volume', 'quiet', 'silent', 'mute', 'no sound'],
            projectSignals: {
                hasCategories: ['sound']
            }
        }
    },
    'sprite-is-hidden': {
        id: 'sprite-is-hidden',
        followUpLabel: 'Unhide sprite',
        text: 'Can\'t see your sprite? It might be hidden! Click the "show" eye icon in the sprite info area, or use the "show" block.',
        tags: ['looks', 'debugging', 'beginner'],
        followUps: ['sprite-ghost-effect', 'sprite-too-small', 'sprite-off-stage'],
        pointers: [
            {
                label: 'Check the sprite info here',
                target: '[class*="sprite-info"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['invisible', 'hidden', 'disappeared', 'can\'t see', 'where', 'gone', 'missing', 'sprite']
        }
    },
    'sprite-ghost-effect': {
        id: 'sprite-ghost-effect',
        followUpLabel: 'Fix ghost effect',
        text: 'If your sprite is see-through or invisible, the ghost effect might be on — use "set ghost effect to 0" to make it solid again!',
        tags: ['looks', 'debugging', 'effects'],
        followUps: ['sprite-is-hidden', 'graphic-effects'],
        relevance: {
            keywords: ['ghost', 'transparent', 'see through', 'invisible', 'faded', 'effect']
        }
    },
    'sprite-too-small': {
        id: 'sprite-too-small',
        followUpLabel: 'Fix size',
        text: 'Your sprite might be too small to see! Use "set size to 100%" to reset it.',
        tags: ['looks', 'debugging'],
        followUps: ['sprite-is-hidden', 'change-size'],
        relevance: {
            keywords: ['small', 'tiny', 'size', 'can\'t see', 'shrink', 'disappeared']
        }
    },
    'sprite-off-stage': {
        id: 'sprite-off-stage',
        followUpLabel: 'Find sprite',
        text: 'Sprite missing? It might have moved off the edge of the stage! Use "go to x: 0 y: 0" to bring it back to the center.',
        tags: ['motion', 'debugging'],
        followUps: ['sprite-is-hidden', 'go-to-position'],
        relevance: {
            keywords: ['off screen', 'off stage', 'missing', 'where', 'find', 'gone', 'disappeared', 'can\'t find']
        }
    },
    'stop-project': {
        id: 'stop-project',
        followUpLabel: 'Stop everything',
        text: 'Click the red stop sign to stop all running scripts — useful when things are going wrong!',
        tags: ['control', 'beginner'],
        followUps: ['green-flag', 'nothing-happens'],
        pointers: [
            {
                label: 'Click the red stop sign',
                target: 'button[class*="stop-all"]',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['stop', 'end', 'halt', 'freeze', 'stuck', 'running']
        }
    },
    'debug-with-say': {
        id: 'debug-with-say',
        followUpLabel: 'Debug with say',
        text: 'Not sure what your code is doing? Add a "say" block to show values while your code runs — it\'s like X-ray vision for your code!',
        tags: ['debugging', 'advanced'],
        followUps: ['say-think', 'show-hide-variable'],
        relevance: {
            keywords: ['debug', 'test', 'check', 'what', 'value', 'wrong', 'figure out', 'troubleshoot']
        }
    },
    'wrong-sprite-selected': {
        id: 'wrong-sprite-selected',
        followUpLabel: 'Check which sprite',
        text: 'Code not running? Make sure you added it to the right sprite — click the sprite you want in the sprite pane, then check its code!',
        tags: ['debugging', 'sprites', 'beginner'],
        followUps: ['where-did-blocks-go', 'sprite-has-own-code'],
        relevance: {
            keywords: ['wrong sprite', 'not working', 'different sprite', 'which sprite', 'other']
        }
    },
    'touching-wrong-color': {
        id: 'touching-wrong-color',
        followUpLabel: 'Fix color detection',
        text: 'If "touching color" isn\'t working, make sure you picked the exact right color — use the eyedropper tool on the color square to sample it from the stage!',
        tags: ['debugging', 'sensing'],
        followUps: ['detect-collision', 'touching-color'],
        relevance: {
            keywords: ['touching color', 'wrong color', 'not detecting', 'color', 'eyedropper', 'pick']
        }
    },
    'wait-vs-no-wait': {
        id: 'wait-vs-no-wait',
        followUpLabel: 'Add a wait',
        text: 'If things happen too fast to see, try adding "wait" blocks between actions — even "wait 0.1 seconds" can help!',
        tags: ['debugging', 'control', 'timing'],
        followUps: ['too-fast', 'understand-seconds'],
        relevance: {
            keywords: ['too fast', 'instant', 'can\'t see', 'flash', 'blink', 'quick', 'wait']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 2: Meta Framework / How Scratch Works
    // ──────────────────────────────────────────────

    'where-did-blocks-go': {
        id: 'where-did-blocks-go',
        followUpLabel: 'Find your blocks',
        text: 'Each sprite has its own code! Click on a sprite in the sprite pane to see its blocks.',
        tags: ['sprites', 'beginner', 'meta'],
        followUps: ['sprite-has-own-code', 'wrong-sprite-selected'],
        pointers: [
            {
                label: 'Click a sprite to see its code',
                target: '[class*="sprite-selector_sprite-selector"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['blocks', 'disappeared', 'gone', 'where', 'missing', 'code', 'lost', 'other sprite']
        }
    },
    'sprite-has-own-code': {
        id: 'sprite-has-own-code',
        followUpLabel: 'Separate code',
        text: 'Remember, each sprite has its own separate code, costumes, and sounds — check you\'re editing the right sprite!',
        tags: ['sprites', 'meta', 'beginner'],
        followUps: ['where-did-blocks-go', 'wrong-sprite-selected'],
        relevance: {
            keywords: ['wrong sprite', 'other sprite', 'code disappeared', 'sprite code', 'separate']
        }
    },
    'blocks-run-in-order': {
        id: 'blocks-run-in-order',
        followUpLabel: 'Block order',
        text: 'Blocks in a stack run one at a time, from top to bottom — the order matters!',
        tags: ['control', 'beginner', 'meta'],
        followUps: ['two-stacks-same-time', 'add-event-block'],
        relevance: {
            keywords: ['order', 'sequence', 'first', 'top', 'bottom', 'which one', 'when']
        }
    },
    'two-stacks-same-time': {
        id: 'two-stacks-same-time',
        followUpLabel: 'Do two things at once',
        text: 'You can run two stacks at the same time! Use two "when green flag clicked" blocks to do things in parallel.',
        tags: ['events', 'control', 'meta'],
        followUps: ['blocks-run-in-order', 'nothing-happens'],
        relevance: {
            keywords: ['same time', 'two things', 'parallel', 'both', 'together', 'simultaneously']
        }
    },
    'if-not-forever': {
        id: 'if-not-forever',
        followUpLabel: 'Keep checking',
        text: '"If" checks only once! Wrap it inside a "forever" loop to keep checking over and over.',
        tags: ['control', 'beginner', 'meta'],
        followUps: ['forever-loop', 'detect-collision'],
        blockExample: 'foreverIfCheck',
        relevance: {
            keywords: ['if', 'only once', 'check', 'forever', 'not working', 'condition', 'keeps', 'continuous']
        }
    },
    'deleting-sprite-deletes-code': {
        id: 'deleting-sprite-deletes-code',
        followUpLabel: 'Don\'t lose code',
        text: 'Careful — deleting a sprite also deletes all the code, costumes, and sounds inside it!',
        tags: ['sprites', 'meta', 'beginner'],
        followUps: ['sprite-has-own-code', 'add-sprite'],
        relevance: {
            keywords: ['delete', 'remove', 'sprite', 'code gone', 'lost', 'disappeared', 'undo']
        }
    },
    'drag-blocks-to-workspace': {
        id: 'drag-blocks-to-workspace',
        followUpLabel: 'Start coding',
        text: 'Drag blocks from the block palette on the left into the workspace to start coding!',
        tags: ['beginner', 'meta'],
        followUps: ['click-block-to-try', 'add-event-block'],
        relevance: {
            keywords: ['how', 'start', 'begin', 'drag', 'block', 'palette', 'workspace', 'where']
        }
    },
    'click-block-to-try': {
        id: 'click-block-to-try',
        followUpLabel: 'Try a block',
        text: 'You can click on any block in the workspace to try it! Click a whole stack to run all of them.',
        tags: ['beginner', 'meta'],
        followUps: ['drag-blocks-to-workspace', 'nothing-happens'],
        relevance: {
            keywords: ['try', 'test', 'click', 'run', 'block', 'does it do']
        }
    },
    'remove-block-from-stack': {
        id: 'remove-block-from-stack',
        followUpLabel: 'Remove a block',
        text: 'To remove a block from the middle of a stack, drag it out to the side — the blocks above and below will reconnect!',
        tags: ['beginner', 'meta', 'editing'],
        followUps: ['right-click-duplicate', 'drag-blocks-to-workspace'],
        relevance: {
            keywords: ['remove', 'delete', 'block', 'middle', 'stack', 'get rid', 'take out', 'disconnect']
        }
    },
    'add-event-block': {
        id: 'add-event-block',
        followUpLabel: 'Add a hat block',
        text: 'Every script needs a "hat block" (the rounded ones) on top to know when to start running.',
        tags: ['events', 'beginner', 'meta'],
        followUps: ['nothing-happens', 'green-flag'],
        pointers: [
            {
                label: 'Hat blocks are in Events',
                target: '.blocklyToolboxCategory#events',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['hat', 'start', 'event', 'when', 'top', 'trigger', 'begin', 'run']
        }
    },
    'batched-updates': {
        id: 'batched-updates',
        followUpLabel: 'Why no effect?',
        text: 'Blocks that undo each other (like "turn 15" then "turn -15") happen so fast you won\'t see anything — add a "wait" block between them!',
        tags: ['motion', 'control', 'meta'],
        followUps: ['wait-vs-no-wait', 'too-fast'],
        relevance: {
            keywords: ['undo', 'cancel', 'nothing', 'fast', 'instant', 'turn', 'no effect', 'can\'t see']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 3: Learner Differences
    // ──────────────────────────────────────────────

    'negative-numbers': {
        id: 'negative-numbers',
        followUpLabel: 'Go backward',
        text: 'Use a minus sign (-) before a number to go backward! For example, "move -10 steps" makes your sprite go the other way.',
        tags: ['motion', 'math', 'beginner'],
        followUps: ['move-sprite', 'decimal-numbers'],
        relevance: {
            keywords: ['backward', 'backwards', 'reverse', 'negative', 'minus', 'opposite', 'other way', 'back']
        }
    },
    'decimal-numbers': {
        id: 'decimal-numbers',
        followUpLabel: 'Use decimals',
        text: 'You can use decimal numbers like 0.5! Try "wait 0.5 seconds" for a shorter pause, or "move 0.5 steps" for tiny movements.',
        tags: ['math', 'beginner', 'control'],
        followUps: ['negative-numbers', 'understand-seconds'],
        relevance: {
            keywords: ['decimal', 'point', 'half', '0.5', 'small number', 'fraction', 'less than 1']
        }
    },
    'greater-less-than': {
        id: 'greater-less-than',
        followUpLabel: 'Compare numbers',
        text: 'The pointy symbols compare numbers: < means "less than" and > means "greater than" — the open end faces the bigger number!',
        tags: ['operators', 'math', 'beginner'],
        followUps: ['use-variables', 'if-not-forever'],
        relevance: {
            keywords: ['greater', 'less', 'than', 'symbol', 'compare', 'arrow', 'pointy', '<', '>']
        }
    },
    'find-block-by-color': {
        id: 'find-block-by-color',
        followUpLabel: 'Find blocks',
        text: 'Blocks are color-coded by category! Blue = Motion, Purple = Looks, Pink = Sound, Yellow = Events, Orange = Control.',
        tags: ['beginner', 'meta'],
        followUps: ['drag-blocks-to-workspace', 'add-event-block'],
        relevance: {
            keywords: ['find', 'where', 'block', 'color', 'category', 'which', 'looking for']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 4: Undiscovered Affordances
    // ──────────────────────────────────────────────

    'change-block-menu': {
        id: 'change-block-menu',
        followUpLabel: 'Change options',
        text: 'See a dropdown on a block? Click it to change the option — like picking a different key, sound, or direction!',
        tags: ['beginner', 'meta'],
        followUps: ['insert-reporter', 'click-block-to-try'],
        relevance: {
            keywords: ['dropdown', 'menu', 'option', 'change', 'pick', 'select', 'choose', 'different']
        }
    },
    'insert-reporter': {
        id: 'insert-reporter',
        followUpLabel: 'Dynamic values',
        text: 'You can drag a round or pointed block into an input on another block to make it dynamic!',
        tags: ['beginner', 'meta', 'advanced'],
        followUps: ['random-numbers', 'use-variables'],
        blockExample: 'moveRandomSteps',
        relevance: {
            keywords: ['reporter', 'round', 'input', 'drag into', 'dynamic', 'variable', 'inside']
        }
    },
    'right-click-duplicate': {
        id: 'right-click-duplicate',
        followUpLabel: 'Duplicate blocks',
        text: 'Right-click (or long-press) on a block to duplicate it, add a comment, or get help!',
        tags: ['beginner', 'meta', 'editing'],
        followUps: ['remove-block-from-stack', 'click-block-to-try'],
        relevance: {
            keywords: ['right click', 'duplicate', 'copy', 'comment', 'help', 'context menu']
        }
    },
    'change-xy-explanation': {
        id: 'change-xy-explanation',
        followUpLabel: 'Stage coordinates',
        text: 'The stage is like a grid: X goes left (-240) to right (240), and Y goes down (-180) to up (180), with center at (0, 0).',
        tags: ['motion', 'coordinates'],
        followUps: ['go-to-position', 'change-xy-position'],
        relevance: {
            keywords: ['x', 'y', 'coordinate', 'grid', 'position', 'stage', 'center', '0', 'left', 'right', 'up', 'down', '240', '180']
        }
    },
    'understand-seconds': {
        id: 'understand-seconds',
        followUpLabel: 'Timing tips',
        text: '1 second = a quick pause. "Wait 10 seconds" = a long pause. "Wait 0.1 seconds" = super fast! Try different numbers to get the right speed.',
        tags: ['control', 'timing'],
        followUps: ['too-fast', 'decimal-numbers'],
        relevance: {
            keywords: ['seconds', 'time', 'how long', 'wait', 'slow', 'fast', 'timing']
        }
    },
    'custom-blocks': {
        id: 'custom-blocks',
        followUpLabel: 'Make custom blocks',
        text: 'Click "Make a Block" in My Blocks to create your own custom block — great for cleaning up long scripts!',
        tags: ['myblocks', 'advanced'],
        followUps: ['forever-loop', 'repeat-loop'],
        pointers: [
            {
                label: 'Find My Blocks here',
                target: '.blocklyToolboxCategory#myBlocks',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['custom block', 'my blocks', 'make a block', 'own block', 'define', 'function', 'procedure']
        }
    },
    'pen-extension': {
        id: 'pen-extension',
        followUpLabel: 'Draw with Pen',
        text: 'Add the Pen extension to draw lines and shapes as your sprite moves — try "pen down" + "move" + "turn" in a loop!',
        tags: ['extensions', 'pen', 'drawing'],
        followUps: ['add-extension', 'stamp-block', 'make-art'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['draw', 'pen', 'line', 'stamp', 'paint', 'trace', 'art']
        }
    },
    'music-extension': {
        id: 'music-extension',
        followUpLabel: 'Play music',
        text: 'Add the Music extension to play drums and instruments — use it in a loop to make a beat!',
        tags: ['extensions', 'music', 'sound'],
        followUps: ['add-extension', 'make-music-project'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['music', 'instrument', 'drum', 'beat', 'note', 'play music', 'melody']
        }
    },
    'text-to-speech-extension': {
        id: 'text-to-speech-extension',
        followUpLabel: 'Sprite talks out loud',
        text: 'Add the Text to Speech extension to make your sprite actually talk out loud!',
        tags: ['extensions', 'speech'],
        followUps: ['add-extension', 'say-think'],
        relevance: {
            keywords: ['text to speech', 'talk', 'voice', 'say out loud', 'speak', 'tts']
        }
    },
    'random-numbers': {
        id: 'random-numbers',
        followUpLabel: 'Use random',
        text: 'Use "pick random 1 to 10" from Operators to add surprises — great for random positions, sizes, or colors!',
        tags: ['operators', 'math'],
        followUps: ['insert-reporter', 'surprise-sprite'],
        pointers: [
            {
                label: 'Operators are here',
                target: '.blocklyToolboxCategory#operators',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['random', 'surprise', 'chance', 'different', 'each time', 'unpredictable', 'luck']
        }
    },
    'ask-and-answer': {
        id: 'ask-and-answer',
        followUpLabel: 'Ask a question',
        text: 'Use "ask and wait" from Sensing to ask the player a question — their response goes into the "answer" block!',
        tags: ['sensing', 'input'],
        followUps: ['make-quiz', 'use-variables'],
        blockExample: 'askAndSay',
        pointers: [
            {
                label: 'Find "ask" in Sensing',
                target: '.blocklyToolboxCategory#sensing',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['ask', 'answer', 'question', 'input', 'type', 'user', 'name', 'response']
        }
    },
    'touching-color': {
        id: 'touching-color',
        followUpLabel: 'Detect colors',
        text: 'Use "touching color?" from Sensing — click the color square to pick any color from the stage with the eyedropper!',
        tags: ['sensing', 'color'],
        followUps: ['detect-collision', 'touching-wrong-color'],
        relevance: {
            keywords: ['color', 'touching color', 'pick', 'eyedropper', 'detect', 'sense']
        }
    },
    'timer-block': {
        id: 'timer-block',
        followUpLabel: 'Use the timer',
        text: 'Use the "timer" block from Sensing to time things — combine with "reset timer" to make countdowns or speedruns!',
        tags: ['sensing', 'timing'],
        followUps: ['use-variables', 'make-game'],
        relevance: {
            keywords: ['timer', 'time', 'countdown', 'stopwatch', 'clock', 'seconds']
        }
    },
    'change-size': {
        id: 'change-size',
        followUpLabel: 'Change size',
        text: 'Use "change size by 10" or "set size to" from Looks to make your sprite grow or shrink!',
        tags: ['looks', 'size'],
        followUps: ['sprite-too-small', 'growing-shrinking'],
        relevance: {
            keywords: ['size', 'big', 'small', 'grow', 'shrink', 'larger', 'smaller', 'scale']
        }
    },
    'graphic-effects': {
        id: 'graphic-effects',
        followUpLabel: 'Visual effects',
        text: 'Try "set color effect" or "set whirl effect" from Looks to add wild visual effects to your sprite!',
        tags: ['looks', 'effects'],
        followUps: ['sprite-ghost-effect', 'color-changing'],
        relevance: {
            keywords: ['effect', 'color', 'whirl', 'fisheye', 'pixelate', 'mosaic', 'brightness', 'ghost']
        }
    },
    'stamp-block': {
        id: 'stamp-block',
        followUpLabel: 'Stamp copies',
        text: 'Use "stamp" from the Pen extension to leave a copy of your sprite on the stage — like a trail of footprints!',
        tags: ['pen', 'effects', 'advanced'],
        followUps: ['pen-extension', 'trail-of-stamps'],
        relevance: {
            keywords: ['stamp', 'copy', 'trail', 'footprint', 'mark', 'imprint']
        }
    },
    'play-vs-play-until-done': {
        id: 'play-vs-play-until-done',
        followUpLabel: 'Sound timing',
        text: '"Start sound" plays and keeps going. "Play sound until done" waits for it to finish. Use "start sound" for background music!',
        tags: ['sound'],
        followUps: ['add-sound', 'play-sound-until-done'],
        relevance: {
            keywords: ['start sound', 'play sound', 'until done', 'background', 'music', 'difference', 'overlap']
        }
    },
    'backdrop-events': {
        id: 'backdrop-events',
        followUpLabel: 'Backdrop triggers',
        text: 'Use "when backdrop switches to" to trigger code when the scene changes — perfect for levels in a game!',
        tags: ['events', 'backdrop', 'game'],
        followUps: ['change-backdrop', 'broadcast-for-levels'],
        relevance: {
            keywords: ['backdrop', 'scene', 'level', 'switch', 'when backdrop', 'stage', 'background']
        }
    },
    'mouse-pointer': {
        id: 'mouse-pointer',
        followUpLabel: 'Follow mouse',
        text: 'Use "go to mouse-pointer" or "point towards mouse-pointer" to make sprites follow your mouse!',
        tags: ['motion', 'sensing', 'mouse'],
        followUps: ['move-sprite', 'forever-loop'],
        blockExample: 'followMouse',
        relevance: {
            keywords: ['mouse', 'follow', 'cursor', 'pointer', 'track', 'chase']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 5: Advanced Concepts & Patterns
    // ──────────────────────────────────────────────

    'clone-basics': {
        id: 'clone-basics',
        followUpLabel: 'Clone behavior',
        text: 'When you create a clone, use "when I start as a clone" to give the clone its own behavior — it\'s like a copy that can do its own thing!',
        tags: ['control', 'clones', 'advanced'],
        followUps: ['clone-sprite', 'clone-delete'],
        relevance: {
            keywords: ['clone', 'start as clone', 'when I start', 'copy', 'behavior', 'own', 'each']
        }
    },
    'show-hide-variable': {
        id: 'show-hide-variable',
        followUpLabel: 'Variable display',
        text: 'Right-click a variable on the stage to change how it looks — you can make it a slider for testing!',
        tags: ['variables', 'debugging'],
        followUps: ['use-variables', 'debug-with-say'],
        relevance: {
            keywords: ['variable', 'display', 'slider', 'show', 'monitor', 'stage', 'readout']
        }
    },
    'reset-at-start': {
        id: 'reset-at-start',
        followUpLabel: 'Reset at start',
        text: 'Put "go to x: y:" and "set size to 100" under "when green flag clicked" to reset your sprite at the start!',
        tags: ['events', 'motion', 'beginner'],
        followUps: ['green-flag', 'go-to-position'],
        blockExample: 'whenFlagGoToReset',
        relevance: {
            keywords: ['reset', 'start', 'beginning', 'initial', 'position', 'restart', 'go back']
        }
    },
    'broadcast-for-levels': {
        id: 'broadcast-for-levels',
        followUpLabel: 'Game levels',
        text: 'Use "broadcast" to switch between levels or scenes — each sprite can listen for the same message and react differently!',
        tags: ['events', 'broadcast', 'game', 'advanced'],
        followUps: ['broadcast-message', 'backdrop-events'],
        relevance: {
            keywords: ['level', 'scene', 'broadcast', 'switch', 'advance', 'next level', 'game over']
        }
    },
    'clone-delete': {
        id: 'clone-delete',
        followUpLabel: 'Delete clones',
        text: 'Don\'t forget to "delete this clone" when you\'re done with it — otherwise you might hit the 300 clone limit!',
        tags: ['control', 'clones', 'advanced'],
        followUps: ['clone-basics', 'clone-sprite'],
        relevance: {
            keywords: ['clone', 'delete', 'remove', 'limit', 'too many', '300', 'maximum', 'lag', 'slow']
        }
    },
    'repeat-until': {
        id: 'repeat-until',
        followUpLabel: 'Repeat until',
        text: 'Use "repeat until" to keep doing something until a condition is met — like moving until you reach the edge!',
        tags: ['control', 'loops'],
        followUps: ['forever-loop', 'if-not-forever'],
        blockExample: 'repeatUntilEdge',
        relevance: {
            keywords: ['repeat until', 'condition', 'stop when', 'keep going', 'until', 'reach']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 6: Project Ideas & Joyful Moments
    // ──────────────────────────────────────────────

    'make-story': {
        id: 'make-story',
        followUpLabel: 'Tell a story',
        text: 'Tell a story! Use "say for 2 seconds", "wait", and "switch backdrop" to create scenes and dialogue.',
        tags: ['project-ideas', 'looks'],
        followUps: ['say-for-seconds', 'change-backdrop'],
        relevance: {
            keywords: ['story', 'tell', 'narrative', 'dialogue', 'conversation', 'scene', 'tale']
        }
    },
    'make-animation': {
        id: 'make-animation',
        followUpLabel: 'Make animation',
        text: 'Create an animation by switching costumes in a loop — draw your own frames in the Costumes tab!',
        tags: ['project-ideas', 'animation', 'looks'],
        followUps: ['animate-costume', 'add-costume'],
        relevance: {
            keywords: ['animation', 'animate', 'cartoon', 'frames', 'flipbook', 'movie']
        }
    },
    'make-music-project': {
        id: 'make-music-project',
        followUpLabel: 'Compose music',
        text: 'Make a music project! Use the Music extension with "play note" blocks to compose your own song.',
        tags: ['project-ideas', 'music', 'sound'],
        followUps: ['music-extension', 'add-sound'],
        relevance: {
            keywords: ['song', 'compose', 'music', 'melody', 'create music', 'band']
        }
    },
    'make-art': {
        id: 'make-art',
        followUpLabel: 'Create art',
        text: 'Make art! Use the Pen extension with loops and turns to draw amazing patterns and spirals.',
        tags: ['project-ideas', 'pen', 'art'],
        followUps: ['pen-extension', 'trail-of-stamps'],
        relevance: {
            keywords: ['art', 'draw', 'pattern', 'spiral', 'design', 'creative', 'geometric']
        }
    },
    'make-quiz': {
        id: 'make-quiz',
        followUpLabel: 'Make a quiz',
        text: 'Make a quiz! Use "ask and wait" + "if answer =" to check if the player got it right.',
        tags: ['project-ideas', 'sensing', 'operators'],
        followUps: ['ask-and-answer', 'use-variables'],
        relevance: {
            keywords: ['quiz', 'question', 'test', 'trivia', 'answer', 'right', 'wrong']
        }
    },
    'make-platformer': {
        id: 'make-platformer',
        followUpLabel: 'Platformer game',
        text: 'Make a platformer game! Use "change y by -2" in a forever loop for gravity, and "if touching color" for the ground.',
        tags: ['project-ideas', 'game', 'advanced'],
        followUps: ['make-game', 'touching-color', 'move-with-keys'],
        blockExample: 'gravityFall',
        relevance: {
            keywords: ['platformer', 'jump', 'gravity', 'platform', 'side scroller', 'mario']
        }
    },
    'make-clicker': {
        id: 'make-clicker',
        followUpLabel: 'Clicker game',
        text: 'Make a clicker game! Use "when this sprite clicked" + "change score by 1" — add costumes to make the sprite react to each click!',
        tags: ['project-ideas', 'game', 'beginner'],
        followUps: ['use-variables', 'change-costume'],
        blockExample: 'whenClickedChangeScore',
        relevance: {
            keywords: ['clicker', 'click', 'tap', 'cookie', 'idle', 'score', 'points']
        }
    },
    'make-dance-party': {
        id: 'make-dance-party',
        followUpLabel: 'Dance party',
        text: 'Make a dance party! Add multiple sprites, give each one a forever loop with costume changes and moves, then add music!',
        tags: ['project-ideas', 'fun', 'animation'],
        followUps: ['add-sprite', 'animate-costume', 'music-extension'],
        relevance: {
            keywords: ['dance', 'party', 'choreography', 'music', 'move', 'groove']
        }
    },
    'make-pet': {
        id: 'make-pet',
        followUpLabel: 'Virtual pet',
        text: 'Make a virtual pet! Use variables to track hunger, happiness, and energy — and buttons to feed, play, and rest.',
        tags: ['project-ideas', 'game', 'variables'],
        followUps: ['use-variables', 'change-costume'],
        relevance: {
            keywords: ['pet', 'virtual pet', 'tamagotchi', 'care', 'feed', 'play']
        }
    },
    'surprise-sprite': {
        id: 'surprise-sprite',
        followUpLabel: 'Random surprise',
        text: 'Try putting "set size to pick random 50 to 200" in your project for fun surprises!',
        tags: ['fun', 'operators'],
        followUps: ['random-numbers', 'change-size'],
        relevance: {
            keywords: ['surprise', 'fun', 'random', 'silly', 'goofy', 'playful', 'wacky']
        }
    },
    'silly-sounds': {
        id: 'silly-sounds',
        followUpLabel: 'Silly sounds',
        text: 'Try the sound effects in the Sounds tab — there are funny sounds like "boing", "chomp", and "zoop"!',
        tags: ['fun', 'sound'],
        followUps: ['add-sound', 'sound-remix'],
        pointers: [
            {
                label: 'Click the Sounds tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(3)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['funny', 'silly', 'sound', 'effects', 'explore', 'cool']
        }
    },
    'color-changing': {
        id: 'color-changing',
        followUpLabel: 'Rainbow colors',
        text: 'Put "change color effect by 25" inside a forever loop to make your sprite cycle through rainbow colors!',
        tags: ['fun', 'looks', 'effects'],
        followUps: ['graphic-effects', 'spinning'],
        blockExample: 'foreverColorChange',
        relevance: {
            keywords: ['rainbow', 'color', 'change', 'cycle', 'colorful', 'effect']
        }
    },
    'spinning': {
        id: 'spinning',
        followUpLabel: 'Spin around',
        text: 'Put "turn 15 degrees" inside a forever loop to make your sprite spin! Change the number to spin faster or slower.',
        tags: ['fun', 'motion'],
        followUps: ['color-changing', 'forever-loop'],
        blockExample: 'foreverSpin',
        relevance: {
            keywords: ['spin', 'turn', 'rotate', 'dizzy', 'twirl']
        }
    },
    'growing-shrinking': {
        id: 'growing-shrinking',
        followUpLabel: 'Pulse effect',
        text: 'Make your sprite pulse! Use "change size by 5" and "wait", then "change size by -5" and "wait" in a forever loop.',
        tags: ['fun', 'looks'],
        followUps: ['change-size', 'forever-loop'],
        relevance: {
            keywords: ['grow', 'shrink', 'pulse', 'bounce', 'throb', 'beat', 'bigger', 'smaller']
        }
    },
    'trail-of-stamps': {
        id: 'trail-of-stamps',
        followUpLabel: 'Leave a trail',
        text: 'Turn on pen down and move your sprite around with the keyboard — you\'ll leave a colorful trail everywhere you go!',
        tags: ['fun', 'pen', 'motion'],
        followUps: ['pen-extension', 'move-with-keys'],
        relevance: {
            keywords: ['trail', 'draw', 'path', 'trace', 'doodle', 'mark', 'line']
        }
    },
    'sound-remix': {
        id: 'sound-remix',
        followUpLabel: 'Remix sounds',
        text: 'Record your own voice in the Sounds tab, then use "set pitch effect" to make it sound like a chipmunk or a monster!',
        tags: ['fun', 'sound'],
        followUps: ['record-sound', 'silly-sounds'],
        relevance: {
            keywords: ['voice', 'record', 'pitch', 'chipmunk', 'monster', 'funny', 'remix', 'effect']
        }
    },
    'bouncing-around': {
        id: 'bouncing-around',
        followUpLabel: 'Bouncing screensaver',
        text: 'Make a screensaver! Use "point in direction pick random 1 to 360", then "forever: move + if on edge bounce"!',
        tags: ['fun', 'motion', 'project-ideas'],
        followUps: ['forever-loop', 'random-numbers'],
        blockExample: 'foreverBounce',
        relevance: {
            keywords: ['bounce', 'screensaver', 'random', 'float', 'drift', 'wall']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 7: Common User Errors
    // ──────────────────────────────────────────────

    'huge-number': {
        id: 'huge-number',
        followUpLabel: 'Big number issues',
        text: 'Typed a really huge number? Numbers bigger than about 16 digits lose precision — and really enormous ones get treated as 0!',
        tags: ['debugging', 'math'],
        followUps: ['decimal-numbers', 'use-variables'],
        relevance: {
            keywords: ['huge', 'big number', 'infinity', 'large', 'lots of digits', '999', 'not working', 'overflow']
        }
    },
    'rotation-style-vs-turn': {
        id: 'rotation-style-vs-turn',
        followUpLabel: 'Fix rotation',
        text: 'If "turn" doesn\'t seem to work, check if the rotation style is set to "left-right" or "don\'t rotate" — change it to "all around" in the sprite info!',
        tags: ['motion', 'debugging'],
        followUps: ['spinning', 'costume-center'],
        pointers: [
            {
                label: 'Check rotation style in sprite info',
                target: '[class*="sprite-info"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['turn', 'rotate', 'not turning', 'spinning', 'rotation', 'style', 'direction', 'left right']
        }
    },
    'costume-center': {
        id: 'costume-center',
        followUpLabel: 'Fix costume center',
        text: 'If your sprite rotates weirdly, the costume center point might be off — go to the Costumes tab and drag the crosshair to the center of your drawing!',
        tags: ['costumes', 'motion', 'debugging'],
        followUps: ['rotation-style-vs-turn', 'change-costume'],
        pointers: [
            {
                label: 'Go to the Costumes tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['rotate', 'wobble', 'center', 'offset', 'costume', 'weird', 'spinning wrong', 'orbit']
        }
    },
    'missing-asset': {
        id: 'missing-asset',
        followUpLabel: 'Missing asset',
        text: 'If a block says a costume or sound name that\'s grayed out, that asset might be missing — add it back in the Costumes or Sounds tab!',
        tags: ['debugging', 'costumes', 'sound'],
        followUps: ['add-costume', 'add-sound'],
        relevance: {
            keywords: ['missing', 'costume', 'sound', 'grayed', 'not found', 'empty', 'asset']
        }
    },
    'dragging-to-stage': {
        id: 'dragging-to-stage',
        followUpLabel: 'Drag to workspace',
        text: 'Make sure you\'re dragging blocks to the code workspace (the big area in the middle), not onto the stage!',
        tags: ['debugging', 'beginner', 'meta'],
        followUps: ['drag-blocks-to-workspace', 'find-block-by-color'],
        relevance: {
            keywords: ['drag', 'stage', 'wrong place', 'blocks', 'workspace', 'won\'t snap', 'can\'t connect']
        }
    }
};
/* eslint-enable @stylistic/max-len */

// Quick-pick suggestions shown in the empty state
// Each has a color matching the relevant Scratch block category
const quickPicks = [
    {label: 'Starting your project', query: 'nothing happens when I click green flag', color: '#FFBF00'},
    {label: 'Moving a sprite', query: 'how do I make my sprite move', color: '#4C97FF'},
    {label: 'My sprite disappeared', query: 'I can\'t see my sprite it disappeared', color: '#9966FF'},
    {label: 'Adding sounds', query: 'how do I add a sound', color: '#CF63CF'},
    {label: 'Making a game', query: 'how do I make a game', color: '#FFAB19'},
    {label: 'Making art', query: 'how do I draw and make art', color: '#0FBD8C'},
    {label: 'Fun effects', query: 'rainbow spinning color effects', color: '#FF6680'},
    {label: 'What went wrong?', query: 'my code is not working something is broken', color: '#FF8C1A'}
];

export {tips as default, quickPicks};
