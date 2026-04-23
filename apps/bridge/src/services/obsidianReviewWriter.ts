import { createHash } from "node:crypto";
import type { ObsidianAdapter } from "@opc/obsidian-adapter";
import type { ObsidianReviewPreview, ObsidianReviewStore } from "../stores/obsidianReviewStore";

export type ObsidianWriteVerifyResult = {
  note: ObsidianReviewPreview;
  sha256: string;
  readbackSha256: string;
  verified: boolean;
  readbackPreview: string;
};

export async function writeReviewNoteCreateOnlyAndVerify(
  adapter: ObsidianAdapter,
  store: ObsidianReviewStore,
  note: ObsidianReviewPreview,
): Promise<ObsidianWriteVerifyResult> {
  store.markWriting(note.id);
  const sha256 = hashText(note.content);
  await adapter.write(note.path, note.content, { mode: "createOnly" });
  const readback = await adapter.read(note.path);
  const readbackSha256 = hashText(readback.content);
  const verified = sha256 === readbackSha256;
  const patched = verified
    ? store.markVerified(note.id, {
        writtenAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        sha256,
        readbackSha256,
        readbackPreview: readback.content.slice(0, 800),
      })
    : store.markFailed(note.id, "readback hash mismatch");
  if (!verified) throw new Error("Obsidian readback hash mismatch");
  return {
    note: patched ?? note,
    sha256,
    readbackSha256,
    verified,
    readbackPreview: readback.content.slice(0, 800),
  };
}

export function hashText(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
