import { describe, expect, it } from "vitest";
import agents from "../../../data/mock/agents.json";
import conversations from "../../../data/mock/conversations.json";
import events from "../../../data/mock/events.json";
import notifications from "../../../data/mock/notifications.json";
import skills from "../../../data/mock/skills.json";
import systemHealth from "../../../data/mock/system-health.json";
import tasks from "../../../data/mock/tasks.json";
import {
  conversationSchema,
  contextPackResultSchema,
  hermesStatusSchema,
  obsidianFileSchema,
  obsidianNoteSchema,
  opcAgentSchema,
  opcEventSchema,
  opcMessageSchema,
  opcNotificationSchema,
  opcSkillSchema,
  openClawConnectionConfigSchema,
  openClawStatusSchema,
  reflectionResultSchema,
  skillPatchSchema,
  systemHealthSchema,
  taskCapsuleSchema,
} from "../src/index";

describe("OPC core schemas", () => {
  it("parses agent mocks", () => {
    expect(() => opcAgentSchema.array().parse(agents)).not.toThrow();
  });

  it("parses skill mocks", () => {
    expect(() => opcSkillSchema.array().parse(skills)).not.toThrow();
  });

  it("parses task capsule mocks", () => {
    expect(() => taskCapsuleSchema.array().parse(tasks)).not.toThrow();
  });

  it("parses notification mocks", () => {
    expect(() => opcNotificationSchema.array().parse(notifications)).not.toThrow();
  });

  it("parses conversation and message mocks", () => {
    expect(() => conversationSchema.array().parse(conversations.conversations)).not.toThrow();
    expect(() => opcMessageSchema.array().parse(conversations.messages)).not.toThrow();
  });

  it("parses event and health mocks", () => {
    expect(() => opcEventSchema.array().parse(events)).not.toThrow();
    expect(() => systemHealthSchema.parse(systemHealth)).not.toThrow();
  });

  it("parses adapter and bridge helper schemas", () => {
    expect(() => openClawConnectionConfigSchema.parse({ mode: "mock" })).not.toThrow();
    expect(() =>
      openClawStatusSchema.parse({ connected: true, mode: "mock", authStatus: "not_required" }),
    ).not.toThrow();
    expect(() =>
      hermesStatusSchema.parse({ available: true, transport: "mock", memoryStatus: "available" }),
    ).not.toThrow();
    expect(() =>
      contextPackResultSchema.parse({
        userPreferences: [],
        projectContext: [],
        relevantHistory: [],
        warnings: [],
        suggestedSkills: [],
      }),
    ).not.toThrow();
    expect(() =>
      skillPatchSchema.parse({
        id: "patch-1",
        skillName: "skill-reflection",
        title: "Patch",
        summary: "Summary",
        before: "before",
        after: "after",
        status: "proposed",
        createdAt: "2026-04-22T14:04:40.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      reflectionResultSchema.parse({
        lessons: [],
        memoryCandidates: [],
        skillPatches: [],
        issues: [],
      }),
    ).not.toThrow();
    expect(() =>
      obsidianFileSchema
        .array()
        .parse([{ path: "08_Review_Queue", name: "08_Review_Queue", type: "folder" }]),
    ).not.toThrow();
    expect(() =>
      obsidianNoteSchema.parse({
        path: "note.md",
        title: "Note",
        content: "# Note",
        tags: [],
        updatedAt: "2026-04-22T14:04:40.000Z",
      }),
    ).not.toThrow();
  });
});
