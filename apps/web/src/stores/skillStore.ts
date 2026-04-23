import { create } from 'zustand'
import type { Skill, SkillDetail, SkillEvalResult } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import skillData from '../../../../data/mock/skills.json'

interface SkillStore {
  skills: Skill[]
  selectedSkill?: SkillDetail
  evalResult?: SkillEvalResult
  evalRunning: boolean
  fetchSkills: () => Promise<void>
  fetchSkill: (nameOrId: string) => Promise<void>
  updateSkill: (nameOrId: string, configYaml: string) => Promise<void>
  runEval: (nameOrId: string) => Promise<void>
  rollbackSkill: (nameOrId: string, patchId?: string) => Promise<void>
}

function fallbackSkillDetail(nameOrId: string): SkillDetail | undefined {
  const skill = (skillData as Skill[]).find((item) => item.id === nameOrId || item.name === nameOrId)
  if (!skill) return undefined

  return {
    ...skill,
    author: skill.ownerAgentId ?? 'agent-conductor',
    createdAt: '2026-04-01T08:00:00.000Z',
    updatedAt: skill.lastRunAt ?? '2026-04-23T06:00:00.000Z',
    dependencies: ['openclaw-gateway'],
    riskLevel: skill.status === 'draft' ? 'S2' : 'S1',
    configYaml: `---\nname: ${skill.id}\ndescription: ${skill.description}\nstatus: ${skill.status}\n---\n`,
    executionHistory: [],
  }
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: skillData as Skill[],
  selectedSkill: undefined,
  evalResult: undefined,
  evalRunning: false,
  fetchSkills: async () => {
    try {
      const skills = await fetchBridge<Skill[]>('/api/skills')
      set({ skills })
    } catch {
      set({ skills: skillData as Skill[] })
    }
  },
  fetchSkill: async (nameOrId) => {
    try {
      const skill = await fetchBridge<SkillDetail>(`/api/skills/${encodeURIComponent(nameOrId)}`)
      set({ selectedSkill: skill, evalResult: skill.latestEval })
    } catch {
      const fallback = fallbackSkillDetail(nameOrId)
      set({ selectedSkill: fallback, evalResult: fallback?.latestEval })
    }
  },
  updateSkill: async (nameOrId, configYaml) => {
    const previous = get().selectedSkill
    if (!previous) return

    set({ selectedSkill: { ...previous, configYaml } })
    try {
      const skill = await fetchBridge<SkillDetail>(`/api/skills/${encodeURIComponent(nameOrId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ configYaml }),
      })
      set({ selectedSkill: skill })
    } catch {
      // Local edit remains visible in mock fallback.
    }
  },
  runEval: async (nameOrId) => {
    set({ evalRunning: true })
    try {
      const result = await fetchBridge<SkillEvalResult>(`/api/skills/${encodeURIComponent(nameOrId)}/eval`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      set({ evalResult: result, evalRunning: false })
    } catch {
      window.setTimeout(() => {
        set({
          evalRunning: false,
          evalResult: {
            id: `local-eval-${Date.now()}`,
            skillId: nameOrId,
            startedAt: new Date(Date.now() - 1200).toISOString(),
            completedAt: new Date().toISOString(),
            score: 0.82,
            judgeSummary: 'Local mock eval completed while Bridge was offline.',
            cases: [
              {
                id: 'local-case-1',
                input: 'Offline eval case',
                expected: 'Show fallback behavior',
                passed: true,
                judgeComment: 'Fallback path works.',
              },
            ],
          },
        })
      }, 1500)
    }
  },
  rollbackSkill: async (nameOrId, patchId) => {
    try {
      await fetchBridge(`/api/skills/${encodeURIComponent(nameOrId)}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ patchId }),
      })
    } catch {
      // Mock fallback: the confirmation is enough to simulate rollback locally.
    }
  },
}))
