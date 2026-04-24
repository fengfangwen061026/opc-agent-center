import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EvolverEvent, EvolverStatus, Skill, SkillPatch } from '@opc/core'
import { EvolverStatusSchema, SkillListSchema } from '@opc/core'
import type { EvolverAdapter } from './EvolverAdapter'

const repoRoot = resolve(process.cwd(), '../..')
const mockRoot = process.env.OPC_MOCK_ROOT ?? resolve(repoRoot, 'data/mock')

async function readMock<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(resolve(mockRoot, fileName), 'utf8')) as T
}

function nextSundayAtThree() {
  const now = new Date()
  const next = new Date(now)
  const day = now.getDay()
  const daysUntilSunday = (7 - day) % 7 || 7
  next.setDate(now.getDate() + daysUntilSunday)
  next.setHours(3, 0, 0, 0)
  return next.toISOString()
}

export class MockEvolverAdapter implements EvolverAdapter {
  private connected = false
  private skills: Skill[] = []
  private handlers = new Set<(event: EvolverEvent) => void>()
  private interval: NodeJS.Timeout | undefined
  private eventIndex = 0

  async connect(): Promise<void> {
    this.skills = SkillListSchema.parse(await readMock('skills.json'))
    this.connected = true
    this.startEventPump()
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
    this.handlers.clear()
  }

  async getStatus(): Promise<EvolverStatus> {
    return EvolverStatusSchema.parse({
      status: this.connected ? 'idle' : 'disabled',
      source: 'mock',
      pendingPatches: (await this.getPendingPatches()).length,
      weeklyAutoPatches: 5,
      autoPatchCountThisWeek: 5,
      evalsThisWeek: 3,
      memoryMaintenanceCount: 1,
      nextRun: nextSundayAtThree(),
      lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  async getPendingPatches(): Promise<SkillPatch[]> {
    return this.skills.flatMap((skill) =>
      skill.evolver.patches.filter((patch) => patch.status === 'pending'),
    )
  }

  async approvePatch(skillName: string, patchId: string): Promise<void> {
    this.updatePatch(skillName, patchId, 'applied')
    this.emit({
      type: 'skill.patch.auto_applied',
      skillName,
      summary: `Patch ${patchId} approved in mock Evolver.`,
    })
  }

  async rejectPatch(skillName: string, patchId: string, reason?: string): Promise<void> {
    this.updatePatch(skillName, patchId, 'rejected')
    this.emit({
      type: 'evolver.completed',
      duration: 800,
      summary: reason ? `Patch ${patchId} rejected: ${reason}` : `Patch ${patchId} rejected.`,
    })
  }

  async triggerEval(skillName: string): Promise<{ jobId: string }> {
    const jobId = `eval-${skillName}-${Date.now()}`
    this.emit({ type: 'evolver.started', triggeredBy: `eval:${skillName}` })
    setTimeout(() => {
      this.emit({
        type: 'evolver.completed',
        duration: 2000,
        summary: `Mock eval completed for ${skillName}.`,
      })
    }, 2000)
    return { jobId }
  }

  subscribe(handler: (event: EvolverEvent) => void): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  private updatePatch(skillName: string, patchId: string, status: SkillPatch['status']) {
    const decoded = decodeURIComponent(skillName)
    this.skills = this.skills.map((skill) => {
      if (
        skill.id !== decoded &&
        skill.name !== decoded &&
        skill.name.toLowerCase().replaceAll(' ', '-') !== decoded
      ) {
        return skill
      }

      return {
        ...skill,
        evolver: {
          ...skill.evolver,
          pendingPatchCount: Math.max(0, skill.evolver.pendingPatchCount - 1),
          patches: skill.evolver.patches.map((patch) =>
            patch.id === patchId
              ? {
                  ...patch,
                  status,
                  appliedAt: status === 'applied' ? new Date().toISOString() : patch.appliedAt,
                }
              : patch,
          ),
        },
      }
    })
  }

  private startEventPump() {
    if (this.interval) {
      return
    }

    this.interval = setInterval(() => {
      if (!this.connected || this.handlers.size === 0) {
        return
      }

      this.eventIndex += 1
      if (this.eventIndex % 3 === 1) {
        this.emit({
          type: 'evolver.completed',
          duration: 1480,
          summary: 'Weekly mock quality scan finished with no blocking issues.',
        })
        return
      }

      if (this.eventIndex % 3 === 2) {
        const skill = this.skills.find((item) =>
          item.evolver.patches.some((patch) => patch.status === 'pending'),
        )
        const patch = skill?.evolver.patches.find((item) => item.status === 'pending')
        if (skill && patch) {
          this.emit({ type: 'skill.patch.submitted', skillName: skill.id, patch })
          return
        }
      }

      this.emit({
        type: 'skill.patch.auto_applied',
        skillName: 'skill-task-router',
        summary: 'Updated tags and example wording after successful routing eval.',
      })
    }, 8000)
  }

  private emit(event: EvolverEvent) {
    for (const handler of this.handlers) {
      handler(event)
    }
  }
}
