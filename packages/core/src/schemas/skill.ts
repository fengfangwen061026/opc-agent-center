import { z } from 'zod'

export const SkillStatusSchema = z.enum(['stable', 'experimental', 'draft'])
export const SkillPatchTypeSchema = z.enum(['auto', 'review_required'])
export const SkillPatchStatusSchema = z.enum(['pending', 'applied', 'rejected'])

export const SkillPatchSchema = z.object({
  id: z.string(),
  type: SkillPatchTypeSchema,
  status: SkillPatchStatusSchema,
  version: z.string().optional(),
  summary: z.string(),
  reason: z.string(),
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().optional(),
  scoreBefore: z.number().min(0).max(1).optional(),
  scoreAfter: z.number().min(0).max(1).optional(),
  diff: z
    .object({
      before: z.string(),
      after: z.string(),
    })
    .optional(),
})

export const SkillRiskLevelSchema = z.enum(['S1', 'S2', 'S3', 'S4'])

export const SkillExecutionRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  source: z.string(),
  status: z.enum(['success', 'fail']),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
})

export const SkillEvalCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  expected: z.string(),
  passed: z.boolean(),
  judgeComment: z.string(),
})

export const SkillEvalResultSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  score: z.number().min(0).max(1),
  cases: z.array(SkillEvalCaseSchema),
  judgeSummary: z.string(),
})

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: SkillStatusSchema,
  version: z.string(),
  ownerAgentId: z.string().optional(),
  tags: z.array(z.string()),
  triggerCount: z.number().nonnegative(),
  successRate: z.number().min(0).max(1),
  healthScore: z.number().min(0).max(1),
  lastRunAt: z.string().datetime().optional(),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  evolver: z.object({
    pendingPatchCount: z.number().nonnegative(),
    autoPatchCount: z.number().nonnegative(),
    patches: z.array(SkillPatchSchema),
  }),
})

export const SkillListSchema = z.array(SkillSchema)

export const SkillDetailSchema = SkillSchema.extend({
  author: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  dependencies: z.array(z.string()),
  riskLevel: SkillRiskLevelSchema,
  configYaml: z.string(),
  executionHistory: z.array(SkillExecutionRecordSchema),
  latestEval: SkillEvalResultSchema.optional(),
})

export type SkillStatus = z.infer<typeof SkillStatusSchema>
export type SkillPatchType = z.infer<typeof SkillPatchTypeSchema>
export type SkillPatchStatus = z.infer<typeof SkillPatchStatusSchema>
export type SkillPatch = z.infer<typeof SkillPatchSchema>
export type Skill = z.infer<typeof SkillSchema>
export type SkillRiskLevel = z.infer<typeof SkillRiskLevelSchema>
export type SkillExecutionRecord = z.infer<typeof SkillExecutionRecordSchema>
export type SkillEvalCase = z.infer<typeof SkillEvalCaseSchema>
export type SkillEvalResult = z.infer<typeof SkillEvalResultSchema>
export type SkillDetail = z.infer<typeof SkillDetailSchema>
