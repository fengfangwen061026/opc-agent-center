import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function readJsonFiles<T>(dir: string, parse: (input: unknown) => T): T[] {
  ensureDir(dir);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJsonFile(join(dir, file), parse))
    .filter((item): item is T => Boolean(item));
}

export function readJsonFile<T>(path: string, parse: (input: unknown) => T): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  const dir = path.split("/").slice(0, -1).join("/");
  if (dir) ensureDir(dir);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
