// The lifecycle + requestAnimationFrame runtime.
//
// On `start(project)` we snapshot every sprite into a mutable RuntimeSprite, compile
// each sprite's generated JS into lifecycle handlers, run the onStart handlers, and
// begin a RAF tick loop. Each tick advances time and invokes onFrame handlers; the
// renderer then draws the live sprite states. Pointer/keyboard events fan out to the
// matching handlers. Editing a sprite's code while running hot-swaps that sprite's
// handlers in place, preserving its live position — "live enough" without the
// complexity of per-chunk evaluation.
import { flattenSprites, type Asset, type Project, type SpriteNode } from '../model/project'
import {
  createHandlers,
  createSpriteApi,
  type RuntimeEnvironment,
  type SpriteApi,
  type SpriteHandlers,
  type SpriteState,
} from './sprite-api'

export interface RuntimeSprite {
  state: SpriteState
  costumes: Asset[]
  handlers: SpriteHandlers
  api: SpriteApi
  /** Compile error message, if the generated code failed to compile. */
  error: string | null
}

/** A sprite reduced to just what the renderer needs to draw it. */
export interface RenderableSprite {
  id: string
  x: number
  y: number
  direction: number
  size: number
  visible: boolean
  costume: Asset | null
  sayText: string | null
}

export interface RenderTarget {
  render(sprites: RenderableSprite[]): void
}

const toRenderable = (sprite: RuntimeSprite): RenderableSprite => ({
  id: sprite.state.id,
  x: sprite.state.x,
  y: sprite.state.y,
  direction: sprite.state.direction,
  size: sprite.state.size,
  visible: sprite.state.visible,
  costume: sprite.costumes[sprite.state.currentCostume] ?? null,
  sayText: sprite.state.sayText,
})

/** Compile a sprite's source into freshly-registered handlers. Throws on syntax/eval errors. */
const compileInto = (source: string, api: SpriteApi, handlers: SpriteHandlers): void => {
  // Reset any previously registered handlers (used when hot-swapping).
  handlers.start.length = 0
  handlers.frame.length = 0
  handlers.click.length = 0
  handlers.key.clear()
  if (!source.trim()) return
  // `new Function` is the deliberately-simple execution choice for this prototype.
  // Hardening (Web Worker / sandboxed iframe) is noted as future work — running
  // generated code in-page trades isolation for liveness and zero runtime overhead.
  const factory = new Function('api', `"use strict";\n${source}`) as (api: SpriteApi) => void
  factory(api)
}

const makeRuntimeSprite = (node: SpriteNode, env: RuntimeEnvironment): RuntimeSprite => {
  const state: SpriteState = {
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    direction: node.direction,
    size: node.size,
    visible: node.visible,
    costumeCount: node.costumes.length,
    currentCostume: node.currentCostume,
    sayText: null,
    sayUntil: null,
  }
  const handlers = createHandlers()
  const api = createSpriteApi(state, handlers, env)
  const sprite: RuntimeSprite = { state, costumes: node.costumes, handlers, api, error: null }
  try {
    compileInto(node.code.source, api, handlers)
  } catch (err) {
    sprite.error = err instanceof Error ? err.message : String(err)
    console.warn(`[vibe-runtime] failed to compile sprite "${node.name}":`, err)
  }
  return sprite
}

export class Runtime {
  private sprites: RuntimeSprite[] = []
  private spritesById = new Map<string, RuntimeSprite>()
  private renderer: RenderTarget | null = null
  private rafId: number | null = null
  private lastTime = 0
  private _running = false

  readonly env: RuntimeEnvironment = {
    mouseX: 0,
    mouseY: 0,
    keysDown: new Set<string>(),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  }

  /** Callbacks fired when the running state flips, so the UI can update controls. */
  private runningListeners = new Set<(running: boolean) => void>()

  get running(): boolean {
    return this._running
  }

  setRenderer(renderer: RenderTarget | null): void {
    this.renderer = renderer
  }

  onRunningChange(listener: (running: boolean) => void): () => void {
    this.runningListeners.add(listener)
    return () => this.runningListeners.delete(listener)
  }

