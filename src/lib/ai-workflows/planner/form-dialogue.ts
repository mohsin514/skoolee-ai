import { z } from "zod";
import type { AiWorkflowJob } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { capability } from "../registry";
import { checkCapabilityAccess } from "../registry/gates";
import type { CapabilityContext, CapabilityEntry } from "../registry/types";
import type { PlannedStep } from "../jobs/job-service";
import { WorkflowError } from "../errors";

export interface DialogueField {
  key: string;
  labels: readonly string[];
  choices?: Readonly<Record<string, readonly string[]>>;
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (text: string) => text.trim().replace(/^(?:is\s+|[:=]\s*)/i, "").replace(/(?:\s+and\s*)?[.,;\s]+$/g, "").trim();

/** Explicit routing only. It cannot execute: this capability still ends in owner review. */
export function schoolCreationName(text: string): string | null {
  const match = text.trim().match(/^(?:please\s+|kindly\s+|can you\s+|could you\s+|i (?:want|need) (?:you )?to\s+)*(?:create|add|register|onboard|provision|make)\s+(.*?)\bschools?\b\s*(.*)$/i);
  if (!match || /\b(?:don't|do not|not|without|delete|remove)\b/i.test(match[1])) return null;
  const before = clean(match[1].replace(/\b(?:a|an|the|new|single|standalone)\b/gi, ""));
  const after = clean(match[2].replace(/^(?:named|called)\s+/i, ""));
  if (after && !/^(?:in|for|with|and|on|as)\b/i.test(after) && !/[;,\n]/.test(after)) return after;
  return before || "";
}

/** Parse only explicit field labels, exact choice aliases, a single email, or the answer to the one
 * field actually asked. No model sees the email, no raw IDs/SQL are accepted, no guessed facts. */
export function readFormAnswer(text: string, fields: readonly DialogueField[], pointer?: string | null): Record<string, string> {
  const patch: Record<string, string> = {};
  const labels = fields.flatMap(field => field.labels.map(label => ({ key: field.key, label })));
  labels.sort((a, b) => b.label.length - a.label.length);
  const expression = new RegExp(`(?:^|[\\s;,])(${labels.map(item => escape(item.label)).join("|")})\\s*(?::|=|\\bis\\b)?\\s+`, "gi");
  const matches = [...text.matchAll(expression)];
  for (const [index, match] of matches.entries()) {
    const key = labels.find(item => item.label.toLowerCase() === match[1].toLowerCase())?.key;
    const end = matches[index + 1]?.index ?? text.length;
    const value = clean(text.slice((match.index ?? 0) + match[0].length, end)).replace(/\s+and$/i, "");
    if (key && value) patch[key] = value;
  }
  const emails = [...new Set(text.match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])];
  const emailField = fields.find(field => field.key === "ownerEmail");
  if (emailField && emails.length === 1) patch[emailField.key] = emails[0];
  for (const field of fields) if (field.choices) {
    const source = patch[field.key] ?? text.trim();
    for (const [value, aliases] of Object.entries(field.choices)) {
      if ([value, ...aliases].some(alias => source.toLowerCase() === alias.toLowerCase())) patch[field.key] = value;
    }
  }
  const pending = fields.find(field => `/${field.key}` === pointer);
  if (pending && !patch[pending.key] && !pending.choices && !/[?؟]/.test(text) && !/^(?:what|why|how|can you|please explain|i don.t know)\b/i.test(text.trim())) {
    const prefix = clean(text.slice(0, matches[0]?.index ?? text.length));
    // An email-only reply never becomes a school/owner name or city.
    if (pending.key === "ownerEmail") patch[pending.key] = text.trim();
    else if (prefix && !prefix.includes("@") && !/[\n;]/.test(prefix) && prefix.length <= 160) patch[pending.key] = prefix;
  }
  return patch;
}

export function validateFormPatch(entry: CapabilityEntry, saved: Record<string, unknown>, patch: Record<string, string>) {
  if (!(entry.input instanceof z.ZodObject) || !entry.dialogueFields) throw new Error("Invalid dialogue schema");
  const input = Object.fromEntries(Object.entries(saved).filter(([key]) => entry.dialogueFields!.some(field => field.key === key)));
  const invalid = new Set<string>();
  for (const field of entry.dialogueFields) if (patch[field.key] !== undefined) {
    const parsed = entry.input.shape[field.key]?.safeParse(patch[field.key]);
    if (parsed?.success) input[field.key] = parsed.data;
    else { delete input[field.key]; invalid.add(`/${field.key}`); }
  }
  const parsed = entry.input.safeParse(input);
  const missing = new Set(parsed.success ? [] : parsed.error.issues.map(issue => `/${issue.path.join("/")}`));
  for (const field of invalid) missing.add(field);
  // Registry order makes the next question predictable, independently of Zod's issue ordering.
  return { input, invalid: [...invalid], missing: entry.dialogueFields.map(field => `/${field.key}`).filter(pointer => missing.has(pointer)) };
}

export async function planFormDialogue(ctx: CapabilityContext, job: AiWorkflowJob, segments: Array<{ ordinal: number; text: string }>): Promise<PlannedStep[] | null> {
  const current = job.planVersion ? await prisma.aiWorkflowStep.findMany({ where: { schoolId: job.schoolId, jobId: job.id, planVersion: job.planVersion } }) : [];
  const previous = current.length === 1 ? current[0] : null;
  const initialName = !current.length ? schoolCreationName(segments[0]?.text ?? "") : null;
  const entry = previous ? capability(previous.capabilityKey) : initialName !== null && ctx.user.role === "APP_OWNER" ? capability("platform.provision_school") : null;
  if (!entry?.dialogueFields || (previous && previous.capabilityVersion !== entry.version)) return null;
  const access = await checkCapabilityAccess(ctx, entry);
  if (!access.ok) throw new WorkflowError("ROLE_NOT_ALLOWED");
  let saved: Record<string, unknown> = {};
  if (previous?.modelInput && typeof previous.modelInput === "object" && !Array.isArray(previous.modelInput)) {
    const missing = Array.isArray(previous.missingFields) ? previous.missingFields : [];
    saved = Object.fromEntries(Object.entries(previous.modelInput).filter(([key]) => !missing.includes(`/${key}`)));
  }
  // Re-read user answers to recover legacy jobs that lost/masked an email before this framework.
  const questions = await prisma.aiWorkflowQuestion.findMany({ where: { schoolId: job.schoolId, jobId: job.id, status: "ANSWERED" }, select: { pointer: true, answer: true } });
  let lastInvalid: string[] = [];
  const invalid = new Set<string>();
  for (const segment of segments) {
    const answered = questions.filter(q => (q.answer as { segment?: number } | null)?.segment === segment.ordinal);
    const pointer = answered.length === 1 ? answered[0].pointer : null;
    const patch = readFormAnswer(segment.text, entry.dialogueFields, pointer);
    if (segment.ordinal === 0 && initialName && !patch.schoolName) patch.schoolName = initialName;
    const next = validateFormPatch(entry, saved, patch);
    saved = next.input;
    for (const key of Object.keys(patch)) invalid.delete(`/${key}`);
    for (const pointer of next.invalid) invalid.add(pointer);
    lastInvalid = [...new Set([...next.missing, ...invalid])];
  }
  return [{ stepKey: previous?.stepKey ?? "s1", capabilityKey: entry.key, input: saved, missingFields: lastInvalid, invalidFields: [...invalid] }];
}
