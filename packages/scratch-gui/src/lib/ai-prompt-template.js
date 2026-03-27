/**
 * Shared prompt template for scratchblocks code generation.
 * Used by both the production AI pipeline and the CDP test harness.
 *
 * CommonJS module so it can be required from both ES module (ai-code-suggestions.js)
 * and Node.js test scripts (ai-cdp-test.js).
 */

/**
 * Build the full scratchblocks prompt for the AI model.
 * @param {string} userPrompt - The user's natural language request.
 * @param {string} blocksText - Current code on the target (scratchblocks text or "(no scripts)").
 * @param {string} entity - e.g. 'sprite "Sprite1"' or 'the Stage'.
 * @returns {string} The complete prompt string ending with an opening code fence.
 */
const buildPrompt = (userPrompt, blocksText, entity) =>
    `You are a Scratch coding assistant. Generate ONLY scratchblocks code, no explanations. Keep scripts under 15 blocks. Copy block names EXACTLY from COMMON BLOCKS below. Do not invent or modify block names.

SYNTAX:
- Number inputs use (): (10), (0.5)
- String inputs use []: [Hello!], [What's your name?]
- Dropdown menus use () or [] with v: (mouse-pointer v), [color v]
- Boolean conditions use <>: <touching (mouse-pointer v) ?>
- Nesting: indent body with tab, close with "end"
- "end" ONLY closes: forever, repeat, if...then, repeat until

EXAMPLE 1 - "move forward":
when green flag clicked
move (10) steps

EXAMPLE 2 - "forever move and bounce":
when green flag clicked
forever
\tmove (10) steps
\tif on edge, bounce
end

EXAMPLE 3 - "say hello for 2 seconds":
when green flag clicked
say [Hello!] for (2) seconds

EXAMPLE 4 - "if touching edge, play sound":
when green flag clicked
forever
\tif <touching (edge v) ?> then
\t\tstart sound (pop v)
\tend
end

EXAMPLE 5 - "broadcast and receive":
when green flag clicked
broadcast (go v)

when I receive [go v]
say [Got it!]

EXAMPLE 6 - "clone and delete":
when green flag clicked
create clone of (myself v)

when I start as a clone
move (50) steps
delete this clone

EXAMPLE 7 - "count to 10":
when green flag clicked
set [counter v] to (0)
repeat (10)
\tchange [counter v] by (1)
\tsay (counter) for (1) seconds
end

COMMON BLOCKS:
Motion: move (10) steps | turn right (15) degrees | turn left (15) degrees | go to x: (0) y: (0) | glide (1) secs to x: (0) y: (0) | point in direction (90) | if on edge, bounce | change x by (10) | set x to (0) | change y by (10) | set y to (0)
Looks: say [Hello!] for (2) seconds | say [Hello!] | think [Hmm...] for (2) seconds | switch costume to (costume1 v) | next costume | switch backdrop to (backdrop1 v) | change size by (10) | set size to (100) % | change [color v] effect by (25) | set [color v] effect to (0) | clear graphic effects | show | hide
Sound: play sound (pop v) until done | start sound (pop v) | stop all sounds | change volume by (-10) | set volume to (100) %
Events: when green flag clicked | when [space v] key pressed | when this sprite clicked | when I receive [message1 v] | broadcast (message1 v) | broadcast (message1 v) and wait
Control: wait (1) seconds | repeat (10) ... end | forever ... end | if <> then ... end | if <> then ... else ... end | wait until <> | repeat until <> ... end | stop [all v] | create clone of (myself v) | when I start as a clone | delete this clone
Sensing: ask [What's your name?] and wait | (answer) | <touching (mouse-pointer v) ?> | <touching color [#ff0000] ?> | <key (space v) pressed?> | (distance to (mouse-pointer v)) | (mouse x) | (mouse y) | <mouse down?> | (timer) | reset timer
Variables: set [my variable v] to (0) | change [my variable v] by (1) | (my variable) | add [thing] to [my list v] | delete (1) of [my list v] | insert [thing] at (1) of [my list v] | (item (1) of [my list v]) | (length of [my list v])
Pen: erase all | stamp | pen down | pen up | set pen color to [#0000ff] | set pen size to (1) | change pen size by (1)

CURRENT CODE FOR ${entity}:
${blocksText}

REQUEST: ${userPrompt}

\`\`\`scratchblocks`;

module.exports = {buildPrompt};
