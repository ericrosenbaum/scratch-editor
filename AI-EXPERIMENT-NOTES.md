# AI Code Suggestions Experiment — Lessons Learned

Notes from building an on-device Gemma integration for generating Scratch code, March–April 2026.

## What We Built

A system that runs Google's Gemma LLM in the browser (via MediaPipe WebGPU) to generate Scratch block scripts from natural language prompts. Two approaches were tried:

### V1: Scratchblocks Text Format

1. User types a prompt ("make the cat walk and bounce off edges")
2. System builds a scratchblocks-formatted prompt with syntax rules, examples, and the sprite's current code
3. Gemma generates scratchblocks text
4. Parser validates and normalizes the output (fixing common model hallucinations)
5. Converter transforms scratchblocks text into VM block objects
6. Blocks are inserted into the project via `vm.shareBlocksToTarget()`

### V2: SB2 JSON Format (current)

Switched to generating Scratch 2.0 (SB2) JSON directly, which eliminated the need for the scratchblocks parser and normalizer (~850 lines). The pipeline is simpler:

1. User clicks a sparkle button in the blocks workspace (visible when the AI model is ready)
2. Modal opens with a text input for a natural language prompt
3. System builds a prompt with Gemma 4 turn tokens, SB2 format rules, opcode signatures, and few-shot examples
4. Gemma generates SB2 JSON: `[[x, y, [["whenGreenFlag"], ["doForever", [["forward:", 10]]]]]]`
5. Bracket repair fixes common JSON malformations (excess trailing brackets)
6. `vm.shareSB2BlocksToTarget()` parses SB2 arrays into SB3 blocks via the existing `sb2.parseToShare()` pipeline
7. Blocks are inserted into the current sprite's workspace

Key files (V2):
- `packages/scratch-gui/src/lib/ai-model-service.js` — model download, OPFS caching, load modal, `generate()` API
- `packages/scratch-gui/src/lib/ai-code-system-prompt.js` — system prompt, few-shot examples, and `buildPrompt()` (Gemma 4 turn token formatting)
- `packages/scratch-gui/src/components/ai-code-button/` — sparkle button overlaid on blocks workspace
- `packages/scratch-gui/src/components/ai-code-modal/` — React modal UI for prompt input and code preview
- `packages/scratch-gui/src/containers/ai-code-modal.jsx` — generation logic, JSON extraction, block loading
- `packages/scratch-gui/src/reducers/modals.js` — `aiCodeModal` open/close state
- `packages/scratch-vm/src/serialization/sb2.js` — `parseToShare()` converts SB2 script arrays to SB3 blocks
- `packages/scratch-vm/src/virtual-machine.js` — `shareSB2BlocksToTarget()` method

Key files (V1, superseded):
- `packages/scratch-gui/src/lib/ai-code-suggestions.js` — prompt building, inference, parsing, block conversion (~850 lines)
- `packages/scratch-gui/src/lib/ai-prompt-template.js` — shared prompt template (CommonJS for Node/browser compat)
- `packages/scratch-gui/src/components/ai-suggestions-modal/` — React modal UI
- `packages/scratch-gui/src/reducers/ai-code-suggestions.js` — Redux state
- Also: an On-Device AI extension in scratch-vm (`scratch3_ConstrainedAI`) with vision, speech, and constrained-response blocks

---

## Bugs & Problems Encountered

### 1. OPFS Unavailable in Headless Chromium

**Problem:** The Origin Private File System (used to cache the ~2–3 GB model) is not available in headless Chromium, which is what Playwright uses.

**Impact:** Tests couldn't cache the model between runs. Each test suite re-downloaded from URL.

**Fix:** Added a fallback path — if OPFS write fails, load the model directly from the URL without caching. In tests, serve the model from a local HTTP server to avoid network dependency.

### 2. SwiftShader WebGPU Timeout

**Problem:** MediaPipe's LlmInference requires WebGPU. On machines without a real GPU, Chromium's SwiftShader (software-emulated GPU) works for small models but hits a 5-minute `DEADLINE_EXCEEDED` timeout with a 3B-parameter model.

**Impact:** E2E tests can't run on typical CI machines (no GPU). Tests must detect SwiftShader and skip.

