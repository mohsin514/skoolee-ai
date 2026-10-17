import { randomBytes } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-421: trip permission. Terms are published as numbered, immutable versions; a guardian answers one
// exact version, and the answer is kept forever (a withdrawal is a new answer, not an edit). A material
// change publishes a version that needs fresh answers while the earlier ones stay on record; a minor
// correction can be marked non-material so earlier answers still stand. Only guardians whose current
// relationship carries the trip's consent kind may answer, under the trip's signatory rule:
//   ANY_GUARDIAN  — granted once an eligible guardian grants and none declines;
//   ALL_GUARDIANS — granted only when every eligible guardian has granted.
// A decline from any eligible guardian always wins. Opening or reading a notice never counts as consent.

type Kind = "fieldTrips" | "offsiteTravel";
type Rule = "ANY_GUARDIAN" | "ALL_GUARDIANS";
export type ChildConsent = "GRANTED" | "DECLINED" | "PENDING" | "PARTIAL";

const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(`Add the ${label}.`, 400);
  return out.slice(0, max);
};
const instant = (value: unknown, label: string) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new ApiError(`Choose the ${label}.`, 400);
  return date;
};
function terms(body: Record<string, unknown>) {
  const departAt = instant(body.departAt, "departure time"), returnAt = instant(body.returnAt, "return time"), respondBy = instant(body.respondBy, "response deadline");
  if (returnAt <= departAt) throw new ApiError("The return must be after the departure.", 400);
  if (respondBy > departAt) throw new ApiError("Families must answer before the trip leaves.", 400);
  const consentKind = String(body.consentKind ?? "fieldTrips") as Kind, signatoryRule = String(body.signatoryRule ?? "ANY_GUARDIAN") as Rule;
  if (!["fieldTrips", "offsiteTravel"].includes(consentKind)) throw new ApiError("Choose the kind of permission.", 400);
  if (!["ANY_GUARDIAN", "ALL_GUARDIANS"].includes(signatoryRule)) throw new ApiError("Choose who must answer.", 400);
  const costAmount = Number(body.costAmount ?? 0);
  if (!Number.isInteger(costAmount) || costAmount < 0) throw new ApiError("Enter the cost as a whole amount.", 400);
  return { title: text(body.title, "trip name", 3, 160), destination: text(body.destination, "destination", 2, 200), departAt, returnAt, respondBy, costAmount, costCurrency: text(body.costCurrency ?? "PKR", "currency", 3, 3).toUpperCase(), contact: text(body.contact, "school contact", 3, 200), instructions: text(body.instructions ?? "", "instructions", 0, 4000), consentKind, signatoryRule };
}

const staffOnly = (user: AuthUser) => { if (!canManageOperations(user)) throw new ApiError("Only school leaders can publish trip notices.", 403); };

export async function createTrip(user: AuthUser, body: Record<string, unknown>) {
  staffOnly(user);
  const data = terms(body);
  if (data.respondBy <= new Date()) throw new ApiError("The response deadline must be in the future.", 400);
  const campusId = user.role === "SUPER_ADMIN" ? String(body.campusId ?? "") : user.campusId ?? "";
  // Invite named pupils and/or whole classes (their active pupils at the time of publishing).
  const classIds = (Array.isArray(body.classIds) ? body.classIds : []).map(String);
  const fromClasses = classIds.length ? (await prisma.student.findMany({ where: { schoolId: user.schoolId, campusId, classId: { in: classIds }, archivedAt: null, status: "active" }, select: { id: true } })).map(s => s.id) : [];
  const studentIds = [...new Set([...(Array.isArray(body.studentIds) ? body.studentIds : []).map(String), ...fromClasses])];
  if (!studentIds.length || studentIds.length > 400) throw new ApiError("Choose the pupils invited on the trip.", 400);
  return schoolAiTransaction(user, async tx => {
    const count = await tx.student.count({ where: { schoolId: user.schoolId, campusId, id: { in: studentIds }, archivedAt: null } });
    if (count !== studentIds.length) throw new ApiError("Every invited pupil must be on this campus.", 400);
    const trip = await tx.trip.create({ data: { schoolId: user.schoolId, campusId, createdById: user.userId, invitees: { create: studentIds.map(studentId => ({ schoolId: user.schoolId, studentId })) } } });
    await tx.tripVersion.create({ data: { schoolId: user.schoolId, tripId: trip.id, version: 1, ...data, material: true, publishedById: user.userId } });
    return trip;
  });
}

