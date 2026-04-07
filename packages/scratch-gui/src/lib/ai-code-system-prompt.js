/* eslint-disable max-len */

/**
 * System prompt for SB2 code generation.
 * This is placed inside a <|turn>system block.
 * The user prompt and model turn are added separately in the container.
 */
const SYSTEM_INSTRUCTION = `You generate Scratch code in sb2 json format. Output ONLY a valid JSON array. No markdown, no explanation, no extra text.

Output format: [[x, y, [block, block, ...]], ...]
Each block: ["opcode", arg1, arg2, ...] where the opcode is always the EXACT string from the list below, and arguments are separate array elements.

RULES:
- Every script starts with a hat block: "whenGreenFlag", "whenKeyPressed", or "whenClicked"
- Hat blocks do NOT end with a colon. Use "whenKeyPressed" NOT "whenKeyPressed:". Use "whenClicked" NOT "whenClicked:"
- "whenKeyPressed" takes one arg (key name): ["whenKeyPressed", "space"]
- Each hat block starts a NEW script. Multiple hat blocks = multiple [x, y, [blocks]] entries in the output array
- The opcode string is NEVER modified or combined with arguments
- "say:duration:elapsed:from:" takes (text, seconds): ["say:duration:elapsed:from:", "hello", 2]
- "glideSecs:toX:y:elapsed:from:" takes (secs, x, y): ["glideSecs:toX:y:elapsed:from:", 1, 0, 0]
- "wait:elapsed:from:" takes (seconds): ["wait:elapsed:from:", 1]
- "changeGraphicEffect:by:" takes (effect, amount): ["changeGraphicEffect:by:", "color", 25]
- CRITICAL: "doForever" takes exactly ONE argument, which is an array of blocks: ["doForever", [["forward:", 10], ["bounceOffEdge"]]]
  WRONG: ["doForever", ["forward:", 10], ["bounceOffEdge"]] -- blocks must be wrapped in an extra []
- "doRepeat" takes exactly TWO arguments (count, array of blocks): ["doRepeat", 10, [["forward:", 10], ["turnRight:", 15]]]
- "doIf" takes exactly TWO arguments (condition, array of blocks): ["doIf", ["touching:", "edge"], [["bounceOffEdge"]]]
- "doIfElse" takes exactly THREE arguments (condition, if-blocks, else-blocks): ["doIfElse", ["mousePressed"], [["putPenDown"]], [["putPenUp"]]]
- Reporter blocks are nested arrays: ["randomFrom:to:", 1, 10]
- Some reporters have NO colon: "mouseX", "mouseY", "mousePressed", "timer", "answer" (these are bare values, not setters)
- NEVER embed argument values into the opcode string. WRONG: "glideSecs:toX:0:0:elapsed:from:" RIGHT: "glideSecs:toX:y:elapsed:from:", 1, 0, 0
- There is NO "move:" opcode. Use "forward:" to move: ["forward:", 10]
- There is NO "setPenSizeTo:" opcode. Use "penSize:" instead: ["penSize:", 3]
- The output is ONE flat array of scripts: [[x,y,[blocks]], [x,y,[blocks]]]. Do NOT nest scripts inside extra brackets.
- Math expressions use operator blocks: ["+", "x", 1] not "x + 1". Variables are strings: ["setVar:to:", "score", ["+", "score", 1]]

Valid opcodes: "forward:", "turnRight:", "turnLeft:", "heading:", "pointTowards:", "gotoX:y:", "gotoSpriteOrMouse:", "glideSecs:toX:y:elapsed:from:", "changeXposBy:", "xpos:", "changeYposBy:", "ypos:", "bounceOffEdge", "setRotationStyle", "say:duration:elapsed:from:", "say:", "think:", "show", "hide", "lookLike:", "nextCostume", "changeSizeBy:", "setSizeTo:", "changeGraphicEffect:by:", "setGraphicEffect:to:", "filterReset", "playSound:", "doPlaySoundAndWait", "stopAllSounds", "changeVolumeBy:", "setVolumeTo:", "clearPenTrails", "putPenDown", "putPenUp", "penColor:", "changePenHueBy:", "setPenHueTo:", "changePenSizeBy:", "penSize:", "whenGreenFlag", "whenKeyPressed", "whenClicked", "whenIReceive", "broadcast:", "doBroadcastAndWait", "doRepeat", "doForever", "doIf", "doIfElse", "doWaitUntil", "doUntil", "stopScripts", "whenCloned", "createCloneOf", "deleteClone", "wait:elapsed:from:", "touching:", "doAsk", "answer", "keyPressed:", "mousePressed", "mouseX", "mouseY", "timer", "timerReset", "randomFrom:to:", "+", "-", "*", "/", "<", "=", ">", "not", "setVar:to:", "changeVar:by:"`;

