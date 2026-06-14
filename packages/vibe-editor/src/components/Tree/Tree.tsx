// Hierarchical project tree: scenes/groups -> sprites -> nested sprites, and each
// sprite's media assets (costumes/sounds) as leaf rows. Selecting a sprite makes it
// the editing target; selecting a costume opens it in the paint editor.
import { isSprite, type Asset, type SpriteNode, type TreeNode } from '../../model/project'
import { useStore } from '../../model/store'
import './Tree.css'

const KIND_ICON: Record<string, string> = {
  scene: '🎬',
  group: '📁',
  sprite: '🐱',
  costume: '🎨',
  sound: '🔊',
}

const AssetRow = ({ sprite, asset }: { sprite: SpriteNode; asset: Asset }): JSX.Element => {
  const { state, dispatch } = useStore()
  const selected = asset.kind === 'costume' && state.selectedCostumeId === asset.id
  return (
    <div
      className={`vibe-tree-row vibe-tree-asset${selected ? ' selected' : ''}`}
      style={{ paddingLeft: 38 }}
      role="treeitem"
      aria-selected={selected}
      onClick={() => {
        if (asset.kind === 'costume') {
          dispatch({ type: 'SELECT_COSTUME', spriteId: sprite.id, costumeId: asset.id })
        }
      }}
    >
      <span className="vibe-tree-icon">{KIND_ICON[asset.kind]}</span>
      <span className="vibe-tree-label">{asset.name}</span>
    </div>
  )
}

const NodeRow = ({ node, depth }: { node: TreeNode; depth: number }): JSX.Element => {
  const { state, dispatch } = useStore()
  const selected = state.selectedId === node.id
  const sprite = isSprite(node) ? node : null
  const assets: Asset[] = sprite ? [...sprite.costumes, ...sprite.sounds] : []
  const hasChildren = node.children.length > 0 || assets.length > 0
  const expanded = node.expanded ?? true

  return (
    <div className="vibe-tree-branch" role="group">
      <div
        className={`vibe-tree-row vibe-tree-${node.kind}${selected ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => dispatch({ type: 'SELECT_NODE', id: node.id })}
      >
        <button
          type="button"
          className="vibe-tree-twisty"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: 'TOGGLE_EXPAND', id: node.id })
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="vibe-tree-icon">{KIND_ICON[node.kind]}</span>
        <span className="vibe-tree-label">{node.name}</span>
      </div>

      {expanded && (
        <>
          {sprite && assets.map((asset) => <AssetRow key={asset.id} sprite={sprite} asset={asset} />)}
          {node.children.map((child) => (
            <NodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  )
}

export const Tree = (): JSX.Element => {
  const { state, dispatch } = useStore()
  const selectedNode = state.selectedId
    ? state.project.roots
        .flatMap(function collect(n: TreeNode): TreeNode[] {
          return [n, ...n.children.flatMap(collect)]
        })
        .find((n) => n.id === state.selectedId)
    : null
  const selectedIsSprite = selectedNode ? isSprite(selectedNode) : false

  return (
    <div className="vibe-tree" role="tree" aria-label="Project structure">
      <div className="vibe-tree-toolbar">
        <span className="vibe-tree-title">Project</span>
        <div className="vibe-tree-actions">
          <button
            type="button"
            title="Add sprite"
            onClick={() =>
              dispatch({
                type: 'ADD_SPRITE',
                parentId: selectedIsSprite ? state.selectedId! : undefined,
              })
            }
          >
            + Sprite
          </button>
          <button type="button" title="Add group" onClick={() => dispatch({ type: 'ADD_GROUP' })}>
            + Group
          </button>
          {state.selectedId && (
            <button
              type="button"
              title="Delete selected"
              className="vibe-tree-delete"
              onClick={() => dispatch({ type: 'DELETE_NODE', id: state.selectedId! })}
            >
              🗑
            </button>
          )}
        </div>
      </div>
      <div className="vibe-tree-body">
        {state.project.roots.map((node) => (
          <NodeRow key={node.id} node={node} depth={0} />
        ))}
      </div>
    </div>
  )
}
