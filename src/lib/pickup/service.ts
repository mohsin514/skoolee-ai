import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageCampusOps } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { zonedInstant } from "@/lib/meetings/time";

// SKO-438: authorized pickup. Verification always comes before release.
// - A guardian with the pickup permission names a recipient, the school's identity method and a window at
//   the child's campus. The QR holds only an opaque token (no name, class or custody detail); only its hash
//   is stored. Re-issuing rotates the token, so an old screenshot stops working.
// - The gate scan opens a check: campus, window, revocation, prior use and restrictions are checked, and the
//   result says "code valid · identity still needs checking". Release requires the staff member to confirm
//   the recipient's identity with the approved method; it rechecks everything and consumes the
//   authorization atomically, so two gates can never both release, and a revocation after the scan blocks.
// - Restrictions (custody order, do not release, lead approval) block release; the gate sees the instruction,
//   not the reason. Anything that cannot be verified escalates to the pickup lead — never an automatic
//   release. A lead's approved exception is recorded with who approved it.
// This module sends no notifications (see ./notify).

const ID_METHODS = ["PHOTO_ID", "SCHOOL_PICKUP_CARD", "KNOWN_TO_STAFF"] as const;
const PREFIX = "SKPU1:";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
// role-ux G29: the gate is the front desk (and campus admins, who hold the desk when no receptionist is on duty);
// lead decisions and restrictions are campus operations. The principal is academic and holds neither.
const isGate = (user: AuthUser) => canManageCampusOps(user) || user.role === "RECEPTIONIST";
const isLead = (user: AuthUser) => canManageCampusOps(user);
const sameCampus = (user: AuthUser, campusId: string) => user.role === "SUPER_ADMIN" || user.campusId === campusId;

async function event(tx: TxClient, schoolId: string, studentId: string, kind: string, actorId: string | null, detail: Record<string, unknown> = {}, ids: { authorizationId?: string | null; checkId?: string | null } = {}) {
  await tx.pickupEvent.create({ data: { schoolId, studentId, kind, actorId, detail: detail as Prisma.InputJsonValue, authorizationId: ids.authorizationId ?? null, checkId: ids.checkId ?? null } });
}

// ─── Guardians ───────────────────────────────────────────────────────────

async function guardianChild(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can authorize a pickup.", 403);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true, fullName: true } });
  const relation = student ? await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "pickup" }) : null;
  if (!student || !relation) throw new ApiError("You are not authorized to arrange pickup for this child.", 404);
  return { student, relationshipId: relation.id };
}

const codeFor = async (token: string) => ({ code: `${PREFIX}${token}`, qr: await QRCode.toDataURL(`${PREFIX}${token}`, { margin: 1, width: 220 }) });

export async function issueAuthorization(user: AuthUser, body: Record<string, unknown>) {
  const { student, relationshipId } = await guardianChild(user, String(body.studentId ?? ""));
  const recipientName = text(body.recipientName, 120), recipientRelation = text(body.recipientRelation, 60);
  if (recipientName.length < 3 || !recipientRelation) throw new ApiError("Name the person collecting and their relationship to the child.", 400);
  const idMethod = String(body.idMethod ?? "");
  if (!ID_METHODS.includes(idMethod as typeof ID_METHODS[number])) throw new ApiError("Choose how the school will check their identity.", 400);
  // Never store more than the last four characters: anything longer is refused, not truncated.
  const idLast4 = body.idLast4 ? String(body.idLast4).trim() : null;
  if (idLast4 && !/^[0-9A-Za-z]{4}$/.test(idLast4)) throw new ApiError("Give only the last four characters of the ID.", 400);
  const timezone = (await getLocalePackage(user.schoolId, student.campusId)).timezone;
  const date = String(body.date ?? ""), from = String(body.from ?? ""), until = String(body.until ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(until)) throw new ApiError("Choose the day and the pickup window.", 400);
  const validFrom = zonedInstant(date, from, timezone), validUntil = zonedInstant(date, until, timezone);
  if (validUntil <= validFrom || validUntil.getTime() - validFrom.getTime() > 12 * 3_600_000) throw new ApiError("The window must end after it starts and last at most 12 hours.", 400);
  if (validUntil <= new Date()) throw new ApiError("Choose a window that has not ended.", 400);
  if (date > calendarDateIn(timezone, new Date(Date.now() + 14 * 86_400_000))) throw new ApiError("Authorize a pickup at most 14 days ahead.", 400);
  const token = randomBytes(24).toString("base64url");
  const row = await schoolAiTransaction(user, async tx => {
    const created = await tx.pickupAuthorization.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, issuedById: user.userId, relationshipId, recipientName, recipientRelation, idMethod, idLast4, validFrom, validUntil, tokenHash: hash(token) } });
    await event(tx, user.schoolId, student.id, "ISSUED", user.userId, { recipientName, validFrom, validUntil }, { authorizationId: created.id });
    return created;
  });
  return { id: row.id, ...(await codeFor(token)), validFrom, validUntil };
}