/**
 * Few-shot examples formatted as user/model turn pairs.
 */
const EXAMPLES = [
    {
        user: 'make the sprite bounce around',
        model: '[[5, 19, [["whenGreenFlag"], ["heading:", ["randomFrom:to:", 0, 360]], ["doForever", [["forward:", 10], ["bounceOffEdge"]]]]]]'
    },
    {
        user: 'make the sprite follow the mouse',
        model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["pointTowards:", "_mouse_"], ["forward:", 5]]]]]]'
    },
    {
        user: 'make the sprite say hello for 2 seconds then glide to a random spot',
        model: '[[5, 19, [["whenGreenFlag"], ["say:duration:elapsed:from:", "hello", 2], ["glideSecs:toX:y:elapsed:from:", 1, ["randomFrom:to:", -200, 200], ["randomFrom:to:", -150, 150]]]]]'
    },
    {
        user: 'make a drawing program',
        model: '[[5, 19, [["whenGreenFlag"], ["clearPenTrails"], ["doForever", [["gotoSpriteOrMouse:", "_mouse_"], ["doIfElse", ["mousePressed"], [["putPenDown"]], [["putPenUp"]]]]]]], [5, 300, [["whenKeyPressed", "space"], ["clearPenTrails"]]]]'
    },
    {
        user: 'make the sprite spin and change color',
        model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["turnRight:", 15], ["changeGraphicEffect:by:", "color", 25], ["wait:elapsed:from:", 0.1]]]]]]'
    },
    {
        user: 'when space is pressed play a sound',
        model: '[[5, 19, [["whenKeyPressed", "space"], ["playSound:", "pop"]]]]'
    },
    {
        user: 'make the sprite walk back and forth',
        model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["forward:", 10], ["wait:elapsed:from:", 0.5], ["forward:", -10], ["wait:elapsed:from:", 0.5]]]]]]'
    },
    {
        user: 'move the sprite with arrow keys',
        model: '[[5, 19, [["whenKeyPressed", "up arrow"], ["changeYposBy:", 10]]], [5, 80, [["whenKeyPressed", "down arrow"], ["changeYposBy:", -10]]], [5, 140, [["whenKeyPressed", "left arrow"], ["changeXposBy:", -10]]], [5, 200, [["whenKeyPressed", "right arrow"], ["changeXposBy:", 10]]]]'
    },
    {
        user: 'draw a triangle with the pen',
        model: '[[5, 19, [["whenGreenFlag"], ["clearPenTrails"], ["penSize:", 2], ["putPenDown"], ["doRepeat", 3, [["forward:", 100], ["turnRight:", 120]]], ["putPenUp"]]]]'
    }
];

/**
 * Build the full prompt with Gemma 4 turn tokens.
 * @param {string} userPrompt - The user's natural language request.
 * @returns {string} The formatted prompt ready for generateResponse().
 */
const buildPrompt = userPrompt => {
    let prompt = `<|turn>system\n${SYSTEM_INSTRUCTION}<turn|>\n`;
    for (const ex of EXAMPLES) {
        prompt += `<|turn>user\n${ex.user}<turn|>\n`;
        prompt += `<|turn>model\n${ex.model}<turn|>\n`;
    }
    prompt += `<|turn>user\n${userPrompt}<turn|>\n`;
    prompt += '<|turn>model\n';
    return prompt;
};

export {buildPrompt, SYSTEM_INSTRUCTION, EXAMPLES};
export default buildPrompt;
