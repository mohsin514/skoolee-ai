import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageCampusOps, resolveCampusId } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { guardianRelationshipAuthorityWhere } from "@/lib/parent/guardian-query";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKAI-1157 (SKAI-1105 §3.1): a guardian's consent for one child. Each answer is a new row naming who
// answered, when, every purpose's choice, the notice version and the language the notice was shown in;
// nothing is edited, so the history is the record. The latest row per guardian is the one in force, and an
// answer to an older notice version counts as out of date. Opening the screen never counts as consent.

export const CONSENT_NOTICE_VERSION = "2026-10-v1";
export const CONSENT_PURPOSES = ["schoolRecords", "familyMessages", "photosMedia", "aiAssistance", "crossBorderHosting"] as const;
export type ConsentPurpose = typeof CONSENT_PURPOSES[number];
export type ConsentLanguage = "en" | "ar" | "ur";
export type ConsentState = "CURRENT" | "OUTDATED" | "MISSING";

/** SKAI-1573: a pupil with no current answer but an earlier one is OUTDATED, never "no answer yet". */
export function pupilConsentState(states: ConsentState[]): ConsentState | "PARTIAL" {
  const current = states.filter(state => state === "CURRENT").length;
  if (states.length && current === states.length) return "CURRENT";
  if (current) return "PARTIAL";
  return states.includes("OUTDATED") ? "OUTDATED" : "MISSING";
}

type ConsentRow = { id: string; guardianUserId: string; guardianName: string; choices: Prisma.JsonValue; noticeVersion: string; language: string; receiptCode: string; createdAt: Date };
const receipt = () => `GC-${randomBytes(4).toString("hex").toUpperCase()}`;
const publicRow = (row: ConsentRow) => ({ id: row.id, guardianName: row.guardianName, choices: row.choices as Record<ConsentPurpose, boolean>, noticeVersion: row.noticeVersion, language: row.language, receiptCode: row.receiptCode, at: row.createdAt.toISOString() });

/** Validate a submission: the current notice version, a yes/no for every purpose and a supported language. */
export function parseConsentBody(body: Record<string, unknown>) {
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) throw new ApiError("Choose the child.", 400);
  if (body.noticeVersion !== CONSENT_NOTICE_VERSION) throw new ApiError("The consent notice changed. Read the new notice and answer again.", 409);
  const language = String(body.language ?? "");
  if (!["en", "ar", "ur"].includes(language)) throw new ApiError("Choose the language the notice was shown in.", 400);
  const raw = (body.choices && typeof body.choices === "object" ? body.choices : {}) as Record<string, unknown>;
  const choices = {} as Record<ConsentPurpose, boolean>;
  for (const purpose of CONSENT_PURPOSES) {
    if (typeof raw[purpose] !== "boolean") throw new ApiError("Answer yes or no for every purpose.", 400);
    choices[purpose] = raw[purpose] as boolean;
  }
  return { studentId, language: language as ConsentLanguage, choices };
}

async function guardianLink(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT") throw new ApiError("Not found", 404);
  const link = await prisma.guardianRelationship.findFirst({
    where: { ...guardianRelationshipAuthorityWhere(user.userId, new Date(), user.schoolId), studentId },
    select: { id: true, fullName: true, campusId: true },
  });
  if (!link) throw new ApiError("Not found", 404);
  return link;
}

/** The guardian's own view: the notice to show and their answers for this child, newest first. */
export const CONSENT_HISTORY_LIMIT = 500;

export async function guardianConsentView(user: AuthUser, studentId: string) {
  await guardianLink(user, studentId);
  const rows = await prisma.guardianConsent.findMany({
    where: { schoolId: user.schoolId, studentId, guardianUserId: user.userId },
    // SKAI-1569: the page promises every answer on record, so the full history is returned (one guardian,
    // one child: a short list; the cap only guards against runaway data).
    orderBy: { createdAt: "desc" }, take: CONSENT_HISTORY_LIMIT,
  });
  const latest = rows[0] ?? null;
  return {
    noticeVersion: CONSENT_NOTICE_VERSION,
    purposes: CONSENT_PURPOSES,
    state: (latest ? (latest.noticeVersion === CONSENT_NOTICE_VERSION ? "CURRENT" : "OUTDATED") : "MISSING") as ConsentState,
    current: latest ? publicRow(latest) : null,
    history: rows.map(publicRow),
  };
}

