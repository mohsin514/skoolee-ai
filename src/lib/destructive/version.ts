import { createHash } from "node:crypto";

/** Stable snapshot version, including dependency counts and fields without updatedAt. */
export function deletionVersion(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
