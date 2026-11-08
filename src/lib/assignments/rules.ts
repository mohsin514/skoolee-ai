import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { wallTimeInstants } from "@/lib/locale/events";

// SKO-409 pure rules: rubric validation, local deadlines, late status and receipt checksums.

export const SUBMISSION_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"] as const;
export const FILE_TYPE_GROUPS = { PDF: ["application/pdf"], IMAGE: ["image/jpeg", "image/png", "image/webp"], WORD: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], TEXT: ["text/plain"] } as const;
export type FileTypeGroup = keyof typeof FILE_TYPE_GROUPS;

export const criterionSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  maxPoints: z.number().int().min(1).max(100),
}).strict();
export type Criterion = z.infer<typeof criterionSchema>;
export const rubricSchema = z.array(criterionSchema).max(20);

/** Problems that block a release: an empty rubric, duplicate criteria or a declared total that does not add up. */
export function rubricIssues(criteria: Criterion[], declaredTotal?: number | null): string[] {
  const issues: string[] = [];
  if (!criteria.length) issues.push("Add at least one rubric criterion.");
  if (new Set(criteria.map(c => c.id)).size !== criteria.length) issues.push("Each criterion needs a distinct id.");
  if (new Set(criteria.map(c => c.title.toLowerCase())).size !== criteria.length) issues.push("Each criterion needs a distinct title.");
  const total = rubricTotal(criteria);
  if (total > 1000) issues.push("The rubric total cannot exceed 1000 points.");
  if (declaredTotal != null && declaredTotal !== total) issues.push(`The criteria add up to ${total}, not ${declaredTotal}.`);
  return issues;
}
export const rubricTotal = (criteria: Criterion[]) => criteria.reduce((sum, c) => sum + c.maxPoints, 0);
export const sameRubric = (a: Criterion[], b: Criterion[]) => JSON.stringify(a.map(normalise)) === JSON.stringify(b.map(normalise));
const normalise = ({ id, title, description, maxPoints }: Criterion) => ({ id, title, description, maxPoints });

export const scoreSchema = z.object({ criterionId: z.string().min(1).max(40), points: z.number().int().min(0).max(100).nullable(), comment: z.string().trim().max(2000).default("") }).strict();
export type Score = z.infer<typeof scoreSchema>;

/** Scores must name rubric criteria within range; a return needs every criterion scored. */
export function scoreIssues(criteria: Criterion[], scores: Score[], complete: boolean): string[] {
  const issues: string[] = [];
  for (const score of scores) {
    const criterion = criteria.find(c => c.id === score.criterionId);
    if (!criterion) issues.push(`Unknown criterion ${score.criterionId}.`);
    else if (score.points !== null && score.points > criterion.maxPoints) issues.push(`${criterion.title} is out of ${criterion.maxPoints}.`);
  }
  if (new Set(scores.map(s => s.criterionId)).size !== scores.length) issues.push("Score each criterion once.");
  if (complete && criteria.some(c => scores.find(s => s.criterionId === c.id)?.points == null)) issues.push("Score every criterion before returning feedback.");
  return issues;
}
export const scoreTotal = (scores: Score[]) => scores.reduce((sum, s) => sum + (s.points ?? 0), 0);

export const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
/**
 * A school-local wall time ("2026-10-20T23:59") as an instant in the school timezone. A time
 * skipped by a daylight-saving change is refused; a repeated one resolves to its later instant,
 * so a learner never loses time.
 */
export function localToInstant(local: string, timezone: string): Date {
  const match = LOCAL_DATETIME.exec(local);
  if (!match) throw new Error("Use a date and time like 2026-10-20T23:59.");
  const candidates = wallTimeInstants(match[1], `${match[2]}:${match[3]}`, timezone);
  if (!candidates.length) throw new Error("That time does not exist in the school timezone (clock change). Choose another time.");
  return new Date(candidates[candidates.length - 1]);
}

/** The deadline in force for one learner: their latest approved extension, else the release deadline. */
export function effectiveDue(releaseDue: Date, extensions: { dueAt: Date; createdAt: Date }[]): Date {
  const latest = [...extensions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return latest ? latest.dueAt : releaseDue;
}
/** Late is judged by the server receipt time, never by when a local or offline draft was saved. */
export const isLate = (receivedAt: Date, due: Date) => receivedAt.getTime() > due.getTime();

export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
/** One checksum for the whole artifact: the file bytes, the typed answer, or both digests together. */
export function artifactChecksum(text: string, fileSha256: string | null): string {
  if (fileSha256 && !text) return fileSha256;
  if (!fileSha256) return sha256(text);
  return sha256(`text:${sha256(text)}\nfile:${fileSha256}`);
}
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function receiptCode(): string {
  return `RC-${[...randomBytes(8)].map(byte => ALPHABET[byte % ALPHABET.length]).join("")}`;
}
export const allowedContentTypes = (groups: string[]): string[] => groups.flatMap(group => [...(FILE_TYPE_GROUPS[group as FileTypeGroup] ?? [])]);
