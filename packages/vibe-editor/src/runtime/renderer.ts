// Canvas 2D renderer for the stage. Draws each visible sprite's current costume at
// its stage position with rotation/scale, plus a simple "say" bubble. Stage logical
// coordinates are 480x360 with a center origin; the canvas uses the same pixel size
// and we translate (0,0) to its center.
import { STAGE_HEIGHT, STAGE_WIDTH, flattenSprites, type Project } from '../model/project'
import type { RenderableSprite, RenderTarget } from './runtime'

const COSTUME_BASE_SIZE = 80 // matches makeCostumeSvg viewBox

/** Convert a static project into renderable sprites (used when the runtime is stopped). */
export const projectToRenderables = (project: Project): RenderableSprite[] =>
  flattenSprites(project.roots).map((sprite) => ({
    id: sprite.id,
    x: sprite.x,
    y: sprite.y,
    direction: sprite.direction,
    size: sprite.size,
    visible: sprite.visible,
    costume: sprite.costumes[sprite.currentCostume] ?? null,
    sayText: null,
  }))

export class CanvasRenderer implements RenderTarget {
  private ctx: CanvasRenderingContext2D | null
  private imageCache = new Map<string, HTMLImageElement>()

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas.width = STAGE_WIDTH
    this.canvas.height = STAGE_HEIGHT
    // In jsdom (tests) the 2D context is unavailable (and may throw "not
    // implemented"); guard so render() becomes a safe no-op there.
    try {
      this.ctx = canvas.getContext ? canvas.getContext('2d') : null
    } catch {
      this.ctx = null
    }
  }

  private getImage(src: string): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null
    let img = this.imageCache.get(src)
    if (!img) {
      img = new Image()
      img.src = src
      this.imageCache.set(src, img)
    }
    return img.complete && img.naturalWidth > 0 ? img : null
  }

  render(sprites: RenderableSprite[]): void {
    const ctx = this.ctx
    if (!ctx) return
    ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
    ctx.save()
    ctx.translate(STAGE_WIDTH / 2, STAGE_HEIGHT / 2)

    for (const sprite of sprites) {
      if (!sprite.visible) continue
      ctx.save()
      // Stage y grows up; canvas y grows down.
      ctx.translate(sprite.x, -sprite.y)
      ctx.rotate(((sprite.direction - 90) * Math.PI) / 180)
      const scale = sprite.size / 100
      const drawn = COSTUME_BASE_SIZE * scale

      const img = sprite.costume ? this.getImage(sprite.costume.data) : null
      if (img) {
        ctx.drawImage(img, -drawn / 2, -drawn / 2, drawn, drawn)
      } else {
        // Placeholder while the costume image is still loading.
        ctx.fillStyle = '#855CD6'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, drawn / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()

      if (sprite.sayText) {
        this.drawSayBubble(ctx, sprite.x, -sprite.y - drawn / 2 - 8, sprite.sayText)
      }
    }
    ctx.restore()
  }

  private drawSayBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    ctx.font = '14px sans-serif'
    const padding = 8
    const width = ctx.measureText(text).width + padding * 2
    const height = 24
    const left = x - width / 2
    const top = y - height
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#cccccc'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(left, top, width, height, 8)
    } else {
      ctx.rect(left, top, width, height)
    }
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#575e75'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(text, x, top + height / 2)
  }
}