async function ownAuthorization(user: AuthUser, tx: TxClient, id: string) {
  const row = await tx.pickupAuthorization.findFirst({ where: { id, schoolId: user.schoolId, issuedById: user.userId } });
  if (!row) throw new ApiError("Pickup authorization not found", 404);
  return row;
}

/** Rotate the token (shows the code again); the previous code stops working at once. */
export async function reissueCode(user: AuthUser, id: string) {
  await guardianChild(user, (await ownAuthorization(user, prisma, id)).studentId);
  const token = randomBytes(24).toString("base64url");
  const updated = await prisma.pickupAuthorization.updateMany({ where: { id, schoolId: user.schoolId, issuedById: user.userId, status: "ACTIVE" }, data: { tokenHash: hash(token) } });
  if (!updated.count) throw new ApiError("This authorization was already used or withdrawn.", 409);
  return codeFor(token);
}

export async function revokeAuthorization(user: AuthUser, id: string) {
  return schoolAiTransaction(user, async tx => {
    const row = await ownAuthorization(user, tx, id);
    if (row.status !== "ACTIVE") throw new ApiError("This authorization was already used or withdrawn.", 409);
    await tx.pickupAuthorization.update({ where: { id: row.id }, data: { status: "REVOKED", revokedAt: new Date(), revokedById: user.userId } });
    await event(tx, user.schoolId, row.studentId, "REVOKED", user.userId, {}, { authorizationId: row.id });
    return { id: row.id };
  });
}

export async function guardianPickups(user: AuthUser, studentId: string) {
  const { student } = await guardianChild(user, studentId);
  const rows = await prisma.pickupAuthorization.findMany({ where: { schoolId: user.schoolId, studentId: student.id, issuedById: user.userId }, orderBy: { validFrom: "desc" }, take: 20 });
  const released = await prisma.pickupEvent.findMany({ where: { schoolId: user.schoolId, studentId: student.id, kind: { in: ["RELEASED"] }, authorizationId: { in: rows.map(r => r.id) } }, select: { authorizationId: true, createdAt: true } });
  const now = new Date();
  return { timezone: (await getLocalePackage(user.schoolId, student.campusId)).timezone, items: rows.map(r => ({ id: r.id, recipientName: r.recipientName, recipientRelation: r.recipientRelation, idMethod: r.idMethod, validFrom: r.validFrom, validUntil: r.validUntil, status: r.status === "ACTIVE" && r.validUntil <= now ? "EXPIRED" : r.status, releasedAt: released.find(e => e.authorizationId === r.id)?.createdAt ?? null })) };
}

// ─── Gate ────────────────────────────────────────────────────────────────