/** Record a new answer. Only a verified, current guardian of the child may answer, for themselves only. */
/** SKAI-1548: a repeat of the same answer within this window is the same submission, not a new one. */
export const CONSENT_REPLAY_WINDOW_MS = 60_000;
const sameChoices = (a: unknown, b: Record<string, boolean>) => {
  const left = (a ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(b)]);
  return [...keys].every(key => left[key] === b[key]);
};
export function isConsentReplay(previous: { choices: unknown; noticeVersion: string; language: string; createdAt: Date } | null, input: { choices: Record<string, boolean>; language: string }, noticeVersion: string, now = new Date()) {
  return Boolean(previous && previous.noticeVersion === noticeVersion && previous.language === input.language
    && now.getTime() - previous.createdAt.getTime() < CONSENT_REPLAY_WINDOW_MS && sameChoices(previous.choices, input.choices));
}

export async function recordGuardianConsent(user: AuthUser, body: Record<string, unknown>) {
  const input = parseConsentBody(body);
  const link = await guardianLink(user, input.studentId);
  return schoolAiTransaction(user, async tx => {
    // One guardian answering for one child is serialised, so two in-flight copies of one submission
    // cannot both insert: the second sees the first and returns its receipt.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guardian-consent:${user.schoolId}:${input.studentId}:${user.userId}`}))`;
    const previous = await tx.guardianConsent.findFirst({ where: { schoolId: user.schoolId, studentId: input.studentId, guardianUserId: user.userId }, orderBy: { createdAt: "desc" } });
    if (previous && isConsentReplay(previous, input, CONSENT_NOTICE_VERSION)) return publicRow(previous);
    const row = await tx.guardianConsent.create({ data: {
      schoolId: user.schoolId, campusId: link.campusId, studentId: input.studentId, guardianUserId: user.userId,
      relationshipId: link.id, guardianName: link.fullName, choices: input.choices,
      noticeVersion: CONSENT_NOTICE_VERSION, language: input.language, receiptCode: receipt(),
    } });
    await writeAuditEvent(tx, user, {
      table: "guardian_consents", recordId: row.id, action: "GRANT", campusId: link.campusId,
      after: { studentId: input.studentId, relationshipId: link.id, noticeVersion: CONSENT_NOTICE_VERSION, language: input.language, ...input.choices },
    });
    return publicRow(row);
  });
}

/** Staff view: every active pupil on the campus with each current guardian's latest answer. */
export async function campusConsentStatus(user: AuthUser, params: { campusId?: string | null; classId?: string | null }) {
  if (!canManageCampusOps(user)) throw new ApiError("Only campus administrators can view consent records.", 403);
  const campusId = await resolveCampusId(user, params.campusId);
  // One round trip: the three reads are independent once the campus is known.
  const [students, links, rows] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId: user.schoolId, campusId, archivedAt: null, consolidatedIntoId: null, status: { equals: "active", mode: "insensitive" }, ...(params.classId ? { classId: params.classId } : {}) },
      select: { id: true, fullName: true, rollNo: true, class: { select: { name: true, section: true } } },
      orderBy: [{ fullName: "asc" }], take: 500,
    }),
    prisma.guardianRelationship.findMany({ where: { ...guardianRelationshipAuthorityWhere(null, new Date(), user.schoolId), campusId }, select: { studentId: true, guardianUserId: true, fullName: true } }),
    prisma.guardianConsent.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" } }),
  ]);
  const latest = new Map<string, ConsentRow>();
  for (const row of rows) { const k = `${row.studentId}:${row.guardianUserId}`; if (!latest.has(k)) latest.set(k, row); }
  return students.map(student => {
    const guardians = links.filter(l => l.studentId === student.id && l.guardianUserId).map(link => {
      const row = latest.get(`${student.id}:${link.guardianUserId}`) ?? null;
      const state: ConsentState = row ? (row.noticeVersion === CONSENT_NOTICE_VERSION ? "CURRENT" : "OUTDATED") : "MISSING";
      return { name: link.fullName, state, consent: row ? publicRow(row) : null };
    });
    return {
      studentId: student.id, fullName: student.fullName, rollNo: student.rollNo,
      className: [student.class?.name, student.class?.section].filter(Boolean).join(" "),
      state: pupilConsentState(guardians.map(g => g.state)),
      guardians,
    };
  });
}
