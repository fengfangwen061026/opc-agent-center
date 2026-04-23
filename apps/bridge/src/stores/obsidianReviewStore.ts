import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { obsidianReviewNoteV1Schema, type ObsidianReviewNoteV1 } from "@opc/shared";
import { ensureDir, writeJsonFile } from "./jsonFiles";

export type ObsidianReviewPreview = ObsidianReviewNoteV1 & {
  content: string;
  path: string;
  skillRunId?: string;
  error?: string;
};

export class ObsidianReviewStore {
  constructor(
    private readonly dir: string,
    private readonly reviewQueuePath: string,
  ) {
    ensureDir(join(dir, "previews"));
  }

  list(): ObsidianReviewPreview[] {
    const manifest = join(this.dir, "previews.json");
    if (!existsSync(manifest)) return [];
    try {
      return (JSON.parse(readFileSync(manifest, "utf8")) as ObsidianReviewPreview[]).map(
        normalizePreview,
      );
    } catch {
      return [];
    }
  }

  get(id: string): ObsidianReviewPreview | undefined {
    return this.list().find((item) => item.id === id);
  }

  createPreview(input: {
    title: string;
    content: string;
    capsuleId?: string;
    skillRunId?: string;
  }): ObsidianReviewPreview {
    const createdAt = new Date().toISOString();
    const id = `obsidian-preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dateFolder = createdAt.slice(0, 10);
    const slug = slugify(input.title);
    const path = `${this.reviewQueuePath.replace(/^\/+|\/+$/g, "")}/${dateFolder}/${slug}-${id.slice(-7)}.md`;
    const frontmatter = {
      opc_id: id,
      capsule_id: input.capsuleId ?? "",
      source: "opc-skillos",
      status: "review",
      created_at: createdAt,
      skill_run_id: input.skillRunId ?? "",
      risk: "S2",
    };
    const markdown = reviewNoteTemplate({
      ...input,
      id,
      createdAt,
      frontmatter,
    });
    const note = obsidianReviewNoteV1Schema.parse({
      id,
      title: input.title,
      slug,
      status: "preview",
      reviewQueuePath: path,
      frontmatter,
      markdown,
      capsuleId: input.capsuleId,
      sourceRefs: input.skillRunId ? [`skill-run:${input.skillRunId}`] : [],
      createdAt,
      updatedAt: createdAt,
    });
    const preview = withLegacyAliases(note, input.skillRunId);
    writeFileSync(join(this.dir, "previews", `${id}.md`), markdown);
    this.saveManifest([preview, ...this.list()]);
    return preview;
  }

  markWaitingApproval(id: string): ObsidianReviewPreview | undefined {
    return this.update(id, { status: "waiting_approval" });
  }

  markWritten(id: string): ObsidianReviewPreview | undefined {
    return this.update(id, {
      status: "written",
      error: undefined,
      writeResult: { writtenAt: new Date().toISOString() },
    });
  }

  markWriting(id: string): ObsidianReviewPreview | undefined {
    return this.update(id, { status: "writing", error: undefined });
  }

  markVerified(
    id: string,
    writeResult: NonNullable<ObsidianReviewNoteV1["writeResult"]>,
  ): ObsidianReviewPreview | undefined {
    return this.update(id, {
      status: "verified",
      error: undefined,
      writeResult,
    });
  }

  markFailed(id: string, error: string): ObsidianReviewPreview | undefined {
    return this.update(id, {
      status: "failed",
      error,
      writeResult: { error },
    });
  }

  archive(id: string): ObsidianReviewPreview | undefined {
    return this.update(id, { status: "archived" });
  }

  promotionPreview(
    id: string,
    targetPath: string,
  ):
    | { note: ObsidianReviewPreview; targetPath: string; copyOnly: true; overwrite: false }
    | undefined {
    const note = this.get(id);
    if (!note) return undefined;
    return { note, targetPath, copyOnly: true, overwrite: false };
  }

  markPromotionTarget(id: string, targetPath: string): ObsidianReviewPreview | undefined {
    return this.update(id, { targetPath });
  }

  private update(
    id: string,
    patch: Partial<Pick<ObsidianReviewPreview, "status" | "error" | "targetPath" | "writeResult">>,
  ): ObsidianReviewPreview | undefined {
    const list = this.list();
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    list[index] = normalizePreview({
      ...list[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.saveManifest(list);
    return list[index];
  }

  private saveManifest(previews: ObsidianReviewPreview[]): void {
    writeJsonFile(join(this.dir, "previews.json"), previews);
  }
}

function withLegacyAliases(note: ObsidianReviewNoteV1, skillRunId?: string): ObsidianReviewPreview {
  return {
    ...note,
    content: note.markdown,
    path: note.reviewQueuePath,
    skillRunId:
      skillRunId ?? note.sourceRefs?.find((ref) => ref.startsWith("skill-run:"))?.slice(10),
  };
}

function normalizePreview(input: ObsidianReviewPreview): ObsidianReviewPreview {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const path = input.reviewQueuePath ?? input.path;
  const markdown = input.markdown ?? input.content ?? "";
  const note = obsidianReviewNoteV1Schema.parse({
    id: input.id,
    title: input.title,
    slug: input.slug ?? slugify(input.title),
    status: input.status,
    reviewQueuePath: path,
    targetPath: input.targetPath,
    frontmatter: input.frontmatter ?? {},
    markdown,
    capsuleId: input.capsuleId,
    sourceRefs: input.sourceRefs ?? (input.skillRunId ? [`skill-run:${input.skillRunId}`] : []),
    writeResult: input.writeResult,
    createdAt,
    updatedAt,
  });
  return {
    ...withLegacyAliases(note, input.skillRunId),
    error: input.error,
  };
}

function reviewNoteTemplate(input: {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  frontmatter: Record<string, unknown>;
  capsuleId?: string;
  skillRunId?: string;
}): string {
  const frontmatter = Object.entries(input.frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${frontmatter}\n---\n\n# ${input.title}\n\n## 来源\n\n- OPC ID: ${input.id}\n- Capsule: ${input.capsuleId ?? "无"}\n- Skill Run: ${input.skillRunId ?? "无"}\n\n## 内容\n\n${input.content}\n\n## 待审核事项\n\n- [ ] 内容是否准确\n- [ ] 是否需要移动到正式目录\n- [ ] 是否需要创建双链\n`;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "opc-review-note";
}
