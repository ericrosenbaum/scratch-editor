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

const tips = {
    'nothing-happens': {
        id: 'nothing-happens',
        followUpLabel: 'Start your code',
        text: 'Your code needs a "hat block" on top to know when to start — try "when green flag clicked"!',
        tags: ['events', 'start', 'beginner', 'hat'],
        followUps: ['green-flag', 'add-event-block'],
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
        followUps: ['nothing-happens', 'stop-project'],
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
        followUps: ['move-with-keys', 'glide-to-position'],
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
        relevance: {
            keywords: ['glide', 'smooth', 'slide', 'animate', 'slow']
        }
    },
    'add-sound': {
        id: 'add-sound',
        followUpLabel: 'Add a sound',
        text: 'Go to the Sounds tab to add sounds, then use "play sound" from the Sound category!',
        tags: ['sound', 'audio', 'beginner'],
        followUps: ['record-sound', 'play-sound-until-done'],
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
        followUps: ['change-costume', 'say-for-seconds'],
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
        followUps: ['add-costume', 'animate-costume'],
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
        followUps: ['repeat-loop', 'too-fast'],
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
        relevance: {
            keywords: ['repeat', 'times', 'loop', 'count', 'number of times']
        }
    },
    'too-fast': {
        id: 'too-fast',
        followUpLabel: 'Slow it down',
        text: 'Add a "wait 1 seconds" block inside your loop to slow things down!',
        tags: ['control', 'timing', 'beginner'],
        followUps: ['forever-loop', 'glide-to-position'],
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
            keywords: [
                'variable', 'score', 'count', 'track', 'number',
                'save', 'remember', 'store', 'points', 'lives', 'health'
            ],
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
        followUps: ['forever-loop', 'make-game'],
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
        followUps: ['add-sprite', 'make-game'],
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
        followUps: ['add-sprite'],
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
        followUps: ['make-game', 'detect-collision'],
        relevance: {
            keywords: ['clone', 'copy', 'duplicate', 'many', 'projectile', 'bullet', 'enemy', 'enemies', 'spawn']
        }
    },
    'add-extension': {
        id: 'add-extension',
        followUpLabel: 'Add extensions',
        text: 'Click the blue "Add Extension" button at the bottom-left to get extra blocks like Music or Pen!',
        tags: ['extensions', 'beginner'],
        followUps: [],
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
    }
};

// Quick-pick suggestions shown in the empty state
// Each has a color matching the relevant Scratch block category
const quickPicks = [
    {label: 'Starting your project', query: 'nothing happens when I click green flag', color: '#FFBF00'},
    {label: 'Moving a sprite', query: 'how do I make my sprite move', color: '#4C97FF'},
    {label: 'Changing looks', query: 'how do I change my sprite costume', color: '#9966FF'},
    {label: 'Adding sounds', query: 'how do I add a sound', color: '#CF63CF'},
    {label: 'Keeping score', query: 'how do I keep score with a variable', color: '#FF8C1A'},
    {label: 'Making a game', query: 'how do I make a game', color: '#FFAB19'}
];

export {tips as default, quickPicks};
