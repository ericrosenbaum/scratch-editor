// The stage: a canvas driven by the runtime, plus green-flag / stop controls. When
// stopped it shows a static render of the project at its initial state; when running
// the runtime drives rendering and receives pointer/keyboard input.
import { useCallback, useEffect, useRef } from 'react'
import { STAGE_HEIGHT, STAGE_WIDTH } from '../../model/project'
import { useStore } from '../../model/store'
import { CanvasRenderer, projectToRenderables } from '../../runtime/renderer'
import { useRuntime } from '../../runtime/runtime-context'
import './Stage.css'

export const Stage = (): JSX.Element => {
  const { state } = useStore()
  const { runtime, running } = useRuntime()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CanvasRenderer | null>(null)

  // Create the renderer once the canvas exists and hand it to the runtime.
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new CanvasRenderer(canvasRef.current)
      runtime.setRenderer(rendererRef.current)
    }
  }, [runtime])

  // While stopped, keep the static preview in sync with the project.
  useEffect(() => {
    if (!running && rendererRef.current) {
      rendererRef.current.render(projectToRenderables(state.project))
    }
  }, [state.project, running])

  // Forward keyboard input to the runtime while running.
  useEffect(() => {
    if (!running) return undefined
    const onKeyDown = (e: KeyboardEvent): void => runtime.handleKey(e.key)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [running, runtime])

  const toStageCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * STAGE_WIDTH - STAGE_WIDTH / 2
    const y = STAGE_HEIGHT / 2 - ((clientY - rect.top) / rect.height) * STAGE_HEIGHT
    return { x, y }
  }, [])

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!running) return
    const { x, y } = toStageCoords(e.clientX, e.clientY)
    runtime.setMouse(x, y)
  }

  const onClick = (e: React.MouseEvent): void => {
    if (!running) return
    const { x, y } = toStageCoords(e.clientX, e.clientY)
    runtime.handleStageClick(x, y)
  }

  const toggleRun = (): void => {
    if (running) {
      runtime.stop()
      // Restore the static preview immediately.
      rendererRef.current?.render(projectToRenderables(state.project))
    } else {
      runtime.start(state.project)
    }
  }

  return (
    <div className="vibe-stage">
      <div className="vibe-stage-controls">
        <button
          type="button"
          className="vibe-flag"
          title="Run"
          aria-label="Run"
          disabled={running}
          onClick={toggleRun}
        >
          ⚑
        </button>
        <button
          type="button"
          className="vibe-stop"
          title="Stop"
          aria-label="Stop"
          disabled={!running}
          onClick={toggleRun}
        >
          ⬛
        </button>
        <span className="vibe-stage-status">{running ? 'Running' : 'Stopped'}</span>
      </div>
      <div className="vibe-stage-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="vibe-stage-canvas"
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          onMouseMove={onMouseMove}
          onClick={onClick}
          data-testid="stage-canvas"
        />
      </div>
    </div>
  )
}
