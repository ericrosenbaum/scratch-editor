// Top-level layout: a left project tree, a center column (stage above a tabbed
// editor for Paint/Code), and a right-hand vibe chat. State is provided by the model
// store; the runtime is provided separately so the stage and chat can drive it.
import { useEffect, useRef, useState } from 'react'
import './App.css'
import { MockCodeGenerator } from './codegen/mock-codegen'
import type { CodeGenerator } from './codegen/types'
import { Chat } from './components/Chat/Chat'
import { CodeView } from './components/CodeView/CodeView'
import { PaintEditorPanel } from './components/PaintEditorPanel/PaintEditorPanel'
import { Stage } from './components/Stage/Stage'
import { Tree } from './components/Tree/Tree'
import { StoreProvider, useStore } from './model/store'
import { RuntimeProvider } from './runtime/runtime-context'

type EditorTab = 'paint' | 'code'

const Workspace = ({ generator }: { generator: CodeGenerator }): JSX.Element => {
  const { state } = useStore()
  const [tab, setTab] = useState<EditorTab>('code')
  const lastCostume = useRef<string | null>(state.selectedCostumeId)

  // When a costume is newly picked in the tree, jump to the paint editor (but keep
  // the default Code tab on first render).
  const selectedCostumeId = state.selectedCostumeId
  useEffect(() => {
    if (selectedCostumeId && selectedCostumeId !== lastCostume.current) {
      setTab('paint')
    }
    lastCostume.current = selectedCostumeId
  }, [selectedCostumeId])

  return (
    <div className="vibe-app">
      <header className="vibe-topbar">
        <span className="vibe-logo">✨ Vibe Editor</span>
        <span className="vibe-tagline">draw it, vibe-code it, run it</span>
      </header>
      <div className="vibe-body">
        <aside className="vibe-col-tree">
          <Tree />
        </aside>
        <main className="vibe-col-center">
          <Stage />
          <section className="vibe-editor-panel">
            <div className="vibe-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'paint'}
                className={tab === 'paint' ? 'active' : ''}
                onClick={() => setTab('paint')}
              >
                Paint
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'code'}
                className={tab === 'code' ? 'active' : ''}
                onClick={() => setTab('code')}
              >
                Code
              </button>
            </div>
            <div className="vibe-tab-body">{tab === 'paint' ? <PaintEditorPanel /> : <CodeView />}</div>
          </section>
        </main>
        <aside className="vibe-col-chat">
          <Chat generator={generator} />
        </aside>
      </div>
    </div>
  )
}

export const App = ({ generator: provided }: { generator?: CodeGenerator } = {}): JSX.Element => {
  // One generator instance for the app's lifetime. Tests can inject a custom one.
  const [generator] = useState<CodeGenerator>(() => provided ?? new MockCodeGenerator())
  return (
    <StoreProvider>
      <RuntimeProvider>
        <Workspace generator={generator} />
      </RuntimeProvider>
    </StoreProvider>
  )
}

export default App
