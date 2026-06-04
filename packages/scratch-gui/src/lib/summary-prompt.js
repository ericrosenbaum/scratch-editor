/* eslint-disable max-len */

/**
 * Prompt builders for the on-device Gemma summarizer.
 *
 * To keep each call well within the small model's context window, work is
 * decomposed into bounded chunks:
 *  1. Stacks: summarize a small batch of one sprite's scripts at a time.
 *  2. Sprite: summarize a sprite from its (already short) stack summaries.
 *  3. Project: summarize the whole project from the sprite summaries.
 *
 * All builders use Gemma 4 turn tokens and ask for a single JSON object.
 */

const STACKS_SYSTEM = `You summarize Scratch scripts for a young learner. You are given a sprite name and a numbered list of scripts. Each script is a stack of blocks written in a scratchblocks-like notation. For EACH numbered script, write ONE short, plain-English sentence describing what it does. Output ONLY a single valid JSON object. No markdown, no explanation, no extra text.

Output format:
{"stacks": [{"n": 1, "description": "..."}, {"n": 2, "description": "..."}]}

RULES:
- Include exactly one entry for each script number you are given.
- "description" is ONE short, plain sentence. Use plain English only — no code, no block syntax, no brackets.`;

const STACKS_EXAMPLE_USER = `Sprite: Ball

Script 1 (when green flag clicked):
when green flag clicked
gotoxy 0 0
forever
  movesteps 5
  if (touchingobject (edge))
    bounceoffedge

Script 2 (when this sprite clicked):
when this sprite clicked
playsound (pop)`;

const STACKS_EXAMPLE_MODEL = `{"stacks": [{"n": 1, "description": "The ball moves across the stage and bounces off the edges in a loop."}, {"n": 2, "description": "The ball plays a popping sound when it is clicked."}]}`;

const SPRITE_SYSTEM = `You summarize one sprite from a Scratch project for a young learner. You are given the sprite's name and a short summary of each of its scripts. Write ONE short, friendly sentence describing the sprite's overall role. Output ONLY a single valid JSON object. No markdown, no explanation, no extra text.

Output format:
{"description": "..."}

RULES:
- "description" is ONE short sentence. Use plain English only.`;

const SPRITE_EXAMPLE_USER = `Sprite: Ball
Scripts:
- when green flag clicked: The ball moves across the stage and bounces off the edges in a loop.
- when this sprite clicked: The ball plays a popping sound when it is clicked.`;

const SPRITE_EXAMPLE_MODEL = `{"description": "A ball that bounces around the stage and reacts when clicked."}`;

const PROJECT_SYSTEM = `You summarize a whole Scratch project for a young learner. You are given a list of the project's sprites with a one-sentence summary of each. Output ONLY a single valid JSON object. No markdown, no explanation, no extra text.

Output format:
{"description": "one sentence describing the whole project"}

RULES:
- "description" is ONE short sentence describing what the project does overall.
- Do NOT invent a title.
- Use plain English only.`;

const PROJECT_EXAMPLE_USER = `Sprites:
- Ball: A ball that bounces around the stage and reacts when clicked.
- Stage: A plain backdrop that plays background music.`;

const PROJECT_EXAMPLE_MODEL = `{"description": "A ball bounces around the stage and plays a sound when clicked, over a musical backdrop."}`;

const turn = (system, exampleUser, exampleModel, user) => (
    `<|turn>system\n${system}<turn|>\n` +
    `<|turn>user\n${exampleUser}<turn|>\n` +
    `<|turn>model\n${exampleModel}<turn|>\n` +
    `<|turn>user\n${user}<turn|>\n` +
    '<|turn>model\n'
);

/**
 * Build a prompt summarizing a batch of one sprite's scripts.
 * @param {string} spriteName - The sprite (or Stage) name.
 * @param {Array<{event: string, text: string}>} batch - Scripts to summarize, in order.
 * @returns {string} The formatted prompt for generateResponse().
 */
const buildStacksPrompt = (spriteName, batch) => {
    const scripts = batch
        .map((s, i) => `Script ${i + 1} (${s.event}):\n${s.text}`)
        .join('\n\n');
    return turn(STACKS_SYSTEM, STACKS_EXAMPLE_USER, STACKS_EXAMPLE_MODEL, `Sprite: ${spriteName}\n\n${scripts}`);
};

/**
 * Build a prompt summarizing a sprite from its stack summaries.
 * @param {string} spriteName - The sprite (or Stage) name.
 * @param {Array<{event: string, description: string}>} stackSummaries - Per-script summaries.
 * @returns {string} The formatted prompt for generateResponse().
 */
const buildSpritePrompt = (spriteName, stackSummaries) => {
    const list = stackSummaries.length ?
        stackSummaries.map(s => `- ${s.event}: ${s.description}`).join('\n') :
        '(this sprite has no scripts)';
    return turn(SPRITE_SYSTEM, SPRITE_EXAMPLE_USER, SPRITE_EXAMPLE_MODEL, `Sprite: ${spriteName}\nScripts:\n${list}`);
};

/**
 * Build a prompt summarizing the whole project from its sprite summaries.
 * @param {Array<{name: string, description: string}>} spriteSummaries - Per-sprite summaries.
 * @returns {string} The formatted prompt for generateResponse().
 */
const buildProjectPrompt = spriteSummaries => {
    const list = spriteSummaries.map(s => `- ${s.name}: ${s.description}`).join('\n');
    return turn(PROJECT_SYSTEM, PROJECT_EXAMPLE_USER, PROJECT_EXAMPLE_MODEL, `Sprites:\n${list}`);
};

export {buildStacksPrompt, buildSpritePrompt, buildProjectPrompt};
