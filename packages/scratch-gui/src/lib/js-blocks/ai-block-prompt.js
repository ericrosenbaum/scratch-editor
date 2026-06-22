/**
 * @file Builds the prompt that asks the on-device Gemma model to generate a
 * JS-powered block "document" (a `---`-fenced header + JavaScript body) from a
 * natural-language description, and cleans up the model's response.
 *
 * The system instruction embeds a compact form of the in-editor API reference
 * (./api-reference) plus a handful of verbatim example documents drawn from the
 * built-in libraries (./example-libraries), so the generated block matches the
 * exact format that ./block-spec parses and ./static-analysis lints.
 */

/* eslint-disable @stylistic/max-len */
// The system instruction is a long prose template; keeping its lines intact reads better than wrapping.

import {API_REFERENCE} from './api-reference';
import {FAMILIES} from './example-libraries';

/**
 * Collapse the structured API reference into compact text for the prompt:
 * one `## Section` heading per group, then `- signature — description` lines.
 * @returns {string} the flattened reference.
 */
const flattenApiReference = () => API_REFERENCE.map(section => {
    const lines = section.entries.map(e => `- ${e.sig} — ${e.desc}`).join('\n');
    return `## ${section.section}\n${lines}`;
}).join('\n\n');

/**
 * The system instruction: how to write a block document, the rules that keep a
 * generation passing static analysis, then the full API reference.
 */
const SYSTEM_INSTRUCTION = `You write a single "block document" for Scratch's JS-powered custom blocks. A block document is a "---" header describing the block, then a "---" line, then a JavaScript body. Output ONLY the document — no markdown fences, no \`\`\`, no explanation, no extra text before or after.

FORMAT (exactly this shape):
---
type: <command | reporter | boolean | c-loop | c-if | hat>
text: "label with {name} placeholders"
inputs:
  name: <number | text | boolean> = <default>
---
<JavaScript body>

HEADER RULES:
- "type:" is required and must be one of: command, reporter, boolean, c-loop, c-if, hat.
- "text:" is required: the block label. Every input is referenced in the label as {name}; every {name} in the label MUST have a matching input, and every declared input MUST appear in the label. If the block needs no inputs, write an empty "inputs:" line and use a label with no {placeholders}.
- Each input is its own indented line: "name: type = default" (type is number, text, or boolean). Quote text defaults, e.g. s: text = "hello".
- "color:" and "warp:" are optional and usually omitted.

BODY RULES (these keep the block valid):
- Read an input with Scratch.args.NAME (already cast to its declared type).
- reporter, boolean, and hat blocks MUST end by returning a value: return <value>;
- command blocks just do something and need no return.
- c-loop and c-if blocks call Scratch.runBranch() to run the wrapped blocks (call it inside a loop to repeat). They need no return.
- hat blocks are checked every frame and return true to fire; they must NOT call Scratch.runBranch() or wait.
- Use only the Scratch.* API below plus standard JS built-ins (Math, JSON, String, Number, Array, Object, Boolean). Do NOT use window, document, fetch, eval, setTimeout, require, or any other host/network API — they are blocked.
- Always give loops a real exit condition.

THE Scratch.* API YOU MAY USE:
${flattenApiReference()}
`;

/**
 * A built-in family by name, for pulling verbatim example documents.
 * @param {string} name - the family display name (e.g. 'Text').
 * @returns {object} the matching family descriptor.
 */
const familyByName = name => FAMILIES.find(f => f.name === name);

/**
 * Few-shot examples: a natural-language request paired with the exact block
 * document it should produce. The command/reporter/boolean cases are verbatim
 * built-in blocks (guaranteed to lint clean); the c-loop/c-if/hat cases cover
 * the remaining types. Every `model` string is asserted lint-clean by the unit
 * test, so keep new examples passing static analysis.
 */
const EXAMPLES = [
    {
        user: 'a reporter that gives a word spelled backwards',
        model: familyByName('Text').docs[0]
    },
    {
        user: 'a command that makes a new square grid of a given size',
        model: familyByName('Grids').docs[0]
    },
    {
        user: 'a boolean that checks whether one piece of text contains another',
        model: familyByName('Text').docs[4]
    },
    {
        user: "a reporter for the width of the sprite's costume, with no inputs",
        model: familyByName('Pixels').docs[5]
    },
    {
        user: 'a c block that repeats its inside n times',
        model: `---
type: c-loop
text: "repeat fancy {n}"
inputs:
  n: number = 4
---
for (var i = 0; i < Scratch.args.n; i++) {
    Scratch.runBranch();
}`
    },
    {
        user: 'a c block that runs its inside with some percent chance',
        model: `---
type: c-if
text: "maybe {chance}%"
inputs:
  chance: number = 50
---
if ((Math.random() * 100) < Scratch.args.chance) {
    Scratch.runBranch();
}`
    },
    {
        user: 'a hat that fires once the timer passes a number of seconds',
        model: `---
type: hat
text: "when timer passes {n}"
inputs:
  n: number = 10
---
return Scratch.timer > Scratch.args.n;`
    }
];

/**
 * Assemble the full prompt (Gemma turn format) for a user's request.
 * @param {string} userText - the natural-language block description.
 * @returns {string} the prompt ready for generateResponse().
 */
const buildJsBlockPrompt = userText => {
    let prompt = `<|turn>system\n${SYSTEM_INSTRUCTION}<turn|>\n`;
    for (const ex of EXAMPLES) {
        prompt += `<|turn>user\n${ex.user}<turn|>\n`;
        prompt += `<|turn>model\n${ex.model}<turn|>\n`;
    }
    prompt += `<|turn>user\n${userText}<turn|>\n`;
    prompt += '<|turn>model\n';
    return prompt;
};

/**
 * Clean a model response down to a bare block document: strip any wrapping
 * markdown code fence and any preamble before the opening "---" header.
 * @param {string} raw - the raw model output.
 * @returns {string} the cleaned document (static analysis catches the rest).
 */
const stripFences = raw => {
    let text = (raw || '').trim();
    // Remove a wrapping markdown code fence (```yaml … ``` or bare ``` … ```).
    if (text.startsWith('```')) {
        text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
            .trim();
    }
    // A document must begin with a "---" header line; skip any preamble.
    if (!text.startsWith('---')) {
        const match = text.match(/\n---[ \t]*(\n|$)/);
        if (match) text = text.slice(match.index + 1).trim();
    }
    return text;
};

export {buildJsBlockPrompt, stripFences, flattenApiReference, SYSTEM_INSTRUCTION, EXAMPLES};
