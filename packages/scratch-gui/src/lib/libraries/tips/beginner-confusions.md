# Beginner Confusions, Stuck Points & Tip Coverage

This document catalogs common beginner confusions and stuck points in Scratch, organized by category. Each entry notes which tip(s) address it.

---

## 1. Learner Differences
Challenges arising from individual learner characteristics (age, reading level, math knowledge).

| Confusion | Description | Tip(s) |
|-----------|-------------|--------|
| Negative numbers | Can't make sprite go backward; don't know minus sign | `negative-numbers` |
| Decimal numbers | Don't know you can use 0.5 for shorter waits/smaller moves | `decimal-numbers` |
| Slow reading | Hard to find blocks in palette; takes long to read labels | `find-block-by-color` |
| Greater/less than symbols | Don't know what < and > mean | `greater-less-than` |

## 2. "Nothing is Happening"
User takes an action and surprisingly, nothing visible occurs.

| Confusion | Description | Tip(s) |
|-----------|-------------|--------|
| Block has no visible effect alone | E.g. clicking "if on edge, bounce" when sprite isn't at edge | `no-visible-effect` |
| Block effect already applied | E.g. "go to x:0 y:0" when already there | `block-already-there` |
| Invisible side effect causes later problems | E.g. "set rotation style left-right" then turn appears broken | `rotation-style-vs-turn` |
| Sound not working (volume 0) | Volume was set to 0 by a previous block | `sound-volume-zero` |
| Touching color wrong color picked | Color detection fails due to wrong color sample | `touching-wrong-color` |
| Batched visual updates | "turn 15 / turn -15" has no visible effect (same frame) | `batched-updates` |
| Things happen too fast to see | Multiple actions execute in one frame | `wait-vs-no-wait`, `too-fast` |

## 3. Meta Framework
Misconceptions about how the Scratch environment itself works.

| Confusion | Description | Tip(s) |
|-----------|-------------|--------|
| Dragging blocks to stage | Drag to workspace, not the stage area | `dragging-to-stage` |
| Sprite hierarchy / "where did my blocks go" | Each sprite has own code; switching sprites changes code view | `where-did-blocks-go`, `sprite-has-own-code` |
| Sequential execution | Blocks run top-to-bottom; order matters | `blocks-run-in-order` |
| Parallel execution | Two stacks can run simultaneously | `two-stacks-same-time` |
| Editing stacks | How to remove a block from middle of stack | `remove-block-from-stack` |
| "If" is a statement, not a rule | "if touching" under green flag only checks once | `if-not-forever` |
| Events / hat blocks needed | Code needs an event block on top to run | `nothing-happens`, `add-event-block` |
| Deleting sprite deletes code | All code/costumes/sounds in sprite are lost | `deleting-sprite-deletes-code` |
| Don't know how to drag blocks | Not aware blocks are dragged from palette to workspace | `drag-blocks-to-workspace` |
| Don't know you can click to try | Clicking a block or stack runs it | `click-block-to-try` |

## 4. Undiscovered Affordances
Features the user hasn't found yet.

| Confusion | Description | Tip(s) |
|-----------|-------------|--------|
| Broadcast blocks for coordination | Don't know how to make sprites communicate | `broadcast-message`, `broadcast-for-levels` |
| Understanding seconds | Don't know how long "wait 10" really is | `understand-seconds` |
| Custom blocks | Don't know "Make a Block" exists | `custom-blocks` |
| Costume center offset | Rotation looks weird due to off-center costume | `costume-center` |
| Pen down state | Don't understand persistent drawing state | `pen-extension`, `trail-of-stamps` |
| Clones | Don't understand what "create clone" does | `clone-sprite`, `clone-basics`, `clone-delete` |
| X/Y coordinates | Don't understand the coordinate system | `change-xy-explanation`, `change-xy-position` |
| Draggable mode | Confusion between editor dragging and player dragging | *(not yet covered — potential future tip)* |
| Sprite is invisible | Hidden via hide block, ghost effect, or size 0 | `sprite-is-hidden`, `sprite-ghost-effect`, `sprite-too-small` |
| Missing asset reference | Block refers to deleted costume/sound | `missing-asset` |
| Dropdown menus on blocks | Don't know you can change block options | `change-block-menu` |
| Reporter blocks in inputs | Don't know you can drag reporters into inputs | `insert-reporter` |
| Right-click context menu | Don't know about duplicate/comment/help | `right-click-duplicate` |
| Extensions library | Don't know extra block categories exist | `add-extension`, `pen-extension`, `music-extension`, `text-to-speech-extension` |
| How to reset at start | Don't know to set initial position under green flag | `reset-at-start` |
| Green flag starts project | Don't know the typical project entry point | `green-flag` |
| "Play sound" vs "play until done" | Don't understand the difference | `play-vs-play-until-done` |
| Backdrop events | Don't know you can trigger code on backdrop switch | `backdrop-events` |
| Variable display modes | Don't know about slider/large readout | `show-hide-variable` |
| Random numbers | Don't know about "pick random" block | `random-numbers` |
| Ask and answer | Don't know how to get user input | `ask-and-answer` |
| Touching color eyedropper | Don't know how to pick colors | `touching-color` |
| Timer block | Don't know timer exists | `timer-block` |

## 5. User Errors
Mistakes users commonly make.

| Confusion | Description | Tip(s) |
|-----------|-------------|--------|
| Copied example incorrectly | Code doesn't match tutorial | `debug-with-say` |
| Typed huge number | 100+ digit numbers cause unexpected behavior (precision loss or treated as 0) | `huge-number` |
| Wrong sprite selected | Added code to wrong sprite | `wrong-sprite-selected` |
| Sprite off-stage | Moved sprite beyond visible area | `sprite-off-stage` |

## 6. Not Yet Covered (Future Tips)
These confusions don't have tips yet — candidates for future expansion.

- **Draggable block vs editor dragging**: Confusion between the "set drag mode" block and normal editor interaction
- **Backpack usage**: Don't know the backpack exists or how to use it
- **Sound editor trimming**: Don't know how to trim recordings
- **Vector editor multi-select**: Don't know how to select multiple objects
- **Stage size awareness**: Don't know the stage is 480×360
- **Variable scope**: "for this sprite only" vs "for all sprites"
- **String vs number confusion**: Variables holding unexpected types
- **Broadcast name mismatch**: Send and receive using different message names
