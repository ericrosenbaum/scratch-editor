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
 * Future phases will add:
 * - pointers: driver.js walkthrough targets
 * - blockExample: SB3 block JSON for preview + "add to project"
 */

const tips = {
    'nothing-happens': {
        id: 'nothing-happens',
        text: 'Your code needs a "hat block" on top to know when to start — try "when green flag clicked"!',
        tags: ['events', 'start', 'beginner', 'hat'],
        followUps: ['green-flag', 'add-event-block'],
        relevance: {
            keywords: ['nothing', 'happens', 'work', 'broken', 'start', 'run', 'won\'t'],
            projectSignals: {
                missing: ['event_whenflagclicked', 'event_whenkeypressed', 'event_whenthisspriteclicked']
            }
        }
    },
    'green-flag': {
        id: 'green-flag',
        text: 'Click the green flag above the stage to run your project!',
        tags: ['events', 'start', 'beginner'],
        followUps: ['nothing-happens', 'stop-project'],
        relevance: {
            keywords: ['green', 'flag', 'start', 'run', 'play', 'begin']
        }
    },
    'move-sprite': {
        id: 'move-sprite',
        text: 'Use "move 10 steps" from the Motion category to make your sprite move!',
        tags: ['motion', 'movement', 'beginner'],
        followUps: ['move-with-keys', 'glide-to-position'],
        relevance: {
            keywords: ['move', 'walk', 'go', 'motion', 'forward'],
            projectSignals: {
                missing: ['motion_movesteps']
            }
        }
    },
    'move-with-keys': {
        id: 'move-with-keys',
        text: 'Use "when key pressed" with a "move" block to control your sprite with the keyboard!',
        tags: ['motion', 'events', 'keyboard', 'beginner'],
        followUps: ['move-sprite', 'change-xy-position'],
        relevance: {
            keywords: ['key', 'keyboard', 'arrow', 'wasd', 'control', 'press'],
            projectSignals: {
                missing: ['event_whenkeypressed']
            }
        }
    },
    'change-xy-position': {
        id: 'change-xy-position',
        text: 'Use "change x by" and "change y by" for smooth left/right and up/down movement!',
        tags: ['motion', 'coordinates', 'position'],
        followUps: ['move-with-keys', 'go-to-position'],
        relevance: {
            keywords: ['position', 'x', 'y', 'coordinate', 'left', 'right', 'up', 'down', 'direction']
        }
    },
    'go-to-position': {
        id: 'go-to-position',
        text: 'Use "go to x: y:" to place your sprite at an exact spot on the stage!',
        tags: ['motion', 'position'],
        followUps: ['change-xy-position', 'glide-to-position'],
        relevance: {
            keywords: ['go to', 'place', 'position', 'where', 'location', 'center']
        }
    },
    'glide-to-position': {
        id: 'glide-to-position',
        text: 'Use "glide" instead of "go to" for smooth, animated movement!',
        tags: ['motion', 'animation'],
        followUps: ['move-sprite', 'too-fast'],
        relevance: {
            keywords: ['glide', 'smooth', 'slide', 'animate', 'slow']
        }
    },
    'add-sound': {
        id: 'add-sound',
        text: 'Go to the Sounds tab to add sounds, then use "play sound" from the Sound category!',
        tags: ['sound', 'audio', 'beginner'],
        followUps: ['record-sound', 'play-sound-until-done'],
        relevance: {
            keywords: ['sound', 'music', 'audio', 'noise', 'play', 'hear']
        }
    },
    'record-sound': {
        id: 'record-sound',
        text: 'In the Sounds tab, click the microphone button to record your own sound!',
        tags: ['sound', 'recording'],
        followUps: ['add-sound', 'play-sound-until-done'],
        relevance: {
            keywords: ['record', 'microphone', 'voice', 'own sound']
        }
    },
    'play-sound-until-done': {
        id: 'play-sound-until-done',
        text: 'Use "play sound until done" if you want to wait for the sound to finish before continuing!',
        tags: ['sound'],
        followUps: ['add-sound', 'too-fast'],
        relevance: {
            keywords: ['sound', 'overlap', 'wait', 'finish', 'until done']
        }
    },
    'say-think': {
        id: 'say-think',
        text: 'Use "say" or "think" from the Looks category to make your sprite talk with a speech bubble!',
        tags: ['looks', 'speech', 'beginner'],
        followUps: ['change-costume', 'say-for-seconds'],
        relevance: {
            keywords: ['say', 'talk', 'speak', 'think', 'speech', 'bubble', 'text', 'message']
        }
    },
    'say-for-seconds': {
        id: 'say-for-seconds',
        text: 'Use "say for 2 seconds" to show a message that disappears — great for conversations!',
        tags: ['looks', 'speech'],
        followUps: ['say-think', 'too-fast'],
        relevance: {
            keywords: ['disappear', 'temporary', 'seconds', 'conversation', 'dialogue']
        }
    },
    'change-costume': {
        id: 'change-costume',
        text: 'Use "switch costume" or "next costume" from Looks to change how your sprite looks!',
        tags: ['looks', 'costumes', 'animation', 'beginner'],
        followUps: ['add-costume', 'animate-costume'],
        relevance: {
            keywords: ['costume', 'look', 'change', 'appearance', 'switch', 'outfit', 'picture']
        }
    },
    'add-costume': {
        id: 'add-costume',
        text: 'Go to the Costumes tab and click the cat button to add a new costume to your sprite!',
        tags: ['costumes', 'drawing'],
        followUps: ['change-costume', 'animate-costume'],
        relevance: {
            keywords: ['add costume', 'new costume', 'draw', 'paint', 'edit']
        }
    },
    'animate-costume': {
        id: 'animate-costume',
        text: 'Put "next costume" inside a "forever" loop with a "wait" block to make a simple animation!',
        tags: ['looks', 'costumes', 'animation', 'loops'],
        followUps: ['change-costume', 'forever-loop'],
        relevance: {
            keywords: ['animate', 'animation', 'flip', 'walk cycle', 'frame']
        }
    },
    'forever-loop': {
        id: 'forever-loop',
        text: 'Use a "forever" block from Control to make something repeat over and over!',
        tags: ['control', 'loops', 'beginner'],
        followUps: ['repeat-loop', 'too-fast'],
        relevance: {
            keywords: ['forever', 'loop', 'repeat', 'again', 'keep', 'continuous', 'always'],
            projectSignals: {
                missing: ['control_forever']
            }
        }
    },
    'repeat-loop': {
        id: 'repeat-loop',
        text: 'Use "repeat 10" to do something a specific number of times!',
        tags: ['control', 'loops'],
        followUps: ['forever-loop', 'too-fast'],
        relevance: {
            keywords: ['repeat', 'times', 'loop', 'count', 'number of times']
        }
    },
    'too-fast': {
        id: 'too-fast',
        text: 'Add a "wait 1 seconds" block inside your loop to slow things down!',
        tags: ['control', 'timing', 'beginner'],
        followUps: ['forever-loop', 'glide-to-position'],
        relevance: {
            keywords: ['fast', 'slow', 'speed', 'wait', 'pause', 'too quick', 'instant']
        }
    },
    'use-variables': {
        id: 'use-variables',
        text: 'Click "Make a Variable" in the Variables category to keep track of things like score!',
        tags: ['variables', 'data', 'beginner'],
        followUps: ['change-variable', 'use-lists'],
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
        text: 'Use "set my variable to 0" at the start, then "change my variable by 1" to update it!',
        tags: ['variables', 'data'],
        followUps: ['use-variables', 'detect-collision'],
        relevance: {
            keywords: ['change variable', 'increase', 'decrease', 'add', 'subtract', 'update', 'reset']
        }
    },
    'use-lists': {
        id: 'use-lists',
        text: 'Click "Make a List" in Variables to store multiple things, like a collection of names!',
        tags: ['variables', 'lists', 'data'],
        followUps: ['use-variables'],
        relevance: {
            keywords: ['list', 'array', 'collection', 'multiple', 'items', 'inventory']
        }
    },
    'detect-collision': {
        id: 'detect-collision',
        text: 'Use "if touching" from Sensing inside a forever loop to detect when sprites bump into each other!',
        tags: ['sensing', 'collision', 'game'],
        followUps: ['forever-loop', 'make-game'],
        relevance: {
            keywords: ['touch', 'collision', 'hit', 'bump', 'detect', 'collide', 'touching', 'overlap']
        }
    },
    'broadcast-message': {
        id: 'broadcast-message',
        text: 'Use "broadcast" and "when I receive" to send messages between sprites!',
        tags: ['events', 'broadcast', 'communication'],
        followUps: ['add-sprite', 'make-game'],
        relevance: {
            keywords: ['broadcast', 'message', 'communicate', 'tell', 'signal', 'between sprites', 'other sprite']
        }
    },
    'add-sprite': {
        id: 'add-sprite',
        text: 'Click the cat button below the stage to add a new sprite to your project!',
        tags: ['sprites', 'beginner'],
        followUps: ['broadcast-message', 'detect-collision'],
        relevance: {
            keywords: ['add sprite', 'new sprite', 'character', 'another sprite', 'more sprites']
        }
    },
    'change-backdrop': {
        id: 'change-backdrop',
        text: 'Click the picture button below the stage to add a backdrop, then use "switch backdrop"!',
        tags: ['looks', 'backdrop', 'stage', 'beginner'],
        followUps: ['add-sprite'],
        relevance: {
            keywords: ['backdrop', 'background', 'scene', 'stage', 'scenery', 'level']
        }
    },
    'make-game': {
        id: 'make-game',
        text: 'A simple game needs: keyboard controls, something to collect or avoid, and a score variable!',
        tags: ['game', 'project-ideas'],
        followUps: ['move-with-keys', 'detect-collision', 'use-variables'],
        relevance: {
            keywords: ['game', 'play', 'make a game', 'create game', 'build game']
        }
    },
    'clone-sprite': {
        id: 'clone-sprite',
        text: 'Use "create clone of myself" to make copies of a sprite — great for projectiles or enemies!',
        tags: ['control', 'clones', 'advanced'],
        followUps: ['make-game', 'detect-collision'],
        relevance: {
            keywords: ['clone', 'copy', 'duplicate', 'many', 'projectile', 'bullet', 'enemy', 'enemies', 'spawn']
        }
    },
    'add-extension': {
        id: 'add-extension',
        text: 'Click the blue "Add Extension" button at the bottom-left to get extra blocks like Music or Pen!',
        tags: ['extensions', 'beginner'],
        followUps: [],
        relevance: {
            keywords: ['extension', 'music', 'pen', 'draw', 'extra blocks', 'more blocks', 'text to speech']
        }
    }
};

// Quick-pick suggestions shown in the empty state
const quickPicks = [
    {label: 'Nothing happens', query: 'nothing happens when I click green flag'},
    {label: 'Move my sprite', query: 'how do I make my sprite move'},
    {label: 'Add a sound', query: 'how do I add a sound'},
    {label: 'Keep score', query: 'how do I keep score with a variable'},
    {label: 'Make a game', query: 'how do I make a game'}
];

export {tips as default, quickPicks};
