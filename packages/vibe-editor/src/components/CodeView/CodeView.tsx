// Per-sprite code view: the detailed summary generated alongside the code, plus the
// raw JavaScript in an editable text area. Edits flow back into the model and are
// hot-swapped into the runtime if it's running, so you can tweak generated code by
// hand without leaving the app.
import { useStore, useSelectedSprite } from '../../model/store'
import { useRuntime } from '../../runtime/runtime-context'
import './CodeView.css'

export const CodeView = (): JSX.Element => {
  const { dispatch } = useStore()
  const { runtime, running } = useRuntime()
  const sprite = useSelectedSprite()

  if (!sprite) {
    return <div className="vibe-code vibe-code-empty">Select a sprite to see its behavior.</div>
  }

  const runtimeError = running ? (runtime.getSprite(sprite.id)?.error ?? null) : null

  const onSourceChange = (source: string): void => {
    dispatch({ type: 'SET_SPRITE_CODE', id: sprite.id, code: { summary: sprite.code.summary, source } })
    if (running) runtime.updateSpriteCode(sprite.id, source)
  }

  return (
    <div className="vibe-code">
      <div className="vibe-code-summary">
        <div className="vibe-code-summary-label">What {sprite.name} does</div>
        <div className="vibe-code-summary-text">
          {sprite.code.summary.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
      {runtimeError && <div className="vibe-code-error">⚠ {runtimeError}</div>}
      <textarea
        className="vibe-code-source"
        aria-label="JavaScript source"
        spellCheck={false}
        value={sprite.code.source}
        placeholder="// No code yet. Ask the chat, or write JavaScript that calls api.onFrame(...), api.move(...), etc."
        onChange={(e) => onSourceChange(e.target.value)}
      />
    </div>
  )
}