async function activeRestriction(db: TxClient, schoolId: string, studentId: string) {
  const now = new Date();
  return db.pickupRestriction.findFirst({ where: { schoolId, studentId, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: { createdAt: "desc" } });
}

/** Why this authorization cannot release now, or null. */
function blockOf(user: AuthUser, auth: { campusId: string; status: string; validFrom: Date; validUntil: Date }, now = new Date()) {
  if (!sameCampus(user, auth.campusId)) return "WRONG_CAMPUS";
  if (auth.status === "REVOKED") return "REVOKED";
  if (auth.status === "USED") return "USED";
  if (now < auth.validFrom) return "NOT_YET";
  if (now >= auth.validUntil) return "EXPIRED";
  return null;
}

async function gateView(db: TxClient, user: AuthUser, check: { id: string; status: string; blockReason: string | null; exceptionStatus: string | null; authorizationId: string | null; studentId: string }) {
  const [student, auth, restriction] = await Promise.all([
    db.student.findFirst({ where: { id: check.studentId, schoolId: user.schoolId }, select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } }),
    check.authorizationId ? db.pickupAuthorization.findFirst({ where: { id: check.authorizationId } }) : null,
    activeRestriction(db, user.schoolId, check.studentId),
  ]);
  const authorizer = auth ? await db.user.findFirst({ where: { id: auth.issuedById }, select: { fullName: true } }) : null;
  return {
    checkId: check.id, status: check.status, blockReason: check.blockReason, exceptionStatus: check.exceptionStatus,
    student: { name: student?.fullName ?? "", className: [student?.class?.name, student?.class?.section].filter(Boolean).join(" "), rollNo: student?.rollNo ?? null },
    recipient: auth ? { name: auth.recipientName, relation: auth.recipientRelation, idMethod: auth.idMethod, idLast4: auth.idLast4, validUntil: auth.validUntil, authorizedBy: authorizer?.fullName ?? "" } : null,
    // The gate sees what to do, never why.
    restriction: restriction ? { kind: restriction.kind, instruction: restriction.instruction } : null,
  };
}

/** Scan: open a check. A valid code is never a release — identity is still to be checked. */
export async function scan(user: AuthUser, body: Record<string, unknown>) {
  if (!isGate(user)) throw new ApiError("Pickup verification access is required.", 403);
  const raw = String(body.code ?? "").trim(), gate = text(body.gate, 40) || "Main gate";
  const token = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ApiError("This is not a Skoolee pickup code.", 400);
  return schoolAiTransaction(user, async tx => {
    const auth = await tx.pickupAuthorization.findFirst({ where: { tokenHash: hash(token), schoolId: user.schoolId } });
    if (!auth) throw new ApiError("This code is not valid. Keep the student supervised and contact the pickup lead.", 404);
    const block = blockOf(user, auth);
    const restriction = await activeRestriction(tx, user.schoolId, auth.studentId);
    const check = await tx.pickupCheck.create({ data: { schoolId: user.schoolId, campusId: user.campusId ?? auth.campusId, authorizationId: auth.id, studentId: auth.studentId, gate, staffId: user.userId, status: block || (restriction && restriction.kind !== "LEAD_APPROVAL") ? "BLOCKED" : "OPEN", blockReason: block ?? (restriction && restriction.kind !== "LEAD_APPROVAL" ? "RESTRICTION" : null) } });
    await event(tx, user.schoolId, auth.studentId, block ? "BLOCKED" : "SCANNED", user.userId, { gate, block, restriction: restriction?.kind ?? null }, { authorizationId: auth.id, checkId: check.id });
    return gateView(tx, user, check);
  });
}

