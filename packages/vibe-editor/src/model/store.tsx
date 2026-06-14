// A tiny state container for the project tree, built on useReducer + context.
// We deliberately avoid Redux here: the prototype's state is small and a plain
// reducer keeps the data flow easy to follow.
import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import {
  createSampleProject,
  createSprite,
  createId,
  findNode,
  insertChild,
  isSprite,
  removeNode,
  updateNode,
  type GeneratedCode,
  type GroupNode,
  type Project,
  type SpriteNode,
  type TreeNode,
} from './project'

export interface EditorState {
  project: Project
  /** Currently selected tree node (sprite, group/scene, or asset id). */
  selectedId: string | null
  /** Currently selected costume asset id, if any (drives the paint editor). */
  selectedCostumeId: string | null
}

export type EditorAction =
  | { type: 'SELECT_NODE'; id: string }
  | { type: 'SELECT_COSTUME'; spriteId: string; costumeId: string }
  | { type: 'TOGGLE_EXPAND'; id: string }
  | { type: 'ADD_SPRITE'; parentId?: string }
  | { type: 'ADD_GROUP' }
  | { type: 'RENAME_NODE'; id: string; name: string }
  | { type: 'DELETE_NODE'; id: string }
  | { type: 'SET_SPRITE_CODE'; id: string; code: GeneratedCode }
  | {
      type: 'UPDATE_COSTUME'
      spriteId: string
      costumeId: string
      data: string
      dataFormat?: string
      rotationCenterX?: number
      rotationCenterY?: number
    }
  | { type: 'RENAME_COSTUME'; spriteId: string; costumeId: string; name: string }

const reducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'SELECT_NODE':
      return { ...state, selectedId: action.id }

    case 'SELECT_COSTUME':
      return { ...state, selectedId: action.spriteId, selectedCostumeId: action.costumeId }

    case 'TOGGLE_EXPAND':
      return {
        ...state,
        project: {
          ...state.project,
          roots: updateNode(state.project.roots, action.id, (node) => ({
            ...node,
            expanded: !node.expanded,
          })),
        },
      }

    case 'ADD_SPRITE': {
      const sprite = createSprite({ name: 'Sprite', x: 0, y: 0 })
      const roots = action.parentId
        ? insertChild(state.project.roots, action.parentId, sprite)
        : [...state.project.roots, sprite]
      return { ...state, project: { ...state.project, roots }, selectedId: sprite.id }
    }

    case 'ADD_GROUP': {
      const group: GroupNode = {
        id: createId('group'),
        kind: 'group',
        name: 'Group',
        expanded: true,
        children: [],
      }
      return {
        ...state,
        project: { ...state.project, roots: [...state.project.roots, group] },
        selectedId: group.id,
      }
    }

    case 'RENAME_NODE':
      return {
        ...state,
        project: {
          ...state.project,
          roots: updateNode(state.project.roots, action.id, (node) => ({ ...node, name: action.name })),
        },
      }

    case 'DELETE_NODE': {
      const roots = removeNode(state.project.roots, action.id)
      return {
        ...state,
        project: { ...state.project, roots },
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      }
    }

    case 'SET_SPRITE_CODE':
      return {
        ...state,
        project: {
          ...state.project,
          roots: updateNode(state.project.roots, action.id, (node) =>
            isSprite(node) ? { ...node, code: action.code } : node,
          ),
        },
      }

    case 'UPDATE_COSTUME':
      return {
        ...state,
        project: {
          ...state.project,
          roots: updateNode(state.project.roots, action.spriteId, (node) => {
            if (!isSprite(node)) return node
            return {
              ...node,
              costumes: node.costumes.map((costume) =>
                costume.id === action.costumeId
                  ? {
                      ...costume,
                      data: action.data,
                      dataFormat: action.dataFormat ?? costume.dataFormat,
                      rotationCenterX: action.rotationCenterX ?? costume.rotationCenterX,
                      rotationCenterY: action.rotationCenterY ?? costume.rotationCenterY,
                    }
                  : costume,
              ),
            }
          }),
        },
      }

    case 'RENAME_COSTUME':
      return {
        ...state,
        project: {
          ...state.project,
          roots: updateNode(state.project.roots, action.spriteId, (node) => {
            if (!isSprite(node)) return node
            return {
              ...node,
              costumes: node.costumes.map((costume) =>
                costume.id === action.costumeId ? { ...costume, name: action.name } : costume,
              ),
            }
          }),
        },
      }

    default:
      return state
  }
}

export const createInitialState = (project: Project = createSampleProject()): EditorState => {
  const firstSprite = project.roots
    .flatMap(function collect(node: TreeNode): TreeNode[] {
      return [node, ...node.children.flatMap(collect)]
    })
    .find(isSprite)
  return {
    project,
    selectedId: firstSprite ? firstSprite.id : null,
    selectedCostumeId: firstSprite ? (firstSprite.costumes[0]?.id ?? null) : null,
  }
}

interface StoreValue {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
}

const StoreContext = createContext<StoreValue | null>(null)

export const StoreProvider = ({ children, project }: { children: ReactNode; project?: Project }): JSX.Element => {
  const [state, dispatch] = useReducer(reducer, project, createInitialState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = (): StoreValue => {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used within a StoreProvider')
  return value
}

/** Convenience selector for the currently selected sprite (if a sprite is selected). */
export const useSelectedSprite = (): SpriteNode | null => {
  const { state } = useStore()
  if (!state.selectedId) return null
  const node = findNode(state.project.roots, state.selectedId)
  return node && isSprite(node) ? node : null
}

// Re-export the pure reducer so tests can exercise state transitions headlessly.
export { reducer as editorReducer }