**Detection approach:**
```js
const adapter = await navigator.gpu.requestAdapter();
const info = adapter.requestAdapterInfo?.() ?? adapter.info;
const isSwiftShader = info.description?.includes('SwiftShader');
```
Note: `requestAdapterInfo()` is the newer API; older Chromium only has `adapter.info`.

### 3. Playwright `route.fulfill()` Has a 2 GB Limit

**Problem:** Playwright's route interception can't serve files larger than 2 GB. The Gemma 3n model was ~3 GB.

**Impact:** Couldn't use Playwright's built-in route mocking to serve the model file.

**Fix:** Run a real HTTP server alongside tests using `http.createServer()` with `server.listen(0)` for dynamic port allocation (avoids EADDRINUSE conflicts between parallel test runs).

### 4. Playwright `route.continue()` Can't Redirect HTTPS to HTTP

**Problem:** When trying to redirect CDN model URLs (HTTPS) to a local test server (HTTP), `route.continue()` throws a protocol mismatch error.

**Fix:** Use `route.fulfill()` to serve the content directly, or patch the URLs in the built `gui.js` source before launching the browser.

### 5. Workers Must Be 1 When Patching Build Artifacts

**Problem:** Multiple Playwright workers running in parallel would race when patching the same `gui.js` file (replacing model/WASM URLs for local serving).

**Fix:** Set `workers: 1` in `playwright.config.js`.

### 6. Model Hallucinations in Scratchblocks Output

**Problem:** Gemma frequently generates plausible-but-wrong scratchblocks syntax. Common patterns:

| Model output | Correct syntax | Fix applied |
|---|---|---|
| `bounce` | `if on edge, bounce` | String replacement |
| `change angle by (15) degrees` | `turn right (15) degrees` | Regex normalization |
| `broadcast go` | `broadcast (go v)` | Add missing parentheses |
| `when I receive go` | `when I receive [go v]` | Add missing brackets |
| `when space key pressed` | `when [space v] key pressed` | Add brackets around key name |
| `play sound (pop v)` | `start sound (pop v)` | Fix verb |
| `move (10) steps to the right` | `move (10) steps` | Strip embellishments |

**Lesson:** The normalization layer (`normalizeScratchblocks`) is essential. Raw model output is unreliable for exact syntax matching. Each new model version may introduce new hallucination patterns — the normalizer should be maintained as a living list.

### 7. Orphan `end` Statements

**Problem:** The model sometimes generates more `end` statements than there are open control blocks, which breaks the nesting parser.

**Fix:** Count open C-shaped blocks during parsing. If an `end` has no matching opener, silently remove it.

### 8. `@mediapipe/tasks-genai` Disappears After npm Operations

**Problem:** Running `npm install` for other packages sometimes removes `@mediapipe/tasks-genai` from `node_modules/`.

**Cause:** The package was installed with `--no-save` (not in package.json), so npm considers it extraneous and cleans it up.

**Fix:** Either add it to `package.json` properly, or document the reinstall command: `npm install --no-save @mediapipe/tasks-genai@0.10.26`.

### 9. CSS Modules Class Name Mismatch in Tests

**Problem:** CSS class names are mangled by CSS Modules. Kebab-case in CSS (`.preview-code`) becomes camelCase in JS imports (`styles.previewCode`), but the actual DOM class contains the original kebab-case string.

**Fix:** Always use `[class*="preview-code"]` (kebab-case from the CSS file) in Playwright selectors, not the camelCase JS import name.

### 10. Gemma 3n to Gemma 4 Migration

**Problem:** When Gemma 4 released (April 2, 2026), we attempted to switch using `@huggingface/transformers` (ONNX + WebGPU). Multiple issues:

- **transformers.js + webpack:** The library uses `import.meta` extensively. Webpack 5 can't bundle it into UMD output. Setting `importMeta: false` in webpack config suppresses build warnings but causes runtime `SyntaxError: Cannot use 'import.meta' outside a module`. Loading from CDN via `/* webpackIgnore: true */` dynamic import avoids webpack processing but introduces CDN dependency.
- **Wrong Auto class:** The ONNX model's architecture is `Gemma4ForConditionalGeneration` (a VLM), but we used `AutoModelForCausalLM` which looks for `Gemma4ForCausalLM`. Error: `Unsupported model type: gemma4`. Fix: use `Gemma4ForConditionalGeneration` directly or `AutoModelForImageTextToText`.
- **Wrong dtype:** Used `dtype: 'q4'` but the model needs `'q4f16'`.
- **Simplest path:** A `.task` file for MediaPipe was already available at `litert-community/gemma-4-E2B-it-litert-lm` on HuggingFace. Just changing the model URL was all that was needed — no library swap required.

