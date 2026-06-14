// Embeds the real scratch-paint editor for the selected sprite's current costume.
//
// scratch-paint is loaded lazily so paper.js / canvas are only touched in the browser
// when the paint tab is opened (never in jsdom tests). We adapt between our lightweight
// Asset model (a costume is a data URL + format) and scratch-paint's prop contract:
// the costume comes in as `image` + `imageFormat`, and edits come back via
// onUpdateImage (an SVG string for vector, an ImageData for bitmap).
import { Suspense, lazy, useCallback } from 'react'
import type { Asset } from '../../model/project'
import { useSelectedSprite, useStore } from '../../model/store'
import './PaintEditorPanel.css'

const ScratchPaintEditor = lazy(() => import('../../paint/scratch-paint-editor'))

/** Decode a data URL into its raw text payload (SVG markup for our costumes). */
const decodeDataUrl = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return dataUrl
  const meta = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  return meta.includes('base64') ? atob(body) : decodeURIComponent(body)
}

/** Convert ImageData (bitmap edits from scratch-paint) into a PNG data URL. */
const imageDataToPng = (image: ImageData): string => {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')?.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

export const PaintEditorPanel = (): JSX.Element => {
  const { state, dispatch } = useStore()
  const sprite = useSelectedSprite()

  const selectedCostume =
    sprite && state.selectedCostumeId ? sprite.costumes.find((c) => c.id === state.selectedCostumeId) : undefined
  const costume: Asset | null = sprite ? (selectedCostume ?? sprite.costumes[0] ?? null) : null

  const onUpdateImage = useCallback(
    (isVector: boolean, image: string | ImageData, rotationCenterX: number, rotationCenterY: number) => {
      if (!sprite || !costume) return
      const data =
        isVector && typeof image === 'string'
          ? `data:image/svg+xml;utf8,${encodeURIComponent(image)}`
          : imageDataToPng(image as ImageData)
      dispatch({
        type: 'UPDATE_COSTUME',
        spriteId: sprite.id,
        costumeId: costume.id,
        data,
        dataFormat: isVector ? 'svg' : 'png',
        rotationCenterX,
        rotationCenterY,
      })
    },
    [dispatch, sprite, costume],
  )

  const onUpdateName = useCallback(
    (name: string) => {
      if (!sprite || !costume) return
      dispatch({ type: 'RENAME_COSTUME', spriteId: sprite.id, costumeId: costume.id, name })
    },
    [dispatch, sprite, costume],
  )

  if (!sprite || !costume) {
    return <div className="vibe-paint vibe-paint-empty">Select a sprite to edit its costume.</div>
  }

  const isSvg = costume.dataFormat === 'svg'

  return (
    <div className="vibe-paint">
      <Suspense fallback={<div className="vibe-paint-empty">Loading paint editor…</div>}>
        <ScratchPaintEditor
          imageId={`${sprite.id}-${costume.id}`}
          image={isSvg ? decodeDataUrl(costume.data) : costume.data}
          imageFormat={costume.dataFormat}
          name={costume.name}
          rotationCenterX={costume.rotationCenterX ?? 40}
          rotationCenterY={costume.rotationCenterY ?? 40}
          rtl={false}
          zoomLevelId={sprite.id}
          onUpdateImage={onUpdateImage}
          onUpdateName={onUpdateName}
          fontInlineFn={(svg) => svg}
        />
      </Suspense>
    </div>
  )
}
