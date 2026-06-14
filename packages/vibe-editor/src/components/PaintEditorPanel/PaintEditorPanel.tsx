// The "one real editor" for this slice: a minimal but genuine direct-manipulation
// paint editor for sprite costumes. You draw with a brush/eraser; on each stroke the
// costume is written back to the model as a PNG data URL, so the stage reflects edits.
//
// This is the approved fallback for the richer scratch-paint embed (which requires its
// own Redux store + IntlProvider + costume-format adapter). The panel is deliberately
// self-contained so scratch-paint's <PaintEditor> can be dropped in later behind the
// same "selected costume in / updated costume out" contract.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset } from '../../model/project'
import { useStore, useSelectedSprite } from '../../model/store'
import './PaintEditorPanel.css'

const CANVAS_SIZE = 240

export const PaintEditorPanel = (): JSX.Element => {
  const { state, dispatch } = useStore()
  const sprite = useSelectedSprite()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const [color, setColor] = useState('#855cd6')
  const [size, setSize] = useState(12)
  const [eraser, setEraser] = useState(false)

  const costume: Asset | null =
    sprite && state.selectedCostumeId
      ? (sprite.costumes.find((c) => c.id === state.selectedCostumeId) ?? sprite.costumes[0] ?? null)
      : (sprite?.costumes[0] ?? null)

  // Load the current costume image into the drawing canvas whenever it changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    if (!costume) return
    if (typeof Image === 'undefined') return
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
    img.src = costume.data
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on costume id only, so our own stroke writes don't reload the image mid-edit
  }, [costume?.id])

  const toCanvasCoords = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    }
  }, [])

  const commit = useCallback((): void => {
    const canvas = canvasRef.current
    if (!canvas || !sprite || !costume) return
    dispatch({
      type: 'UPDATE_COSTUME',
      spriteId: sprite.id,
      costumeId: costume.id,
      data: canvas.toDataURL('image/png'),
      dataFormat: 'png',
    })
  }, [dispatch, sprite, costume])

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!costume) return
    drawing.current = true
    last.current = toCanvasCoords(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawDot(last.current)
  }

  const drawDot = (p: { x: number; y: number }): void => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const p = toCanvasCoords(e)
    if (ctx && last.current) {
      ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
      ctx.strokeStyle = color
      ctx.lineWidth = size
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(last.current.x, last.current.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    last.current = p
  }

  const onPointerUp = (): void => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    commit()
  }

  const clear = (): void => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    commit()
  }

  if (!sprite) {
    return <div className="vibe-paint vibe-paint-empty">Select a sprite to edit its costume.</div>
  }

  return (
    <div className="vibe-paint">
      <div className="vibe-paint-toolbar">
        <label className="vibe-paint-tool" title="Brush color">
          <span>Color</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Brush color" />
        </label>
        <label className="vibe-paint-tool" title="Brush size">
          <span>Size</span>
          <input
            type="range"
            min={2}
            max={48}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Brush size"
          />
        </label>
        <button
          type="button"
          className={eraser ? 'active' : ''}
          onClick={() => setEraser((v) => !v)}
          aria-pressed={eraser}
        >
          Eraser
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
        <span className="vibe-paint-name">{costume?.name}</span>
      </div>
      <div className="vibe-paint-stage">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="vibe-paint-canvas"
          data-testid="paint-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  )
}
