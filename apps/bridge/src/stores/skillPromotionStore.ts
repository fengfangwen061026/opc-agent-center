import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  skillPromotionRequestV1Schema,
  type SkillDescriptorV1,
  type SkillEvalV1,
  type SkillPromotionRequestV1,
} from "@opc/shared";
import { ensureDir, readJsonFiles, writeJsonFile } from "./jsonFiles";

export class SkillPromotionStore {
  private readonly promotions = new Map<string, SkillPromotionRequestV1>();

  constructor(
    private readonly dir: string,
    private readonly backupDir: string,
  ) {
    for (const promotion of readJsonFiles(dir, (input) =>
      skillPromotionRequestV1Schema.parse(input),
    )) {
      this.promotions.set(promotion.id, promotion);
    }
  }

  list(): SkillPromotionRequestV1[] {
    return [...this.promotions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): SkillPromotionRequestV1 | undefined {
    return this.promotions.get(id);
  }

  create(input: {
    skill: SkillDescriptorV1;
    to: "experimental" | "stable";
    targetRoot: string;
    evalResult?: SkillEvalV1;
  }): SkillPromotionRequestV1 {
    const now = new Date().toISOString();
    const from = input.skill.lifecycle === "draft" ? "draft" : "experimental";
    if (input.to === "stable" && input.evalResult?.status !== "passed") {
      throw new Error("experimental → stable 需要 eval passed。");
    }
    const skillDir = dirname(input.skill.path);
    const targetPath = join(input.targetRoot, basename(skillDir));
    const promotion = skillPromotionRequestV1Schema.parse({
      id: `skill-promotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      skillId: input.skill.id,
      from,
      to: input.to,
      sourcePath: skillDir,
      targetPath,
      evalId: input.evalResult?.id,
      status: "waiting_approval",
      createdAt: now,
      updatedAt: now,
    });
    this.promotions.set(promotion.id, promotion);
    this.save(promotion);
    return promotion;
  }

  approve(id: string): SkillPromotionRequestV1 | undefined {
    return this.patch(id, { status: "approved" });
  }

  reject(id: string): SkillPromotionRequestV1 | undefined {
    return this.patch(id, { status: "rejected" });
  }

  apply(id: string): SkillPromotionRequestV1 | undefined {
    const promotion = this.promotions.get(id);
    if (!promotion) return undefined;
    if (promotion.status === "applied") return promotion;
    if (!existsSync(promotion.sourcePath)) return this.patch(id, { status: "failed" });
    let backupPath: string | undefined;
    if (existsSync(promotion.targetPath)) {
      backupPath = join(
        this.backupDir,
        promotion.skillId,
        new Date().toISOString().replace(/[:.]/g, "-"),
      );
      mkdirSync(dirname(backupPath), { recursive: true });
      cpSync(promotion.targetPath, backupPath, { recursive: true });
      rmSync(promotion.targetPath, { recursive: true, force: true });
    }
    mkdirSync(dirname(promotion.targetPath), { recursive: true });
    cpSync(promotion.sourcePath, promotion.targetPath, { recursive: true });
    return this.patch(id, { status: "applied", backupPath });
  }

  private patch(
    id: string,
    patch: Partial<Pick<SkillPromotionRequestV1, "status" | "backupPath">>,
  ): SkillPromotionRequestV1 | undefined {
    const existing = this.promotions.get(id);
    if (!existing) return undefined;
    const next = skillPromotionRequestV1Schema.parse({
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.promotions.set(next.id, next);
    this.save(next);
    return next;
  }

  private save(promotion: SkillPromotionRequestV1): void {
    ensureDir(this.dir);
    writeJsonFile(join(this.dir, `${promotion.id}.json`), promotion);
  }
}
