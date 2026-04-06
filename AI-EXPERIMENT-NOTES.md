# AI Code Suggestions Experiment — Lessons Learned

Notes from building an on-device Gemma integration for generating Scratch code, March–April 2026.

## What We Built

A system that runs Google's Gemma LLM in the browser (via MediaPipe WebGPU) to generate Scratch block scripts from natural language prompts. The pipeline:

1. User types a prompt ("make the cat walk and bounce off edges")
2. System builds a scratchblocks-formatted prompt with syntax rules, examples, and the sprite's current code
3. Gemma generates scratchblocks text
4. Parser validates and normalizes the output (fixing common model hallucinations)
5. Converter transforms scratchblocks text into VM block objects
6. Blocks are inserted into the project via `vm.shareBlocksToTarget()`

Key files:
- `packages/scratch-gui/src/lib/ai-model-manager.js` — model download, OPFS caching, load modal
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

---

## End-to-End Testing System

### Goal

Test the complete AI code generation pipeline: model inference through VM execution and state verification. This validates that the prompt template, model output, parser, block converter, and VM integration all work together correctly.

### Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐
│ Test Runner  │───>│ Prompt       │───>│ Gemma LLM    │───>│ Parse &     │
│ (Playwright) │    │ Template     │    │ (on-device)  │    │ Normalize   │
└─────────────┘    └──────────────┘    └──────────────┘    └──────┬──────┘
                                                                  │
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────▼──────┐
│ Assert VM   │<───│ Run Green    │<───│ Insert into  │<───│ Convert to  │
│ State       │    │ Flag (2s)    │    │ Project      │    │ VM Blocks   │
└─────────────┘    └──────────────┘    └──────────────┘    └─────────────┘
```

### Why CDP, Not Playwright

All E2E testing during development should use the **Chrome DevTools Protocol (CDP)** approach via `ai-cdp-test.js`, not Playwright. Reasons:

1. **Claude (or any AI coding assistant) can run CDP tests directly.** The test harness is a simple Node.js script that connects to a running Chrome instance. No special test runner, no browser lifecycle management, no Playwright binary version issues.
2. **Faster iteration.** The browser stays open between test runs. No cold-start per test. Model stays loaded in memory across prompts.
3. **Real browser, real GPU.** CDP connects to the developer's actual Chrome — the same environment users will see. No headless quirks, no SwiftShader detection, no OPFS fallback paths.
4. **No build artifact patching.** The editor runs from `npm start` (dev server on port 8601). No need to patch `gui.js`, redirect URLs, or manage a test HTTP server.
5. **Interactive debugging.** `--interactive` mode lets you iterate on prompts in a REPL. Inspect state, try variations, see raw model output — all without restarting anything.

Playwright tests are still useful for CI and UI-only tests (button visibility, modal behavior) that don't need the model. But for AI integration testing during development, CDP is the right tool.

### Prerequisites

- Chrome running with remote debugging: `open -a "Google Chrome" --args --remote-debugging-port=9222`
- Dev server running: `npm start` in `packages/scratch-gui/` (serves on port 8601)
- Model loaded in the browser (trigger via the AI suggest button once, then cached for the session)

### Test Flow (per prompt)

The CDP test harness (`packages/scratch-gui/test/playwright/ai-cdp-test.js`) handles the full cycle:

1. **Reset project** — delete extra sprites, clear all blocks from Sprite1
2. **Capture baseline** — record sprite position, direction, size, effects, etc.
3. **Generate code** — call the model via `window.__aiGenerate(prompt)` or the full `generateCodeSuggestion` pipeline
4. **Validate scratchblocks** — check the preview text for expected patterns
5. **Verify block structure** — check that generated VM blocks contain expected opcodes
6. **Insert blocks** — call `addBlocksToWorkspace(vm, blocks)`
7. **Run the project** — click green flag, wait 2 seconds
8. **Assert VM state** — compare sprite state against expectations:
   - Position changed (for motion blocks)
   - Say/think bubble visible (for looks blocks)
   - Variable values (for data blocks)
   - Clone count (for clone blocks)
   - Sound playing (for sound blocks)

### Usage

```bash
# Test a single prompt
node test/playwright/ai-cdp-test.js "make the cat walk and bounce off edges"

# Run all built-in test prompts
node test/playwright/ai-cdp-test.js --all

# Interactive mode — iterate on prompts in a REPL
node test/playwright/ai-cdp-test.js --interactive
```

### How Claude Should Use This

When working on AI code suggestions, Claude should:
1. Make code changes to the parser, normalizer, block converter, or prompt template
2. Ask the user to rebuild (`npm start` hot-reloads, or `npm run build` for Playwright tests)
3. Run specific test prompts via CDP to verify the change works end-to-end
4. Use `--all` to run the full prompt suite as a regression check
5. Inspect raw model output in the logs to diagnose parser/normalizer issues

The CDP harness exposes helpers for reading VM state directly:
- `getSpritePos()`, `getSpriteDirection()`, `getSpriteSize()`, `getSpriteVisible()`
- `getBlockCount()`, `getBlockOpcodes()`, `getBubbleText()`
- `getFullState()` — snapshot of all sprite properties

### Test Prompts Catalog

Each test case defines:
```js
{
    name: 'move forward',
    prompt: 'move the sprite 100 steps forward',
    requiredOpcodes: ['motion_movesteps'],
    verify: (state) => state.x !== 0  // sprite moved from origin
}
```

Categories to cover:
- **Motion:** move, turn, go to, glide, point, bounce, position changes
- **Looks:** say, think, show/hide, size, costume, effects
- **Sound:** play sound, volume, tempo
- **Control:** forever, repeat, if/then, wait, clone
- **Sensing:** ask, key pressed, touching
- **Data:** set variable, change variable, lists
- **Combinations:** forever + move + bounce, if touching + broadcast, etc.

### Reliability Considerations

- **Non-deterministic output:** LLM responses vary between runs. Tests should assert loose properties (sprite moved, block count > 0) not exact values.
- **Timeout budget:** Model load ~3–5 min first time (cached in OPFS after). Inference ~10–60 sec per prompt depending on complexity.
- **Flakiness mitigation:** Allow 1 retry per prompt. Log raw model output on failure for debugging.

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

| Metric | Target | Notes |
|---|---|---|
| Model download | < 3 min on 50 Mbps | ~2 GB for Gemma 4 E2B |
| Model load (cached) | < 10 sec | From OPFS/Cache API to WebGPU |
| Code generation | < 30 sec | For a 10-block script |
| Explanation | < 15 sec | Short text output |
| Summarization | < 20 sec per sprite | Can run in background |
| Speech recognition | < 3 sec | For a short utterance |

### Hardware Requirements

- **Minimum:** 4 GB RAM, WebGPU-capable browser (Chrome 128+)
- **Recommended:** 8 GB RAM, discrete GPU or Apple Silicon
- **Not supported:** Devices without WebGPU (older browsers, most mobile), SwiftShader-only environments
- **Graceful degradation:** Detect capabilities at startup. Offer cloud fallback for devices that can't run on-device inference. Show clear messaging about why on-device isn't available.