/** Confirm identity and release. Rechecks the authorization and restrictions, then consumes it once. */
export async function release(user: AuthUser, body: Record<string, unknown>) {
  if (!isGate(user)) throw new ApiError("Pickup verification access is required.", 403);
  const checkId = String(body.checkId ?? "");
  try {
    return await schoolAiTransaction(user, async tx => {
      await tx.$queryRaw`SELECT id FROM pickup_checks WHERE id = ${checkId} AND school_id = ${user.schoolId} FOR UPDATE`;
      const check = await tx.pickupCheck.findFirst({ where: { id: checkId, schoolId: user.schoolId } });
      if (!check || !sameCampus(user, check.campusId)) throw new ApiError("Pickup check not found", 404);
      // A retried confirmation returns the recorded result instead of releasing twice.
      if (check.status === "RELEASED") return { ...(await gateView(tx, user, check)), repeated: true };
      if (body.identityConfirmed !== true) throw new ApiError("Confirm the recipient's identity with the approved method first.", 400);
      const method = String(body.identityMethod ?? "");
      if (!ID_METHODS.includes(method as typeof ID_METHODS[number])) throw new ApiError("Say how identity was checked.", 400);
      const auth = check.authorizationId ? await tx.pickupAuthorization.findFirst({ where: { id: check.authorizationId } }) : null;
      const restriction = await activeRestriction(tx, user.schoolId, check.studentId);
      const exceptionApproved = check.exceptionStatus === "APPROVED";
      const block = !auth ? "NO_AUTHORIZATION" : blockOf(user, auth) ?? (restriction && !exceptionApproved ? "RESTRICTION" : null) ?? (auth.idMethod !== method && !exceptionApproved ? "IDENTITY_METHOD" : null);
      if (block) {
        await tx.pickupCheck.update({ where: { id: check.id }, data: { status: "BLOCKED", blockReason: block } });
        await event(tx, user.schoolId, check.studentId, "BLOCKED", user.userId, { block, at: "release" }, { authorizationId: auth?.id, checkId: check.id });
        return { ...(await gateView(tx, user, { ...check, status: "BLOCKED", blockReason: block })), repeated: false };
      }
      const consumed = await tx.pickupAuthorization.updateMany({ where: { id: auth!.id, status: "ACTIVE", usedAt: null }, data: { status: "USED", usedAt: new Date(), usedByCheckId: check.id } });
      if (!consumed.count) throw new ApiError("This code was just used at another gate. Do not release; contact the pickup lead.", 409);
      const now = new Date();
      await tx.pickupCheck.update({ where: { id: check.id }, data: { status: "RELEASED", identityMethod: method, identityAt: now, releasedAt: now } });
      await event(tx, user.schoolId, check.studentId, "RELEASED", user.userId, { recipientName: auth!.recipientName, authorizedBy: auth!.issuedById, identityMethod: method, gate: check.gate, exceptionBy: exceptionApproved ? check.exceptionById : null }, { authorizationId: auth!.id, checkId: check.id });
      return { ...(await gateView(tx, user, { ...check, status: "RELEASED" })), repeated: false, notifyGuardian: auth!.issuedById };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("This code was just used at another gate. Do not release; contact the pickup lead.", 409);
    throw error;
  }
}

/** Escalate a check (failed verification, restriction, unclear identity) to the pickup lead. */
export async function escalate(user: AuthUser, body: Record<string, unknown>) {
  if (!isGate(user)) throw new ApiError("Pickup verification access is required.", 403);
  return schoolAiTransaction(user, async tx => {
    const check = await tx.pickupCheck.findFirst({ where: { id: String(body.checkId ?? ""), schoolId: user.schoolId } });
    if (!check || !sameCampus(user, check.campusId)) throw new ApiError("Pickup check not found", 404);
    if (check.status === "RELEASED") throw new ApiError("This pickup was already released.", 409);
    const note = text(body.note, 500);
    await tx.pickupCheck.update({ where: { id: check.id }, data: { status: "ESCALATED", exceptionStatus: "REQUESTED", exceptionNote: note || null } });
    await event(tx, user.schoolId, check.studentId, "EXCEPTION_REQUESTED", user.userId, { note }, { authorizationId: check.authorizationId, checkId: check.id });
    const restriction = await activeRestriction(tx, user.schoolId, check.studentId);
    return { checkId: check.id, campusId: check.campusId, leadUserId: restriction?.leadUserId ?? null };
  });
}

/** The pickup lead decides an exception; an approval lets the gate complete release with identity checked. */
export async function decideException(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const check = await tx.pickupCheck.findFirst({ where: { id: String(body.checkId ?? ""), schoolId: user.schoolId } });
    if (!check) throw new ApiError("Pickup check not found", 404);
    const restriction = await activeRestriction(tx, user.schoolId, check.studentId);
    if (!(isLead(user) && sameCampus(user, check.campusId)) && restriction?.leadUserId !== user.userId) throw new ApiError("Only the designated pickup lead can decide this.", 403);
    if (check.exceptionStatus !== "REQUESTED") throw new ApiError("No exception is waiting for a decision.", 409);
    const decision = String(body.decision ?? ""), note = text(body.note, 500);
    if (!["approve", "deny"].includes(decision) || !note) throw new ApiError("Record the decision and why.", 400);
    if (decision === "approve" && restriction && restriction.kind !== "LEAD_APPROVAL") throw new ApiError("A custody or do-not-release restriction cannot be overridden at the gate. Lift it through the restriction record first.", 409);
    await tx.pickupCheck.update({ where: { id: check.id }, data: { exceptionStatus: decision === "approve" ? "APPROVED" : "DENIED", exceptionById: user.userId, exceptionNote: note, status: decision === "approve" ? "OPEN" : "BLOCKED" } });
    await event(tx, user.schoolId, check.studentId, decision === "approve" ? "EXCEPTION_APPROVED" : "EXCEPTION_DENIED", user.userId, { note }, { authorizationId: check.authorizationId, checkId: check.id });
    return { checkId: check.id };
  });
}

