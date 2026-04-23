import { describe, expect, it } from "vitest";
import { parseHermesJson } from "../src/jsonParser";

describe("parseHermesJson", () => {
  it("parses fenced json", () => {
    const result = parseHermesJson<{ ok: boolean }>('text\n```json\n{"ok":true}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ok).toBe(true);
  });

  it("parses bare json inside prose", () => {
    const result = parseHermesJson<{ value: number }>('Here is it {"value":3} done');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.value).toBe(3);
  });

  it("falls back on invalid output", () => {
    const result = parseHermesJson("no structured data");
    expect(result.ok).toBe(false);
  });
});
