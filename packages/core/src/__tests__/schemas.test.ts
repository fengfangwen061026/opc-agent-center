import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AgentListSchema,
  ConversationListSchema,
  EvolverEventSchema,
  EvolverLogEntryListSchema,
  EvolverStatusSchema,
  MemoryStatsSchema,
  MemoryEntryListSchema,
  NotificationListSchema,
  SkillListSchema,
  SystemEventListSchema,
  SystemHealthSchema,
  TaskListSchema,
} from '../index'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '../../../../')

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')) as T
}

describe('mock data schemas', () => {
  it('parses agents.json', () => {
    expect(() => AgentListSchema.parse(readJson('data/mock/agents.json'))).not.toThrow()
  })

  it('parses skills.json', () => {
    expect(() => SkillListSchema.parse(readJson('data/mock/skills.json'))).not.toThrow()
  })

  it('parses tasks.json', () => {
    expect(() => TaskListSchema.parse(readJson('data/mock/tasks.json'))).not.toThrow()
  })

  it('parses notifications.json', () => {
    expect(() => NotificationListSchema.parse(readJson('data/mock/notifications.json'))).not.toThrow()
  })

  it('parses conversations.json', () => {
    expect(() => ConversationListSchema.parse(readJson('data/mock/conversations.json'))).not.toThrow()
  })

  it('parses events.json', () => {
    expect(() => SystemEventListSchema.parse(readJson('data/mock/events.json'))).not.toThrow()
  })

  it('parses system-health.json', () => {
    expect(() => SystemHealthSchema.parse(readJson('data/mock/system-health.json'))).not.toThrow()
  })

  it('parses memory.json', () => {
    expect(() => MemoryEntryListSchema.parse(readJson('data/mock/memory.json'))).not.toThrow()
  })

  it('parses a memory stats payload', () => {
    expect(() =>
      MemoryStatsSchema.parse({
        total: 45,
        byType: { episodic: 22, semantic: 14, procedural: 9 },
        archived: 5,
        core: 12,
        lastUpdated: '2026-04-23T06:00:00.000Z',
      }),
    ).not.toThrow()
  })

  it('parses evolver-log.json', () => {
    expect(() => EvolverLogEntryListSchema.parse(readJson('data/mock/evolver-log.json'))).not.toThrow()
  })

  it('parses an evolver status payload', () => {
    const systemHealth = SystemHealthSchema.parse(readJson('data/mock/system-health.json'))

    expect(() =>
      EvolverStatusSchema.parse({
        ...systemHealth.evolver,
        currentOperation: 'Idle and waiting for the weekly run window',
        autoPatchCountThisWeek: 4,
        evalsThisWeek: 3,
        memoryMaintenanceCount: 1,
      }),
    ).not.toThrow()
  })

  it('parses evolver event payloads', () => {
    expect(() =>
      EvolverEventSchema.parse({
        type: 'memory.maintenance.completed',
        merged: 2,
        pruned: 1,
        archived: 3,
      }),
    ).not.toThrow()
  })
})