**Lesson:** Before switching inference frameworks, check if the new model is available in the format your existing framework already supports. MediaPipe's LiteRT `.task` format for Gemma 4 worked with zero code changes beyond the URL.

### 11. Stale OPFS Cache After Model Upgrade

**Problem:** Users who had Gemma 3n cached in OPFS (~3 GB as `gemma-model.bin`) will try to load the old model first after upgrading to Gemma 4. The old model file will fail to load with MediaPipe (wrong format).

**Current behavior:** Falls through to the download modal automatically, but the old cache wastes 3 GB of storage.

**Suggested fix:** Version the OPFS filename (e.g., `gemma-4-e2b.bin`) or store a version marker alongside the cached file, and delete stale caches on startup.

### 12. MediaPipe maxTokens is Input + Output Combined

**Problem:** MediaPipe's `LlmInference` `maxTokens` option is the total budget for input tokens AND output tokens combined, not just output. The initial value of `1024` was smaller than the system prompt alone (~1500 tokens), causing `INVALID_ARGUMENT: input_size(1530) was not less than maxTokens(1024)`.

**Fix:** Increased `maxTokens` to `4096`. The system prompt with few-shot examples uses ~1500 tokens, leaving ~2500 for generated output — sufficient for even complex multi-script responses.

### 13. Gemma 4 Requires Turn Tokens — Without Them, It Loops Endlessly

**Problem:** When prompting Gemma 4 E2B with raw text (no turn formatting), the model generates one plausible response and then immediately continues generating more "examples" — alternating between `<thinking>` and `<code>` blocks in an endless repetition loop until it hits the token limit.

**Root cause:** Without Gemma 4's turn tokens, the model has no signal for when to stop generating. It treats the entire context as a continuation task rather than a single-turn instruction.

**Fix:** Use Gemma 4's turn token format:
```
<|turn>system
{system instruction}<turn|>
<|turn>user
{example input}<turn|>
<|turn>model
{example output}<turn|>
<|turn>user
{actual user prompt}<turn|>
<|turn>model
```

The key is that the final `<|turn>model` has NO closing `<turn|>` — the model generates into this open turn and stops when it reaches a natural completion point. Few-shot examples must also use the turn format with proper closing tokens.

**Lesson:** Always check the model-specific prompt formatting documentation. Gemma 4 uses `<|turn>` / `<turn|>`, which is different from Gemma 2/3's `<start_of_turn>` / `<end_of_turn>`. Using the wrong format or no format at all causes catastrophic generation quality issues.

### 14. SB2 Opcode Hallucination — Model Abbreviates Long Opcodes

**Problem:** Gemma 4 E2B consistently abbreviates long SB2 opcodes by dropping suffixes:

| Model output | Correct opcode |
|---|---|
| `say:duration:` | `say:duration:elapsed:from:` |
| `glideSecs:` | `glideSecs:toX:y:elapsed:from:` |
| `wait:` | `wait:elapsed:from:` |
| `say:2` | `say:duration:elapsed:from:`, `2` (mashes value into opcode) |
| `whenKeyPressed:` | `whenKeyPressed` (adds spurious colon) |
| `mouseX:` | `mouseX` (adds spurious colon to reporter) |
| `createGraphicEffect` | (entirely hallucinated opcode) |

**Fix:** Two complementary approaches:

1. **Few-shot examples are the strongest fix.** Including a user/model turn pair that uses the exact opcode (e.g., `["say:duration:elapsed:from:", "hello", 2]`) dramatically reduces hallucination for that opcode. Just listing the opcode in a "valid opcodes" string is NOT sufficient — the model needs to see it used in context.

2. **Explicit signature documentation in the system prompt.** Adding lines like:
   ```
   - "say:duration:elapsed:from:" takes (text, seconds): ["say:duration:elapsed:from:", "hello", 2]
   - Hat blocks do NOT end with a colon. Use "whenKeyPressed" NOT "whenKeyPressed:"
   - Some reporters have NO colon: "mouseX", "mouseY", "mousePressed"
   ```
   These rules catch the most common error patterns.

