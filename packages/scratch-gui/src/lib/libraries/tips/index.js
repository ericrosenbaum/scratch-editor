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
        queries: [
            'nothing happens when I click the green flag',
            'my code is not working',
            'why won\'t my project run',
            'I clicked the blocks but nothing happened',
            'my project is broken it doesn\'t do anything',
            'how do I make my code start'
        ],
        followUps: ['green-flag', 'add-event-block', 'no-visible-effect', 'block-already-there'],
        blockExample: 'whenFlagMove',
        pointers: [
            {
                label: 'Drag "when green flag clicked" into your code',
                blockOpcode: 'event_whenflagclicked',
                category: 'events',
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
        queries: [
            'how do I start my project',
            'where is the play button',
            'how do I run my code',
            'where do I click to start'
        ],
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
        queries: [
            'how do I make my sprite move',
            'my sprite is just sitting there',
            'I want my character to walk',
            'how do I move the cat',
            'make sprite go forward'
        ],
        followUps: ['move-with-keys', 'glide-to-position', 'negative-numbers'],
        blockExample: 'whenFlagMove',
        pointers: [
            {
                label: 'Drag "move 10 steps" into your code',
                blockOpcode: 'motion_movesteps',
                category: 'motion',
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
        queries: [
            'how do I use the arrow keys to move',
            'I want to control my sprite with the keyboard',
            'how do I make wasd controls',
            'my sprite won\'t move when I press keys',
            'how to add keyboard controls'
        ],
        followUps: ['move-sprite', 'change-xy-position'],
        blockExample: 'whenKeyMoveRight',
        pointers: [
            {
                label: 'Drag "when key pressed" into your code',
                blockOpcode: 'event_whenkeypressed',
                category: 'events',
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
        queries: [
            'how do I move my sprite left and right',
            'how do I move up and down',
            'what is x and y',
            'I want smooth movement with arrow keys'
        ],
        followUps: ['move-with-keys', 'go-to-position'],
        blockExample: 'whenKeyMoveRight',
        pointers: [
            {
                label: 'Drag "change x by" into your code',
                blockOpcode: 'motion_changexby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['position', 'x', 'y', 'coordinate', 'left', 'right', 'up', 'down', 'direction']
        }
    },
    'go-to-position': {
        id: 'go-to-position',
        followUpLabel: 'Go to a spot',
        text: 'Use "go to x: y:" to place your sprite at an exact spot on the stage!',
        tags: ['motion', 'position'],
        queries: [
            'how do I put my sprite in a specific spot',
            'I want my sprite to go to the center',
            'how do I set the position of my sprite'
        ],
        followUps: ['change-xy-position', 'glide-to-position'],
        blockExample: 'goToCenter',
        pointers: [
            {
                label: 'Drag "go to x: y:" into your code',
                blockOpcode: 'motion_gotoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['go to', 'place', 'position', 'where', 'location', 'center']
        }
    },
    'glide-to-position': {
        id: 'glide-to-position',
        followUpLabel: 'Smooth movement',
        text: 'Use "glide" instead of "go to" for smooth, animated movement!',
        tags: ['motion', 'animation'],
        queries: [
            'how do I make my sprite slide smoothly',
            'I want my sprite to glide across the screen',
            'my sprite teleports instead of moving slowly'
        ],
        followUps: ['move-sprite', 'too-fast'],
        blockExample: 'glideTo',
        pointers: [
            {
                label: 'Drag "glide" into your code',
                blockOpcode: 'motion_glidesecstoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['glide', 'smooth', 'slide', 'animate', 'slow']
        }
    },
    'add-sound': {
        id: 'add-sound',
        followUpLabel: 'Add a sound',
        text: 'Go to the Sounds tab to add sounds, then use "play sound" from the Sound category!',
        tags: ['sound', 'audio', 'beginner'],
        queries: [
            'how do I add a sound to my project',
            'I want my sprite to make noise',
            'where are the sound effects',
            'how do I play music',
            'I want to add a song'
        ],
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
        queries: [
            'how do I record my own sound',
            'I want to use my voice in my project',
            'where is the microphone button',
            'can I record audio'
        ],
        followUps: ['add-sound', 'play-sound-until-done'],
        pointers: [
            {
                label: 'Click the Sounds tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(3)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['record', 'microphone', 'voice', 'own sound']
        }
    },
    'play-sound-until-done': {
        id: 'play-sound-until-done',
        followUpLabel: 'Wait for sound',
        text: 'Use "play sound until done" if you want to wait for the sound to finish before continuing!',
        tags: ['sound'],
        queries: [
            'my sounds are overlapping each other',
            'how do I wait for a sound to finish',
            'the sound keeps restarting'
        ],
        followUps: ['add-sound', 'too-fast'],
        pointers: [
            {
                label: 'Drag "play sound until done" into your code',
                blockOpcode: 'sound_playuntildone',
                category: 'sound',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['sound', 'overlap', 'wait', 'finish', 'until done']
        }
    },
    'say-think': {
        id: 'say-think',
        followUpLabel: 'Speech bubbles',
        text: 'Use "say" or "think" from the Looks category to make your sprite talk with a speech bubble!',
        tags: ['looks', 'speech', 'beginner'],
        queries: [
            'how do I make my sprite talk',
            'I want a speech bubble',
            'how do I show text on the screen',
            'I want my character to say something',
            'how to make the sprite think'
        ],
        followUps: ['change-costume', 'say-for-seconds', 'debug-with-say'],
        blockExample: 'saySomething',
        pointers: [
            {
                label: 'Drag "say Hello!" into your code',
                blockOpcode: 'looks_sayforsecs',
                category: 'looks',
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
        queries: [
            'how do I make the speech bubble go away',
            'I want the text to disappear after a while',
            'how do I make a conversation between sprites'
        ],
        followUps: ['say-think', 'too-fast'],
        pointers: [
            {
                label: 'Drag "say for 2 seconds" into your code',
                blockOpcode: 'looks_sayforsecs',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['disappear', 'temporary', 'seconds', 'conversation', 'dialogue']
        }
    },
    'change-costume': {
        id: 'change-costume',
        followUpLabel: 'Change costume',
        text: 'Use "switch costume" or "next costume" from Looks to change how your sprite looks!',
        tags: ['looks', 'costumes', 'animation', 'beginner'],
        queries: [
            'how do I change what my sprite looks like',
            'I want to switch between different outfits',
            'how do I use costumes',
            'my sprite needs a different picture'
        ],
        followUps: ['add-costume', 'animate-costume', 'costume-center'],
        pointers: [
            {
                label: 'Drag "next costume" into your code',
                blockOpcode: 'looks_nextcostume',
                category: 'looks',
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
        queries: [
            'how do I add more costumes',
            'I want to draw my own costume',
            'where do I add a new picture for my sprite'
        ],
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
        queries: [
            'how do I animate my sprite',
            'I want my sprite to look like it\'s walking',
            'how do I make a flipbook animation',
            'my sprite should change costumes automatically'
        ],
        followUps: ['change-costume', 'forever-loop'],
        blockExample: 'foreverNextCostume',
        pointers: [
            {
                label: 'Drag "next costume" into your code',
                blockOpcode: 'looks_nextcostume',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['animate', 'animation', 'flip', 'walk cycle', 'frame']
        }
    },
    'forever-loop': {
        id: 'forever-loop',
        followUpLabel: 'Repeat forever',
        text: 'Use a "forever" block from Control to make something repeat over and over!',
        tags: ['control', 'loops', 'beginner'],
        queries: [
            'how do I make something repeat forever',
            'I want my sprite to keep moving',
            'how do I loop my code',
            'my code only runs once',
            'I want it to keep going and not stop'
        ],
        followUps: ['repeat-loop', 'too-fast', 'if-not-forever'],
        blockExample: 'foreverMove',
        pointers: [
            {
                label: 'Drag "forever" into your code',
                blockOpcode: 'control_forever',
                category: 'control',
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
        queries: [
            'how do I repeat something a certain number of times',
            'I want to do something 10 times',
            'how do I make a loop that stops'
        ],
        followUps: ['forever-loop', 'too-fast'],
        blockExample: 'repeatTurn',
        pointers: [
            {
                label: 'Drag "repeat" into your code',
                blockOpcode: 'control_repeat',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['repeat', 'times', 'loop', 'count', 'number of times']
        }
    },
    'too-fast': {
        id: 'too-fast',
        followUpLabel: 'Slow it down',
        text: 'Add a "wait 1 seconds" block inside your loop to slow things down!',
        tags: ['control', 'timing', 'beginner'],
        queries: [
            'everything happens too fast',
            'my sprite moves too quickly',
            'how do I slow things down',
            'it goes so fast I can\'t see anything',
            'how do I add a pause'
        ],
        followUps: ['forever-loop', 'glide-to-position', 'wait-vs-no-wait', 'understand-seconds'],
        blockExample: 'waitBlock',
        pointers: [
            {
                label: 'Drag "wait 1 seconds" into your code',
                blockOpcode: 'control_wait',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['fast', 'slow', 'speed', 'wait', 'pause', 'too quick', 'instant']
        }
    },
    'use-variables': {
        id: 'use-variables',
        followUpLabel: 'Make a variable',
        text: 'Click "Make a Variable" in the Variables category to keep track of things like score!',
        tags: ['variables', 'data', 'beginner'],
        queries: [
            'how do I keep score',
            'I want to count something',
            'how do I make a score variable',
            'how do I track lives or health',
            'I need to save a number'
        ],
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
        queries: [
            'how do I add 1 to my score',
            'how do I change my variable',
            'my score won\'t go up',
            'how do I reset the score to zero'
        ],
        followUps: ['use-variables', 'detect-collision'],
        pointers: [
            {
                label: 'Variables are here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['change variable', 'increase', 'decrease', 'add', 'subtract', 'update', 'reset']
        }
    },
    'use-lists': {
        id: 'use-lists',
        followUpLabel: 'Use lists',
        text: 'Click "Make a List" in Variables to store multiple things, like a collection of names!',
        tags: ['variables', 'lists', 'data'],
        queries: [
            'how do I store a bunch of things',
            'I want to make a list of names',
            'how do I save multiple items'
        ],
        followUps: ['use-variables'],
        pointers: [
            {
                label: 'Variables are here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['list', 'array', 'collection', 'multiple', 'items', 'inventory']
        }
    },
    'detect-collision': {
        id: 'detect-collision',
        followUpLabel: 'Detect collisions',
        text: 'Use "if touching" from Sensing inside a forever loop to detect when sprites bump into each other!',
        tags: ['sensing', 'collision', 'game'],
        queries: [
            'how do I tell when sprites touch each other',
            'I want something to happen when my sprite hits another sprite',
            'how do I detect collisions',
            'my sprite should catch things',
            'how do I know if two sprites are touching'
        ],
        followUps: ['forever-loop', 'make-game', 'touching-wrong-color'],
        blockExample: 'foreverIfTouching',
        pointers: [
            {
                label: 'Drag "touching?" into your code',
                blockOpcode: 'sensing_touchingobject',
                category: 'sensing',
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
        queries: [
            'how do I make one sprite tell another sprite to do something',
            'how do sprites communicate',
            'I want to send a message between sprites',
            'how does broadcast work'
        ],
        followUps: ['add-sprite', 'make-game', 'broadcast-for-levels'],
        blockExample: 'broadcastAndReceive',
        pointers: [
            {
                label: 'Drag "broadcast" into your code',
                blockOpcode: 'event_broadcast',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['broadcast', 'message', 'communicate', 'tell', 'signal', 'between sprites', 'other sprite']
        }
    },
    'add-sprite': {
        id: 'add-sprite',
        followUpLabel: 'Add a sprite',
        text: 'Click the cat button below the stage to add a new sprite to your project!',
        tags: ['sprites', 'beginner'],
        queries: [
            'how do I add another character',
            'I want more sprites in my project',
            'where do I get a new sprite',
            'how do I add a second sprite'
        ],
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
        queries: [
            'how do I change the background',
            'I want a different scene',
            'how do I add a backdrop',
            'the white background is boring',
            'how do I switch scenes'
        ],
        followUps: ['add-sprite', 'backdrop-events'],
        pointers: [
            {
                label: 'Add a backdrop here',
                target: '[class*="stage-selector"] [class*="add-button"]',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['backdrop', 'background', 'scene', 'stage', 'scenery', 'level']
        }
    },
    'make-game': {
        id: 'make-game',
        followUpLabel: 'Make a game',
        text: 'A simple game needs: keyboard controls, something to collect or avoid, and a score variable!',
        tags: ['game', 'project-ideas'],
        queries: [
            'how do I make a game',
            'I want to build a game',
            'what do I need for a game',
            'how do I make a simple game',
            'I want to make something you can play'
        ],
        followUps: ['move-with-keys', 'detect-collision', 'use-variables'],
        pointers: [
            {
                label: 'Drag "when key pressed" into your code',
                blockOpcode: 'event_whenkeypressed',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['game', 'play', 'make a game', 'create game', 'build game']
        }
    },
    'clone-sprite': {
        id: 'clone-sprite',
        followUpLabel: 'Clone sprites',
        text: 'Use "create clone of myself" to make copies of a sprite — great for projectiles or enemies!',
        tags: ['control', 'clones', 'advanced'],
        queries: [
            'how do I make copies of my sprite',
            'I want lots of the same sprite',
            'how do I spawn enemies',
            'how do clones work'
        ],
        followUps: ['make-game', 'detect-collision', 'clone-basics', 'clone-delete'],
        blockExample: 'cloneCreateAndBehave',
        pointers: [
            {
                label: 'Drag "create clone of" into your code',
                blockOpcode: 'control_create_clone_of',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['clone', 'copy', 'duplicate', 'many', 'projectile', 'bullet', 'enemy', 'enemies', 'spawn']
        }
    },
    'add-extension': {
        id: 'add-extension',
        followUpLabel: 'Add extensions',
        text: 'Click the blue "Add Extension" button at the bottom-left to get extra blocks like Music or Pen!',
        tags: ['extensions', 'beginner'],
        queries: [
            'how do I get more blocks',
            'where are the extra blocks',
            'I want to use pen or music blocks',
            'how do I add an extension',
            'I need more types of blocks'
        ],
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
        queries: [
            'I clicked a block but nothing happened',
            'the block doesn\'t seem to do anything',
            'why doesn\'t this block work',
            'I tried running my code but I can\'t see a difference'
        ],
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
        queries: [
            'my block doesn\'t do anything',
            'I used a block but nothing changed',
            'the sprite is already in that position',
            'why does this block not seem to work'
        ],
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
        queries: [
            'I can\'t hear any sound',
            'my sound isn\'t playing',
            'why is there no audio',
            'the volume is too quiet',
            'my project is silent'
        ],
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
        queries: [
            'my sprite disappeared',
            'I can\'t see my sprite',
            'where did my sprite go',
            'my character is invisible',
            'my sprite is hidden and I can\'t find it'
        ],
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
        queries: [
            'my sprite is see-through',
            'my sprite looks faded or transparent',
            'how do I make my sprite solid again',
            'the ghost effect is stuck on'
        ],
        followUps: ['sprite-is-hidden', 'graphic-effects'],
        blockExample: 'setGhostZero',
        pointers: [
            {
                label: 'Drag "set ghost effect to 0" from Looks',
                blockOpcode: 'looks_seteffectto',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['ghost', 'transparent', 'see through', 'invisible', 'faded', 'effect']
        }
    },
    'sprite-too-small': {
        id: 'sprite-too-small',
        followUpLabel: 'Fix size',
        text: 'Your sprite might be too small to see! Use "set size to 100%" to reset it.',
        tags: ['looks', 'debugging'],
        queries: [
            'my sprite is too tiny to see',
            'my sprite shrunk and I can\'t find it',
            'how do I make my sprite bigger again',
            'my sprite got really small'
        ],
        followUps: ['sprite-is-hidden', 'change-size'],
        blockExample: 'setSizeTo100',
        pointers: [
            {
                label: 'Drag "set size to" from Looks',
                blockOpcode: 'looks_setsizeto',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['small', 'tiny', 'size', 'can\'t see', 'shrink', 'disappeared']
        }
    },
    'sprite-off-stage': {
        id: 'sprite-off-stage',
        followUpLabel: 'Find sprite',
        text: 'Sprite missing? It might have moved off the edge of the stage! Use "go to x: 0 y: 0" to bring it back to the center.',
        tags: ['motion', 'debugging'],
        queries: [
            'my sprite went off the screen',
            'I can\'t find my sprite it moved away',
            'my sprite is gone off the edge',
            'how do I bring my sprite back to the middle'
        ],
        followUps: ['sprite-is-hidden', 'go-to-position'],
        pointers: [
            {
                label: 'Drag "go to x: y:" into your code',
                blockOpcode: 'motion_gotoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['off screen', 'off stage', 'missing', 'where', 'find', 'gone', 'disappeared', 'can\'t find']
        }
    },
    'stop-project': {
        id: 'stop-project',
        followUpLabel: 'Stop everything',
        text: 'Click the red stop sign to stop all running scripts — useful when things are going wrong!',
        tags: ['control', 'beginner'],
        queries: [
            'how do I stop my project',
            'everything is going crazy how do I stop it',
            'where is the stop button',
            'my project won\'t stop running'
        ],
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
        queries: [
            'how do I figure out what\'s wrong with my code',
            'I don\'t know why my code isn\'t working',
            'how do I test what a variable equals',
            'how do I debug my project'
        ],
        followUps: ['say-think', 'show-hide-variable'],
        pointers: [
            {
                label: 'Drag "say" into your code',
                blockOpcode: 'looks_say',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['debug', 'test', 'check', 'what', 'value', 'wrong', 'figure out', 'troubleshoot']
        }
    },
    'wrong-sprite-selected': {
        id: 'wrong-sprite-selected',
        followUpLabel: 'Check which sprite',
        text: 'Code not running? Make sure you added it to the right sprite — click the sprite you want in the sprite pane, then check its code!',
        tags: ['debugging', 'sprites', 'beginner'],
        queries: [
            'my code is on the wrong sprite',
            'I put the code on the wrong character',
            'why is the other sprite doing it instead',
            'how do I check which sprite has the code',
            'my code runs but the wrong sprite moves'
        ],
        followUps: ['where-did-blocks-go', 'sprite-has-own-code'],
        pointers: [
            {
                label: 'Click a sprite to see its code',
                target: '[class*="sprite-selector_sprite-selector"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['wrong sprite', 'not working', 'different sprite', 'which sprite', 'other']
        }
    },
    'touching-wrong-color': {
        id: 'touching-wrong-color',
        followUpLabel: 'Fix color detection',
        text: 'If "touching color" isn\'t working, make sure you picked the exact right color — use the eyedropper tool on the color square to sample it from the stage!',
        tags: ['debugging', 'sensing'],
        queries: [
            'touching color isn\'t working',
            'my color detection doesn\'t detect anything',
            'the sprite doesn\'t notice the color',
            'how do I pick the right color'
        ],
        followUps: ['detect-collision', 'touching-color'],
        pointers: [
            {
                label: 'Find "touching color?" in Sensing',
                blockOpcode: 'sensing_touchingcolor',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['touching color', 'wrong color', 'not detecting', 'color', 'eyedropper', 'pick']
        }
    },
    'wait-vs-no-wait': {
        id: 'wait-vs-no-wait',
        followUpLabel: 'Add a wait',
        text: 'If things happen too fast to see, try adding "wait" blocks between actions — even "wait 0.1 seconds" can help!',
        tags: ['debugging', 'control', 'timing'],
        queries: [
            'things happen so fast I can\'t see them',
            'my say block flashes and disappears',
            'everything happens instantly',
            'I need things to go slower',
            'how do I add a delay between blocks'
        ],
        followUps: ['too-fast', 'understand-seconds'],
        pointers: [
            {
                label: 'Drag "wait" into your code',
                blockOpcode: 'control_wait',
                category: 'control',
                side: 'right'
            }
        ],
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
        queries: [
            'where did my blocks go',
            'my code disappeared',
            'I can\'t find my code anymore',
            'all my blocks are gone',
            'I lost my code'
        ],
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
        queries: [
            'does each sprite have its own code',
            'why can\'t my sprites share code',
            'I added code but it\'s not on my other sprite'
        ],
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
        queries: [
            'do blocks run in order',
            'which block runs first',
            'does order matter in my code',
            'why does it do things one at a time'
        ],
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
        queries: [
            'how do I do two things at the same time',
            'I want my sprite to move and talk at once',
            'can I run two scripts together',
            'how do I make things happen in parallel'
        ],
        followUps: ['blocks-run-in-order', 'nothing-happens'],
        blockExample: 'twoFlagStacks',
        pointers: [
            {
                label: 'Drag "when green flag clicked" into your code',
                blockOpcode: 'event_whenflagclicked',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['same time', 'two things', 'parallel', 'both', 'together', 'simultaneously']
        }
    },
    'if-not-forever': {
        id: 'if-not-forever',
        followUpLabel: 'Keep checking',
        text: '"If" checks only once! Wrap it inside a "forever" loop to keep checking over and over.',
        tags: ['control', 'beginner', 'meta'],
        queries: [
            'my if block only works once',
            'why doesn\'t my if block keep checking',
            'the if block runs but then stops',
            'I need my if to keep checking over and over',
            'my collision detection only works the first time'
        ],
        followUps: ['forever-loop', 'detect-collision'],
        blockExample: 'foreverIfCheck',
        pointers: [
            {
                label: 'Drag "if" into your code',
                blockOpcode: 'control_if',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['if', 'only once', 'check', 'forever', 'not working', 'condition', 'keeps', 'continuous']
        }
    },
    'deleting-sprite-deletes-code': {
        id: 'deleting-sprite-deletes-code',
        followUpLabel: 'Don\'t lose code',
        text: 'Careful — deleting a sprite also deletes all the code, costumes, and sounds inside it!',
        tags: ['sprites', 'meta', 'beginner'],
        queries: [
            'I deleted a sprite and lost all my code',
            'can I undo deleting a sprite',
            'all my code is gone after I deleted the sprite',
            'I accidentally removed a sprite'
        ],
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
        queries: [
            'how do I start coding',
            'what do I do first',
            'how do I use the blocks',
            'where do I put the blocks',
            'I don\'t know how to begin'
        ],
        followUps: ['click-block-to-try', 'add-event-block'],
        pointers: [
            {
                label: 'Drag blocks from here into the workspace',
                blockOpcode: 'motion_movesteps',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['how', 'start', 'begin', 'drag', 'block', 'palette', 'workspace', 'where']
        }
    },
    'click-block-to-try': {
        id: 'click-block-to-try',
        followUpLabel: 'Try a block',
        text: 'You can click on any block in the workspace to try it! Click a whole stack to run all of them.',
        tags: ['beginner', 'meta'],
        queries: [
            'can I click a block to see what it does',
            'how do I test a single block',
            'how do I try out a block'
        ],
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
        queries: [
            'how do I delete a block from the middle',
            'how do I remove a block without breaking my code',
            'I want to take out one block from my stack',
            'how do I disconnect a block'
        ],
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
        queries: [
            'what is a hat block',
            'my code doesn\'t have a starting block',
            'how do I make my code run automatically',
            'I need a when block on top',
            'what goes at the top of my code'
        ],
        followUps: ['nothing-happens', 'green-flag'],
        pointers: [
            {
                label: 'Drag "when green flag clicked" into your code',
                blockOpcode: 'event_whenflagclicked',
                category: 'events',
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
        queries: [
            'I put turn and turn back but nothing happens',
            'my blocks cancel each other out',
            'the sprite doesn\'t seem to move at all',
            'blocks happen too fast to see'
        ],
        followUps: ['wait-vs-no-wait', 'too-fast'],
        pointers: [
            {
                label: 'Drag "wait" into your code',
                blockOpcode: 'control_wait',
                category: 'control',
                side: 'right'
            }
        ],
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
        queries: [
            'how do I make my sprite go backwards',
            'I want my sprite to move the other way',
            'how do I use negative numbers',
            'can I move left instead of right'
        ],
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
        queries: [
            'can I use decimal numbers like 0.5',
            'how do I make a really short wait',
            'I want to move less than 1 step'
        ],
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
        queries: [
            'what does the less than symbol mean',
            'how do I compare two numbers',
            'I don\'t understand greater than and less than',
            'what are the pointy blocks for'
        ],
        followUps: ['use-variables', 'if-not-forever'],
        pointers: [
            {
                label: 'Operators are here',
                target: '.blocklyToolboxCategory#operators',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['greater', 'less', 'than', 'symbol', 'compare', 'arrow', 'pointy', '<', '>']
        }
    },
    'find-block-by-color': {
        id: 'find-block-by-color',
        followUpLabel: 'Find blocks',
        text: 'Blocks are color-coded by category! Blue = Motion, Purple = Looks, Pink = Sound, Yellow = Events, Orange = Control.',
        tags: ['beginner', 'meta'],
        queries: [
            'I can\'t find the block I need',
            'where is the move block',
            'how do I know which category a block is in',
            'what do the colors mean',
            'I\'m looking for a specific block'
        ],
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
        queries: [
            'how do I change the option on a block',
            'how do I pick a different sound or key',
            'there\'s a little arrow on my block what does it do'
        ],
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
        queries: [
            'how do I put a variable inside a block',
            'can I drag a block into another block',
            'how do I use a random number in a move block'
        ],
        followUps: ['random-numbers', 'use-variables'],
        blockExample: 'moveRandomSteps',
        pointers: [
            {
                label: 'Find "pick random" in Operators',
                blockOpcode: 'operator_random',
                category: 'operators',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['reporter', 'round', 'input', 'drag into', 'dynamic', 'variable', 'inside']
        }
    },
    'right-click-duplicate': {
        id: 'right-click-duplicate',
        followUpLabel: 'Duplicate blocks',
        text: 'Right-click (or long-press) on a block to duplicate it, add a comment, or get help!',
        tags: ['beginner', 'meta', 'editing'],
        queries: [
            'how do I copy a block',
            'how do I duplicate my code',
            'is there a right-click menu'
        ],
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
        queries: [
            'how does the stage grid work',
            'what are x and y coordinates',
            'where is the center of the stage',
            'how big is the stage'
        ],
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
        queries: [
            'how long is 1 second in Scratch',
            'what number should I put in the wait block',
            'how do I get the right timing'
        ],
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
        queries: [
            'how do I make my own block',
            'can I create a custom block',
            'my code is really long how do I organize it'
        ],
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
        queries: [
            'how do I draw lines on the stage',
            'I want my sprite to leave a trail',
            'how do I use the pen',
            'where are the drawing blocks'
        ],
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
        queries: [
            'how do I play instruments',
            'I want to make music with drums',
            'where are the music blocks',
            'how do I play notes'
        ],
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
        queries: [
            'how do I make my sprite talk out loud',
            'I want to hear my sprite\'s voice',
            'can my sprite speak with real audio'
        ],
        followUps: ['add-extension', 'say-think'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['text to speech', 'talk', 'voice', 'say out loud', 'speak', 'tts']
        }
    },
    'random-numbers': {
        id: 'random-numbers',
        followUpLabel: 'Use random',
        text: 'Use "pick random 1 to 10" from Operators to add surprises — great for random positions, sizes, or colors!',
        tags: ['operators', 'math'],
        queries: [
            'how do I make something random',
            'I want a different thing to happen each time',
            'how do I pick a random number',
            'I want surprise elements in my project'
        ],
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
        queries: [
            'how do I ask the player a question',
            'I want the user to type something',
            'how do I get the player\'s name',
            'how does the answer block work'
        ],
        followUps: ['make-quiz', 'use-variables'],
        blockExample: 'askAndSay',
        pointers: [
            {
                label: 'Drag "ask and wait" into your code',
                blockOpcode: 'sensing_askandwait',
                category: 'sensing',
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
        queries: [
            'how do I detect when my sprite touches a color',
            'I want to know if my sprite is on the ground',
            'how do I use the color picker'
        ],
        followUps: ['detect-collision', 'touching-wrong-color'],
        pointers: [
            {
                label: 'Drag "touching color?" into your code',
                blockOpcode: 'sensing_touchingcolor',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['color', 'touching color', 'pick', 'eyedropper', 'detect', 'sense']
        }
    },
    'timer-block': {
        id: 'timer-block',
        followUpLabel: 'Use the timer',
        text: 'Use the "timer" block from Sensing to time things — combine with "reset timer" to make countdowns or speedruns!',
        tags: ['sensing', 'timing'],
        queries: [
            'how do I add a timer to my game',
            'I want a countdown',
            'how do I time how long something takes'
        ],
        followUps: ['use-variables', 'make-game'],
        pointers: [
            {
                label: 'Find "timer" in Sensing',
                blockOpcode: 'sensing_timer',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['timer', 'time', 'countdown', 'stopwatch', 'clock', 'seconds']
        }
    },
    'change-size': {
        id: 'change-size',
        followUpLabel: 'Change size',
        text: 'Use "change size by 10" or "set size to" from Looks to make your sprite grow or shrink!',
        tags: ['looks', 'size'],
        queries: [
            'how do I make my sprite bigger',
            'I want my sprite to grow',
            'how do I shrink my sprite',
            'how do I change the size of my sprite'
        ],
        followUps: ['sprite-too-small', 'growing-shrinking'],
        blockExample: 'changeSizeBy',
        pointers: [
            {
                label: 'Drag "change size by" into your code',
                blockOpcode: 'looks_changesizeby',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['size', 'big', 'small', 'grow', 'shrink', 'larger', 'smaller', 'scale']
        }
    },
    'graphic-effects': {
        id: 'graphic-effects',
        followUpLabel: 'Visual effects',
        text: 'Try "set color effect" or "set whirl effect" from Looks to add wild visual effects to your sprite!',
        tags: ['looks', 'effects'],
        queries: [
            'how do I add cool effects to my sprite',
            'I want to make my sprite look weird',
            'how do I change the color of my sprite',
            'what visual effects are there'
        ],
        followUps: ['sprite-ghost-effect', 'color-changing'],
        blockExample: 'setColorEffect',
        pointers: [
            {
                label: 'Drag "set effect to" from Looks',
                blockOpcode: 'looks_seteffectto',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['effect', 'color', 'whirl', 'fisheye', 'pixelate', 'mosaic', 'brightness', 'ghost']
        }
    },
    'stamp-block': {
        id: 'stamp-block',
        followUpLabel: 'Stamp copies',
        text: 'Use "stamp" from the Pen extension to leave a copy of your sprite on the stage — like a trail of footprints!',
        tags: ['pen', 'effects', 'advanced'],
        queries: [
            'how do I stamp my sprite on the stage',
            'I want to leave copies of my sprite',
            'how do I make a trail of pictures'
        ],
        followUps: ['pen-extension', 'trail-of-stamps'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['stamp', 'copy', 'trail', 'footprint', 'mark', 'imprint']
        }
    },
    'play-vs-play-until-done': {
        id: 'play-vs-play-until-done',
        followUpLabel: 'Sound timing',
        text: '"Start sound" plays and keeps going. "Play sound until done" waits for it to finish. Use "start sound" for background music!',
        tags: ['sound'],
        queries: [
            'what is the difference between start sound and play sound until done',
            'my sounds play on top of each other',
            'how do I play background music'
        ],
        followUps: ['add-sound', 'play-sound-until-done'],
        pointers: [
            {
                label: 'Sound blocks are here',
                target: '.blocklyToolboxCategory#sound',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['start sound', 'play sound', 'until done', 'background', 'music', 'difference', 'overlap']
        }
    },
    'backdrop-events': {
        id: 'backdrop-events',
        followUpLabel: 'Backdrop triggers',
        text: 'Use "when backdrop switches to" to trigger code when the scene changes — perfect for levels in a game!',
        tags: ['events', 'backdrop', 'game'],
        queries: [
            'how do I trigger code when the backdrop changes',
            'I want something to happen when I switch scenes',
            'how do I make levels with backdrops'
        ],
        followUps: ['change-backdrop', 'broadcast-for-levels'],
        pointers: [
            {
                label: 'Drag "when backdrop switches to" into your code',
                blockOpcode: 'event_whenbackdropswitchesto',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['backdrop', 'scene', 'level', 'switch', 'when backdrop', 'stage', 'background']
        }
    },
    'mouse-pointer': {
        id: 'mouse-pointer',
        followUpLabel: 'Follow mouse',
        text: 'Use "go to mouse-pointer" or "point towards mouse-pointer" to make sprites follow your mouse!',
        tags: ['motion', 'sensing', 'mouse'],
        queries: [
            'how do I make my sprite follow the mouse',
            'I want my sprite to chase the cursor',
            'how do I use the mouse to control a sprite'
        ],
        followUps: ['move-sprite', 'forever-loop'],
        blockExample: 'followMouse',
        pointers: [
            {
                label: 'Drag "go to" into your code',
                blockOpcode: 'motion_goto',
                category: 'motion',
                side: 'right'
            }
        ],
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
        queries: [
            'what happens when a clone starts',
            'how do I give clones their own code',
            'how do I make each clone do something different'
        ],
        followUps: ['clone-sprite', 'clone-delete'],
        blockExample: 'cloneBasicsPair',
        pointers: [
            {
                label: 'Drag "when I start as a clone" into your code',
                blockOpcode: 'control_start_as_clone',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['clone', 'start as clone', 'when I start', 'copy', 'behavior', 'own', 'each']
        }
    },
    'show-hide-variable': {
        id: 'show-hide-variable',
        followUpLabel: 'Variable display',
        text: 'Right-click a variable on the stage to change how it looks — you can make it a slider for testing!',
        tags: ['variables', 'debugging'],
        queries: [
            'how do I show a variable on the stage',
            'how do I hide the variable display',
            'can I make a variable slider'
        ],
        followUps: ['use-variables', 'debug-with-say'],
        pointers: [
            {
                label: 'Variables are here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['variable', 'display', 'slider', 'show', 'monitor', 'stage', 'readout']
        }
    },
    'reset-at-start': {
        id: 'reset-at-start',
        followUpLabel: 'Reset at start',
        text: 'Put "go to x: y:" and "set size to 100" under "when green flag clicked" to reset your sprite at the start!',
        tags: ['events', 'motion', 'beginner'],
        queries: [
            'my sprite starts in the wrong place every time',
            'how do I reset my sprite at the beginning',
            'my sprite doesn\'t go back to the start',
            'I want everything to reset when I click the green flag'
        ],
        followUps: ['green-flag', 'go-to-position'],
        blockExample: 'whenFlagGoToReset',
        pointers: [
            {
                label: 'Drag "go to x: y:" into your code',
                blockOpcode: 'motion_gotoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['reset', 'start', 'beginning', 'initial', 'position', 'restart', 'go back']
        }
    },
    'broadcast-for-levels': {
        id: 'broadcast-for-levels',
        followUpLabel: 'Game levels',
        text: 'Use "broadcast" to switch between levels or scenes — each sprite can listen for the same message and react differently!',
        tags: ['events', 'broadcast', 'game', 'advanced'],
        queries: [
            'how do I make levels in my game',
            'how do I go to the next level',
            'I want to switch between game scenes'
        ],
        followUps: ['broadcast-message', 'backdrop-events'],
        blockExample: 'broadcastLevels',
        pointers: [
            {
                label: 'Drag "broadcast" into your code',
                blockOpcode: 'event_broadcast',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['level', 'scene', 'broadcast', 'switch', 'advance', 'next level', 'game over']
        }
    },
    'clone-delete': {
        id: 'clone-delete',
        followUpLabel: 'Delete clones',
        text: 'Don\'t forget to "delete this clone" when you\'re done with it — otherwise you might hit the 300 clone limit!',
        tags: ['control', 'clones', 'advanced'],
        queries: [
            'how do I get rid of clones',
            'there are too many clones and my project is lagging',
            'my project is slow because of clones'
        ],
        followUps: ['clone-basics', 'clone-sprite'],
        blockExample: 'deleteClone',
        pointers: [
            {
                label: 'Drag "delete this clone" into your code',
                blockOpcode: 'control_delete_this_clone',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['clone', 'delete', 'remove', 'limit', 'too many', '300', 'maximum', 'lag', 'slow']
        }
    },
    'repeat-until': {
        id: 'repeat-until',
        followUpLabel: 'Repeat until',
        text: 'Use "repeat until" to keep doing something until a condition is met — like moving until you reach the edge!',
        tags: ['control', 'loops'],
        queries: [
            'how do I repeat until something happens',
            'I want to keep going until I reach the edge',
            'how do I stop a loop when a condition is true'
        ],
        followUps: ['forever-loop', 'if-not-forever'],
        blockExample: 'repeatUntilEdge',
        pointers: [
            {
                label: 'Drag "repeat until" into your code',
                blockOpcode: 'control_repeat_until',
                category: 'control',
                side: 'right'
            }
        ],
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
        queries: [
            'I want to make a story',
            'how do I make characters talk to each other',
            'I want to create a cartoon or movie'
        ],
        followUps: ['say-for-seconds', 'change-backdrop'],
        pointers: [
            {
                label: 'Drag "say for 2 seconds" into your code',
                blockOpcode: 'looks_sayforsecs',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['story', 'tell', 'narrative', 'dialogue', 'conversation', 'scene', 'tale']
        }
    },
    'make-animation': {
        id: 'make-animation',
        followUpLabel: 'Make animation',
        text: 'Create an animation by switching costumes in a loop — draw your own frames in the Costumes tab!',
        tags: ['project-ideas', 'animation', 'looks'],
        queries: [
            'how do I make an animation',
            'I want to make a cartoon',
            'how do I create a flipbook or movie'
        ],
        followUps: ['animate-costume', 'add-costume'],
        pointers: [
            {
                label: 'Click the Costumes tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['animation', 'animate', 'cartoon', 'frames', 'flipbook', 'movie']
        }
    },
    'make-music-project': {
        id: 'make-music-project',
        followUpLabel: 'Compose music',
        text: 'Make a music project! Use the Music extension with "play note" blocks to compose your own song.',
        tags: ['project-ideas', 'music', 'sound'],
        queries: [
            'how do I make a music project',
            'I want to compose a song',
            'how do I create beats and melodies'
        ],
        followUps: ['music-extension', 'add-sound'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['song', 'compose', 'music', 'melody', 'create music', 'band']
        }
    },
    'make-art': {
        id: 'make-art',
        followUpLabel: 'Create art',
        text: 'Make art! Use the Pen extension with loops and turns to draw amazing patterns and spirals.',
        tags: ['project-ideas', 'pen', 'art'],
        queries: [
            'how do I make art in Scratch',
            'I want to draw patterns and spirals',
            'how do I make geometric designs'
        ],
        followUps: ['pen-extension', 'trail-of-stamps'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['art', 'draw', 'pattern', 'spiral', 'design', 'creative', 'geometric']
        }
    },
    'make-quiz': {
        id: 'make-quiz',
        followUpLabel: 'Make a quiz',
        text: 'Make a quiz! Use "ask and wait" + "if answer =" to check if the player got it right.',
        tags: ['project-ideas', 'sensing', 'operators'],
        queries: [
            'how do I make a quiz game',
            'I want to make a trivia game',
            'how do I check if the answer is right'
        ],
        followUps: ['ask-and-answer', 'use-variables'],
        pointers: [
            {
                label: 'Drag "ask and wait" into your code',
                blockOpcode: 'sensing_askandwait',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['quiz', 'question', 'test', 'trivia', 'answer', 'right', 'wrong']
        }
    },
    'make-platformer': {
        id: 'make-platformer',
        followUpLabel: 'Platformer game',
        text: 'Make a platformer game! Use "change y by -2" in a forever loop for gravity, and "if touching color" for the ground.',
        tags: ['project-ideas', 'game', 'advanced'],
        queries: [
            'how do I make a platformer game',
            'I want to add gravity and jumping',
            'how do I make a side scrolling game like Mario'
        ],
        followUps: ['make-game', 'touching-color', 'move-with-keys'],
        blockExample: 'gravityFall',
        pointers: [
            {
                label: 'Drag "change y by" into your code',
                blockOpcode: 'motion_changeyby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['platformer', 'jump', 'gravity', 'platform', 'side scroller', 'mario']
        }
    },
    'make-clicker': {
        id: 'make-clicker',
        followUpLabel: 'Clicker game',
        text: 'Make a clicker game! Use "when this sprite clicked" + "change score by 1" — add costumes to make the sprite react to each click!',
        tags: ['project-ideas', 'game', 'beginner'],
        queries: [
            'how do I make a clicker game',
            'I want to click a sprite to get points',
            'how do I make a cookie clicker'
        ],
        followUps: ['use-variables', 'change-costume'],
        blockExample: 'whenClickedChangeScore',
        pointers: [
            {
                label: 'Drag "when this sprite clicked" into your code',
                blockOpcode: 'event_whenthisspriteclicked',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['clicker', 'click', 'tap', 'cookie', 'idle', 'score', 'points']
        }
    },
    'make-dance-party': {
        id: 'make-dance-party',
        followUpLabel: 'Dance party',
        text: 'Make a dance party! Add multiple sprites, give each one a forever loop with costume changes and moves, then add music!',
        tags: ['project-ideas', 'fun', 'animation'],
        queries: [
            'how do I make a dance party',
            'I want sprites to dance together',
            'how do I make a music video'
        ],
        followUps: ['add-sprite', 'animate-costume', 'music-extension'],
        pointers: [
            {
                label: 'Add a new sprite here',
                target: '[class*="sprite-selector_sprite-selector"] [class*="add-button"]',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['dance', 'party', 'choreography', 'music', 'move', 'groove']
        }
    },
    'make-pet': {
        id: 'make-pet',
        followUpLabel: 'Virtual pet',
        text: 'Make a virtual pet! Use variables to track hunger, happiness, and energy — and buttons to feed, play, and rest.',
        tags: ['project-ideas', 'game', 'variables'],
        queries: [
            'how do I make a virtual pet',
            'I want to make a tamagotchi',
            'how do I make a pet you can feed and play with'
        ],
        followUps: ['use-variables', 'change-costume'],
        pointers: [
            {
                label: 'Variables are here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['pet', 'virtual pet', 'tamagotchi', 'care', 'feed', 'play']
        }
    },
    'surprise-sprite': {
        id: 'surprise-sprite',
        followUpLabel: 'Random surprise',
        text: 'Try putting "set size to pick random 50 to 200" in your project for fun surprises!',
        tags: ['fun', 'operators'],
        queries: [
            'I want something fun and random to happen',
            'how do I make my sprite a surprise size',
            'I want silly random stuff'
        ],
        followUps: ['random-numbers', 'change-size'],
        pointers: [
            {
                label: 'Find "pick random" in Operators',
                blockOpcode: 'operator_random',
                category: 'operators',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['surprise', 'fun', 'random', 'silly', 'goofy', 'playful', 'wacky']
        }
    },
    'silly-sounds': {
        id: 'silly-sounds',
        followUpLabel: 'Silly sounds',
        text: 'Try the sound effects in the Sounds tab — there are funny sounds like "boing", "chomp", and "zoop"!',
        tags: ['fun', 'sound'],
        queries: [
            'where are the funny sounds',
            'I want silly sound effects',
            'are there any cool sounds I can use'
        ],
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
        queries: [
            'how do I make my sprite change colors like a rainbow',
            'I want rainbow effects',
            'how do I make a color cycling effect'
        ],
        followUps: ['graphic-effects', 'spinning'],
        blockExample: 'foreverColorChange',
        pointers: [
            {
                label: 'Drag "change color effect" into your code',
                blockOpcode: 'looks_changeeffectby',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['rainbow', 'color', 'change', 'cycle', 'colorful', 'effect']
        }
    },
    'spinning': {
        id: 'spinning',
        followUpLabel: 'Spin around',
        text: 'Put "turn 15 degrees" inside a forever loop to make your sprite spin! Change the number to spin faster or slower.',
        tags: ['fun', 'motion'],
        queries: [
            'how do I make my sprite spin',
            'I want my sprite to rotate around',
            'how do I make something twirl'
        ],
        followUps: ['color-changing', 'forever-loop'],
        blockExample: 'foreverSpin',
        pointers: [
            {
                label: 'Drag "turn" into your code',
                blockOpcode: 'motion_turnright',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['spin', 'turn', 'rotate', 'dizzy', 'twirl']
        }
    },
    'growing-shrinking': {
        id: 'growing-shrinking',
        followUpLabel: 'Pulse effect',
        text: 'Make your sprite pulse! Use "change size by 5" and "wait", then "change size by -5" and "wait" in a forever loop.',
        tags: ['fun', 'looks'],
        queries: [
            'how do I make my sprite pulse or throb',
            'I want my sprite to grow and shrink',
            'how do I make a breathing or bouncing effect'
        ],
        followUps: ['change-size', 'forever-loop'],
        blockExample: 'foreverChangeSizePulse',
        pointers: [
            {
                label: 'Drag "change size by" into your code',
                blockOpcode: 'looks_changesizeby',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['grow', 'shrink', 'pulse', 'bounce', 'throb', 'beat', 'bigger', 'smaller']
        }
    },
    'trail-of-stamps': {
        id: 'trail-of-stamps',
        followUpLabel: 'Leave a trail',
        text: 'Turn on pen down and move your sprite around with the keyboard — you\'ll leave a colorful trail everywhere you go!',
        tags: ['fun', 'pen', 'motion'],
        queries: [
            'how do I make a drawing program',
            'I want my sprite to leave a colorful trail',
            'how do I doodle on the stage'
        ],
        followUps: ['pen-extension', 'move-with-keys'],
        pointers: [
            {
                label: 'Add extensions here',
                target: 'button[class*="extension-button"]',
                preAction: 'switchToCodeTab',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['trail', 'draw', 'path', 'trace', 'doodle', 'mark', 'line']
        }
    },
    'sound-remix': {
        id: 'sound-remix',
        followUpLabel: 'Remix sounds',
        text: 'Record your own voice in the Sounds tab, then use "set pitch effect" to make it sound like a chipmunk or a monster!',
        tags: ['fun', 'sound'],
        queries: [
            'how do I make my voice sound funny',
            'I want to make chipmunk or monster sounds',
            'how do I change the pitch of a recording'
        ],
        followUps: ['record-sound', 'silly-sounds'],
        pointers: [
            {
                label: 'Click the Sounds tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(3)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['voice', 'record', 'pitch', 'chipmunk', 'monster', 'funny', 'remix', 'effect']
        }
    },
    'bouncing-around': {
        id: 'bouncing-around',
        followUpLabel: 'Bouncing screensaver',
        text: 'Make a screensaver! Use "point in direction pick random 1 to 360", then "forever: move + if on edge bounce"!',
        tags: ['fun', 'motion', 'project-ideas'],
        queries: [
            'how do I make a bouncing screensaver',
            'I want my sprite to bounce off the walls',
            'how do I make a DVD logo effect'
        ],
        followUps: ['forever-loop', 'random-numbers'],
        blockExample: 'foreverBounce',
        pointers: [
            {
                label: 'Drag "if on edge, bounce" into your code',
                blockOpcode: 'motion_ifonedgebounce',
                category: 'motion',
                side: 'right'
            }
        ],
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
        queries: [
            'I typed a really big number and it broke',
            'why does my huge number turn into 0',
            'my number is wrong after I type a lot of digits'
        ],
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
        queries: [
            'my sprite won\'t turn or rotate',
            'the turn block doesn\'t seem to do anything',
            'my sprite only flips left and right',
            'how do I change the rotation style'
        ],
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
        queries: [
            'my sprite wobbles when it turns',
            'the sprite rotates around the wrong point',
            'my sprite orbits in a circle instead of spinning'
        ],
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
        queries: [
            'a costume or sound name is grayed out',
            'my block says a name but it\'s missing',
            'how do I fix a missing costume or sound'
        ],
        followUps: ['add-costume', 'add-sound'],
        pointers: [
            {
                label: 'Click the Costumes tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['missing', 'costume', 'sound', 'grayed', 'not found', 'empty', 'asset']
        }
    },
    'dragging-to-stage': {
        id: 'dragging-to-stage',
        followUpLabel: 'Drag to workspace',
        text: 'Make sure you\'re dragging blocks to the code workspace (the big area in the middle), not onto the stage!',
        tags: ['debugging', 'beginner', 'meta'],
        queries: [
            'I\'m dragging blocks to the stage by accident',
            'my blocks won\'t snap together',
            'where am I supposed to put the blocks',
            'blocks aren\'t connecting to each other'
        ],
        followUps: ['drag-blocks-to-workspace', 'find-block-by-color'],
        relevance: {
            keywords: ['drag', 'stage', 'wrong place', 'blocks', 'workspace', 'won\'t snap', 'can\'t connect']
        }
    },

    // ──────────────────────────────────────────────
    // TUTORIALS — each opens a step-by-step tutorial deck
    // ──────────────────────────────────────────────

    'tutorial-getting-started': {
        id: 'tutorial-getting-started',
        tutorialId: 'intro-move-sayhello',
        text: 'Try the "Getting Started" tutorial to learn how to make a sprite move and say hello!',
        tags: ['beginner', 'tutorial'],
        queries: [
            'how do I get started',
            'I\'m new to Scratch what do I do',
            'beginner tutorial',
            'how do I start making something',
            'teach me Scratch'
        ],
        followUps: [],
        relevance: {
            keywords: ['start', 'begin', 'new', 'first', 'learn', 'hello', 'tutorial', 'getting started']
        }
    },
    'tutorial-getting-started-asl': {
        id: 'tutorial-getting-started-asl',
        tutorialId: 'intro-getting-started-ASL',
        text: 'Try the "Getting Started - ASL" tutorial to learn Scratch with American Sign Language!',
        tags: ['beginner', 'tutorial'],
        queries: [
            'getting started with ASL',
            'American Sign Language tutorial',
            'deaf accessible tutorial',
            'sign language Scratch tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['asl', 'sign language', 'deaf', 'accessible', 'getting started']
        }
    },
    'tutorial-animate-a-name': {
        id: 'tutorial-animate-a-name',
        tutorialId: 'animate-a-name',
        text: 'Try the "Animate a Name" tutorial to make letters spin, grow, and change color!',
        tags: ['animation', 'art', 'tutorial'],
        queries: [
            'how do I animate letters',
            'I want to make a name animation',
            'animate text or letters',
            'make letters spin and change color'
        ],
        followUps: [],
        relevance: {
            keywords: ['animate', 'name', 'letter', 'spin', 'grow', 'color', 'art', 'tutorial']
        }
    },
    'tutorial-animate-a-character': {
        id: 'tutorial-animate-a-character',
        tutorialId: 'Animate-A-Character',
        text: 'Try the "Animate a Character" tutorial to make a character talk, move with arrow keys, and jump!',
        tags: ['animation', 'tutorial'],
        queries: [
            'how do I animate a character',
            'make my character move and talk',
            'character animation tutorial',
            'how do I make a character jump'
        ],
        followUps: [],
        relevance: {
            keywords: ['animate', 'character', 'talk', 'jump', 'arrow keys', 'move', 'tutorial']
        }
    },
    'tutorial-tell-a-story': {
        id: 'tutorial-tell-a-story',
        tutorialId: 'Tell-A-Story',
        text: 'Try the "Create a Story" tutorial to make characters have conversations and switch scenes!',
        tags: ['stories', 'tutorial'],
        queries: [
            'how do I make a story',
            'I want to create a story in Scratch',
            'make characters talk to each other',
            'how do I switch scenes in a story'
        ],
        followUps: [],
        relevance: {
            keywords: ['story', 'conversation', 'talk', 'scene', 'backdrop', 'narrative', 'tutorial']
        }
    },
    'tutorial-say-it-out-loud': {
        id: 'tutorial-say-it-out-loud',
        tutorialId: 'say-it-out-loud',
        text: 'Try the "Create Animations That Talk" tutorial to use the text-to-speech extension and make sprites speak out loud!',
        tags: ['sound', 'tutorial'],
        queries: [
            'how do I make a sprite talk out loud',
            'text to speech in Scratch',
            'make my character speak with a voice',
            'how do I use text to speech'
        ],
        followUps: [],
        relevance: {
            keywords: ['text to speech', 'talk', 'speak', 'voice', 'say', 'out loud', 'tts', 'tutorial']
        }
    },
    'tutorial-imagine': {
        id: 'tutorial-imagine',
        tutorialId: 'imagine',
        text: 'Try the "Imagine a World" tutorial to create an interactive world with flying, gliding, and costume changes!',
        tags: ['animation', 'stories', 'tutorial'],
        queries: [
            'imagine a world tutorial',
            'how do I make an interactive world',
            'I want to create a world in Scratch',
            'make sprites fly around and change costumes'
        ],
        followUps: [],
        relevance: {
            keywords: ['imagine', 'world', 'fly', 'glide', 'costume', 'interactive', 'tutorial']
        }
    },
    'tutorial-add-effects': {
        id: 'tutorial-add-effects',
        tutorialId: 'add-effects',
        text: 'Try the "Add Effects" tutorial to learn about color, fisheye, whirl, pixelate, and other cool effects!',
        tags: ['looks', 'tutorial'],
        queries: [
            'how do I add effects to a sprite',
            'color fisheye whirl pixelate effects',
            'how do I make my sprite look cool',
            'graphic effects in Scratch'
        ],
        followUps: [],
        relevance: {
            keywords: ['effects', 'color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'ghost', 'brightness', 'tutorial']
        }
    },
    'tutorial-make-it-fly': {
        id: 'tutorial-make-it-fly',
        tutorialId: 'make-it-fly',
        text: 'Try the "Make it Fly" tutorial to create a flying game with arrow keys, collectibles, and a score!',
        tags: ['games', 'tutorial'],
        queries: [
            'how do I make a flying game',
            'make my sprite fly around',
            'flying game with score',
            'how do I collect things in a game'
        ],
        followUps: [],
        relevance: {
            keywords: ['fly', 'flying', 'game', 'arrow keys', 'collect', 'score', 'scenery', 'tutorial']
        }
    },
    'tutorial-make-music': {
        id: 'tutorial-make-music',
        tutorialId: 'Make-Music',
        text: 'Try the "Make Music" tutorial to pick instruments, create songs, and make a beatbox!',
        tags: ['music', 'sound', 'tutorial'],
        queries: [
            'how do I make music in Scratch',
            'I want to play instruments',
            'create a song or beat',
            'make a drum beat or beatbox'
        ],
        followUps: [],
        relevance: {
            keywords: ['music', 'instrument', 'song', 'beat', 'drum', 'beatbox', 'play', 'band', 'tutorial']
        }
    },
    'tutorial-pong': {
        id: 'tutorial-pong',
        tutorialId: 'pong',
        text: 'Try the "Pong Game" tutorial to make a ball bounce off a paddle and keep score!',
        tags: ['games', 'tutorial'],
        queries: [
            'how do I make a pong game',
            'bouncing ball game with paddle',
            'how do I make a ball bounce off things',
            'pong game tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['pong', 'bounce', 'paddle', 'ball', 'game', 'score', 'tutorial']
        }
    },
    'tutorial-clicker-game': {
        id: 'tutorial-clicker-game',
        tutorialId: 'Make-A-Game',
        text: 'Try the "Make a Clicker Game" tutorial to make things pop up, click on them, and keep score!',
        tags: ['games', 'tutorial'],
        queries: [
            'how do I make a clicker game',
            'clicking game with score',
            'make things pop up and click them',
            'whack a mole style game'
        ],
        followUps: [],
        relevance: {
            keywords: ['clicker', 'click', 'pop', 'game', 'score', 'random', 'tutorial']
        }
    },
    'tutorial-chase-game': {
        id: 'tutorial-chase-game',
        tutorialId: 'Chase-Game',
        text: 'Try the "Chase Game" tutorial to make a game where you chase things around the screen with arrow keys!',
        tags: ['games', 'tutorial'],
        queries: [
            'how do I make a chase game',
            'make a game where I chase things',
            'arrow key game with score',
            'how do I make a game with keyboard controls'
        ],
        followUps: [],
        relevance: {
            keywords: ['chase', 'game', 'catch', 'follow', 'arrow keys', 'keyboard', 'score', 'tutorial']
        }
    },
    'tutorial-video-sensing': {
        id: 'tutorial-video-sensing',
        tutorialId: 'Video-Sensing',
        text: 'Try the "Video Sensing" tutorial to use your camera to pet the cat, animate sprites, and pop balloons!',
        tags: ['sensing', 'tutorial'],
        queries: [
            'how do I use video sensing',
            'camera in Scratch',
            'use my webcam in a project',
            'video sensing extension tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['video', 'sensing', 'camera', 'webcam', 'motion', 'pet', 'pop', 'tutorial']
        }
    },
    'tutorial-face-sensing': {
        id: 'tutorial-face-sensing',
        tutorialId: 'Face-Sensing',
        text: 'Try the "Face Sensing" tutorial to put accessories on your face and make games that use face tracking!',
        tags: ['sensing', 'tutorial'],
        queries: [
            'how do I use face sensing',
            'face tracking in Scratch',
            'put things on my face with camera',
            'face sensing extension tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['face', 'sensing', 'camera', 'tracking', 'hat', 'glasses', 'accessory', 'tutorial']
        }
    },
    'tutorial-talking-tales': {
        id: 'tutorial-talking-tales',
        tutorialId: 'talking',
        text: 'Try the "Talking Tales" tutorial to make characters speak, switch scenes, dance, and ask questions!',
        tags: ['stories', 'sound', 'tutorial'],
        queries: [
            'talking tales tutorial',
            'make characters speak and dance',
            'text to speech story with scenes',
            'ask and answer blocks tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['talking', 'tales', 'speak', 'dance', 'scene', 'ask', 'answer', 'text to speech', 'tutorial']
        }
    },
    'tutorial-add-sprite': {
        id: 'tutorial-add-sprite',
        tutorialId: 'add-sprite',
        text: 'Try the "Add a Sprite" tutorial to learn how to add new characters to your project!',
        tags: ['beginner', 'tutorial'],
        queries: [
            'how do I add a sprite',
            'add a new character',
            'where do I find more sprites',
            'how do I add a second sprite'
        ],
        followUps: [],
        relevance: {
            keywords: ['add', 'sprite', 'character', 'new', 'choose', 'pick', 'tutorial']
        }
    },
    'tutorial-add-backdrop': {
        id: 'tutorial-add-backdrop',
        tutorialId: 'add-a-backdrop',
        text: 'Try the "Add a Backdrop" tutorial to learn how to change the background of your project!',
        tags: ['beginner', 'tutorial'],
        queries: [
            'how do I add a backdrop',
            'change the background',
            'how do I set a background',
            'add a scene or background'
        ],
        followUps: [],
        relevance: {
            keywords: ['backdrop', 'background', 'scene', 'add', 'change', 'tutorial']
        }
    },
    'tutorial-arrow-keys': {
        id: 'tutorial-arrow-keys',
        tutorialId: 'move-around-with-arrow-keys',
        text: 'Try the "Use Arrow Keys" tutorial to learn how to move a sprite around with the keyboard!',
        tags: ['events', 'motion', 'tutorial'],
        queries: [
            'how do I move with arrow keys',
            'keyboard controls for my sprite',
            'move up down left right with keys',
            'how do I use arrow keys in Scratch'
        ],
        followUps: [],
        relevance: {
            keywords: ['arrow', 'keys', 'keyboard', 'move', 'up', 'down', 'left', 'right', 'controls', 'tutorial']
        }
    },
    'tutorial-change-size': {
        id: 'tutorial-change-size',
        tutorialId: 'change-size',
        text: 'Try the "Change Size" tutorial to learn how to make sprites grow and shrink!',
        tags: ['looks', 'tutorial'],
        queries: [
            'how do I change the size of a sprite',
            'make my sprite bigger or smaller',
            'grow and shrink a sprite',
            'change size tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['size', 'change', 'grow', 'shrink', 'bigger', 'smaller', 'scale', 'tutorial']
        }
    },
    'tutorial-glide-around': {
        id: 'tutorial-glide-around',
        tutorialId: 'glide-around',
        text: 'Try the "Glide Around" tutorial to make your sprite glide smoothly back and forth or to a point!',
        tags: ['motion', 'tutorial'],
        queries: [
            'how do I make a sprite glide',
            'smooth movement glide to a point',
            'glide back and forth',
            'how do I use the glide block'
        ],
        followUps: [],
        relevance: {
            keywords: ['glide', 'smooth', 'move', 'point', 'back', 'forth', 'slide', 'tutorial']
        }
    },
    'tutorial-make-it-spin': {
        id: 'tutorial-make-it-spin',
        tutorialId: 'spin-video',
        text: 'Try the "Make It Spin" tutorial to learn how to make a sprite turn and set its direction!',
        tags: ['motion', 'tutorial'],
        queries: [
            'how do I make a sprite spin',
            'turn and rotate a sprite',
            'spinning animation',
            'how do I set direction'
        ],
        followUps: [],
        relevance: {
            keywords: ['spin', 'turn', 'rotate', 'direction', 'twist', 'tutorial']
        }
    },
    'tutorial-record-a-sound': {
        id: 'tutorial-record-a-sound',
        tutorialId: 'record-a-sound',
        text: 'Try the "Record a Sound" tutorial to record your own sounds and use them in your project!',
        tags: ['sound', 'tutorial'],
        queries: [
            'how do I record a sound',
            'record my own sound or voice',
            'use the microphone to record',
            'add my own sound to Scratch'
        ],
        followUps: [],
        relevance: {
            keywords: ['record', 'sound', 'microphone', 'voice', 'audio', 'own', 'tutorial']
        }
    },
    'tutorial-hide-and-show': {
        id: 'tutorial-hide-and-show',
        tutorialId: 'hide-and-show',
        text: 'Try the "Hide and Show" tutorial to make sprites appear and disappear!',
        tags: ['looks', 'tutorial'],
        queries: [
            'how do I hide and show a sprite',
            'make a sprite appear and disappear',
            'hide a sprite then show it',
            'invisible sprite tutorial'
        ],
        followUps: [],
        relevance: {
            keywords: ['hide', 'show', 'appear', 'disappear', 'visible', 'invisible', 'tutorial']
        }
    },
    'tutorial-animate-a-sprite': {
        id: 'tutorial-animate-a-sprite',
        tutorialId: 'switch-costume',
        text: 'Try the "Animate a Sprite" tutorial to learn how to switch costumes and create animations!',
        tags: ['looks', 'animation', 'tutorial'],
        queries: [
            'how do I animate a sprite with costumes',
            'switch costumes to make animation',
            'costume animation tutorial',
            'how do I change what my sprite looks like'
        ],
        followUps: [],
        relevance: {
            keywords: ['animate', 'costume', 'switch', 'change', 'look', 'appearance', 'tutorial']
        }
    },

    // ──────────────────────────────────────────────
    // STARTER PROJECTS — each links to a remixable project on scratch.mit.edu
    // ──────────────────────────────────────────────

    // --- Animation ---
    'starter-dance-party': {
        id: 'starter-dance-party',
        followUpLabel: 'Dance Party',
        text: 'The Dance Party project shows how to make characters dance by switching costumes in a forever loop while the stage plays music!',
        tags: ['animation', 'looks', 'sound', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105113583_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105113583/',
        queries: [
            'I want to make a dance animation',
            'how do I make sprites dance',
            'how do I animate to music',
            'I want to make a dance party'
        ],
        followUps: ['starter-animate-crab', 'starter-walk-cycle', 'starter-food-truck'],
        relevance: {
            keywords: ['dance', 'animate', 'music', 'costume', 'party', 'loop', 'backdrop']
        }
    },
    'starter-animate-crab': {
        id: 'starter-animate-crab',
        followUpLabel: 'Animate the Crab',
        text: 'The Animate the Crab project shows how to bring a character to life with costume expressions, "if on edge bounce," and random positioning!',
        tags: ['animation', 'motion', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105114913_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105114913/',
        queries: [
            'how do I animate a character',
            'how do costume animations work',
            'how do I use if on edge bounce',
            'make a character come alive'
        ],
        followUps: ['starter-dance-party', 'starter-walk-cycle', 'starter-mouse-trail'],
        relevance: {
            keywords: ['animate', 'character', 'costume', 'bounce', 'edge', 'crab', 'expression']
        }
    },
    'starter-walk-cycle': {
        id: 'starter-walk-cycle',
        followUpLabel: 'Walk Cycle',
        text: 'The Walk Cycle project shows how to create a realistic walking animation by combining "move steps" with "next costume" in a repeat loop!',
        tags: ['animation', 'motion', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105114015_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105114015/',
        queries: [
            'how do I make a walk cycle',
            'make my sprite walk realistically',
            'walking animation with costumes',
            'how to animate walking'
        ],
        followUps: ['starter-dance-party', 'starter-animate-crab', 'starter-mouse-trail'],
        relevance: {
            keywords: ['walk', 'cycle', 'animate', 'costume', 'steps', 'repeat', 'loop']
        }
    },
    'starter-mouse-trail': {
        id: 'starter-mouse-trail',
        followUpLabel: 'Mouse Trail',
        text: 'The Mouse Trail project shows how to use cloning to create a trail of stars that follows your mouse, with each clone shrinking and disappearing!',
        tags: ['animation', 'clones', 'motion', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105118803_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105118803/',
        queries: [
            'how do I make a mouse trail',
            'how do clones work',
            'particle effect with cloning',
            'make things follow my mouse'
        ],
        followUps: ['starter-animate-crab', 'starter-walk-cycle', 'starter-food-truck'],
        relevance: {
            keywords: ['mouse', 'trail', 'clone', 'particle', 'follow', 'shrink', 'random']
        }
    },
    'starter-food-truck': {
        id: 'starter-food-truck',
        followUpLabel: 'Food Truck Animation',
        text: 'The Food Truck Animation project shows how to make a scrolling background, spinning tires, and flashing graphic effects with multiple sprites!',
        tags: ['animation', 'motion', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105114421_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105114421/',
        queries: [
            'how do I make a scrolling background',
            'animate a scene with multiple sprites',
            'how do I make a driving animation',
            'scrolling side-scroll effect'
        ],
        followUps: ['starter-dance-party', 'starter-animate-crab', 'starter-walk-cycle'],
        relevance: {
            keywords: ['scroll', 'background', 'scene', 'drive', 'truck', 'spin', 'graphic', 'effect']
        }
    },

    // --- Games ---
    'starter-make-it-fly': {
        id: 'starter-make-it-fly',
        followUpLabel: 'Make It Fly',
        text: 'The Make It Fly project shows how to use keyboard sensing and forever loops to make a flying cat dodge scrolling buildings!',
        tags: ['game', 'control', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1110545496_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1110545496/',
        queries: [
            'how do I make a flying game',
            'keyboard controls for a game',
            'side scrolling game',
            'flappy bird style game'
        ],
        followUps: ['starter-maze', 'starter-pong', 'starter-hide-seek'],
        relevance: {
            keywords: ['fly', 'game', 'keyboard', 'scroll', 'dodge', 'control', 'arrow']
        }
    },
    'starter-maze': {
        id: 'starter-maze',
        followUpLabel: 'Maze Starter',
        text: 'The Maze Starter project shows how to navigate a ball through a maze using arrow keys and color-touching detection for wall collisions!',
        tags: ['game', 'sensing', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/10128431_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/10128431/',
        queries: [
            'how do I make a maze game',
            'color touching collision detection',
            'arrow key movement game',
            'navigate through walls'
        ],
        followUps: ['starter-make-it-fly', 'starter-pong', 'starter-hide-seek'],
        relevance: {
            keywords: ['maze', 'wall', 'collision', 'color', 'touching', 'arrow', 'navigate']
        }
    },
    'starter-dress-up': {
        id: 'starter-dress-up',
        followUpLabel: 'Dress Up Tera',
        text: 'The Dress Up Tera project shows how to make sprites draggable and use touching detection to create an interactive dress-up game!',
        tags: ['game', 'sensing', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105678528_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105678528/',
        queries: [
            'how do I make a dress up game',
            'how do I make sprites draggable',
            'touching detection game',
            'character customization game'
        ],
        followUps: ['starter-make-it-fly', 'starter-maze', 'starter-hide-seek'],
        relevance: {
            keywords: ['dress', 'drag', 'draggable', 'costume', 'touching', 'customize', 'layer']
        }
    },
    'starter-pong': {
        id: 'starter-pong',
        followUpLabel: 'Pong Starter',
        text: 'The Pong Starter project shows how to make a simple game including mouse movement, ball bouncing, collisions, and sound effects!',
        tags: ['game', 'motion', 'sensing', 'sound', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/10128515_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/10128515/',
        queries: [
            'how do I make pong',
            'bouncing ball game',
            'paddle game with mouse',
            'how do I make a ball bounce'
        ],
        followUps: ['starter-make-it-fly', 'starter-maze', 'starter-hide-seek'],
        relevance: {
            keywords: ['pong', 'paddle', 'bounce', 'ball', 'mouse', 'score', 'random', 'angle']
        }
    },
    'starter-hide-seek': {
        id: 'starter-hide-seek',
        followUpLabel: 'Hide and Seek',
        text: 'The Hide and Seek project shows how to make a clicking game with a score variable, random positioning, and show/hide!',
        tags: ['game', 'variables', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/10128368_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/10128368/',
        queries: [
            'how do I make a clicking game',
            'hide and seek game',
            'score variable game',
            'random position game'
        ],
        followUps: ['starter-make-it-fly', 'starter-maze', 'starter-pong'],
        relevance: {
            keywords: ['hide', 'seek', 'click', 'score', 'variable', 'random', 'show', 'disappear']
        }
    },

    // --- Interactive Art ---
    'starter-stamp-studio': {
        id: 'starter-stamp-studio',
        followUpLabel: 'Stamp Studio',
        text: 'The Stamp Studio project shows how to use the pen stamp block with if-then conditions to draw colorful patterns that follow your mouse!',
        tags: ['art', 'pen', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1111541829_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1111541829/',
        queries: [
            'how do I make a stamp tool',
            'drawing program in Scratch',
            'pen stamp art',
            'create a painting app'
        ],
        followUps: ['starter-parallax', 'starter-soundflower', 'starter-spin-art'],
        relevance: {
            keywords: ['stamp', 'draw', 'art', 'mouse', 'pen', 'pattern', 'tool']
        }
    },
    'starter-parallax': {
        id: 'starter-parallax',
        followUpLabel: 'Interactive Parallax',
        text: 'The Interactive Parallax project shows how to use math operators and mouse sensing to move layers at different speeds for a depth effect!',
        tags: ['art', 'operators', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105131011_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105131011/',
        queries: [
            'how do I make a parallax effect',
            'moving background layers',
            'depth illusion with layers',
            'interactive background art'
        ],
        followUps: ['starter-stamp-studio', 'starter-art-alive', 'starter-spin-art'],
        relevance: {
            keywords: ['parallax', 'layer', 'depth', 'mouse', 'background', 'operator', 'divide']
        }
    },
    'starter-soundflower': {
        id: 'starter-soundflower',
        followUpLabel: 'Soundflower',
        text: 'The Soundflower project shows how to use the loudness sensor and multiply blocks to make a flower that responds to your microphone!',
        tags: ['art', 'sensing', 'operators', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1111537402_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1111537402/',
        queries: [
            'how do I make art with sound',
            'microphone art project',
            'sound reactive animation',
            'generative art with loudness'
        ],
        followUps: ['starter-stamp-studio', 'starter-art-alive', 'starter-spin-art'],
        relevance: {
            keywords: ['sound', 'microphone', 'loudness', 'flower', 'generative', 'art', 'react']
        }
    },
    'starter-art-alive': {
        id: 'starter-art-alive',
        followUpLabel: 'Make Art Come Alive',
        text: 'The Make Art Come Alive project shows how to use click events, broadcasts, and glide blocks to animate parts of a painting!',
        tags: ['art', 'events', 'motion', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106198418_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106198418/',
        queries: [
            'how do I make animated art',
            'broadcast messages for animation',
            'interactive artwork',
            'make a painting come alive'
        ],
        followUps: ['starter-stamp-studio', 'starter-parallax', 'starter-spin-art'],
        relevance: {
            keywords: ['art', 'alive', 'broadcast', 'animate', 'painting', 'click', 'glide']
        }
    },
    'starter-spin-art': {
        id: 'starter-spin-art',
        followUpLabel: 'Spin Art',
        text: 'The Spin Art project shows how to use slider variables, the stamp block, and move-and-turn to create mesmerizing spiral patterns!',
        tags: ['art', 'pen', 'variables', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105521187_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105521187/',
        queries: [
            'how do I make spin art',
            'spiral drawing with pen',
            'slider variables for art',
            'spirograph pattern'
        ],
        followUps: ['starter-stamp-studio', 'starter-parallax', 'starter-soundflower'],
        relevance: {
            keywords: ['spin', 'spiral', 'rotate', 'pen', 'stamp', 'pattern', 'slider', 'variable']
        }
    },

    // --- Music ---
    'starter-dj': {
        id: 'starter-dj',
        followUpLabel: 'DJ Scratch Cat',
        text: 'The DJ Scratch Cat project shows how to use key press events and sound blocks to make a DJ mixing board with a looping beat!',
        tags: ['music', 'sound', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/11640429_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/11640429/',
        queries: [
            'how do I make a DJ app',
            'music mixing with keys',
            'sound buttons game',
            'beat maker project'
        ],
        followUps: ['starter-piano', 'starter-fur-elise', 'starter-drum-sequencer'],
        relevance: {
            keywords: ['DJ', 'mix', 'beat', 'sound', 'key', 'music', 'loop']
        }
    },
    'starter-piano': {
        id: 'starter-piano',
        followUpLabel: 'Piano',
        text: 'The Piano project shows how to build a playable instrument with clickable key sprites using the Music extension\'s play-note block!',
        tags: ['music', 'extensions', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106245381_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106245381/',
        queries: [
            'how do I make a piano',
            'play notes in Scratch',
            'music extension instrument',
            'clickable piano keys'
        ],
        followUps: ['starter-dj', 'starter-fur-elise', 'starter-drum-sequencer'],
        relevance: {
            keywords: ['piano', 'note', 'key', 'music', 'instrument', 'play', 'extension']
        }
    },
    'starter-fish-pitch': {
        id: 'starter-fish-pitch',
        followUpLabel: 'Catch the Fish',
        text: 'The Catch the Fish project shows how to use cloning, a score variable, and the pitch effect to make music play higher as you score!',
        tags: ['music', 'clones', 'variables', 'sound', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106268602_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106268602/',
        queries: [
            'sound pitch effect game',
            'cloning game with sound',
            'how do I change pitch',
            'music and game combined'
        ],
        followUps: ['starter-dj', 'starter-piano', 'starter-drum-sequencer'],
        relevance: {
            keywords: ['pitch', 'catch', 'fish', 'sound', 'clone', 'score', 'variable', 'game']
        }
    },
    'starter-fur-elise': {
        id: 'starter-fur-elise',
        followUpLabel: 'Fur Elise',
        text: 'The Fur Elise project shows how to use custom My Blocks to organize a song into reusable sections with the Music extension!',
        tags: ['music', 'extensions', 'myblocks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106259376_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106259376/',
        queries: [
            'how do I compose music in Scratch',
            'custom my blocks for music',
            'music extension song',
            'write a song with play note'
        ],
        followUps: ['starter-dj', 'starter-piano', 'starter-drum-sequencer'],
        relevance: {
            keywords: ['compose', 'melody', 'note', 'music', 'song', 'my blocks', 'custom', 'tempo']
        }
    },
    'starter-drum-sequencer': {
        id: 'starter-drum-sequencer',
        followUpLabel: 'Drum Sequencer',
        text: 'The Drum Sequencer project shows how to use cloning for a button grid and color-sensing on a moving play head to make a drum machine!',
        tags: ['music', 'clones', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1111562971_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1111562971/',
        queries: [
            'how do I make a drum machine',
            'beat sequencer project',
            'drum patterns with clones',
            'rhythm loop maker'
        ],
        followUps: ['starter-dj', 'starter-piano', 'starter-fish-pitch'],
        relevance: {
            keywords: ['drum', 'sequencer', 'rhythm', 'loop', 'clone', 'grid', 'beat', 'pattern']
        }
    },

    // --- Stories ---
    'starter-story': {
        id: 'starter-story',
        followUpLabel: 'Story Starter',
        text: 'The Story Starter project shows how to tell a story with multiple characters using broadcasts to coordinate dialogue and sound!',
        tags: ['story', 'events', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1110565816_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1110565816/',
        queries: [
            'how do I make a story',
            'character dialogue with broadcasts',
            'tell a story in Scratch',
            'make characters talk to each other'
        ],
        followUps: ['starter-fill-blanks', 'starter-stop-motion', 'starter-adventure'],
        relevance: {
            keywords: ['story', 'dialogue', 'broadcast', 'character', 'talk', 'scene', 'narrative']
        }
    },
    'starter-random-facts': {
        id: 'starter-random-facts',
        followUpLabel: 'Random Facts',
        text: 'The 5 Random Facts About Me project shows how to create a slideshow presentation using backdrops and key press events!',
        tags: ['story', 'events', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/10014866_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/10014866/',
        queries: [
            'how do I make a presentation',
            'slideshow with backdrops',
            'about me project',
            'flip through pages'
        ],
        followUps: ['starter-story', 'starter-fill-blanks', 'starter-stop-motion'],
        relevance: {
            keywords: ['slideshow', 'presentation', 'backdrop', 'about', 'facts', 'page', 'key']
        }
    },
    'starter-fill-blanks': {
        id: 'starter-fill-blanks',
        followUpLabel: 'Fill in the Blanks',
        text: 'The Fill in the Blanks project shows how to make a mad-libs story using ask blocks, variables, and the join operator!',
        tags: ['story', 'sensing', 'variables', 'operators', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1110571119_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1110571119/',
        queries: [
            'how do I make mad libs',
            'ask block for user input',
            'join operator for sentences',
            'word game with variables'
        ],
        followUps: ['starter-story', 'starter-random-facts', 'starter-adventure'],
        relevance: {
            keywords: ['mad libs', 'ask', 'input', 'join', 'variable', 'blanks', 'word', 'sentence']
        }
    },
    'starter-stop-motion': {
        id: 'starter-stop-motion',
        followUpLabel: 'Stop Motion',
        text: 'The Stop Motion Animation project shows how to create a flipbook-style animation by switching costumes in a forever loop!',
        tags: ['story', 'animation', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105521591_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105521591/',
        queries: [
            'how do I make stop motion',
            'frame by frame animation',
            'make a movie in Scratch',
            'flipbook animation'
        ],
        followUps: ['starter-story', 'starter-random-facts', 'starter-adventure'],
        relevance: {
            keywords: ['stop', 'motion', 'frame', 'movie', 'costume', 'animate', 'flipbook']
        }
    },
    'starter-adventure': {
        id: 'starter-adventure',
        followUpLabel: 'Adventure Game',
        text: 'The Adventure with Scratch Cat project shows how to build an interactive adventure with collision detection and broadcast-driven scene changes!',
        tags: ['story', 'game', 'sensing', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1107181129_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1107181129/',
        queries: [
            'how do I make a choose your own adventure',
            'interactive story game',
            'collision detection adventure',
            'branching story with broadcasts'
        ],
        followUps: ['starter-story', 'starter-fill-blanks', 'starter-stop-motion'],
        relevance: {
            keywords: ['adventure', 'choice', 'broadcast', 'collision', 'mouse', 'hidden', 'scene']
        }
    },

    // --- Math & Science ---
    'starter-gravity': {
        id: 'starter-gravity',
        followUpLabel: 'Gravity Example',
        text: 'The Gravity Example project shows how to simulate gravity with velocity variables and conditionals for ground collision!',
        tags: ['math', 'variables', 'control', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1111567332_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1111567332/',
        queries: [
            'how do I simulate gravity',
            'falling with acceleration',
            'physics in Scratch',
            'velocity variable for gravity'
        ],
        followUps: ['starter-sound-graph', 'starter-math-game', 'starter-coordinates'],
        relevance: {
            keywords: ['gravity', 'physics', 'fall', 'acceleration', 'velocity', 'variable', 'collision']
        }
    },
    'starter-sound-graph': {
        id: 'starter-sound-graph',
        followUpLabel: 'Sound Graph',
        text: 'The Sound Graph project shows how to visualize microphone input as a graph using pen blocks, loudness sensing, and math operators!',
        tags: ['math', 'pen', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1105532968_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1105532968/',
        queries: [
            'how do I graph sound',
            'microphone visualizer',
            'draw a graph with pen',
            'loudness graph project'
        ],
        followUps: ['starter-gravity', 'starter-math-game', 'starter-circuit'],
        relevance: {
            keywords: ['graph', 'sound', 'microphone', 'loudness', 'pen', 'visualize', 'draw', 'volume']
        }
    },
    'starter-math-game': {
        id: 'starter-math-game',
        followUpLabel: 'Math Game',
        text: 'The Math Game project shows how to make a quiz with random number variables, ask blocks for input, and if-else to check answers!',
        tags: ['math', 'variables', 'sensing', 'operators', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106220358_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106220358/',
        queries: [
            'how do I make a math quiz',
            'random math problems game',
            'quiz game with ask and answer',
            'educational math game'
        ],
        followUps: ['starter-gravity', 'starter-circuit', 'starter-coordinates'],
        relevance: {
            keywords: ['math', 'quiz', 'random', 'answer', 'ask', 'education', 'if-else', 'check']
        }
    },
    'starter-circuit': {
        id: 'starter-circuit',
        followUpLabel: 'Circuit Simulation',
        text: 'The Simple Circuit Simulation project shows how to use draggable sprites, color-touching detection, and boolean logic to simulate a circuit!',
        tags: ['math', 'sensing', 'variables', 'operators', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106279050_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106279050/',
        queries: [
            'circuit simulation project',
            'electricity in Scratch',
            'boolean logic project',
            'draggable science simulation'
        ],
        followUps: ['starter-gravity', 'starter-sound-graph', 'starter-coordinates'],
        relevance: {
            keywords: ['circuit', 'electricity', 'boolean', 'switch', 'simulation', 'science', 'drag']
        }
    },
    'starter-coordinates': {
        id: 'starter-coordinates',
        followUpLabel: 'X and Y Coordinates',
        text: 'The X and Y Coordinates project shows how the Scratch coordinate system works by letting you drag a sprite and see its position update!',
        tags: ['math', 'motion', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106739913_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106739913/',
        queries: [
            'how do coordinates work in Scratch',
            'x and y position explained',
            'coordinate system project',
            'learn about stage coordinates'
        ],
        followUps: ['starter-gravity', 'starter-math-game', 'starter-circuit'],
        relevance: {
            keywords: ['coordinates', 'x', 'y', 'position', 'stage', 'drag', 'ask']
        }
    },

    // --- Extensions ---
    'starter-text-speech': {
        id: 'starter-text-speech',
        followUpLabel: 'Text to Speech',
        text: 'The Text to Speech project shows how to use the Text-to-Speech extension and broadcasts to make characters have a spoken conversation!',
        tags: ['extensions', 'sound', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106234816_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106234816/',
        queries: [
            'how do I use text to speech',
            'make sprites talk out loud',
            'speech extension project',
            'talking characters'
        ],
        followUps: ['starter-pen-flower', 'starter-translate', 'starter-face-filter'],
        relevance: {
            keywords: ['speech', 'talk', 'voice', 'extension', 'text', 'speak', 'broadcast']
        }
    },
    'starter-pen-flower': {
        id: 'starter-pen-flower',
        followUpLabel: 'Pen Flower',
        text: 'The Pen Flower project shows how to use nested repeat loops and pen blocks to draw a colorful pattern of rotating squares!',
        tags: ['extensions', 'pen', 'control', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106765499_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106765499/',
        queries: [
            'how do I draw with pen blocks',
            'pen flower pattern',
            'geometric pattern with loops',
            'nested loops pen art'
        ],
        followUps: ['starter-text-speech', 'starter-musical-droplets', 'starter-translate'],
        relevance: {
            keywords: ['pen', 'flower', 'draw', 'pattern', 'loop', 'nested', 'rotate', 'geometric']
        }
    },
    'starter-musical-droplets': {
        id: 'starter-musical-droplets',
        followUpLabel: 'Musical Droplets',
        text: 'The Musical Droplets project shows how to use clones, the Music extension, and math to turn mouse position into musical notes!',
        tags: ['extensions', 'music', 'clones', 'operators', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1111576868_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1111576868/',
        queries: [
            'music extension with clones',
            'mouse position to music notes',
            'musical animation project',
            'interactive music art'
        ],
        followUps: ['starter-text-speech', 'starter-pen-flower', 'starter-face-filter'],
        relevance: {
            keywords: ['music', 'droplet', 'clone', 'note', 'mouse', 'extension', 'math']
        }
    },
    'starter-translate': {
        id: 'starter-translate',
        followUpLabel: 'Translate This!',
        text: 'The Translate This! project shows how to use the Translate extension to make characters speak in different languages!',
        tags: ['extensions', 'looks', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1110579465_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1110579465/',
        queries: [
            'how do I use the translate extension',
            'change language in Scratch',
            'translate words between languages',
            'multilingual project'
        ],
        followUps: ['starter-text-speech', 'starter-pen-flower', 'starter-face-filter'],
        relevance: {
            keywords: ['translate', 'language', 'extension', 'French', 'Italian', 'multilingual']
        }
    },
    'starter-face-filter': {
        id: 'starter-face-filter',
        followUpLabel: 'Face Filter',
        text: 'The Face Filter project shows how to use the Face Sensing extension to make hats and glasses follow your face in real time!',
        tags: ['extensions', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1208621527_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1208621527/',
        queries: [
            'how do I use face sensing',
            'face filter with camera',
            'augmented reality in Scratch',
            'face tracking project'
        ],
        followUps: ['starter-text-speech', 'starter-musical-droplets', 'starter-translate'],
        relevance: {
            keywords: ['face', 'filter', 'camera', 'sensing', 'tilt', 'track', 'augmented']
        }
    },

    // --- Community Kindness ---
    'starter-greeting-card': {
        id: 'starter-greeting-card',
        followUpLabel: 'Greeting Card',
        text: 'The Greeting Card project shows how to make an interactive card with backdrop switches, glide animations, and sound effects!',
        tags: ['kindness', 'events', 'looks', 'sound', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/11806234_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/11806234/',
        queries: [
            'how do I make a greeting card',
            'birthday card project',
            'interactive card with sound',
            'animated greeting'
        ],
        followUps: ['starter-quiz', 'starter-trophy', 'starter-kindness'],
        relevance: {
            keywords: ['card', 'greeting', 'birthday', 'message', 'animation', 'sound', 'glide']
        }
    },
    'starter-quiz': {
        id: 'starter-quiz',
        followUpLabel: 'Community Quiz',
        text: 'The Community Quiz project shows how to build a quiz with custom blocks, ask-and-wait input, if-else logic, and Text-to-Speech!',
        tags: ['kindness', 'myblocks', 'sensing', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106806960_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106806960/',
        queries: [
            'how do I make a quiz',
            'trivia game with ask blocks',
            'custom blocks for a quiz',
            'check answers with if-else'
        ],
        followUps: ['starter-greeting-card', 'starter-trophy', 'starter-paper-plane'],
        relevance: {
            keywords: ['quiz', 'trivia', 'ask', 'answer', 'custom', 'my blocks', 'if-else', 'check']
        }
    },
    'starter-trophy': {
        id: 'starter-trophy',
        followUpLabel: 'Small Wins Trophy',
        text: 'The Small Wins Trophy project shows how to click on sprite parts to cycle through costumes and design a custom award!',
        tags: ['kindness', 'looks', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1106823880_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1106823880/',
        queries: [
            'trophy customization project',
            'click to change costumes',
            'celebration animation',
            'design an award'
        ],
        followUps: ['starter-greeting-card', 'starter-quiz', 'starter-kindness'],
        relevance: {
            keywords: ['trophy', 'celebration', 'costume', 'click', 'customize', 'award', 'win']
        }
    },
    'starter-kindness': {
        id: 'starter-kindness',
        followUpLabel: 'Acts of Kindness',
        text: 'The Random Acts of Kindness project shows how to pick a random item from a list using broadcasts and the pick-random operator!',
        tags: ['kindness', 'data', 'operators', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1110573738_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1110573738/',
        queries: [
            'how do I pick random from a list',
            'kindness generator project',
            'random suggestion picker',
            'list and pick random'
        ],
        followUps: ['starter-greeting-card', 'starter-quiz', 'starter-paper-plane'],
        relevance: {
            keywords: ['kindness', 'random', 'list', 'pick', 'suggestion', 'broadcast']
        }
    },
    'starter-paper-plane': {
        id: 'starter-paper-plane',
        followUpLabel: 'Paper Plane Tutorial',
        text: 'The Paper Plane Tutorial project shows how to make a step-by-step guide with broadcasts, repeat-until loops, and costume switching!',
        tags: ['kindness', 'control', 'events', 'starter-project'],
        thumbnail: 'https://uploads.scratch.mit.edu/get_image/project/1111552152_480x360.png',
        projectUrl: 'https://scratch.mit.edu/projects/1111552152/',
        queries: [
            'how do I make a tutorial in Scratch',
            'step by step instruction project',
            'repeat until loop project',
            'broadcast for steps'
        ],
        followUps: ['starter-greeting-card', 'starter-trophy', 'starter-kindness'],
        relevance: {
            keywords: ['tutorial', 'step', 'teach', 'instruction', 'broadcast', 'repeat', 'until']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 8: Kid Questions — Basketball / Sports
    // ──────────────────────────────────────────────

    'follow-another-sprite': {
        id: 'follow-another-sprite',
        followUpLabel: 'Follow a sprite',
        text: 'Use "go to [sprite]" inside a "forever" loop to make one sprite follow another — like a basketball following the cat!',
        tags: ['motion', 'game', 'sports'],
        queries: [
            'how do I make the cat dribble a basketball',
            'show me the code to make the basketball follow the cat',
            'how do I make one sprite follow another',
            'how do I make the ball follow the player',
            'how do I make a sprite chase another sprite'
        ],
        followUps: ['follow-with-offset', 'bounce-up-down', 'forever-loop'],
        blockExample: 'followMouse',
        pointers: [
            {
                label: 'Drag "go to" into your code',
                blockOpcode: 'motion_goto',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['follow', 'chase', 'dribble', 'basketball', 'ball', 'go to', 'sprite']
        }
    },
    'follow-with-offset': {
        id: 'follow-with-offset',
        followUpLabel: 'Follow with offset',
        text: 'To make a sprite follow below another, use "go to [sprite]" then "change y by -30" — the negative number puts it lower!',
        tags: ['motion', 'position'],
        queries: [
            'what if I want the basketball to be a little below the cat',
            'how do I make a sprite follow but a little lower',
            'how do I offset a following sprite',
            'make the ball stay below the player'
        ],
        followUps: ['follow-another-sprite', 'change-xy-position'],
        pointers: [
            {
                label: 'Drag "change y by" into your code',
                blockOpcode: 'motion_changeyby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['below', 'offset', 'lower', 'above', 'next to', 'beside', 'follow']
        }
    },
    'bounce-up-down': {
        id: 'bounce-up-down',
        followUpLabel: 'Bounce up & down',
        text: 'Make a sprite bounce! Use "repeat 10: change y by 5" then "repeat 10: change y by -5" inside a forever loop.',
        tags: ['motion', 'animation', 'sports'],
        queries: [
            'how do I make the basketball bounce up and down',
            'how do I make a sprite bounce up and down',
            'how do I make a bouncing animation',
            'I want my sprite to go up and down'
        ],
        followUps: ['bounce-speed', 'bounce-height', 'forever-loop'],
        blockExample: 'bounceUpDown',
        pointers: [
            {
                label: 'Drag "change y by" into your code',
                blockOpcode: 'motion_changeyby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['bounce', 'up and down', 'basketball', 'ball', 'hop', 'spring']
        }
    },
    'bounce-speed': {
        id: 'bounce-speed',
        followUpLabel: 'Bounce speed',
        text: 'To change bounce speed, adjust the "repeat" number — fewer repeats = faster bounce, more repeats = slower bounce!',
        tags: ['motion', 'animation'],
        queries: [
            'how can I make the bounce faster or slower',
            'how do I change the bounce speed',
            'my bounce is too slow',
            'I want the ball to bounce faster'
        ],
        followUps: ['bounce-up-down', 'bounce-height', 'too-fast'],
        relevance: {
            keywords: ['faster', 'slower', 'speed', 'bounce', 'quick', 'tempo']
        }
    },
    'bounce-height': {
        id: 'bounce-height',
        followUpLabel: 'Bounce height',
        text: 'To change how high the bounce goes, change the number in "change y by" — bigger number = higher bounce!',
        tags: ['motion', 'animation'],
        queries: [
            'how do I change the height of the bounce',
            'I want a higher bounce',
            'how do I make the ball bounce lower',
            'make the bounce taller or shorter'
        ],
        followUps: ['bounce-up-down', 'bounce-speed'],
        relevance: {
            keywords: ['height', 'high', 'low', 'bounce', 'tall', 'short', 'bigger']
        }
    },
    'shoot-at-target': {
        id: 'shoot-at-target',
        followUpLabel: 'Shoot at a target',
        text: 'Use "glide 0.5 secs to x: y:" to make a sprite fly toward a target — set x and y to where the hoop or goal is!',
        tags: ['motion', 'game', 'sports'],
        queries: [
            'how do I make the cat shoot the ball into the hoop',
            'how do I make a sprite fly toward a target',
            'how do I throw a ball at something',
            'how do I make a shooting animation'
        ],
        followUps: ['glide-to-position', 'detect-collision', 'follow-another-sprite'],
        blockExample: 'glideTo',
        pointers: [
            {
                label: 'Drag "glide" into your code',
                blockOpcode: 'motion_glidesecstoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['shoot', 'throw', 'hoop', 'basket', 'goal', 'target', 'aim', 'launch']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 9: Kid Questions — Sprite Animation
    // ──────────────────────────────────────────────

    'sprite-hop-jump': {
        id: 'sprite-hop-jump',
        followUpLabel: 'Make it hop',
        text: 'Press space to hop! Use "change y by 50", "wait 0.3 seconds", then "change y by -50" — that\'s up, pause, and back down!',
        tags: ['motion', 'animation', 'beginner'],
        queries: [
            'how to make the chick hop',
            'how do I make a sprite hop',
            'how do I make my sprite jump',
            'I want my character to hop up and down',
            'how to make the movement more smooth and make my character jump'
        ],
        followUps: ['bounce-up-down', 'move-with-keys', 'sprite-walk-animate'],
        blockExample: 'hopJump',
        pointers: [
            {
                label: 'Drag "change y by" into your code',
                blockOpcode: 'motion_changeyby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['hop', 'jump', 'leap', 'spring', 'chick', 'bunny', 'frog']
        }
    },
    'sprite-walk-animate': {
        id: 'sprite-walk-animate',
        followUpLabel: 'Make it walk',
        text: 'To make a sprite walk, use "next costume" with "move 10 steps" inside a forever loop — the costume changes make it look like walking!',
        tags: ['motion', 'looks', 'animation', 'beginner'],
        queries: [
            'how to make chick walk',
            'how do I make a sprite walk',
            'how do I make my character walk across the screen',
            'show me the code for the cat\'s movement',
            'I want my sprite to look like it\'s walking'
        ],
        followUps: ['animate-costume', 'move-sprite', 'sprite-hop-jump'],
        blockExample: 'foreverNextCostume',
        pointers: [
            {
                label: 'Drag "next costume" into your code',
                blockOpcode: 'looks_nextcostume',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['walk', 'chick', 'step', 'animate', 'movement', 'cat', 'character']
        }
    },
    'sprite-backflip': {
        id: 'sprite-backflip',
        followUpLabel: 'Do a backflip',
        text: 'Make a sprite do a backflip! Use "change y by 50", then "repeat 10: turn 36 degrees", then "change y by -50" to jump, spin, and land!',
        tags: ['motion', 'animation', 'fun'],
        queries: [
            'how do I make my sprite do a backflip',
            'how to make a sprite flip in the air',
            'I want my character to do a trick',
            'how do I make a spinning jump'
        ],
        followUps: ['sprite-hop-jump', 'spinning', 'repeat-loop'],
        blockExample: 'backflipSpin',
        pointers: [
            {
                label: 'Drag "turn" into your code',
                blockOpcode: 'motion_turnright',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['backflip', 'flip', 'trick', 'spin', 'somersault', 'acrobat']
        }
    },
    'sprite-lay-down': {
        id: 'sprite-lay-down',
        followUpLabel: 'Lay down',
        text: 'Use "point in direction 0" to make a sprite lay down (facing up), or "point in direction 180" to face down — set rotation style to "all around" first!',
        tags: ['motion', 'looks', 'animation'],
        queries: [
            'how can I make singer1 lay down',
            'how do I make a sprite lay down',
            'how to make a sprite lie flat',
            'how do I rotate my sprite sideways'
        ],
        followUps: ['rotation-style-vs-turn', 'face-without-flip'],
        pointers: [
            {
                label: 'Drag "point in direction" into your code',
                blockOpcode: 'motion_pointindirection',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['lay down', 'lie', 'flat', 'horizontal', 'sideways', 'rotate', 'sleep']
        }
    },
    'crowd-surf-effect': {
        id: 'crowd-surf-effect',
        followUpLabel: 'Crowd surf',
        text: 'Make a sprite crowd surf! Use "glide 2 secs to x:240 y:50" to slide across, and add "change y by 5" then "change y by -5" in a loop for a bobbing effect!',
        tags: ['motion', 'animation', 'fun'],
        queries: [
            'how to make singer1 crowd surf',
            'how do I make a sprite slide across the screen',
            'how do I make a floating movement'
        ],
        followUps: ['glide-to-position', 'bounce-up-down', 'make-dance-party'],
        blockExample: 'glideTo',
        pointers: [
            {
                label: 'Drag "glide" into your code',
                blockOpcode: 'motion_glidesecstoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['crowd surf', 'surf', 'float', 'slide', 'concert', 'singer']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 10: Kid Questions — Sprite Management
    // ──────────────────────────────────────────────

    'duplicate-code-to-sprite': {
        id: 'duplicate-code-to-sprite',
        followUpLabel: 'Copy code to sprite',
        text: 'Yes! Drag your code stack from the workspace onto another sprite\'s thumbnail in the sprite pane — it copies the whole stack!',
        tags: ['sprites', 'meta', 'beginner'],
        queries: [
            'can you duplicate the code stack to other sprites',
            'how do I copy code to another sprite',
            'how do I share blocks between sprites',
            'I want the same code on a different sprite'
        ],
        followUps: ['sprite-has-own-code', 'right-click-duplicate', 'add-sprite'],
        pointers: [
            {
                label: 'Drag code onto a sprite thumbnail to copy it',
                target: '[class*="sprite-selector_sprite-selector"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['duplicate', 'copy', 'code', 'stack', 'other sprite', 'share', 'transfer']
        }
    },
    'explore-sprite-abilities': {
        id: 'explore-sprite-abilities',
        followUpLabel: 'What can it do?',
        text: 'Every sprite can move, change costumes, play sounds, and run code! Click the Costumes tab to see its different looks, and the Sounds tab for its sounds.',
        tags: ['sprites', 'beginner', 'meta'],
        queries: [
            'what can the egg do',
            'what can this sprite do',
            'what are all the things my sprite can do',
            'what is this sprite for'
        ],
        followUps: ['access-other-costumes', 'add-sound', 'move-sprite'],
        pointers: [
            {
                label: 'Click Costumes to see its looks',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['what can', 'do', 'abilities', 'features', 'egg', 'sprite']
        }
    },
    'access-other-costumes': {
        id: 'access-other-costumes',
        followUpLabel: 'See all costumes',
        text: 'Click the Costumes tab at the top to see all the costumes your sprite has — you can switch between them with "switch costume to" or "next costume"!',
        tags: ['costumes', 'beginner'],
        queries: [
            'how do I get to the other egg costumes',
            'where are the other costumes',
            'how do I see all my sprite\'s costumes',
            'how do I find the costume list'
        ],
        followUps: ['change-costume', 'animate-costume', 'add-costume'],
        pointers: [
            {
                label: 'Click the Costumes tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['costume', 'other', 'list', 'tab', 'find', 'see', 'switch']
        }
    },
    'find-sprite-in-library': {
        id: 'find-sprite-in-library',
        followUpLabel: 'Find a sprite',
        text: 'Click the cat button below the stage to open the sprite library, then use the search bar to find any sprite by name!',
        tags: ['sprites', 'beginner'],
        queries: [
            'where can I find Dan B',
            'how do I find a specific sprite',
            'how do I search for a sprite',
            'where is the sprite library'
        ],
        followUps: ['add-sprite', 'add-many-same-sprite'],
        pointers: [
            {
                label: 'Add a new sprite here',
                target: '[class*="sprite-selector_sprite-selector"] [class*="add-button"]',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['find', 'search', 'library', 'Dan', 'sprite', 'where', 'look for']
        }
    },
    'add-many-same-sprite': {
        id: 'add-many-same-sprite',
        followUpLabel: 'Add more copies',
        text: 'To add more copies of a sprite, right-click the sprite in the sprite pane and choose "duplicate" — or add it again from the library! For lots of copies, try cloning.',
        tags: ['sprites', 'beginner'],
        queries: [
            'how do I make more than three dans',
            'how do I add more of the same sprite',
            'I want multiple copies of a sprite',
            'can I duplicate a sprite'
        ],
        followUps: ['clone-sprite', 'find-sprite-in-library', 'add-sprite'],
        pointers: [
            {
                label: 'Right-click a sprite to duplicate',
                target: '[class*="sprite-selector_sprite-selector"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['more', 'copies', 'duplicate', 'multiple', 'same', 'another', 'three']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 11: Kid Questions — Movement Patterns
    // ──────────────────────────────────────────────

    'move-side-to-side': {
        id: 'move-side-to-side',
        followUpLabel: 'Move side to side',
        text: 'Use "move 5 steps" with "if on edge, bounce" inside a forever loop to make a sprite go back and forth automatically!',
        tags: ['motion', 'animation'],
        queries: [
            'how to make the egg move side to side',
            'how do I make a sprite go left and right',
            'I want my sprite to move back and forth',
            'how do I make something go side to side automatically'
        ],
        followUps: ['waddle-side-to-side', 'forever-loop', 'bouncing-around'],
        blockExample: 'moveSideToSide',
        pointers: [
            {
                label: 'Drag "if on edge, bounce" into your code',
                blockOpcode: 'motion_ifonedgebounce',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['side to side', 'left and right', 'back and forth', 'patrol', 'pace']
        }
    },
    'waddle-side-to-side': {
        id: 'waddle-side-to-side',
        followUpLabel: 'Waddle effect',
        text: 'Make a sprite waddle! Use "turn right 10" then "wait 0.1" then "turn left 10" then "wait 0.1" inside a forever loop.',
        tags: ['motion', 'animation', 'fun'],
        queries: [
            'how to make the egg waddle side to side',
            'how do I make a waddle animation',
            'how do I make my sprite wobble',
            'I want my sprite to rock back and forth'
        ],
        followUps: ['move-side-to-side', 'fix-upright-rotation', 'forever-loop'],
        blockExample: 'waddleTurn',
        pointers: [
            {
                label: 'Drag "turn" into your code',
                blockOpcode: 'motion_turnright',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['waddle', 'wobble', 'rock', 'sway', 'penguin', 'egg', 'tilt']
        }
    },
    'fix-upright-rotation': {
        id: 'fix-upright-rotation',
        followUpLabel: 'Stay upright',
        text: 'Use "point in direction 90" to make your sprite sit upright, or set rotation style to "don\'t rotate" so it always stays right-side up!',
        tags: ['motion', 'looks'],
        queries: [
            'how to make the egg sit upright',
            'how do I make my sprite stay right side up',
            'my sprite is tilted how do I fix it',
            'I want my sprite to face straight up'
        ],
        followUps: ['face-without-flip', 'rotation-style-vs-turn'],
        pointers: [
            {
                label: 'Check rotation style in sprite info',
                target: '[class*="sprite-info"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['upright', 'straight', 'fix', 'rotation', 'tilt', 'direction', 'reset']
        }
    },
    'face-without-flip': {
        id: 'face-without-flip',
        followUpLabel: 'Face left (no flip)',
        text: 'Set rotation style to "left-right" in the sprite info area — then your sprite will mirror horizontally without flipping upside down!',
        tags: ['motion', 'looks', 'beginner'],
        queries: [
            'how do I make the monkey face left without flipping upside down',
            'my sprite flips upside down when it turns',
            'how do I mirror my sprite left and right',
            'how do I stop my sprite from going upside down'
        ],
        followUps: ['rotation-style-vs-turn', 'fix-upright-rotation'],
        pointers: [
            {
                label: 'Set rotation style in sprite info',
                target: '[class*="sprite-info"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['face', 'left', 'flip', 'upside down', 'mirror', 'rotation style', 'left-right']
        }
    },
    'continuous-key-hold': {
        id: 'continuous-key-hold',
        followUpLabel: 'Hold key to move',
        text: 'Use "forever: if key pressed then change x by 5" instead of "when key pressed" — this way holding the key gives smooth, continuous movement!',
        tags: ['motion', 'events', 'control'],
        queries: [
            'how do I make it so that when I hold down the arrow keys it continuously moves in that direction',
            'holding the key should keep moving',
            'I want smooth continuous movement when holding a key',
            'how do I make my sprite move while holding a key'
        ],
        followUps: ['move-with-keys', 'forever-loop', 'wasd-controls'],
        blockExample: 'foreverIfKeySmooth',
        pointers: [
            {
                label: 'Drag "key pressed?" from Sensing',
                blockOpcode: 'sensing_keypressed',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['hold', 'continuous', 'smooth', 'key pressed', 'keep moving', 'arrow', 'direction']
        }
    },
    'wasd-controls': {
        id: 'wasd-controls',
        followUpLabel: 'WASD controls',
        text: 'For WASD movement, use "forever: if key w pressed, change y by 5 / if key a pressed, change x by -5" and so on for each letter!',
        tags: ['motion', 'events', 'control'],
        queries: [
            'how do I make my sprite move using wasd',
            'how do I use wasd keys for movement',
            'I want to use the letter keys to move',
            'wasd keyboard controls'
        ],
        followUps: ['continuous-key-hold', 'move-with-keys', 'change-xy-position'],
        blockExample: 'foreverIfKeySmooth',
        pointers: [
            {
                label: 'Drag "key pressed?" from Sensing',
                blockOpcode: 'sensing_keypressed',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['wasd', 'w a s d', 'letter keys', 'keyboard', 'controls']
        }
    },
    'sprite-return-to-position': {
        id: 'sprite-return-to-position',
        followUpLabel: 'Go back to start',
        text: 'Use "go to x: -200 y: 0" to send a sprite back to a specific position — great for resetting enemies or obstacles!',
        tags: ['motion', 'game'],
        queries: [
            'how do I get the crab to go back to the left',
            'how do I reset a sprite to its starting position',
            'how do I make a sprite go back to the start',
            'I want the enemy to come back after it goes off screen'
        ],
        followUps: ['reset-at-start', 'go-to-position'],
        blockExample: 'goToCenter',
        pointers: [
            {
                label: 'Drag "go to x: y:" into your code',
                blockOpcode: 'motion_gotoxy',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['go back', 'return', 'reset', 'start', 'left', 'beginning', 'reappear']
        }
    },
    'move-multiple-sprites': {
        id: 'move-multiple-sprites',
        followUpLabel: 'Move both sprites',
        text: 'Each sprite needs its own code! Click a sprite in the sprite pane, then add movement blocks to it — do this for each sprite you want to move.',
        tags: ['sprites', 'motion', 'beginner'],
        queries: [
            'how do I make both sprites move',
            'how do I control two sprites',
            'only one sprite is moving',
            'I want all my sprites to move'
        ],
        followUps: ['sprite-has-own-code', 'wrong-sprite-selected', 'move-with-keys'],
        pointers: [
            {
                label: 'Click a sprite to add code to it',
                target: '[class*="sprite-selector_sprite-selector"]',
                side: 'left'
            }
        ],
        relevance: {
            keywords: ['both', 'two', 'multiple', 'all', 'sprites', 'move', 'each']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 12: Kid Questions — Sound
    // ──────────────────────────────────────────────

    'find-specific-sound': {
        id: 'find-specific-sound',
        followUpLabel: 'Find a sound',
        text: 'Click the Sounds tab, then click the speaker button to open the sound library — use the search bar to look for sounds like "chirp", "bird", or any sound you want!',
        tags: ['sound', 'beginner'],
        queries: [
            'is there a cheeping sound',
            'how do I find a specific sound',
            'is there a bird sound',
            'where do I search for sounds',
            'I\'m looking for a particular sound effect'
        ],
        followUps: ['add-sound', 'record-sound', 'silly-sounds'],
        pointers: [
            {
                label: 'Click the Sounds tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(3)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['find', 'search', 'specific', 'cheep', 'chirp', 'bird', 'sound', 'particular']
        }
    },
    'insert-audio-file': {
        id: 'insert-audio-file',
        followUpLabel: 'Upload a sound',
        text: 'To add your own audio file, go to the Sounds tab, hover over the speaker button, and choose "Upload Sound" to pick a file from your computer!',
        tags: ['sound', 'beginner'],
        queries: [
            'how do I insert an audio',
            'how do I upload my own sound file',
            'can I add an mp3 to my project',
            'I want to use my own music file'
        ],
        followUps: ['add-sound', 'record-sound', 'play-vs-play-until-done'],
        pointers: [
            {
                label: 'Click the Sounds tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(3)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['insert', 'upload', 'audio', 'file', 'mp3', 'import', 'own sound']
        }
    },
    'debug-sound-on-collision': {
        id: 'debug-sound-on-collision',
        followUpLabel: 'Fix sound on touch',
        text: 'If your sound isn\'t playing when sprites touch, make sure the "if touching" and "play sound" are both inside a "forever" loop — and use "play sound until done" so it doesn\'t restart every frame!',
        tags: ['sound', 'debugging', 'sensing'],
        queries: [
            'look at my code, why is my sound not playing when it hits the volleyball sprite',
            'my sound doesn\'t play when sprites touch',
            'why isn\'t the sound working on collision',
            'sound not playing when touching another sprite'
        ],
        followUps: ['detect-collision', 'play-vs-play-until-done', 'if-not-forever'],
        pointers: [
            {
                label: 'Drag "play sound until done" into your code',
                blockOpcode: 'sound_playuntildone',
                category: 'sound',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['sound', 'not playing', 'touch', 'collision', 'hit', 'volleyball', 'play']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 13: Kid Questions — Game Mechanics
    // ──────────────────────────────────────────────

    'solid-wall-collision': {
        id: 'solid-wall-collision',
        followUpLabel: 'Solid walls',
        text: 'To stop a sprite from going through walls, use "if touching color [wall color] then move back" — put it in a forever loop so it\'s always checking!',
        tags: ['sensing', 'game', 'collision'],
        queries: [
            'how do I make my cat not able to go through the green pillars',
            'how do I make solid walls my sprite can\'t walk through',
            'my sprite goes through obstacles',
            'how do I stop a sprite from going through things'
        ],
        followUps: ['touching-color', 'detect-collision', 'obstacle-course-game'],
        blockExample: 'touchingColorGoto',
        pointers: [
            {
                label: 'Drag "touching color?" into your code',
                blockOpcode: 'sensing_touchingcolor',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['wall', 'solid', 'through', 'pillar', 'barrier', 'block', 'stop', 'can\'t pass']
        }
    },
    'obstacle-course-game': {
        id: 'obstacle-course-game',
        followUpLabel: 'Obstacle course',
        text: 'Make an obstacle course! Draw obstacles on the backdrop, then use "if touching color" to detect them. Add keyboard controls and a "go to start" reset!',
        tags: ['game', 'project-ideas'],
        queries: [
            'how do I make an obstacle course',
            'I want to make an obstacle game',
            'how do I make a game with obstacles to dodge',
            'how do I make a maze or obstacle course game'
        ],
        followUps: ['solid-wall-collision', 'color-touch-restart', 'move-with-keys', 'countdown-timer-variable'],
        blockExample: 'touchingColorGoto',
        pointers: [
            {
                label: 'Drag "touching color?" into your code',
                blockOpcode: 'sensing_touchingcolor',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['obstacle', 'course', 'dodge', 'avoid', 'maze', 'platformer']
        }
    },
    'score-on-event': {
        id: 'score-on-event',
        followUpLabel: 'Score points',
        text: 'Make a "score" variable, set it to 0 at the start, then use "if touching [sprite]" with "change score by 1" inside a forever loop to score when sprites meet!',
        tags: ['variables', 'game', 'sensing'],
        queries: [
            'how do I put a score for every time the sprite jumps over the crab',
            'how do I add points when something happens',
            'how do I score when sprites touch',
            'how do put the score up',
            'I want to keep score in my game'
        ],
        followUps: ['use-variables', 'detect-collision', 'change-variable'],
        pointers: [
            {
                label: 'Make a Variable here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['score', 'points', 'count', 'track', 'jump over', 'collect', 'earn']
        }
    },
    'countdown-timer-variable': {
        id: 'countdown-timer-variable',
        followUpLabel: 'Countdown timer',
        text: 'Make a "timer" variable, set it to 30, then use "repeat 30: wait 1 second, change timer by -1" — when it hits 0, stop the game!',
        tags: ['variables', 'game', 'control'],
        queries: [
            'how do I make a 30 second timer',
            'how do I make a countdown timer',
            'I want a timer that counts down in my game',
            'how do I set a time limit'
        ],
        followUps: ['use-variables', 'timer-block', 'make-game'],
        pointers: [
            {
                label: 'Make a Variable here',
                target: '.blocklyToolboxCategory#variables',
                preAction: 'switchToCodeTab',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['countdown', 'timer', 'seconds', 'time limit', '30', 'clock', 'stopwatch']
        }
    },
    'color-touch-restart': {
        id: 'color-touch-restart',
        followUpLabel: 'Color = restart',
        text: 'Use "forever: if touching color [pick a color] then go to x: y:" — this sends your sprite back to the start whenever it touches that color!',
        tags: ['sensing', 'game', 'control'],
        queries: [
            'how do I make it so that if a sprite touches a color it restart',
            'touching a color should restart the game',
            'if my sprite touches red it should go back',
            'how do I make a color that resets you'
        ],
        followUps: ['touching-color', 'solid-wall-collision', 'reset-at-start'],
        blockExample: 'touchingColorGoto',
        pointers: [
            {
                label: 'Drag "touching color?" into your code',
                blockOpcode: 'sensing_touchingcolor',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['touch color', 'restart', 'reset', 'go back', 'start over', 'die']
        }
    },
    'kill-brick-game-over': {
        id: 'kill-brick-game-over',
        followUpLabel: 'Game over trigger',
        text: 'To make a sprite end the game when touched, use "forever: if touching [sprite] then stop all" — you can also broadcast "game over" to show a message first!',
        tags: ['game', 'control', 'sensing'],
        queries: [
            'how do I make button 3 a kill brick',
            'how do I make a sprite that ends the game when you touch it',
            'how do I make a death block',
            'how do I make game over when touching a sprite'
        ],
        followUps: ['detect-collision', 'broadcast-message', 'make-game'],
        blockExample: 'foreverIfTouching',
        pointers: [
            {
                label: 'Drag "stop all" into your code',
                blockOpcode: 'control_stop',
                category: 'control',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['kill', 'death', 'game over', 'end', 'stop', 'lose', 'brick', 'danger']
        }
    },
    'ball-bounce-off-sprite': {
        id: 'ball-bounce-off-sprite',
        followUpLabel: 'Bounce off sprite',
        text: 'To make a ball bounce off a player, use "if touching [player]" inside a forever loop, then "point in direction (pick random)" or "turn 180 degrees" to reverse it!',
        tags: ['motion', 'sensing', 'game', 'sports'],
        queries: [
            'how can I make the ball bounce off a player',
            'how do I make a ball bounce off a sprite',
            'I want the ball to ricochet when it hits something',
            'how do I make things bounce off each other'
        ],
        followUps: ['detect-collision', 'bouncing-around', 'volleyball-game'],
        blockExample: 'foreverIfTouching',
        pointers: [
            {
                label: 'Drag "touching?" into your code',
                blockOpcode: 'sensing_touchingobject',
                category: 'sensing',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['bounce off', 'deflect', 'ricochet', 'hit', 'ball', 'player', 'rebound']
        }
    },
    'falling-obstacle': {
        id: 'falling-obstacle',
        followUpLabel: 'Falling obstacles',
        text: 'To make a sprite fall from the sky, start it at the top with "go to x:0 y:180" then use "forever: change y by -5" to make it fall down!',
        tags: ['motion', 'game'],
        queries: [
            'how do I make a sprite fall from the sky',
            'how do I make things fall down',
            'I want obstacles to drop from the top',
            'how do I make the broom fall from the sky'
        ],
        followUps: ['solid-wall-collision', 'detect-collision', 'clone-sprite'],
        blockExample: 'fallingFromSky',
        pointers: [
            {
                label: 'Drag "change y by" into your code',
                blockOpcode: 'motion_changeyby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['fall', 'drop', 'sky', 'rain', 'obstacle', 'top', 'down', 'broom']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 14: Kid Questions — Project Ideas & Concepts
    // ──────────────────────────────────────────────

    'game-types-overview': {
        id: 'game-types-overview',
        followUpLabel: 'Game ideas',
        text: 'You can make so many games! Maze games, chase games, platformers, clicker games, pong, quiz games, dodge games, catching games, and more — pick one that sounds fun!',
        tags: ['project-ideas', 'game'],
        queries: [
            'what kind of games can I create',
            'what kinds of games can you make in Scratch',
            'what are some game ideas',
            'what games can I build'
        ],
        followUps: ['make-game', 'make-platformer', 'obstacle-course-game', 'volleyball-game'],
        relevance: {
            keywords: ['kinds', 'types', 'games', 'create', 'build', 'what', 'ideas']
        }
    },
    'advanced-scratch-examples': {
        id: 'advanced-scratch-examples',
        followUpLabel: 'Amazing Scratch projects',
        text: 'People have made incredible things in Scratch — 3D engines, full RPG games, music studios, and even working computers! Start with something simple and keep building your skills.',
        tags: ['project-ideas', 'inspiration'],
        queries: [
            'what is the most advanced complicated game that was made on Scratch',
            'what is the coolest Scratch project ever',
            'what amazing things can you make in Scratch',
            'can you make advanced games in Scratch'
        ],
        followUps: ['game-types-overview', 'make-game', 'project-idea-suggestion'],
        relevance: {
            keywords: ['advanced', 'complicated', 'complex', 'amazing', 'best', 'coolest', 'impressive']
        }
    },
    'project-idea-suggestion': {
        id: 'project-idea-suggestion',
        followUpLabel: 'Get an idea',
        text: 'How about making a game where your sprite dodges falling objects? Or an animation of your favorite animal? Or a music machine? Start small — you can always add more!',
        tags: ['project-ideas', 'beginner'],
        queries: [
            'give me an idea of what I should make',
            'I don\'t know what to make',
            'what should I create in Scratch',
            'I need inspiration for a project'
        ],
        followUps: ['game-types-overview', 'make-game', 'make-animation', 'make-music-project'],
        relevance: {
            keywords: ['idea', 'suggestion', 'what to make', 'inspire', 'don\'t know', 'create']
        }
    },
    'make-tetris-game': {
        id: 'make-tetris-game',
        followUpLabel: 'Tetris-style game',
        text: 'Tetris is an advanced project! Start by making one block that falls and stops at the bottom, then add keyboard controls to move it left and right. Build up from there!',
        tags: ['project-ideas', 'game', 'advanced'],
        queries: [
            'I want to make a tetris game',
            'how do I make tetris in Scratch',
            'how do I make falling block game',
            'can I make tetris'
        ],
        followUps: ['falling-obstacle', 'continuous-key-hold', 'use-variables'],
        blockExample: 'fallingFromSky',
        pointers: [
            {
                label: 'Drag "change y by" into your code',
                blockOpcode: 'motion_changeyby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['tetris', 'falling blocks', 'puzzle', 'block game', 'stack']
        }
    },
    'volleyball-game': {
        id: 'volleyball-game',
        followUpLabel: 'Volleyball game',
        text: 'For a volleyball game, make a ball sprite that bounces, two player sprites with keyboard controls, and use "if touching" to make the ball bounce off the players!',
        tags: ['project-ideas', 'game', 'sports'],
        queries: [
            'how can I make a volleyball game',
            'I want to make a volleyball game',
            'how do I make a two player sports game',
            'how can I make the ball move'
        ],
        followUps: ['ball-bounce-off-sprite', 'move-with-keys', 'bouncing-around'],
        blockExample: 'foreverBounce',
        pointers: [
            {
                label: 'Drag "if on edge, bounce" into your code',
                blockOpcode: 'motion_ifonedgebounce',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['volleyball', 'sports', 'ball', 'player', 'two player', 'net']
        }
    },
    'make-game-more-interesting': {
        id: 'make-game-more-interesting',
        followUpLabel: 'Improve your game',
        text: 'Try adding: a score variable, sound effects when things happen, a timer, extra levels with backdrops, or power-ups using clones — these all make games more exciting!',
        tags: ['project-ideas', 'game'],
        queries: [
            'what else should I add to make the game more interesting',
            'how do I make my game better',
            'my game needs more features',
            'what can I add to my game'
        ],
        followUps: ['use-variables', 'add-sound', 'countdown-timer-variable', 'clone-sprite'],
        relevance: {
            keywords: ['interesting', 'better', 'improve', 'features', 'more', 'fun', 'exciting', 'add']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 15: Kid Questions — Stage & Backdrops
    // ──────────────────────────────────────────────

    'scrolling-backdrop': {
        id: 'scrolling-backdrop',
        followUpLabel: 'Scrolling background',
        text: 'For a continuously moving backdrop, make two copies of the background as sprites. Move both left in a forever loop — when one goes off screen, jump it to the right side!',
        tags: ['motion', 'game', 'advanced'],
        queries: [
            'how to make the backdrop continuously moving',
            'how do I make a scrolling background',
            'I want the background to keep moving',
            'how do I make an infinite scrolling backdrop'
        ],
        followUps: ['change-backdrop', 'forever-loop', 'make-platformer'],
        blockExample: 'moveSideToSide',
        pointers: [
            {
                label: 'Drag "change x by" into your code',
                blockOpcode: 'motion_changexby',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['scrolling', 'backdrop', 'background', 'moving', 'continuous', 'infinite', 'parallax']
        }
    },
    'multiple-backdrops': {
        id: 'multiple-backdrops',
        followUpLabel: 'Multiple backdrops',
        text: 'Click the backdrop area below the stage and add more backdrops! Use "switch backdrop to" or "next backdrop" blocks to switch between them in your code.',
        tags: ['looks', 'backdrop', 'beginner'],
        queries: [
            'how do I have 2 backgrounds',
            'how do I add multiple backdrops',
            'I want different backgrounds for different levels',
            'how do I switch between backgrounds'
        ],
        followUps: ['change-backdrop', 'backdrop-events', 'broadcast-for-levels'],
        pointers: [
            {
                label: 'Add a backdrop here',
                target: '[class*="stage-selector"] [class*="add-button"]',
                side: 'top'
            }
        ],
        relevance: {
            keywords: ['two', 'multiple', 'backgrounds', 'backdrops', 'switch', 'different', 'levels']
        }
    },

    // ──────────────────────────────────────────────
    // CATEGORY 16: Kid Questions — Misc / Meta
    // ──────────────────────────────────────────────

    'find-sprite-x-position': {
        id: 'find-sprite-x-position',
        followUpLabel: 'Find X position',
        text: 'Hover over a sprite on the stage to see its x and y position in the sprite info area below, or use the "x position" reporter block from Motion!',
        tags: ['motion', 'sensing', 'coordinates'],
        queries: [
            'where is the x position of crab',
            'how do I find a sprite\'s x position',
            'what is my sprite\'s position',
            'how do I see the coordinates of a sprite'
        ],
        followUps: ['change-xy-explanation', 'go-to-position'],
        pointers: [
            {
                label: 'Find "x position" in Motion',
                blockOpcode: 'motion_xposition',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['x position', 'y position', 'coordinate', 'where', 'location', 'find']
        }
    },
    'other-turn-options': {
        id: 'other-turn-options',
        followUpLabel: 'Turn options',
        text: 'You can "turn right" or "turn left" by any number of degrees, or use "point in direction" to face a specific way (90=right, -90=left, 0=up, 180=down)!',
        tags: ['motion', 'beginner'],
        queries: [
            'are there other turn options',
            'what other ways can I turn my sprite',
            'how do I point my sprite in a direction',
            'what are the different turn blocks'
        ],
        followUps: ['spinning', 'rotation-style-vs-turn', 'face-without-flip'],
        pointers: [
            {
                label: 'Drag "point in direction" into your code',
                blockOpcode: 'motion_pointindirection',
                category: 'motion',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['turn', 'rotate', 'direction', 'options', 'degrees', 'point', 'face']
        }
    },
    'forever-block-explained': {
        id: 'forever-block-explained',
        followUpLabel: 'Why use forever?',
        text: 'Without "forever", your code runs once and stops! The "forever" loop keeps repeating your blocks over and over — that\'s why your sprite stops moving when you remove it.',
        tags: ['control', 'meta', 'beginner'],
        queries: [
            'why when I take out the forever block, my sprite stops moving',
            'why do I need a forever block',
            'what does the forever block do',
            'my code stops after running once'
        ],
        followUps: ['forever-loop', 'repeat-loop', 'if-not-forever'],
        blockExample: 'foreverMove',
        relevance: {
            keywords: ['forever', 'why', 'stops', 'once', 'need', 'remove', 'take out']
        }
    },
    'no-code-interactions': {
        id: 'no-code-interactions',
        followUpLabel: 'Without code',
        text: 'You can drag sprites around the stage with your mouse, draw costumes, record sounds, and change the backdrop — all without any code! But code is what makes things interactive.',
        tags: ['meta', 'beginner'],
        queries: [
            'can I do that without code',
            'do I need code to do this',
            'what can I do without coding',
            'is there a way to do it without blocks'
        ],
        followUps: ['drag-blocks-to-workspace', 'add-costume', 'add-sound'],
        relevance: {
            keywords: ['without code', 'no code', 'don\'t code', 'manually', 'drag', 'mouse']
        }
    },
    'green-flag-not-moving': {
        id: 'green-flag-not-moving',
        followUpLabel: 'Nothing moves',
        text: 'If clicking the green flag does nothing, check: do you have a "when green flag clicked" block on top of your code? Is your code connected in a stack? Is it on the right sprite?',
        tags: ['debugging', 'events', 'beginner'],
        queries: [
            'I\'m clicking the green flag and it doesn\'t move what do I do',
            'green flag doesn\'t work',
            'nothing happens when I press play',
            'I click start but nothing moves'
        ],
        followUps: ['nothing-happens', 'wrong-sprite-selected', 'add-event-block'],
        blockExample: 'whenFlagMove',
        pointers: [
            {
                label: 'Drag "when green flag clicked" into your code',
                blockOpcode: 'event_whenflagclicked',
                category: 'events',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['green flag', 'not moving', 'doesn\'t move', 'click', 'nothing', 'start']
        }
    },
    'make-sprite-bigger': {
        id: 'make-sprite-bigger',
        followUpLabel: 'Make it bigger',
        text: 'Use "set size to 200%" from Looks to make your sprite bigger — 100% is normal, higher numbers make it larger!',
        tags: ['looks', 'size', 'beginner'],
        queries: [
            'how do I make the broom size bigger',
            'how do I make a sprite larger',
            'my sprite is too small I want it bigger',
            'how do I increase the size of my sprite'
        ],
        followUps: ['change-size', 'sprite-too-small'],
        blockExample: 'setSizeTo100',
        pointers: [
            {
                label: 'Drag "set size to" into your code',
                blockOpcode: 'looks_setsizeto',
                category: 'looks',
                side: 'right'
            }
        ],
        relevance: {
            keywords: ['bigger', 'larger', 'size', 'increase', 'grow', 'broom', 'scale up']
        }
    },
    'costume-masking': {
        id: 'costume-masking',
        followUpLabel: 'Edit part of costume',
        text: 'Scratch doesn\'t have masking, but you can select just part of a costume to edit! In the Costumes tab, use the select tool to click and drag around the area you want to change.',
        tags: ['costumes', 'drawing'],
        queries: [
            'can I mask a costume so that when I edit it only edits what\'s inside the mask',
            'how do I edit just part of a costume',
            'how do I select a portion of my costume to edit',
            'is there a mask tool in Scratch'
        ],
        followUps: ['add-costume', 'change-costume'],
        pointers: [
            {
                label: 'Click the Costumes tab',
                target: '[class*="tab-list"] [class*="tab"]:nth-child(2)',
                side: 'bottom'
            }
        ],
        relevance: {
            keywords: ['mask', 'select', 'part', 'portion', 'edit', 'area', 'crop']
        }
    }
};
/* eslint-enable @stylistic/max-len */

// Quick-pick suggestions shown in the empty state
// Each has a color matching the relevant Scratch block category
const quickPicks = [
    {label: 'Starting your project', query: 'nothing happens when I click green flag', color: '#FFBF00'},
    {label: 'Moving a sprite', query: 'how do I make my sprite move', color: '#4C97FF'},
    {label: 'Animation', query: 'how do I animate my sprite', color: '#9966FF'},
    {label: 'Adding sounds', query: 'how do I add a sound', color: '#CF63CF'},
    {label: 'Making a game', query: 'how do I make a game', color: '#FFAB19'},
    {label: 'Making art', query: 'how do I draw and make art', color: '#0FBD8C'},
    {label: 'Fun effects', query: 'rainbow spinning color effects', color: '#FF6680'},
    {label: 'What went wrong?', query: 'my code is not working something is broken', color: '#FF8C1A'}
];

export {tips as default, quickPicks};
