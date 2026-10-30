import { createHash } from "node:crypto";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** Binds a review to the exact staged rows, selections, mapping and expiry. Not an authorization token. */
export function importReviewToken(batch: { id: string; campusId: string; state: string; data: unknown; expiresAt: Date }) {
  return createHash("sha256").update(canonical({ id: batch.id, campusId: batch.campusId, state: batch.state, data: batch.data, expiresAt: batch.expiresAt.toISOString() })).digest("hex");
}
