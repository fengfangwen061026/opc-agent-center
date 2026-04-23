import { useState } from 'react'
import type { VaultNode } from '@opc/core'
import { FileText, Folder, FolderOpen } from 'lucide-react'
import { GlassCard } from '@opc/ui'
import { useObsidianStore } from '@/stores/obsidianStore'

function TreeNode({ node, level = 0 }: { node: VaultNode; level?: number }) {
  const [open, setOpen] = useState(node.name === 'Review Queue' || level === 0)
  const { openNote } = useObsidianStore()
  const isReview = node.path === 'Review Queue'

  if (node.type === 'folder') {
    return (
      <div>
        <button
          className={`opc-vault-node opc-vault-node--folder ${isReview ? 'is-review' : ''}`}
          style={{ paddingLeft: `${10 + level * 14}px` }}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <FolderOpen /> : <Folder />}
          <span>{node.name}</span>
          {isReview ? <strong>{node.children?.length ?? 0}</strong> : null}
        </button>
        {open ? (
          <div>
            {node.children?.map((child) => <TreeNode key={child.path} node={child} level={level + 1} />)}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <button
      className="opc-vault-node"
      style={{ paddingLeft: `${10 + level * 14}px` }}
      onClick={() => void openNote(node.path)}
    >
      <FileText />
      <span>{node.name}</span>
    </button>
  )
}

export function VaultTree() {
  const { tree, status } = useObsidianStore()

  return (
    <GlassCard className="opc-vault-tree" variant="strong" data-testid="vault-tree">
      <div>
        <p className="opc-eyebrow">Vault</p>
        <h2 className="opc-section-title">{status?.vaultName ?? 'Mock OPC Vault'}</h2>
      </div>
      <div className="opc-vault-tree__nodes">
        {tree.map((node) => (
          <TreeNode key={node.path} node={node} />
        ))}
      </div>
    </GlassCard>
  )
}