**Lesson:** Small on-device models need more hand-holding than large cloud models. Every opcode that you expect the model to use correctly should appear in at least one few-shot example. The valid opcode list alone is not enough — the model treats it as a fuzzy reference, not a hard constraint.

### 15. SB2 Bracket Mismatches

**Problem:** The model frequently generates JSON with mismatched brackets — usually 1-2 excess trailing `]` characters. Less commonly, brackets are misplaced mid-string when generating multi-script output.

**Examples:**
- `[[5, 19, [["whenGreenFlag"], ["forward:", 10]]]]]` — two extra `]`
- `[[5, 19, [...]]]], [5, 80, [...]]]` — excess `]` between scripts

**Fix:** Bracket repair in the JSON parser:
1. First, try `JSON.parse()` as-is
2. If that fails, replace runs of 3+ consecutive `]` with `]]` (fixes mid-string excess)
3. Try progressively removing 1-5 trailing characters
4. Try adding 1-3 `]` (for unclosed brackets)

This handles ~95% of bracket errors. The remaining ~5% are unparseable and fail gracefully with an error message.

### 16. doForever Body Nesting

**Problem:** The model sometimes generates `["doForever", ["forward:", 10], ["bounceOffEdge"]]` instead of the correct `["doForever", [["forward:", 10], ["bounceOffEdge"]]]`. The difference is subtle — the body blocks need to be wrapped in an extra array layer.

**Fix:** Added a "CRITICAL" rule to the system prompt with a WRONG vs RIGHT example:
```
CRITICAL: "doForever" takes exactly ONE argument, which is an array of blocks: ["doForever", [["forward:", 10], ["bounceOffEdge"]]]
WRONG: ["doForever", ["forward:", 10], ["bounceOffEdge"]] -- blocks must be wrapped in an extra []
```

Showing the wrong form explicitly helped the model avoid it. This pattern also applies to `doRepeat`, `doIf`, and `doIfElse`.

### 17. Multiple Hat Blocks Need Separate Scripts

**Problem:** When the model generates code with multiple hat blocks (e.g., 4 arrow key handlers), it sometimes puts them all in one script array instead of separate `[x, y, [blocks]]` entries. Only the first hat block works; the rest are treated as regular blocks (and fail silently).

**Fix:** Added a rule ("Each hat block starts a NEW script") and a few-shot example showing 4 separate `whenKeyPressed` scripts with different y-coordinates. The model copies the pattern reliably.

---

## End-to-End Testing System

### Architecture

Two CDP-based test scripts exist, each serving a different purpose:

1. **`packages/scratch-gui/test/ai-cdp-harness.js`** — Automated harness for Claude Code. Outputs structured JSON to stdout. Designed for programmatic iteration: generate → evaluate → adjust prompt → retry.

2. **`packages/scratch-gui/test/playwright/ai-cdp-test.js`** — Interactive harness for human developers. Supports `--all`, `--interactive` (REPL), and single-prompt modes. Outputs human-readable logs.

Both connect to Chrome via CDP (port 9222) and access:
- `window.__aiGenerate(prompt)` — model inference (exposed by `ai-model-service.js`)
- `window.__aiModelLoaded` / `window.__aiModelStatus` — model state
- `window.__vm` — VM instance (exposed by `vm-manager-hoc.jsx`)

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ CDP Harness  │───>│ Build Prompt │───>│ Gemma 4 E2B  │───>│ Extract JSON │
│ (Node.js)    │    │ (turn tokens)│    │ (on-device)  │    │ + bracket fix│
└─────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                  │
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────▼───────┐
│ JSON output  │<───│ Read block   │<───│ Load via     │<───│ Validate     │
│ to stdout    │    │ count / state│    │ shareSB2...  │    │ opcodes      │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Why CDP, Not Playwright

1. **Claude Code can run tests directly.** The harness is a Node.js script — just `node test/ai-cdp-harness.js --prompt "..."`. No test runner, no browser lifecycle.
2. **Faster iteration.** Browser stays open, model stays loaded (~500ms–2s per generation vs minutes for cold start).
3. **Real browser, real GPU.** CDP connects to the developer's Chrome — no headless quirks, no SwiftShader issues.
4. **Prompt injection via CDP.** The `--system-prompt` flag lets you test prompt variations without rebuilding (webpack has no HMR, so file edits trigger full ~10-30s rebuilds).
5. **Structured output.** The harness outputs JSON with `success`, `rawResponse`, `jsonParsed`, `invalidOpcodes`, `blocksLoaded`, `blockCount` — easy for Claude Code to parse and act on.

