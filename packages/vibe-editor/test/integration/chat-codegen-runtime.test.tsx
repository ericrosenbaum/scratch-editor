// End-to-end loop with a mocked generator, exercised through the real UI:
//   type a prompt -> (mock) codegen returns JS + summary -> apply to the sprite ->
//   press Run -> the runtime executes the generated code and the sprite behaves.
//
// This is the integration coverage the plan calls for: the chat/codegen/runtime
// wiring is verified without any real model, by driving the actual components.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/App'
import type { Runtime } from '../../src/runtime/runtime'

const getRuntime = (): Runtime => {
  const runtime = (globalThis as { __vibeRuntime?: Runtime }).__vibeRuntime
  if (!runtime) throw new Error('runtime was not exposed on window')
  return runtime
}

afterEach(() => {
  getRuntime().stop()
  cleanup()
})

describe('chat -> codegen -> runtime', () => {
  it('generates a behavior from a prompt and runs it on the stage', async () => {
    const user = userEvent.setup()
    render(<App />)

    // The sample project selects "Cat" by default; prompt scope defaults to the
    // selected sprite. Ask for a *move* behavior (distinct from the Cat's starter
    // spin) so we can prove the generated code — not the original — is running.
    const input = screen.getByLabelText('Prompt')
    await user.type(input, 'walk forward and bounce off the edges')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    // The generated summary appears in the chat transcript (reply + card).
    const messages = screen.getByTestId('chat-messages')
    const summaryHits = await within(messages).findAllByText(/Glides forward and bounces/i)
    expect(summaryHits.length).toBeGreaterThan(0)

    // Run the project, then tick the runtime deterministically.
    await user.click(screen.getByRole('button', { name: 'Run' }))
    const runtime = getRuntime()
    const cat = runtime.getAllSprites().find((s) => s.state.name === 'Cat')
    expect(cat).toBeDefined()

    const startX = cat!.state.x
    const startDirection = cat!.state.direction
    for (let i = 0; i < 5; i += 1) runtime.tickOnce(16)

    // The generated "move" behavior advanced X but left direction alone — confirming
    // the freshly generated code (not the starter spin) is what executed.
    expect(cat!.state.x).not.toBe(startX)
    expect(cat!.state.direction).toBe(startDirection)
  })

  it('updates the sprite code blob shown in the Code view', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Prompt'), 'spin really fast')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    // The Code view (default tab) reflects the new summary, and the editable
    // source contains the generated call.
    const summaries = await screen.findAllByText(/Spins clockwise continuously/i)
    expect(summaries.length).toBeGreaterThan(0)
    const source = screen.getByLabelText('JavaScript source') as HTMLTextAreaElement
    expect(source.value).toContain('api.turn(')
  })
})
