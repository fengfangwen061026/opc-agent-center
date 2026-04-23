import type {
  ObsidianStatus,
  ReviewQueueEntry,
  VaultNode,
  VaultNote,
  VaultSearchResult,
} from '@opc/core'
import { VaultNoteSchema } from '@opc/core'
import type { ObsidianAdapter, WriteOptions } from './ObsidianAdapter'

function nowIso() {
  return new Date().toISOString()
}

function frontmatterFor(note: ReviewQueueEntry) {
  return {
    sourceUrl: note.sourceUrl,
    tags: note.tags,
    capturedAt: note.capturedAt,
    taskId: note.taskId,
    status: 'pending',
  }
}

function noteContent(note: ReviewQueueEntry) {
  return `---\ntitle: ${note.title}\nstatus: pending\ncapturedAt: ${note.capturedAt}\ntags: [${note.tags.join(', ')}]\n---\n\n# ${note.title}\n\n${note.summary}\n\n${note.sourceUrl ? `Source: ${note.sourceUrl}\n` : ''}`
}

export class MockObsidianAdapter implements ObsidianAdapter {
  private connected = false
  private notes = new Map<string, VaultNote>()

  async connect(): Promise<void> {
    this.connected = false
    const capturedAt = nowIso()
    const reviewEntries: ReviewQueueEntry[] = [
      {
        title: 'OpenClaw Gateway configuration reference',
        sourceUrl: 'https://docs.openclaw.ai/gateway/configuration',
        summary:
          'Config is stored in ~/.openclaw/openclaw.json and can be edited via CLI or Control UI.',
        tags: ['openclaw', 'gateway'],
        capturedAt,
        taskId: 'task-knowledge-001',
      },
      {
        title: 'Memory plugin rollout note',
        summary:
          'Active memory should degrade to keyword recall when Ollama embedding is unavailable.',
        tags: ['memory', 'lancedb'],
        capturedAt,
      },
      {
        title: 'Evolver review boundary',
        summary: 'Logic changes require approval; description and tag updates can be auto-applied.',
        tags: ['evolver', 'approval'],
        capturedAt,
      },
      {
        title: 'Vault sync fallback',
        summary: 'Obsidian writes should queue while Local REST API is offline.',
        tags: ['obsidian', 'fallback'],
        capturedAt,
      },
      {
        title: 'Dashboard topology note',
        summary:
          'The dashboard graph uses fixed nodes for OpenClaw, LanceDB, Obsidian, and Evolver.',
        tags: ['dashboard', 'architecture'],
        capturedAt,
      },
    ]

    this.notes = new Map(
      [
        [
          'Projects/OPC Agent Center/Architecture.md',
          '# Architecture\n\nOpenClaw, LanceDB, Obsidian, and Evolver are bridged through OPC Bridge.',
        ],
        [
          'Projects/OPC Agent Center/Phase Log.md',
          '# Phase Log\n\nPhase 0-10 tracks the cockpit from mock-first to local adapters.',
        ],
        [
          'Daily Notes/2026-04-23.md',
          '# 2026-04-23\n\nInstalled OpenClaw Gateway and pulled nomic-embed-text.',
        ],
        [
          'Archive/Legacy Hermes.md',
          '# Legacy Hermes\n\nHermes-based architecture was retired in v2.0.',
        ],
        ...reviewEntries.map(
          (entry, index) =>
            [
              `Review Queue/${String(index + 1).padStart(2, '0')} - ${entry.title}.md`,
              noteContent(entry),
            ] as const,
        ),
      ].map(([path, content]) => [
        path,
        VaultNoteSchema.parse({
          path,
          content,
          frontmatter: path.startsWith('Review Queue/')
            ? frontmatterFor(
                reviewEntries[
                  Number(path.slice('Review Queue/'.length, 'Review Queue/'.length + 2)) - 1
                ],
              )
            : { status: 'active' },
          modified: capturedAt,
        }),
      ]),
    )
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async status(): Promise<ObsidianStatus> {
    return {
      connected: this.connected,
      vaultName: 'Mock OPC Vault',
      fileCount: this.notes.size,
    }
  }

  async getTree(path = ''): Promise<VaultNode[]> {
    const normalizedPath = path.replace(/\/$/, '')

    const build = (prefix: string): VaultNode[] => {
      const nodes = new Map<string, VaultNode>()
      for (const note of this.notes.values()) {
        if (prefix && !note.path.startsWith(prefix + '/')) continue
        const rest = prefix ? note.path.slice(prefix.length + 1) : note.path
        const [name] = rest.split('/')
        const nodePath = prefix ? `${prefix}/${name}` : name
        const isFile = rest === name
        const existing = nodes.get(name)
        if (existing) continue
        nodes.set(name, {
          path: nodePath,
          name,
          type: isFile ? 'file' : 'folder',
          modified: isFile ? note.modified : undefined,
          children: isFile ? undefined : build(nodePath),
        })
      }
      return Array.from(nodes.values()).sort(
        (left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name),
      )
    }

    return build(normalizedPath)
  }

  async getNote(path: string): Promise<VaultNote | null> {
    return this.notes.get(path) ?? null
  }

  async writeNote(path: string, content: string, options: WriteOptions = {}): Promise<void> {
    if (options.overwrite === false && this.notes.has(path)) {
      throw new Error('Note already exists')
    }
    this.notes.set(
      path,
      VaultNoteSchema.parse({ path, content, frontmatter: {}, modified: nowIso() }),
    )
  }

  async appendNote(path: string, content: string): Promise<void> {
    const current = this.notes.get(path)
    await this.writeNote(path, `${current?.content ?? ''}\n${content}`.trim(), { overwrite: true })
  }

  async deleteNote(path: string): Promise<void> {
    this.notes.delete(path)
  }

  async search(query: string, limit = 20): Promise<VaultSearchResult[]> {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return Array.from(this.notes.values())
      .map((note) => {
        const haystack = `${note.path} ${note.content}`.toLowerCase()
        const score =
          (haystack.includes(needle) ? 1 : 0) + (note.path.toLowerCase().includes(needle) ? 0.5 : 0)
        return {
          path: note.path,
          score,
          excerpt:
            note.content.split('\n').find((line) => line.toLowerCase().includes(needle)) ??
            note.content.slice(0, 140),
        }
      })
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
  }

  async getReviewQueue(): Promise<VaultNote[]> {
    return Array.from(this.notes.values())
      .filter((note) => note.path.startsWith('Review Queue/'))
      .sort((left, right) => right.modified.localeCompare(left.modified))
  }

  async addToReviewQueue(note: ReviewQueueEntry): Promise<void> {
    const safeTitle = note.title.replace(/[^\w -]/g, '').trim() || 'Captured Note'
    const path = `Review Queue/${new Date(note.capturedAt).toISOString().slice(0, 10)} - ${safeTitle}.md`
    this.notes.set(
      path,
      VaultNoteSchema.parse({
        path,
        content: noteContent(note),
        frontmatter: frontmatterFor(note),
        modified: nowIso(),
      }),
    )
  }
}