  private setRunning(running: boolean): void {
    if (this._running === running) return
    this._running = running
    for (const listener of this.runningListeners) listener(running)
  }

  getSprite(id: string): RuntimeSprite | undefined {
    return this.spritesById.get(id)
  }

  /** All live runtime sprites. Handy for debugging and tests. */
  getAllSprites(): RuntimeSprite[] {
    return this.sprites
  }

  /** Snapshot the project, compile all sprites, fire onStart and begin ticking. */
  start(project: Project): void {
    this.stop()
    const nodes = flattenSprites(project.roots)
    this.sprites = nodes.map((node) => makeRuntimeSprite(node, this.env))
    this.spritesById = new Map(this.sprites.map((sprite) => [sprite.state.id, sprite]))
    for (const sprite of this.sprites) {
      for (const handler of sprite.handlers.start) {
        this.safeCall(sprite, handler)
      }
    }
    this.setRunning(true)
    this.lastTime = this.env.now()
    this.render()
    this.scheduleNextFrame()
  }

  stop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId)
    }
    this.rafId = null
    this.sprites = []
    this.spritesById.clear()
    this.setRunning(false)
  }

  /** Advance the simulation by `dtMs` and render once. Public so tests can tick deterministically. */
  tickOnce(dtMs: number): void {
    const dtSeconds = dtMs / 1000
    const now = this.env.now()
    for (const sprite of this.sprites) {
      for (const handler of sprite.handlers.frame) {
        this.safeCall(sprite, () => handler(dtSeconds))
      }
      // Expire timed say bubbles.
      if (sprite.state.sayUntil !== null && now >= sprite.state.sayUntil) {
        sprite.state.sayText = null
        sprite.state.sayUntil = null
      }
    }
    this.render()
  }

  private scheduleNextFrame(): void {
    if (typeof requestAnimationFrame !== 'function') return
    this.rafId = requestAnimationFrame((now) => {
      const dt = now - this.lastTime
      this.lastTime = now
      // Clamp dt to avoid huge jumps after a tab is backgrounded.
      this.tickOnce(Math.min(dt, 100))
      if (this._running) this.scheduleNextFrame()
    })
  }

  /** Hot-swap a single sprite's behavior while preserving its live position. */
  updateSpriteCode(id: string, source: string): void {
    const sprite = this.spritesById.get(id)
    if (!sprite) return
    sprite.error = null
    try {
      compileInto(source, sprite.api, sprite.handlers)
      // Re-run onStart so newly added initialization takes effect immediately.
      for (const handler of sprite.handlers.start) {
        this.safeCall(sprite, handler)
      }
    } catch (err) {
      sprite.error = err instanceof Error ? err.message : String(err)
    }
    this.render()
  }

  // --- input ---

  setMouse(x: number, y: number): void {
    this.env.mouseX = x
    this.env.mouseY = y
  }

  handleKey(key: string): void {
    for (const sprite of this.sprites) {
      const list = sprite.handlers.key.get(key)
      if (list) {
        for (const handler of list) this.safeCall(sprite, handler)
      }
    }
  }

  /** Fire click handlers for the topmost sprite whose bounding box contains (x, y). */
  handleStageClick(x: number, y: number): void {
    for (let i = this.sprites.length - 1; i >= 0; i -= 1) {
      const sprite = this.sprites[i]
      if (!sprite.state.visible) continue
      const half = (40 * sprite.state.size) / 100 // costumes are ~80px; half-extent in stage units
      if (Math.abs(x - sprite.state.x) <= half && Math.abs(y - sprite.state.y) <= half) {
        for (const handler of sprite.handlers.click) this.safeCall(sprite, handler)
        return
      }
    }
  }

  private safeCall(sprite: RuntimeSprite, fn: () => void): void {
    try {
      fn()
    } catch (err) {
      sprite.error = err instanceof Error ? err.message : String(err)
      console.warn(`[vibe-runtime] error in sprite "${sprite.state.name}":`, err)
    }
  }

  private render(): void {
    if (this.renderer) {
      this.renderer.render(this.sprites.map(toRenderable))
    }
  }
}
