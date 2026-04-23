export type HermesJsonParseResult<T> =
  | { ok: true; value: T; raw: string }
  | { ok: false; raw: string; error: string };

export function parseHermesJson<T = unknown>(raw: string): HermesJsonParseResult<T> {
  const candidates = [extractFencedJson(raw), extractObjectJson(raw)].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) as T, raw };
    } catch {
      // Try the next extraction strategy.
    }
  }
  return { ok: false, raw, error: "Hermes output did not contain parseable JSON." };
}

function extractFencedJson(raw: string): string | undefined {
  const match = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}

function extractObjectJson(raw: string): string | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  return raw.slice(start, end + 1);
}
