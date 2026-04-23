import type {
  ObsidianStatus,
  ReviewQueueEntry,
  VaultNode,
  VaultNote,
  VaultSearchResult,
} from '@opc/core'
import { VaultNoteSchema } from '@opc/core'
import type { ObsidianAdapter, ObsidianConfig, WriteOptions } from './ObsidianAdapter'

type DirectoryResponse =
  | string[]
  | {
      files?: unknown[]
      children?: unknown[]
    }

type SearchResponse = Array<{
  filename?: string
  path?: string
  score?: number
  context?: string[]
  matches?: string[]
  content?: string
}>

function nowIso() {
  return new Date().toISOString()
}

function encodeVaultPath(path: string, directory = false) {
  const cleaned = path.replace(/^\/+/, '').replace(/\/+$/, '')
  const encoded = cleaned
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')

  if (!encoded) {
    return '/vault/'
  }

  return `/vault/${encoded}${directory ? '/' : ''}`
}

function joinVaultPath(parent: string, child: string) {
  const name = child.replace(/^\/+/, '').replace(/\/+$/, '')
  return parent ? `${parent.replace(/\/+$/, '')}/${name}` : name
}

function safeNoteName(title: string) {
  return (
    title
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'Captured Note'
  )
}

function parseFrontmatter(content: string): Record<string, unknown> | undefined {
  if (!content.startsWith('---\n')) {
    return undefined
  }

  const end = content.indexOf('\n---', 4)
  if (end < 0) {
    return undefined
  }

  const block = content.slice(4, end)
  const result: Record<string, unknown> = {}
  for (const line of block.split('\n')) {
    const [rawKey, ...rest] = line.split(':')
    const key = rawKey?.trim()
    if (!key || rest.length === 0) continue
    const rawValue = rest.join(':').trim()
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      result[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
    } else {
      result[key] = rawValue.replace(/^"|"$/g, '')
    }
  }

  return result
}

function reviewNoteContent(note: ReviewQueueEntry) {
  return `---
title: "${note.title.replaceAll('"', '\\"')}"
sourceUrl: "${note.sourceUrl ?? ''}"
capturedAt: ${note.capturedAt}
tags: [${note.tags.map((tag) => `"${tag.replaceAll('"', '\\"')}"`).join(', ')}]
taskId: "${note.taskId ?? ''}"
status: pending
---

# ${note.title}

${note.summary}
`
}

export class RealObsidianAdapter implements ObsidianAdapter {
  private connected = false
  private config: ObsidianConfig | null = null

