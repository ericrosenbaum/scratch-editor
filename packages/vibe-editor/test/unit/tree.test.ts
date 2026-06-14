import { describe, expect, it } from 'vitest'
import {
  createSampleProject,
  findNode,
  flattenSprites,
  insertChild,
  isSprite,
  removeNode,
  updateNode,
} from '../../src/model/project'
import { createInitialState, editorReducer, type EditorState } from '../../src/model/store'

describe('tree helpers', () => {
  it('finds nested nodes and flattens sprites', () => {
    const project = createSampleProject()
    const sprites = flattenSprites(project.roots)
    // Cat, Hat (nested in Cat), Ball
    expect(sprites.map((s) => s.name).sort()).toEqual(['Ball', 'Cat', 'Hat'])
    const hat = sprites.find((s) => s.name === 'Hat')!
    expect(findNode(project.roots, hat.id)).toBe(hat)
  })

  it('updateNode and removeNode are immutable', () => {
    const project = createSampleProject()
    const cat = flattenSprites(project.roots).find((s) => s.name === 'Cat')!
    const updated = updateNode(project.roots, cat.id, (node) => ({ ...node, name: 'Kitty' }))
    expect(project.roots).not.toBe(updated)
    expect((findNode(updated, cat.id) as { name: string }).name).toBe('Kitty')
    // Original is untouched.
    expect((findNode(project.roots, cat.id) as { name: string }).name).toBe('Cat')

    const without = removeNode(project.roots, cat.id)
    expect(findNode(without, cat.id)).toBeNull()
  })

  it('insertChild nests a node under a parent', () => {
    const project = createSampleProject()
    const ball = flattenSprites(project.roots).find((s) => s.name === 'Ball')!
    const child = { ...ball, id: 'child', name: 'BallChild', children: [] }
    const next = insertChild(project.roots, ball.id, child)
    const parent = findNode(next, ball.id)!
    expect(parent.children.map((c) => c.id)).toContain('child')
  })
})

describe('editorReducer', () => {
  const initial = (): EditorState => createInitialState()

  it('selects the first sprite initially', () => {
    const state = initial()
    const selected = findNode(state.project.roots, state.selectedId!)
    expect(selected && isSprite(selected) && selected.name).toBe('Cat')
  })

  it('ADD_SPRITE adds and selects a new sprite', () => {
    const before = initial()
    const countBefore = flattenSprites(before.project.roots).length
    const after = editorReducer(before, { type: 'ADD_SPRITE' })
    expect(flattenSprites(after.project.roots).length).toBe(countBefore + 1)
    expect(after.selectedId).not.toBe(before.selectedId)
  })

  it('SET_SPRITE_CODE updates a sprite code blob', () => {
    const before = initial()
    const after = editorReducer(before, {
      type: 'SET_SPRITE_CODE',
      id: before.selectedId!,
      code: { summary: 'new summary', source: 'api.onFrame(() => {});' },
    })
    const sprite = findNode(after.project.roots, before.selectedId!)
    expect(sprite && isSprite(sprite) && sprite.code.summary).toBe('new summary')
  })

  it('DELETE_NODE removes a node and clears selection', () => {
    const before = initial()
    const after = editorReducer(before, { type: 'DELETE_NODE', id: before.selectedId! })
    expect(findNode(after.project.roots, before.selectedId!)).toBeNull()
    expect(after.selectedId).toBeNull()
  })

  it('TOGGLE_EXPAND flips the expanded flag', () => {
    const before = initial()
    const sceneId = before.project.roots[0].id
    const expandedBefore = before.project.roots[0].expanded
    const after = editorReducer(before, { type: 'TOGGLE_EXPAND', id: sceneId })
    expect(findNode(after.project.roots, sceneId)!.expanded).toBe(!expandedBefore)
  })
})