### Prerequisites

```bash
# 1. Start Chrome with remote debugging
open -a "Google Chrome" --args --remote-debugging-port=9222

# 2. Start dev server (in editor root)
npm start

# 3. Open http://localhost:8601 in Chrome, wait for AI model to load
```

### Automated Harness Usage (ai-cdp-harness.js)

```bash
# Single prompt test — outputs JSON to stdout
node packages/scratch-gui/test/ai-cdp-harness.js --prompt "make the cat walk forward"

# Custom system prompt (no rebuild needed!)
node packages/scratch-gui/test/ai-cdp-harness.js \
  --prompt "make the cat walk" \
  --system-prompt-file /tmp/test-prompt.txt

# Generation only, skip loading blocks into VM
node packages/scratch-gui/test/ai-cdp-harness.js --prompt "..." --skip-load
```

**Output format:**
```json
{
  "success": true,
  "generationTimeMs": 504,
  "rawResponse": "[[5, 19, [[\"whenGreenFlag\"], [\"doForever\", [\"forward:\", 5]]]]]",
  "jsonParsed": true,
  "jsonParseError": null,
  "parsedScripts": [...],
  "invalidOpcodes": [],
  "blocksLoaded": true,
  "blocksLoadError": null,
  "blockCount": 4,
  "error": null
}
```

### How Claude Code Should Use This

The automated iteration loop:
1. Run `node packages/scratch-gui/test/ai-cdp-harness.js --prompt "..."` and read JSON output
2. If `success: true` — try more prompts to verify robustness
3. If `success: false` — check which step failed:
   - `jsonParsed: false` → bracket/syntax issue, adjust system prompt for JSON clarity
   - `invalidOpcodes: [...]` → model hallucinated opcode, add few-shot example using the correct one
   - `blocksLoadError: "..."` → structural issue, add rule about nesting
4. Write adjusted system prompt to `/tmp/test-prompt.txt`
5. Re-run with `--system-prompt-file /tmp/test-prompt.txt` (no rebuild needed)
6. Repeat until passing, then write the final prompt back to `ai-code-system-prompt.js`

**Important:** Wait 2-3 seconds between runs. MediaPipe's `LlmInference` can only handle one generation at a time — calling it while busy throws `Previous invocation or loading is still ongoing`.

### Interactive Harness Usage (ai-cdp-test.js)

```bash
# Single prompt with human-readable output
node packages/scratch-gui/test/playwright/ai-cdp-test.js "make the cat bounce"

# Run all built-in test prompts
node packages/scratch-gui/test/playwright/ai-cdp-test.js --all

# REPL mode — type prompts, inspect state, iterate
node packages/scratch-gui/test/playwright/ai-cdp-test.js --interactive
```

### Test Results (as of April 2026)

11 test prompts, ~91-100% pass rate (non-deterministic model output causes occasional bracket failures):

| Prompt | Typical Result |
|---|---|
| make the cat walk forward | PASS, ~500ms, 4 blocks |
| make the sprite bounce around forever | PASS, ~530ms, 4 blocks |
| make the sprite say hello for 2 seconds | PASS, ~530ms, 4 blocks |
| glide to a random position | PASS, ~1100ms, 11 blocks |
| make the sprite spin in circles | PASS, ~670ms, 4 blocks |
| change color effects in a loop | PASS, ~770ms, 4 blocks |
| when space key pressed, play a sound | PASS, ~500ms, 3 blocks |
| walk back and forth | PASS, ~1000ms, 10 blocks |
| hide and show repeatedly | PASS, ~650ms, 3 blocks |
| grow bigger when clicked | PASS (intermittent bracket fail), ~800ms |
| move with arrow keys | PASS, ~1800ms, 12 blocks (4 scripts) |

### Reliability Considerations

- **Non-deterministic output.** The same prompt produces different code each run. Tests assert structural properties (block count > 0, valid opcodes) not exact block sequences.
- **Bracket repair.** Handles ~95% of JSON malformations automatically. The remaining ~5% are unparseable and reported as errors.
- **Model concurrency.** MediaPipe LlmInference is single-threaded. Wait 2-3s between calls. Concurrent calls throw `Previous invocation or loading is still ongoing`.
- **Generation speed.** Simple prompts ~500ms, complex multi-script prompts ~1500-2000ms on Apple Silicon with GPU.

