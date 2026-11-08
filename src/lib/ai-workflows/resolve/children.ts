import { prisma } from "@/lib/db/prisma";
import { currentGuardianRelationship, hasGuardianPermission, type GuardianPermission, type GuardianPermissions } from "@/lib/parent/guardian-access";
import type { CapabilityContext, ScopeRule } from "../registry/types";
import { InputRequired, WorkflowError } from "../errors";
import { matchPupil, type Pupil } from "./pupils";

/**
 * Binds the child a parent names ("Hamza", "میری بیٹی زینب", "roll 12") to one of their own children,
 * through verified guardian links only (src/lib/parent/guardian-access.ts currentGuardianRelationship:
 * ACTIVE, verified, inside its validity window, one effective access version). The right the step needs
 * (attendance, fees, communication, pickup, results) is checked on that link. The model never receives
 * the list of children: it copies the parent's words and this resolver matches them on the server.
 *
 * - One usable child and no name: bound automatically.
 * - Several and the text is missing or ambiguous: a CHOICE question (`/child`) listing only own children.
 * - A link that is INVITED, REVIEW_REQUIRED, unverified, suspended or expired: SCOPE_DENIED with
 *   `reason: ASK_SCHOOL_OFFICE`. Never a self-link, never a fallback to another child.
 * - A name that is none of the parent's linked children (a sibling's or another family's child):
 *   SCOPE_DENIED `CHILD_NOT_LINKED`. Whether such a child exists at the school is never revealed.
 */
export type ChildRight = Extract<ScopeRule, { kind: "own-child" }>["permission"];

export const CHILD_RIGHT: Record<ChildRight, GuardianPermission> = {
  attendance: "attendance", fees: "finances", communication: "communication", pickup: "pickup", results: "learningRecords",
};

export interface BoundChild extends Pupil {
  campusId: string;
  classId: string | null;
  className: string;
  relationshipId: string;
  permissions: GuardianPermissions;
}

const label = (child: Pick<BoundChild, "fullName" | "nameUr" | "className">) => [child.fullName, child.nameUr, child.className].filter(Boolean).join(" · ");
const denied = (reason: "ASK_SCHOOL_OFFICE" | "GUARDIAN_RIGHT_MISSING" | "CHILD_NOT_LINKED" | "NOT_A_GUARDIAN", right?: ChildRight) =>
  new WorkflowError("SCOPE_DENIED", { reason, ...(right ? { right } : {}) });

type Linked = { live: BoundChild[]; withoutRight: BoundChild[]; unverified: Pupil[] };

/** Every child this guardian is linked to, sorted into usable for `right`, live without it, and not verified. */
export async function guardianChildren(ctx: CapabilityContext, right: ChildRight): Promise<Linked> {
  if (ctx.user.role !== "PARENT") throw denied("NOT_A_GUARDIAN");
  const links = await prisma.guardianRelationship.findMany({
    where: { schoolId: ctx.user.schoolId, guardianUserId: ctx.user.userId },
    select: { studentId: true, student: { select: { id: true, fullName: true, nameUr: true, rollNo: true, campusId: true, classId: true, class: { select: { name: true, section: true } } } } },
    orderBy: [{ student: { rollNo: "asc" } }, { student: { fullName: "asc" } }],
  });
  const out: Linked = { live: [], withoutRight: [], unverified: [] };
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.studentId)) continue;
    seen.add(link.studentId);
    const student = link.student;
    const pupil: Pupil = { id: student.id, fullName: student.fullName, nameUr: student.nameUr, rollNo: student.rollNo };
    // The authority check every family service runs (status, verification, validity, live child and account).
    const access = await currentGuardianRelationship({ schoolId: ctx.user.schoolId, studentId: student.id, guardianUserId: ctx.user.userId, at: ctx.now });
    if (!access) { out.unverified.push(pupil); continue; }
    const child: BoundChild = { ...pupil, campusId: student.campusId, classId: student.classId, className: student.class ? [student.class.name, student.class.section].filter(Boolean).join(" ") : "", relationshipId: access.id, permissions: access.permissions };
    (hasGuardianPermission(access.permissions, CHILD_RIGHT[right]) ? out.live : out.withoutRight).push(child);
  }
  return out;
}

function choice(children: readonly BoundChild[], promptKey: "CHILD_CHOICE" | "CHILD_AMBIGUOUS"): InputRequired {
  const names = children.map(child => child.fullName);
  return new InputRequired([{
    pointer: "/child", promptKey, params: { count: children.length },
    // Two children with the same name are told apart by roll number ("#12" is matched as a roll number).
    options: children.slice(0, 8).map(child => ({ value: names.filter(name => name === child.fullName).length > 1 ? `#${child.rollNo}` : child.fullName, label: label(child) })),
  }]);
}

/** One own child for `right`, from the parent's words (or none, when they have only one usable child). */
export async function resolveChild(ctx: CapabilityContext, text: string | null | undefined, right: ChildRight): Promise<BoundChild> {
  const linked = await guardianChildren(ctx, right);
  const said = text?.trim();
  if (!said) {
    if (linked.live.length === 1) return linked.live[0];
    if (linked.live.length > 1) throw choice(linked.live, "CHILD_CHOICE");
    throw linked.withoutRight.length ? denied("GUARDIAN_RIGHT_MISSING", right) : denied("ASK_SCHOOL_OFFICE");
  }
  const found = matchPupil(linked.live, said) as BoundChild[];
  if (found.length === 1) return found[0];
  if (found.length > 1) throw choice(found, "CHILD_AMBIGUOUS");
  if (matchPupil(linked.withoutRight, said).length) throw denied("GUARDIAN_RIGHT_MISSING", right);
  if (matchPupil(linked.unverified, said).length) throw denied("ASK_SCHOOL_OFFICE");
  throw denied("CHILD_NOT_LINKED");
}

/** For reads: the named child, or every own child holding `right` when none is named. */
export async function resolveChildren(ctx: CapabilityContext, text: string | null | undefined, right: ChildRight): Promise<BoundChild[]> {
  if (text?.trim()) return [await resolveChild(ctx, text, right)];
  const linked = await guardianChildren(ctx, right);
  if (linked.live.length) return linked.live;
  throw linked.withoutRight.length ? denied("GUARDIAN_RIGHT_MISSING", right) : denied("ASK_SCHOOL_OFFICE");
}

/** Re-checks a bound child at execute time (the link or its rights may have changed since the preview). */
export async function assertChild(ctx: CapabilityContext, studentId: string | undefined, right: ChildRight): Promise<BoundChild> {
  if (!studentId) throw new WorkflowError("INVALID_INPUT");
  const child = (await guardianChildren(ctx, right)).live.find(row => row.id === studentId);
  if (!child) throw denied("CHILD_NOT_LINKED");
  return child;
}

export const childLabel = label;
