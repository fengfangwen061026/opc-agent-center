import type { EvolverEvent, EvolverStatus, SkillPatch } from '@opc/core'

export interface EvolverAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<EvolverStatus>
  getPendingPatches(): Promise<SkillPatch[]>
  approvePatch(skillName: string, patchId: string): Promise<void>
  rejectPatch(skillName: string, patchId: string, reason?: string): Promise<void>
  triggerEval(skillName: string): Promise<{ jobId: string }>
  subscribe(handler: (event: EvolverEvent) => void): () => void
}