---

## Recommendations for a Production System

### Model Download & Caching

**Current state:** OPFS caching with streaming download and progress modal. Works well but has issues with cache invalidation and headless environments.

**Recommendations:**

1. **Version-aware caching.** Store model metadata (version, size hash) alongside the binary. On startup, compare against expected version. Delete stale caches automatically. Use a filename like `gemma-4-e2b-v1.task` instead of generic `gemma-model.bin`.

2. **Cache API as alternative to OPFS.** The browser Cache API (`caches.open()`) works in more environments than OPFS and is what `@huggingface/transformers` uses internally. Consider it as a fallback or primary storage.

3. **Progressive download with resume.** If the download is interrupted (user navigates away, network drop), the current implementation starts over. Use HTTP Range requests to resume from where it left off. Store the partial file and byte offset in OPFS.

4. **Background download.** Use a Service Worker to download and cache the model in the background without blocking the UI thread. Show a persistent notification bar instead of a modal.

5. **Size budget UI.** Show the user how much storage the model requires and how much is available (`navigator.storage.estimate()`). Warn if space is tight.

### Shared Model Manager

**Problem:** The AI code suggestions feature and the On-Device AI extension both load and manage the same Gemma model independently, with potential for conflicts (double loading, competing OPFS access).

**Recommendation: Single `AIModelService` module** consumed by all features:

```
┌────────────────────────────────────────────┐
│              AIModelService                 │
│                                            │
│  - download / cache management             │
│  - load into MediaPipe LlmInference        │
│  - request queue (serialize inference)      │
│  - expose generate(prompt) → text          │
│  - expose generateStream(prompt) → stream  │
│  - health check / model info               │
└───────┬───────┬───────┬───────┬───────┬────┘
        │       │       │       │       │
   Code Gen  Extension  Explain  Summary  Speech
```

Key design points:
- **Singleton with lazy init.** Don't load the model until the first consumer requests it.
- **Request queue.** MediaPipe LlmInference can only handle one request at a time. Queue concurrent requests and process them serially. Provide cancellation tokens for long-running generations.
- **Event bus.** Emit events for model status changes (`loading`, `ready`, `error`, `generating`) so all UI components can react (show spinners, disable buttons, etc.).
- **Warm-up.** After model loads, send a short warm-up prompt to initialize GPU pipelines. The first real inference after a cold load is always slower.

### Feature-Specific Recommendations

#### Code Generation (current feature)

- **Prompt versioning.** The prompt template is sensitive to exact wording. Version it and A/B test variants. Store the template version with generated output for debugging.
- **Multi-turn refinement.** Let users say "make it faster" or "add a sound" to refine generated code. Include the previous generation in the prompt context.
- **Streaming preview.** Show scratchblocks text as it streams from the model, rather than waiting for the full response. MediaPipe supports `generateResponseAsync()` with partial callbacks.
- **Block count guard.** Currently enforced by prompt instruction ("keep under 15 blocks"). Add a hard parser-level cutoff that stops processing after N blocks, in case the model ignores the instruction.
- **Custom blocks.** The current BLOCK_DEFS table covers ~60 standard blocks. Extensions add new blocks — consider a registry that extensions can contribute to, so the prompt and parser know about them.

#### Extensions (On-Device AI blocks)

The existing `scratch3_ConstrainedAI` extension provides blocks like "ask AI about stage image" and constrained-list responses. Recommendations:
- **Share the model instance.** Currently the extension and code suggestions each try to own the LlmInference instance. Route both through AIModelService.
- **Vision blocks.** Gemma 4 E2B supports image input natively. Expose "describe what you see on the stage" as a Scratch block that passes the stage canvas to the model.
- **Audio blocks.** Gemma 4 E2B supports audio input. Expose "what did you hear?" blocks that process microphone input.
- **Constrained output.** Use guided generation / logit biasing to constrain responses to a list of options (e.g., "is the sprite touching the edge? yes/no").

#### Code Explanation

