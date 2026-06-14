// The helper API exposed to generated code. A sprite's generated JavaScript is a
// script body that receives a single `api` argument and registers lifecycle
// handlers and calls motion/looks helpers, e.g.:
//
//     api.onFrame(() => api.move(3));
//     api.onClick(() => api.say('Hi!', 1));
//
// This is the "set of helper functions in a simplified runtime" the product
// vision describes. Generated code never touches the DOM or the model directly —
// it only goes through this object, which keeps execution easy to reason about.
import { STAGE_HEIGHT, STAGE_WIDTH } from '../model/project'

export type FrameHandler = (dtSeconds: number) => void
export type SimpleHandler = () => void

export interface SpriteState {
  id: string
  name: string
  x: number
  y: number
  direction: number
  size: number
  visible: boolean
  costumeCount: number
  currentCostume: number
  sayText: string | null
  /** Performance.now() timestamp after which the say bubble disappears, or null for forever. */
  sayUntil: number | null
}

export interface RuntimeEnvironment {
  /** Mouse position in stage coordinates (center origin). */
  mouseX: number
  mouseY: number
  /** Set of currently-held key names (KeyboardEvent.key). */
  keysDown: Set<string>
  /** Monotonic clock; injectable so tests are deterministic. */
  now: () => number
}

export interface SpriteHandlers {
  start: SimpleHandler[]
  frame: FrameHandler[]
  click: SimpleHandler[]
  key: Map<string, SimpleHandler[]>
}

export const createHandlers = (): SpriteHandlers => ({
  start: [],
  frame: [],
  click: [],
  key: new Map(),
})

const clampToStage = (state: SpriteState): void => {
  const halfW = STAGE_WIDTH / 2
  const halfH = STAGE_HEIGHT / 2
  state.x = Math.max(-halfW, Math.min(halfW, state.x))
  state.y = Math.max(-halfH, Math.min(halfH, state.y))
}

/** Normalize a direction into the (-180, 180] range, matching Scratch. */
export const normalizeDirection = (direction: number): number => {
  let d = direction % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/**
 * Build the API object bound to a single sprite's live state + handler registry.
 * Registration methods (onStart/onFrame/...) push into `handlers`; action methods
 * mutate `state` in place. Generated code only ever sees this object.
 */
export const createSpriteApi = (state: SpriteState, handlers: SpriteHandlers, env: RuntimeEnvironment) => {
  const api = {
    // --- stage constants ---
    stageWidth: STAGE_WIDTH,
    stageHeight: STAGE_HEIGHT,

    // --- lifecycle registration ---
    onStart(fn: SimpleHandler) {
      handlers.start.push(fn)
    },
    onFrame(fn: FrameHandler) {
      handlers.frame.push(fn)
    },
    onClick(fn: SimpleHandler) {
      handlers.click.push(fn)
    },
    onKey(key: string, fn: SimpleHandler) {
      const list = handlers.key.get(key) ?? []
      list.push(fn)
      handlers.key.set(key, list)
    },

    // --- motion ---
    move(steps: number) {
      const radians = ((90 - state.direction) * Math.PI) / 180
      state.x += steps * Math.cos(radians)
      state.y += steps * Math.sin(radians)
      clampToStage(state)
    },
    turn(degrees: number) {
      // Positive = clockwise (turn right), matching Scratch's "turn right" block.
      state.direction = normalizeDirection(state.direction + degrees)
    },
    turnLeft(degrees: number) {
      state.direction = normalizeDirection(state.direction - degrees)
    },
    pointInDirection(direction: number) {
      state.direction = normalizeDirection(direction)
    },
    pointTowards(x: number, y: number) {
      const dx = x - state.x
      const dy = y - state.y
      state.direction = normalizeDirection(90 - (Math.atan2(dy, dx) * 180) / Math.PI)
    },
    goTo(x: number, y: number) {
      state.x = x
      state.y = y
      clampToStage(state)
    },
    setX(x: number) {
      state.x = x
      clampToStage(state)
    },
    setY(y: number) {
      state.y = y
      clampToStage(state)
    },
    changeX(dx: number) {
      state.x += dx
      clampToStage(state)
    },
    changeY(dy: number) {
      state.y += dy
      clampToStage(state)
    },
    /** If touching the edge, reflect the direction so the sprite "bounces". */
    ifOnEdgeBounce() {
      const halfW = STAGE_WIDTH / 2
      const halfH = STAGE_HEIGHT / 2
      if (state.x <= -halfW || state.x >= halfW) {
        state.direction = normalizeDirection(-state.direction)
      }
      if (state.y <= -halfH || state.y >= halfH) {
        state.direction = normalizeDirection(180 - state.direction)
      }
    },

    // --- looks ---
    say(text: string, seconds?: number) {
      state.sayText = String(text)
      state.sayUntil = typeof seconds === 'number' ? env.now() + seconds * 1000 : null
    },
    clearSay() {
      state.sayText = null
      state.sayUntil = null
    },
    show() {
      state.visible = true
    },
    hide() {
      state.visible = false
    },
    setSize(percent: number) {
      state.size = Math.max(5, percent)
    },
    changeSize(delta: number) {
      state.size = Math.max(5, state.size + delta)
    },
    nextCostume() {
      if (state.costumeCount > 0) {
        state.currentCostume = (state.currentCostume + 1) % state.costumeCount
      }
    },
    setCostume(index: number) {
      if (state.costumeCount > 0) {
        state.currentCostume = ((index % state.costumeCount) + state.costumeCount) % state.costumeCount
      }
    },

    // --- sensing / reporters ---
    getX: () => state.x,
    getY: () => state.y,
    getDirection: () => state.direction,
    getSize: () => state.size,
    mouseX: () => env.mouseX,
    mouseY: () => env.mouseY,
    isKeyDown: (key: string) => env.keysDown.has(key),
    random: (min: number, max: number) => min + Math.random() * (max - min),
    randomInt: (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1)),
  }
  return api
}

export type SpriteApi = ReturnType<typeof createSpriteApi>