/** Publish revised terms. A material change needs fresh answers; earlier answers stay on record. */
export async function reviseTrip(user: AuthUser, tripId: string, body: Record<string, unknown>) {
  staffOnly(user);
  const data = terms(body);
  const material = body.material !== false;
  const changeNote = text(body.changeNote, "note on what changed", 3, 500);
  return schoolAiTransaction(user, async tx => {
    const trip = await lockTrip(tx, user, tripId);
    if (trip.status !== "OPEN") throw new ApiError("This trip was cancelled.", 409);
    if (Number(body.knownVersion) !== trip.currentVersion) throw new ApiError("Someone published newer terms. Review them before changing the trip again.", 409);
    const version = trip.currentVersion + 1;
    await tx.tripVersion.create({ data: { schoolId: user.schoolId, tripId, version, ...data, material, changeNote, publishedById: user.userId } });
    return tx.trip.update({ where: { id: tripId }, data: { currentVersion: version } });
  });
}

export async function cancelTrip(user: AuthUser, tripId: string) {
  staffOnly(user);
  return schoolAiTransaction(user, async tx => { const trip = await lockTrip(tx, user, tripId); if (trip.status !== "OPEN") throw new ApiError("This trip was already cancelled.", 409); return tx.trip.update({ where: { id: tripId }, data: { status: "CANCELLED" } }); });
}