export async function gateQueue(user: AuthUser) {
  if (!isGate(user)) throw new ApiError("Pickup verification access is required.", 403);
  const today = new Date(Date.now() - 18 * 3_600_000);
  const checks = await prisma.pickupCheck.findMany({ where: { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), createdAt: { gte: today } }, orderBy: { createdAt: "desc" }, take: 50 });
  const views = [];
  for (const c of checks) views.push({ ...(await gateView(prisma, user, c)), gate: c.gate, createdAt: c.createdAt });
  return { lead: isLead(user), checks: views };
}

// ─── Restrictions (leads) ────────────────────────────────────────────────

export async function addRestriction(user: AuthUser, body: Record<string, unknown>) {
  if (!isLead(user)) throw new ApiError("Only campus leaders record pickup restrictions.", 403);
  const student = await prisma.student.findFirst({ where: { id: String(body.studentId ?? ""), schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true } });
  if (!student || !sameCampus(user, student.campusId)) throw new ApiError("Student not found", 404);
  const kind = String(body.kind ?? "");
  if (!["CUSTODY_ORDER", "DO_NOT_RELEASE", "LEAD_APPROVAL"].includes(kind)) throw new ApiError("Choose the kind of restriction.", 400);
  const instruction = text(body.instruction, 300);
  if (!instruction) throw new ApiError("Write what gate staff should do.", 400);
  return schoolAiTransaction(user, async tx => {
    const row = await tx.pickupRestriction.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, kind, instruction, reason: text(body.reason, 1000) || null, leadUserId: body.leadUserId ? String(body.leadUserId) : user.userId, endsAt: body.endsAt ? new Date(String(body.endsAt)) : null, createdById: user.userId } });
    await event(tx, user.schoolId, student.id, "RESTRICTION_ADDED", user.userId, { kind });
    return row;
  });
}

export async function liftRestriction(user: AuthUser, id: string) {
  if (!isLead(user)) throw new ApiError("Only campus leaders record pickup restrictions.", 403);
  return schoolAiTransaction(user, async tx => {
    const row = await tx.pickupRestriction.findFirst({ where: { id, schoolId: user.schoolId, liftedAt: null } });
    if (!row || !sameCampus(user, row.campusId)) throw new ApiError("Restriction not found", 404);
    await tx.pickupRestriction.update({ where: { id: row.id }, data: { liftedAt: new Date() } });
    await event(tx, user.schoolId, row.studentId, "RESTRICTION_LIFTED", user.userId, { kind: row.kind });
    return { id: row.id };
  });
}

/** Release history for one student (leaders): authorizer, recipient, verifying staff, time, exceptions. */
export async function history(user: AuthUser, studentId: string) {
  if (!isLead(user)) throw new ApiError("Only campus leaders see pickup history.", 403);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId }, select: { id: true, campusId: true, fullName: true } });
  if (!student || !sameCampus(user, student.campusId)) throw new ApiError("Student not found", 404);
  const [events, restrictions] = await Promise.all([
    prisma.pickupEvent.findMany({ where: { schoolId: user.schoolId, studentId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.pickupRestriction.findMany({ where: { schoolId: user.schoolId, studentId }, orderBy: { createdAt: "desc" } }),
  ]);
  const names = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(events.flatMap(e => [e.actorId, (e.detail as { authorizedBy?: string }).authorizedBy]).filter((x): x is string => Boolean(x)))] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName ?? ""]));
  return { student: { id: student.id, name: student.fullName }, restrictions, events: events.map(e => ({ ...e, actor: e.actorId ? names.get(e.actorId) ?? "" : null, authorizedBy: names.get(String((e.detail as { authorizedBy?: string }).authorizedBy ?? "")) ?? null })) };
}

/** Students of the leader's campus matching a name or roll number (for restrictions and history). */
export async function findStudents(user: AuthUser, q: string) {
  if (!isLead(user)) throw new ApiError("Only campus leaders search pickup records.", 403);
  const query = q.trim();
  if (query.length < 2) return [];
  return prisma.student.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), OR: [{ fullName: { contains: query, mode: "insensitive" } }, { rollNo: { contains: query } }] }, select: { id: true, fullName: true, rollNo: true, class: { select: { name: true, section: true } } }, take: 20 });
}
