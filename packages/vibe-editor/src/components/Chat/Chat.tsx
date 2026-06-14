// The vibe-coding chat. You type a prompt, pick whether it targets the whole project
// or just the selected sprite, and the (mock) code generator returns JavaScript plus a
// human-readable summary. Each change is applied to the sprite's code and hot-swapped
// into the runtime if it's currently running. The raw JS is viewable per change.
import { useRef, useState } from 'react'
import type { CodeGenChange, CodeGenScope, CodeGenerator } from '../../codegen/types'
import { useStore, useSelectedSprite } from '../../model/store'
import { useRuntime } from '../../runtime/runtime-context'
import './Chat.css'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  changes?: CodeGenChange[]
}

let messageId = 0

export const Chat = ({ generator }: { generator: CodeGenerator }): JSX.Element => {
  const { state, dispatch } = useStore()
  const { runtime, running } = useRuntime()
  const selectedSprite = useSelectedSprite()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [scope, setScope] = useState<CodeGenScope>('sprite')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [openSource, setOpenSource] = useState<Record<string, boolean>>({})
  const listRef = useRef<HTMLDivElement>(null)

  const append = (message: Omit<ChatMessage, 'id'>): void => {
    messageId += 1
    setMessages((prev) => [...prev, { ...message, id: messageId }])
    // Scroll to the latest message after render.
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
  }

  const submit = async (): Promise<void> => {
    const text = prompt.trim()
    if (!text || busy) return
    setPrompt('')
    append({ role: 'user', text })
    setBusy(true)
    try {
      const result = await generator.generate({
        scope,
        prompt: text,
        targetId: scope === 'sprite' ? (state.selectedId ?? undefined) : undefined,
        project: state.project,
      })
      for (const change of result.changes) {
        dispatch({
          type: 'SET_SPRITE_CODE',
          id: change.targetId,
          code: { summary: change.summary, source: change.source },
        })
        if (running) runtime.updateSpriteCode(change.targetId, change.source)
      }
      append({ role: 'assistant', text: result.message, changes: result.changes })
    } catch (err) {
      append({ role: 'assistant', text: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const scopeLabel =
    scope === 'sprite' ? `this sprite${selectedSprite ? ` (${selectedSprite.name})` : ''}` : 'the whole project'

  return (
    <div className="vibe-chat">
      <div className="vibe-chat-header">
        <span className="vibe-chat-title">Vibe Chat</span>
      </div>

      <div className="vibe-chat-messages" ref={listRef} data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="vibe-chat-empty">
            Describe what you want a sprite to do — e.g. <em>“make it spin and say hi when clicked”</em>.
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`vibe-chat-msg vibe-chat-${message.role}`}>
            <div className="vibe-chat-bubble">{message.text}</div>
            {message.changes?.map((change) => {
              const key = `${message.id}:${change.targetId}`
              const open = openSource[key] ?? false
              return (
                <div key={key} className="vibe-chat-card">
                  <div className="vibe-chat-card-head">
                    <span className="vibe-chat-card-target">{change.targetName}</span>
                    <button
                      type="button"
                      className="vibe-chat-card-toggle"
                      onClick={() => setOpenSource((prev) => ({ ...prev, [key]: !open }))}
                    >
                      {open ? 'Hide JS' : 'View JS'}
                    </button>
                  </div>
                  <div className="vibe-chat-card-summary">{change.summary}</div>
                  {open && <pre className="vibe-chat-card-code">{change.source}</pre>}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="vibe-chat-input">
        <div className="vibe-chat-scope" role="radiogroup" aria-label="Prompt scope">
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'sprite'}
            className={scope === 'sprite' ? 'active' : ''}
            onClick={() => setScope('sprite')}
          >
            Selected sprite
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'project'}
            className={scope === 'project' ? 'active' : ''}
            onClick={() => setScope('project')}
          >
            Whole project
          </button>
        </div>
        <textarea
          className="vibe-chat-textarea"
          placeholder={`Tell ${scopeLabel} what to do…`}
          value={prompt}
          rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Prompt"
        />
        <button type="button" className="vibe-chat-send" onClick={() => void submit()} disabled={busy}>
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