async function lockTrip(tx: TxClient, user: AuthUser, tripId: string) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trips WHERE id = ${tripId} AND school_id = ${user.schoolId} FOR UPDATE`;
  const trip = locked ? await tx.trip.findUnique({ where: { id: tripId } }) : null;
  if (!trip || (user.role !== "SUPER_ADMIN" && user.role !== "PARENT" && trip.campusId !== user.campusId)) throw new ApiError("Trip not found", 404);
  return trip;
}

/** The version answers must refer to: the latest material version (minor corrections keep earlier answers). */
const baselineOf = (versions: { version: number; material: boolean }[]) => Math.max(1, ...versions.filter(v => v.material).map(v => v.version));

async function eligibleGuardians(db: Pick<TxClient, "guardianRelationship">, schoolId: string, studentIds: string[], kind: Kind) {
  const rows = await db.guardianRelationship.findMany({ where: { studentId: { in: studentIds }, ...liveGuardianRelationshipWhere(null, kind, new Date(), schoolId) }, select: { id: true, studentId: true, guardianUserId: true, fullName: true } });
  return rows.filter(r => r.guardianUserId);
}

function childStatus(rule: Rule, signatories: string[], latest: Map<string, string>): ChildConsent {
  const answers = signatories.map(id => latest.get(id) ?? null);
  if (answers.includes("DECLINED")) return "DECLINED";
  const granted = answers.filter(a => a === "GRANTED").length;
  if (rule === "ANY_GUARDIAN") return granted > 0 ? "GRANTED" : "PENDING";
  if (granted && granted === signatories.length) return "GRANTED";
  return granted ? "PARTIAL" : "PENDING";
}

/** Latest answer per guardian for answers given to the baseline version or later. */
function latestAnswers(consents: { guardianUserId: string; choice: string; createdAt: Date; version: number }[], baseline: number) {
  const latest = new Map<string, string>();
  for (const row of [...consents].filter(c => c.version >= baseline).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) latest.set(row.guardianUserId, row.choice === "WITHDRAWN" ? "WITHDRAWN" : row.choice);
  for (const [k, v] of latest) if (v === "WITHDRAWN") latest.delete(k);
  return latest;
}

export async function tripRoster(user: AuthUser, tripId: string) {
  staffOnly(user);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, include: { versions: { orderBy: { version: "asc" } }, invitees: true, consents: { include: { tripVersion: { select: { version: true } } }, orderBy: { createdAt: "asc" } } } });
  if (!trip) throw new ApiError("Trip not found", 404);
  const current = trip.versions.at(-1)!, baseline = baselineOf(trip.versions);
  const students = await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: trip.invitees.map(i => i.studentId) } }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } });
  const guardians = await eligibleGuardians(prisma, user.schoolId, students.map(s => s.id), current.consentKind as Kind);
  const rows = students.map(student => {
    const mine = trip.consents.filter(c => c.studentId === student.id).map(c => ({ guardianUserId: c.guardianUserId, choice: c.choice, createdAt: c.createdAt, version: c.tripVersion.version }));
    const signatories = guardians.filter(g => g.studentId === student.id).map(g => g.guardianUserId!);
    return { studentId: student.id, name: student.fullName, rollNo: student.rollNo, status: signatories.length ? childStatus(current.signatoryRule as Rule, signatories, latestAnswers(mine, baseline)) : "PENDING" as ChildConsent, signatories: signatories.length, history: mine.map(m => ({ ...m, guardian: guardians.find(g => g.guardianUserId === m.guardianUserId)?.fullName ?? null })) };
  });
  return { trip: { id: trip.id, status: trip.status, currentVersion: trip.currentVersion, baseline }, versions: trip.versions, rows, counts: Object.fromEntries(["GRANTED", "DECLINED", "PENDING", "PARTIAL"].map(k => [k, rows.filter(r => r.status === k).length])) };
}

export async function staffTrips(user: AuthUser, campusId: string) {
  staffOnly(user);
  const trips = await prisma.trip.findMany({ where: { schoolId: user.schoolId, campusId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 50 });
  return trips.map(t => ({ id: t.id, status: t.status, currentVersion: t.currentVersion, title: t.versions[0]?.title, departAt: t.versions[0]?.departAt, respondBy: t.versions[0]?.respondBy }));
}

/** Trips a guardian's children are invited on, with the current terms and where each child's answer stands. */
export async function guardianTrips(guardianUserId: string, schoolId: string, studentIds: string[], now = new Date()) {
  if (!studentIds.length) return [];
  const invites = await prisma.tripInvitee.findMany({ where: { schoolId, studentId: { in: studentIds }, trip: { status: "OPEN" } }, include: { trip: { include: { versions: { orderBy: { version: "asc" } }, consents: { include: { tripVersion: { select: { version: true } } } } } } } });
  const out = [];
  for (const invite of invites) {
    const trip = invite.trip, current = trip.versions.at(-1)!, baseline = baselineOf(trip.versions);
    const guardians = await eligibleGuardians(prisma, schoolId, [invite.studentId], current.consentKind as Kind);
    const signatories = guardians.map(g => g.guardianUserId!);
    const answers = trip.consents.filter(c => c.studentId === invite.studentId).map(c => ({ guardianUserId: c.guardianUserId, choice: c.choice, createdAt: c.createdAt, version: c.tripVersion.version, receiptCode: c.receiptCode }));
    const latest = latestAnswers(answers, baseline);
    const myAnswers = answers.filter(a => a.guardianUserId === guardianUserId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const mineNow = myAnswers.find(a => a.version >= baseline) ?? null;
    out.push({
      tripId: trip.id, studentId: invite.studentId, version: current, baseline,
      status: signatories.length ? childStatus(current.signatoryRule as Rule, signatories, latest) : "PENDING" as ChildConsent,
      canSign: signatories.includes(guardianUserId), deadlinePassed: now > current.respondBy, departed: now > current.departAt,
      myAnswer: mineNow ? { choice: mineNow.choice, version: mineNow.version, receiptCode: mineNow.receiptCode, at: mineNow.createdAt } : null,
      earlierAnswer: !mineNow && myAnswers[0] ? { choice: myAnswers[0].choice, version: myAnswers[0].version, receiptCode: myAnswers[0].receiptCode } : null,
      answeredByOther: [...latest.keys()].some(id => id !== guardianUserId),
    });
  }
  return out;
}

/** Record one guardian's answer to one exact version. Retrying with the same key returns the same receipt. */
export async function answerTrip(user: AuthUser, body: Record<string, unknown>, now = new Date()) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can answer a trip permission request.", 403);
  const choice = String(body.choice ?? ""), idempotencyKey = String(body.idempotencyKey ?? "");
  if (!["GRANTED", "DECLINED", "WITHDRAWN"].includes(choice)) throw new ApiError("Choose to give or refuse permission.", 400);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) throw new ApiError("Missing request key.", 400);
  return schoolAiTransaction(user, async tx => {
    const trip = await lockTrip(tx, user, String(body.tripId ?? ""));
    const studentId = String(body.studentId ?? "");
    const versions = await tx.tripVersion.findMany({ where: { tripId: trip.id }, orderBy: { version: "asc" } });
    const current = versions.at(-1)!;
    const repeat = await tx.tripConsent.findFirst({ where: { tripVersionId: current.id, guardianUserId: user.userId, idempotencyKey } });
    if (repeat) return repeat;
    if (!(await tx.tripInvitee.findFirst({ where: { tripId: trip.id, studentId } }))) throw new ApiError("Trip not found", 404);
    const [relationship] = await eligibleGuardians(tx, user.schoolId, [studentId], current.consentKind as Kind).then(rows => rows.filter(r => r.guardianUserId === user.userId));
    if (!relationship) throw new ApiError("Only an authorized signatory can answer for this child.", 403);
    if (trip.status !== "OPEN") throw new ApiError("This trip was cancelled.", 409);
    if (Number(body.version) !== current.version) throw new ApiError(`The trip details changed. Read version ${current.version} and choose again.`, 409);
    if (choice !== "WITHDRAWN" && now > current.respondBy) throw new ApiError("The time to answer has passed. Contact the school.", 409);
    if (choice === "WITHDRAWN") {
      if (now > current.departAt) throw new ApiError("The trip has already left.", 409);
      const latest = await tx.tripConsent.findFirst({ where: { tripId: trip.id, studentId, guardianUserId: user.userId }, orderBy: { createdAt: "desc" } });
      if (latest?.choice !== "GRANTED") throw new ApiError("There is no permission to withdraw.", 409);
    }
    const receiptCode = `TRP-${randomBytes(4).toString("hex").toUpperCase()}`;
    return tx.tripConsent.create({ data: { schoolId: user.schoolId, tripId: trip.id, tripVersionId: current.id, studentId, guardianUserId: user.userId, relationshipId: relationship.id, choice, signatoryRule: current.signatoryRule, idempotencyKey, receiptCode } });
  });
}
