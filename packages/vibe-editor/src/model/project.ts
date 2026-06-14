// Project data model for the Vibe Editor.
//
// This is intentionally *not* the Scratch project format. It is a simplified,
// hierarchical tree: scenes/groups contain sprites, sprites can contain nested
// sprites, and each sprite owns its media assets (costumes/sounds) plus a single
// blob of generated code (JavaScript + a human-readable summary).
//
// Coordinates follow the Scratch mental model so the experience feels familiar:
// the stage is 480x360, the origin (0,0) is the center, x grows right and y grows
// up. Direction is in degrees where 90 points right and 0 points up.

export const STAGE_WIDTH = 480
export const STAGE_HEIGHT = 360

export type AssetKind = 'costume' | 'sound'

export interface Asset {
  id: string
  name: string
  kind: AssetKind
  /** A fully-formed data URL (e.g. `data:image/svg+xml;...` or `data:image/png;base64,...`). */
  data: string
  /** Short format hint, e.g. `svg`, `png`, `wav`. */
  dataFormat: string
}

/** Generated behavior for a sprite: the JS source and the summary produced alongside it. */
export interface GeneratedCode {
  summary: string
  source: string
}

export interface SpriteNode {
  id: string
  kind: 'sprite'
  name: string
  x: number
  y: number
  /** Degrees, Scratch convention: 90 = right, 0 = up. */
  direction: number
  /** Size as a percentage (100 = natural size). */
  size: number
  visible: boolean
  costumes: Asset[]
  currentCostume: number
  sounds: Asset[]
  code: GeneratedCode
  /** Nested sprites (rendered relative to the stage, not the parent, in this prototype). */
  children: TreeNode[]
  expanded?: boolean
}

export interface GroupNode {
  id: string
  kind: 'group' | 'scene'
  name: string
  children: TreeNode[]
  expanded?: boolean
}

export type TreeNode = SpriteNode | GroupNode

export interface Project {
  name: string
  roots: TreeNode[]
}

export const isSprite = (node: TreeNode): node is SpriteNode => node.kind === 'sprite'

let idCounter = 0
export const createId = (prefix = 'node'): string => {
  idCounter += 1
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Build a simple SVG costume (a rounded shape with a face) as a data URL. Keeps the
 * prototype self-contained — no external asset files required.
 */
export const makeCostumeSvg = (fill: string, accent = '#000000'): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
        <rect x="8" y="8" width="64" height="64" rx="20" fill="${fill}" stroke="${accent}" stroke-width="3"/>
        <circle cx="30" cy="36" r="6" fill="#ffffff"/>
        <circle cx="50" cy="36" r="6" fill="#ffffff"/>
        <circle cx="30" cy="37" r="3" fill="#222222"/>
        <circle cx="50" cy="37" r="3" fill="#222222"/>
        <path d="M28 52 Q40 62 52 52" fill="none" stroke="#222222" stroke-width="3" stroke-linecap="round"/>
    </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const makeCostume = (name: string, fill: string, accent?: string): Asset => ({
  id: createId('costume'),
  name,
  kind: 'costume',
  data: makeCostumeSvg(fill, accent),
  dataFormat: 'svg',
})

export interface CreateSpriteOptions {
  name: string
  x?: number
  y?: number
  fill?: string
  children?: TreeNode[]
  code?: GeneratedCode
}

export const createSprite = (options: CreateSpriteOptions): SpriteNode => ({
  id: createId('sprite'),
  kind: 'sprite',
  name: options.name,
  x: options.x ?? 0,
  y: options.y ?? 0,
  direction: 90,
  size: 100,
  visible: true,
  costumes: [makeCostume('costume1', options.fill ?? '#855CD6')],
  currentCostume: 0,
  sounds: [],
  code: options.code ?? { summary: 'No behavior yet. Ask the chat to make this sprite do something!', source: '' },
  children: options.children ?? [],
  expanded: true,
})

/** A small starter project that demonstrates scenes, nested sprites and assets. */
export const createSampleProject = (): Project => {
  const hat = createSprite({ name: 'Hat', x: 0, y: 40, fill: '#FFAB19' })
  const cat = createSprite({
    name: 'Cat',
    x: -80,
    y: 0,
    fill: '#FF8C1A',
    children: [hat],
    code: {
      summary: 'Spins clockwise forever. Click it to say hello.',
      source: [
        'api.onFrame(() => {',
        '    api.turn(4);',
        '});',
        '',
        'api.onClick(() => {',
        "    api.say('Hello!', 2);",
        '});',
      ].join('\n'),
    },
  })
  const ball = createSprite({ name: 'Ball', x: 90, y: -30, fill: '#4C97FF' })
  const scene: GroupNode = {
    id: createId('scene'),
    kind: 'scene',
    name: 'Scene 1',
    expanded: true,
    children: [cat, ball],
  }
  return { name: 'Untitled', roots: [scene] }
}

// ---------------------------------------------------------------------------
// Immutable tree helpers
// ---------------------------------------------------------------------------

const childrenOf = (node: TreeNode): TreeNode[] => node.children

/** Depth-first search for a node by id. */
export const findNode = (roots: TreeNode[], id: string): TreeNode | null => {
  for (const node of roots) {
    if (node.id === id) return node
    const found = findNode(childrenOf(node), id)
    if (found) return found
  }
  return null
}

/** Collect every sprite in the tree (including nested), depth-first. */
export const flattenSprites = (roots: TreeNode[]): SpriteNode[] => {
  const out: SpriteNode[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (isSprite(node)) out.push(node)
      walk(node.children)
    }
  }
  walk(roots)
  return out
}

/** Return a new tree with `id` replaced by `updater(node)`. */
export const updateNode = (roots: TreeNode[], id: string, updater: (node: TreeNode) => TreeNode): TreeNode[] =>
  roots.map((node) => {
    if (node.id === id) return updater(node)
    const newChildren = updateNode(node.children, id, updater)
    if (newChildren !== node.children) {
      return { ...node, children: newChildren } as TreeNode
    }
    return node
  })

/** Return a new tree with `id` (and its subtree) removed. */
export const removeNode = (roots: TreeNode[], id: string): TreeNode[] =>
  roots
    .filter((node) => node.id !== id)
    .map((node) => {
      const newChildren = removeNode(node.children, id)
      if (newChildren !== node.children) {
        return { ...node, children: newChildren } as TreeNode
      }
      return node
    })

/** Return a new tree with `child` appended to the children of `parentId`. */
export const insertChild = (roots: TreeNode[], parentId: string, child: TreeNode): TreeNode[] =>
  updateNode(roots, parentId, (node) => ({ ...node, children: [...node.children, child] }) as TreeNode)
