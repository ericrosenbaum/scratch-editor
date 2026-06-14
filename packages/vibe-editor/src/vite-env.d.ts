/// <reference types="vite/client" />

declare module '*.css'

// scratch-paint ships no type declarations. We use it via a thin wrapper, so a loose
// module declaration is enough for the prototype.
declare module 'scratch-paint' {
  import type { ComponentType } from 'react'
  import type { Reducer } from 'redux'

  export interface PaintEditorProps {
    image?: string
    imageId?: string
    imageFormat?: string
    name?: string
    rotationCenterX?: number
    rotationCenterY?: number
    rtl?: boolean
    zoomLevelId?: string
    onUpdateImage: (
      isVector: boolean,
      image: string | ImageData,
      rotationCenterX: number,
      rotationCenterY: number,
    ) => void
    onUpdateName?: (name: string) => void
    fontInlineFn?: (svg: string) => string
  }

  const PaintEditor: ComponentType<PaintEditorProps>
  export const ScratchPaintReducer: Reducer
  export default PaintEditor
}