  async connect(config: ObsidianConfig): Promise<void> {
    this.config = config

    try {
      const response = await this.rawFetch('/', { method: 'GET', timeoutMs: 3000 })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      this.connected = true
      console.log('[obsidian] connected to vault')
    } catch (error) {
      console.warn('[obsidian] REST API not reachable, using mock fallback:', error)
      this.connected = false
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected() {
    return this.connected
  }

  async status(): Promise<ObsidianStatus> {
    if (!this.connected) {
      return { connected: false, vaultName: null, fileCount: 0 }
    }

    try {
      const tree = await this.getTree()
      return {
        connected: true,
        vaultName: 'obsidian-vault',
        fileCount: countFiles(tree),
      }
    } catch {
      return { connected: false, vaultName: null, fileCount: 0 }
    }
  }

  async getTree(path = ''): Promise<VaultNode[]> {
    if (!this.connected) return []
    return this.buildTree(path.replace(/\/+$/, ''))
  }

  async getNote(path: string): Promise<VaultNote | null> {
    if (!this.connected) return null

    const response = await this.vaultFetch('GET', path)
    if (!response.ok) {
      return null
    }

    const content = await response.text()
    return VaultNoteSchema.parse({
      path,
      content,
      frontmatter: parseFrontmatter(content),
      modified: response.headers.get('last-modified')
        ? new Date(response.headers.get('last-modified') ?? '').toISOString()
        : nowIso(),
    })
  }

  async writeNote(path: string, content: string, options: WriteOptions = {}): Promise<void> {
    if (!this.connected) throw new Error('Obsidian REST API is not connected')
    if (options.overwrite === false) {
      const current = await this.getNote(path)
      if (current) throw new Error('Note already exists')
    }

    const response = await this.vaultFetch('PUT', path, content)
    if (!response.ok) {
      throw new Error(`Obsidian write failed: HTTP ${response.status}`)
    }
  }

  async appendNote(path: string, content: string): Promise<void> {
    if (!this.connected) throw new Error('Obsidian REST API is not connected')
    const response = await this.vaultFetch('POST', path, content)
    if (!response.ok) {
      throw new Error(`Obsidian append failed: HTTP ${response.status}`)
    }
  }

  async deleteNote(path: string): Promise<void> {
    if (!this.connected) throw new Error('Obsidian REST API is not connected')
    const response = await this.vaultFetch('DELETE', path)
    if (!response.ok) {
      throw new Error(`Obsidian delete failed: HTTP ${response.status}`)
    }
  }

  async search(query: string, limit = 20): Promise<VaultSearchResult[]> {
    if (!this.connected || !query.trim()) return []

    try {
      const response = await this.rawFetch('/search/simple/', {
        method: 'POST',
        body: JSON.stringify({ query }),
        contentType: 'application/json',
      })
      if (!response.ok) {
        return []
      }

      const results = (await response.json()) as SearchResponse
      return results.slice(0, limit).map((result) => ({
        path: result.filename ?? result.path ?? 'Untitled.md',
        score: Number(result.score ?? 1),
        excerpt: result.context?.[0] ?? result.matches?.[0] ?? result.content?.slice(0, 180) ?? '',
      }))
    } catch {
      return []
    }
  }

  async getReviewQueue(): Promise<VaultNote[]> {
    const nodes = await this.getTree('Review Queue')
    const files = flattenFiles(nodes).filter((node) => node.path.endsWith('.md'))
    const notes = await Promise.all(files.map((node) => this.getNote(node.path)))
    return notes
      .filter((note): note is VaultNote => Boolean(note))
      .sort((left, right) => right.modified.localeCompare(left.modified))
  }

  async addToReviewQueue(note: ReviewQueueEntry): Promise<void> {
    const filename = `${new Date(note.capturedAt).toISOString().slice(0, 10)} - ${safeNoteName(note.title)}.md`
    await this.writeNote(`Review Queue/${filename}`, reviewNoteContent(note), {
      createParents: true,
    })
  }

  private async buildTree(path: string): Promise<VaultNode[]> {
    const entries = await this.listDirectory(path)
    const nodes = await Promise.all(
      entries.map(async (entry): Promise<VaultNode> => {
        const name = entry.replace(/\/+$/, '').split('/').filter(Boolean).at(-1) ?? entry
        const nodePath = joinVaultPath(path, name)
        const folderHint = entry.endsWith('/') || !name.includes('.')
        const isFolder = folderHint && (await this.directoryExists(nodePath))

        return {
          path: nodePath,
          name,
          type: isFolder ? 'folder' : 'file',
          children: isFolder ? await this.buildTree(nodePath) : undefined,
          modified: isFolder ? undefined : nowIso(),
        }
      }),
    )

    return nodes.sort(
      (left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name),
    )
  }

  private async listDirectory(path: string) {
    const response = await this.rawFetch(encodeVaultPath(path, true), { method: 'GET' })
    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as DirectoryResponse
    const entries = Array.isArray(data) ? data : (data.files ?? data.children ?? [])
    const rawEntries = entries
      .map((entry) =>
        typeof entry === 'string'
          ? entry
          : entry && typeof entry === 'object'
            ? String((entry as { name?: unknown }).name ?? '')
            : '',
      )
      .filter(Boolean)
    return immediateEntries(path, rawEntries)
  }

  private async directoryExists(path: string) {
    const response = await this.rawFetch(encodeVaultPath(path, true), {
      method: 'GET',
      timeoutMs: 1500,
    })
    return response.ok && response.headers.get('content-type')?.includes('application/json')
  }

  private async vaultFetch(method: string, path: string, body?: string) {
    return this.rawFetch(encodeVaultPath(path), {
      method,
      body,
      contentType: 'text/markdown',
    })
  }

  private async rawFetch(
    path: string,
    options: { method: string; body?: string; contentType?: string; timeoutMs?: number },
  ) {
    if (!this.config) {
      throw new Error('Obsidian adapter is not configured')
    }

    const headers: Record<string, string> = {}
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`
    }
    if (options.contentType) {
      headers['Content-Type'] = options.contentType
    }

    return fetch(`${this.config.apiUrl}${path}`, {
      method: options.method,
      headers,
      body: options.body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    })
  }
}

function countFiles(nodes: VaultNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.type === 'file' ? 1 : countFiles(node.children ?? [])),
    0,
  )
}

function flattenFiles(nodes: VaultNode[]): VaultNode[] {
  return nodes.flatMap((node) =>
    node.type === 'file' ? [node] : flattenFiles(node.children ?? []),
  )
}

function immediateEntries(parent: string, entries: string[]) {
  const prefix = parent ? `${parent.replace(/\/+$/, '')}/` : ''
  const names = new Set<string>()

  for (const entry of entries) {
    const withoutPrefix = prefix && entry.startsWith(prefix) ? entry.slice(prefix.length) : entry
    const [first] = withoutPrefix.split('/').filter(Boolean)
    if (first) {
      names.add(first)
    }
  }

  return Array.from(names)
}
