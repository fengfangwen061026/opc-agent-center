import type { EvolverEvent, EvolverStatus, SkillPatch } from '@opc/core'
import { EvolverStatusSchema, SkillPatchSchema } from '@opc/core'
import type { EvolverAdapter } from './EvolverAdapter'

// OpenClaw sub-agent REST endpoints are inferred from the local Gateway contract:
// - GET  /api/subagents/evolver/status
// - POST /api/subagents/evolver/invoke
// - GET  /api/subagents/evolver/patches
// TODO: confirm endpoint names with OpenClaw docs when the sub-agent REST API is published.
interface RealEvolverAdapterOptions {
  baseUrl: string
  token?: string
}

class EvolverHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function numberFrom(value: unknown, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
}

function stringFrom(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function dateFrom(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  return undefined
}

function statusFrom(value: unknown): EvolverStatus['status'] {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (
    normalized === 'running' ||
    normalized === 'idle' ||
    normalized === 'error' ||
    normalized === 'disabled'
  ) {
    return normalized
  }

  if (normalized === 'active' || normalized === 'busy' || normalized === 'working') {
    return 'running'
  }

  return 'idle'
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []

  for (const key of ['data', 'patches', 'items', 'results']) {
    const nested = value[key]
    if (Array.isArray(nested)) return nested
  }

  return []
}

function pendingSkillPatches(values: unknown[]): SkillPatch[] {
  return values.reduce<SkillPatch[]>((patches, value) => {
    const parsed = SkillPatchSchema.safeParse(value)
    if (parsed.success && parsed.data.status === 'pending') {
      patches.push(parsed.data)
    }
    return patches
  }, [])
}

export class RealEvolverAdapter implements EvolverAdapter {
  private connected = false
  private handlers = new Set<(event: EvolverEvent) => void>()
  private pollTimer: NodeJS.Timeout | undefined
  private lastStatus: EvolverStatus | undefined

  constructor(private readonly options: RealEvolverAdapterOptions) {}

  async connect(): Promise<void> {
    const status = await this.getStatus()
    this.connected = true
    this.lastStatus = status
    this.startPolling()
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
    this.handlers.clear()
  }

  async getStatus(): Promise<EvolverStatus> {
    const raw = await this.fetchJson<unknown>('/api/subagents/evolver/status')
    const record = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
    const status = isRecord(record) ? record : {}

    return EvolverStatusSchema.parse({
      status: statusFrom(status.status ?? status.state ?? status.phase),
      pendingPatches: numberFrom(
        status.pendingPatches ??
          status.pending_patches ??
          status.pendingPatchCount ??
          status.patchCount,
      ),
      weeklyAutoPatches: numberFrom(
        status.weeklyAutoPatches ?? status.weekly_auto_patches ?? status.autoPatchCountThisWeek,
      ),
      autoPatchCountThisWeek: numberFrom(
        status.autoPatchCountThisWeek ?? status.auto_patch_count_this_week,
      ),
      evalsThisWeek: numberFrom(status.evalsThisWeek ?? status.evals_this_week),
      memoryMaintenanceCount: numberFrom(
        status.memoryMaintenanceCount ?? status.memory_maintenance_count,
      ),
      lastRun: dateFrom(status.lastRun ?? status.last_run),
      nextRun: dateFrom(status.nextRun ?? status.next_run),
      currentOperation: stringFrom(status.currentOperation ?? status.current_operation),
      lastError: stringFrom(status.lastError ?? status.last_error),
    })
  }

  async getPendingPatches(): Promise<SkillPatch[]> {
    try {
      const raw = await this.fetchJson<unknown>('/api/subagents/evolver/patches')
      return pendingSkillPatches(firstArray(raw))
    } catch (error) {
      if (error instanceof EvolverHttpError && error.status === 404) {
        return this.getPendingPatchesFromSkills()
      }
      throw error
    }
  }

  async approvePatch(skillName: string, patchId: string): Promise<void> {
    await this.fetchJson(`/api/subagents/evolver/patches/${encodeURIComponent(patchId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ skillName }),
    })
  }

  async rejectPatch(skillName: string, patchId: string, reason?: string): Promise<void> {
    await this.fetchJson(`/api/subagents/evolver/patches/${encodeURIComponent(patchId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ skillName, reason }),
    })
  }

  async triggerEval(skillName: string): Promise<{ jobId: string }> {
    const raw = await this.fetchJson<unknown>('/api/subagents/evolver/invoke', {
      method: 'POST',
      body: JSON.stringify({ action: 'eval', skillName }),
    })
    const record = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
    const jobId = isRecord(record)
      ? stringFrom(
          record.jobId ??
            record.job_id ??
            record.id ??
            (isRecord(record.job) ? record.job.id : undefined),
        )
      : undefined

    if (!jobId) {
      throw new Error('RealEvolverAdapter: invoke response missing jobId')
    }

    this.emit({ type: 'evolver.started', triggeredBy: `eval:${skillName}` })
    return { jobId }
  }

  subscribe(handler: (event: EvolverEvent) => void): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  private async getPendingPatchesFromSkills() {
    try {
      const raw = await this.fetchJson<unknown>('/api/skills?hasPendingPatch=true')
      const skills = firstArray(raw)
      return pendingSkillPatches(
        skills.flatMap((skill) =>
          isRecord(skill) && isRecord(skill.evolver) ? firstArray(skill.evolver.patches) : [],
        ),
      )
    } catch (error) {
      if (error instanceof EvolverHttpError && error.status === 404) {
        return []
      }
      throw error
    }
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return
    }

    this.pollTimer = setInterval(() => {
      void this.poll()
    }, 10000)
  }

  private async poll(): Promise<void> {
    if (!this.connected) {
      return
    }

    try {
      const previous = this.lastStatus
      const next = await this.getStatus()
      this.lastStatus = next

      if (previous?.status !== 'running' && next.status === 'running') {
        this.emit({ type: 'evolver.started', triggeredBy: next.currentOperation ?? 'poll' })
      }

      if (previous?.status === 'running' && next.status === 'idle') {
        this.emit({ type: 'evolver.completed', duration: 0, summary: 'Evolver run completed.' })
      }

      if (previous?.status !== 'error' && next.status === 'error') {
        this.emit({
          type: 'evolver.error',
          message: next.lastError ?? 'Evolver reported an error.',
        })
      }
    } catch {
      // Polling must not destabilize Bridge. The factory handles initial reachability.
    }
  }

  private emit(event: EvolverEvent): void {
    for (const handler of this.handlers) {
      handler(event)
    }
  }

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (this.options.token) {
      headers.set('Authorization', `Bearer ${this.options.token}`)
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      throw new EvolverHttpError(
        `RealEvolverAdapter: HTTP ${response.status} for ${path}`,
        response.status,
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }
}
