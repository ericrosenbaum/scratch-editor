import { describe, expect, it } from 'vitest'
import { MockCodeGenerator } from '../../src/codegen/mock-codegen'
import { createSampleProject, createSprite, flattenSprites, type Project } from '../../src/model/project'

const gen = new MockCodeGenerator()

const projectWithOneSprite = (): { project: Project; spriteId: string } => {
  const sprite = { ...createSprite({ name: 'Cat' }), id: 'cat' }
  return { project: { name: 'T', roots: [sprite] }, spriteId: 'cat' }
}

describe('MockCodeGenerator', () => {
  it('maps "spin" to a turning behavior', async () => {
    const { project, spriteId } = projectWithOneSprite()
    const result = await gen.generate({ scope: 'sprite', prompt: 'make it spin', targetId: spriteId, project })
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].source).toContain('api.turn(')
    expect(result.changes[0].summary).toMatch(/spins/i)
  })

  it('maps "say hello" to an onClick say behavior', async () => {
    const { project, spriteId } = projectWithOneSprite()
    const result = await gen.generate({ scope: 'sprite', prompt: 'say hello there', targetId: spriteId, project })
    expect(result.changes[0].source).toContain('api.onClick')
    expect(result.changes[0].source).toContain('api.say(')
    expect(result.changes[0].source).toContain('hello there')
  })

  it('combines multiple behaviors from one prompt', async () => {
    const { project, spriteId } = projectWithOneSprite()
    const result = await gen.generate({
      scope: 'sprite',
      prompt: 'spin and say hi when clicked',
      targetId: spriteId,
      project,
    })
    expect(result.changes[0].source).toContain('api.turn(')
    expect(result.changes[0].source).toContain('api.say(')
  })

  it('falls back to a default behavior for unrecognized prompts', async () => {
    const { project, spriteId } = projectWithOneSprite()
    const result = await gen.generate({ scope: 'sprite', prompt: 'asdfghjkl', targetId: spriteId, project })
    expect(result.changes[0].source).toContain('api.onFrame')
    expect(result.changes[0].summary).toMatch(/default behavior/i)
  })

  it('applies project-scoped prompts to every sprite', async () => {
    const project = createSampleProject()
    const spriteCount = flattenSprites(project.roots).length
    const result = await gen.generate({ scope: 'project', prompt: 'move around', project })
    expect(result.changes).toHaveLength(spriteCount)
    expect(spriteCount).toBeGreaterThan(1)
  })

  it('asks the user to select a sprite when none is targeted', async () => {
    const { project } = projectWithOneSprite()
    const result = await gen.generate({ scope: 'sprite', prompt: 'spin', project })
    expect(result.changes).toHaveLength(0)
    expect(result.message).toMatch(/select a sprite/i)
  })

  it('produces source that is valid, runnable JavaScript', async () => {
    const prompts = ['spin', 'move and bounce', 'follow the mouse', 'use the arrow keys', 'grow', 'say hi']
    for (const prompt of prompts) {
      const { project, spriteId } = projectWithOneSprite()
      const result = await gen.generate({ scope: 'sprite', prompt, targetId: spriteId, project })
      const source = result.changes[0].source
      // Must compile against the api argument without throwing.
      expect(() => new Function('api', `"use strict";\n${source}`)).not.toThrow()
    }
  })
})
