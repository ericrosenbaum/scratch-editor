import { describe, expect, it } from 'vitest'
import { createSprite, type Project } from '../../src/model/project'
import { Runtime } from '../../src/runtime/runtime'
import { createSpriteApi, createHandlers, normalizeDirection, type SpriteState } from '../../src/runtime/sprite-api'

const makeState = (overrides: Partial<SpriteState> = {}): SpriteState => ({
  id: 's1',
  name: 'S',
  x: 0,
  y: 0,
  direction: 90,
  size: 100,
  visible: true,
  costumeCount: 1,
  currentCostume: 0,
  sayText: null,
  sayUntil: null,
  ...overrides,
})

describe('sprite API math', () => {
  it('moves in the pointed direction (90 = right)', () => {
    const state = makeState()
    const api = createSpriteApi(state, createHandlers(), { mouseX: 0, mouseY: 0, keysDown: new Set(), now: () => 0 })
    api.move(10)
    expect(state.x).toBeCloseTo(10)
    expect(state.y).toBeCloseTo(0)
  })

  it('moves up when direction is 0', () => {
    const state = makeState({ direction: 0 })
    const api = createSpriteApi(state, createHandlers(), { mouseX: 0, mouseY: 0, keysDown: new Set(), now: () => 0 })
    api.move(10)
    expect(state.x).toBeCloseTo(0)
    expect(state.y).toBeCloseTo(10)
  })

  it('turns clockwise and normalizes direction', () => {
    const state = makeState({ direction: 170 })
    const api = createSpriteApi(state, createHandlers(), { mouseX: 0, mouseY: 0, keysDown: new Set(), now: () => 0 })
    api.turn(30)
    expect(state.direction).toBe(-160)
  })

  it('normalizeDirection wraps into (-180, 180]', () => {
    expect(normalizeDirection(190)).toBe(-170)
    expect(normalizeDirection(-190)).toBe(170)
    expect(normalizeDirection(360)).toBe(0)
  })
})

const projectWith = (source: string): Project => ({
  name: 'T',
  roots: [{ ...createSprite({ name: 'Mover', x: 0, y: 0 }), id: 'mover', code: { summary: '', source } }],
})

describe('Runtime', () => {
  it('compiles generated code and advances it on each tick', () => {
    const runtime = new Runtime()
    runtime.start(projectWith('api.onFrame(() => api.turn(10));'))
    const before = runtime.getSprite('mover')!.state.direction
    runtime.tickOnce(16)
    runtime.tickOnce(16)
    const after = runtime.getSprite('mover')!.state.direction
    expect(after).not.toBe(before)
    runtime.stop()
    expect(runtime.running).toBe(false)
  })

  it('runs onStart handlers immediately on start', () => {
    const runtime = new Runtime()
    runtime.start(projectWith('api.onStart(() => api.setX(123));'))
    expect(runtime.getSprite('mover')!.state.x).toBe(123)
  })

  it('captures compile errors without throwing', () => {
    const runtime = new Runtime()
    runtime.start(projectWith('this is not valid javascript ('))
    expect(runtime.getSprite('mover')!.error).toBeTruthy()
  })

  it('hot-swaps behavior while running', () => {
    const runtime = new Runtime()
    runtime.start(projectWith('api.onFrame(() => api.turn(10));'))
    runtime.updateSpriteCode('mover', 'api.onStart(() => api.setSize(50));')
    expect(runtime.getSprite('mover')!.state.size).toBe(50)
  })

  it('fires click handlers when the sprite is hit', () => {
    const runtime = new Runtime()
    runtime.start(projectWith("api.onClick(() => api.say('hi'));"))
    runtime.handleStageClick(0, 0)
    expect(runtime.getSprite('mover')!.state.sayText).toBe('hi')
  })
})