- **Scope.** Let users select a script (or single block stack) and ask "what does this do?" Convert the selected blocks to scratchblocks text, then prompt: "Explain what this Scratch code does in simple terms for a young learner: {code}".
- **Reading level.** Scratch users range from age 8 to adult. Tailor explanation complexity. Default to simple; let advanced users opt into technical detail.
- **Inline tooltips.** Show explanations as hover tooltips on block stacks, not just in a modal.

#### Project & Sprite Summarization

- **Sprite behavior summary.** For each sprite, convert all scripts to scratchblocks text and prompt: "Summarize what this sprite does in 1–2 sentences." Display in a project overview panel.
- **Project summary.** Aggregate sprite summaries: "This project has 3 sprites. The cat walks back and forth, the ball bounces around, and the backdrop changes when you press space."
- **Diff summary.** After editing, summarize what changed: "You added a new script that makes the cat say 'hello' when clicked."
- **Token budget.** Large projects with many sprites and scripts can exceed the model's context window. Truncate or summarize individual sprites first, then combine.

#### Speech Recognition

- **Gemma 4 E2B supports audio input.** This could replace or supplement the existing cloud-based speech-to-text service in the Scratch text-to-speech extension.
- **Use cases:**
  - Voice coding: "make the cat move forward" → generates code (combines speech + code generation)
  - Voice control during project play: "say [recognized word]" block
  - Accessibility: voice navigation of the editor
- **Latency.** On-device speech recognition should be faster than cloud round-trips. But the model is large — test actual latency on target hardware (Chromebooks, iPads).
- **Language support.** Gemma 4 supports 140+ languages. This could significantly improve speech recognition for non-English Scratch users compared to cloud services that may have limited language coverage.

### Architecture for Pluggable AI Consumers

```
┌─────────────────────────────────────────────────────────┐
│                    AI Feature Registry                   │
│                                                          │
│  register(name, {                                        │
│    promptBuilder: (context) => string,                   │
│    responseParser: (text) => result,                     │
│    maxTokens: number,                                    │
│    priority: 'interactive' | 'background',               │
│    inputModalities: ['text'] | ['text','image','audio']  │
│  })                                                      │
└───────────────────────┬─────────────────────────────────┘
                        │
          ┌─────────────▼─────────────┐
          │       AIModelService       │
          │  (download, cache, infer)  │
          └─────────────┬─────────────┘
                        │
    ┌───────────┬───────┴───────┬───────────┐
    ▼           ▼               ▼           ▼
Code Gen   Explanation   Summarization   Speech
```

Each consumer registers with:
- **promptBuilder:** Constructs the prompt from context (selected blocks, stage image, audio buffer, etc.)
- **responseParser:** Validates and transforms the raw model output into a structured result
- **maxTokens:** Token budget for this use case (code gen needs more than yes/no questions)
- **priority:** Interactive requests (user waiting) get priority over background tasks (auto-summarization)
- **inputModalities:** What the model receives — text only, or also image/audio

The registry manages:
- **Queuing.** Interactive requests preempt background ones. Long background tasks can be cancelled.
- **Token allocation.** Total context window is shared. Registry ensures individual consumers don't exceed their budget.
- **Telemetry.** Log prompt templates, response times, success/failure rates per consumer for monitoring quality.

### Performance Targets

| Metric | Target | Actual (Apple Silicon) | Notes |
|---|---|---|---|
| Model download | < 3 min on 50 Mbps | ~2 min | ~2 GB for Gemma 4 E2B |
| Model load (cached) | < 10 sec | ~5 sec | From OPFS to WebGPU |
| Code generation (simple) | < 5 sec | ~500ms | Single-script, 3-5 blocks |
| Code generation (complex) | < 30 sec | ~1.5-2s | Multi-script, 10+ blocks |
| Explanation | < 15 sec | Not yet measured | Short text output |
| Summarization | < 20 sec per sprite | Not yet measured | Can run in background |
| Speech recognition | < 3 sec | Not yet measured | For a short utterance |

### Hardware Requirements

- **Minimum:** 4 GB RAM, WebGPU-capable browser (Chrome 128+)
- **Recommended:** 8 GB RAM, discrete GPU or Apple Silicon
- **Not supported:** Devices without WebGPU (older browsers, most mobile), SwiftShader-only environments
- **Graceful degradation:** Detect capabilities at startup. Offer cloud fallback for devices that can't run on-device inference. Show clear messaging about why on-device isn't available.
