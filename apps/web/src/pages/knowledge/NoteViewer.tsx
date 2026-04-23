import { useMemo } from 'react'
import { marked } from 'marked'
import { Clipboard, ExternalLink } from 'lucide-react'
import { GlassCard, LiquidButton } from '@opc/ui'
import { useObsidianStore } from '@/stores/obsidianStore'

export function NoteViewer() {
  const { activeNote } = useObsidianStore()
  const html = useMemo(() => (activeNote ? marked.parse(activeNote.content) : ''), [activeNote])

  if (!activeNote) {
    return (
      <GlassCard className="opc-note-viewer" variant="strong">
        <p className="opc-empty-copy">Select a note from the vault tree.</p>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="opc-note-viewer" variant="strong">
      <div className="opc-note-viewer__header">
        <div>
          <p className="opc-eyebrow">Note</p>
          <h1 className="opc-section-title">{activeNote.path}</h1>
        </div>
        <div className="opc-drawer-actions">
          <LiquidButton
            variant="ghost"
            icon={<ExternalLink />}
            onClick={() =>
              window.open(
                `obsidian://open?vault=obsidian-vault&file=${encodeURIComponent(activeNote.path)}`,
              )
            }
          >
            在 Obsidian 中打开
          </LiquidButton>
          <LiquidButton
            variant="ghost"
            icon={<Clipboard />}
            onClick={() => void navigator.clipboard.writeText(activeNote.path)}
          >
            复制路径
          </LiquidButton>
        </div>
      </div>

      {activeNote.frontmatter ? (
        <GlassCard className="opc-frontmatter-card" variant="soft">
          {Object.entries(activeNote.frontmatter).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{Array.isArray(value) ? value.join(', ') : String(value)}</strong>
            </div>
          ))}
        </GlassCard>
      ) : null}

      <article className="opc-markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </GlassCard>
  )
}
