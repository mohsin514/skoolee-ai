import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { uploadPrivateObject } from "@/lib/storage/s3";

// SKO-441: internal service desk (repairs, access, supplies, information requests) for staff.
// - A request gets a stable reference (SD-<n>, per school), a category with its routing rule and the
//   school's own targets (no target, nothing is "late"), and either a named owner or the explicit
//   unassigned queue. Safety categories are urgent and reach the escalation contact at once; safeguarding
//   concerns never belong here (the form says so and offers the restricted route instead).
// - The timeline keeps INTERNAL entries (notes, routing reasons, private evidence) apart from REQUESTER
//   entries (deliberate updates). Requesters and watchers read only the latter.
// - Priority and due-date changes need a reason and keep before/after. Resolving needs the work performed;
//   the requester confirms or reopens, and reopening keeps the first response and first resolution times.
// - Overdue requests escalate once per due time (a cron claims each before sending).
// This module sends no notifications (see ./notify).

const KINDS = ["REPAIR", "ACCESS", "SUPPLIES", "INFORMATION"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const OPEN = ["OPEN", "IN_PROGRESS", "BLOCKED"];
const IMAGE = ["image/jpeg", "image/png", "image/webp"];
const HOUR = 3_600_000;
const text = (value: unknown, max: number) => { const s = String(value ?? "").trim(); return s ? s.slice(0, max) : null; };
const isStaff = (user: AuthUser) => !["PARENT", "STUDENT"].includes(user.role);
const canLead = (user: AuthUser, campusId: string) => canManageOperations(user) && (user.role === "SUPER_ADMIN" || user.campusId === campusId);

function campusOf(user: AuthUser, requested: unknown) {
  const campusId = String(requested ?? "") || user.campusId || "";
  if (!campusId) throw new ApiError("Choose a campus.", 400);
  if (user.role !== "SUPER_ADMIN" && user.campusId && campusId !== user.campusId) throw new ApiError("Choose your own campus.", 403);
  return campusId;
}

// ─── Categories and routing ───────────────────────────────────────────────

export async function createCategory(user: AuthUser, body: Record<string, unknown>) {
  const campusId = campusOf(user, body.campusId);
  if (!canLead(user, campusId)) throw new ApiError("Only campus leaders set up request types.", 403);
  const name = text(body.name, 80), team = text(body.team, 60), kind = String(body.kind ?? "");
  if (!name || !team) throw new ApiError("Give the request type a name and the team that handles it.", 400);
  if (!KINDS.includes(kind as typeof KINDS[number])) throw new ApiError("Choose repair, access, supplies or information.", 400);
  const hours = (v: unknown) => v === undefined || v === null || v === "" ? null : Number(v);
  const responseHours = hours(body.responseHours), resolveHours = hours(body.resolveHours);
  for (const h of [responseHours, resolveHours]) if (h !== null && (!Number.isInteger(h) || h < 1 || h > 24 * 90)) throw new ApiError("Targets are whole hours, or left empty when the school has none.", 400);
  const people = [body.defaultOwnerId, body.escalationId].filter(Boolean).map(String);
  if (people.length && await prisma.user.count({ where: { schoolId: user.schoolId, campusId, id: { in: people }, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } } }) !== new Set(people).size) throw new ApiError("Choose active staff of this campus.", 400);
  const safety = body.safety === true;
  if (safety && !body.escalationId) throw new ApiError("A safety request type needs a real escalation contact.", 400);
  const departmentId = body.departmentId ? String(body.departmentId) : null;
  if (departmentId && !await prisma.department.count({ where: { id: departmentId, schoolId: user.schoolId, campusId } })) throw new ApiError("Department not found", 400);
  const keywords = (Array.isArray(body.keywords) ? body.keywords : String(body.keywords ?? "").split(",")).map(k => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 30);
  try {
    return await prisma.serviceCategory.create({ data: { schoolId: user.schoolId, campusId, name, kind, team, departmentId, defaultOwnerId: body.defaultOwnerId ? String(body.defaultOwnerId) : null, escalationId: body.escalationId ? String(body.escalationId) : null, responseHours, resolveHours, keywords, safety, createdById: user.userId } });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("A request type with this name already exists.", 409); throw error; }
}

export async function listCategories(user: AuthUser, campusRequested: unknown) {
  if (!isStaff(user)) throw new ApiError("The service desk is for staff.", 403);
  const campusId = campusOf(user, campusRequested);
  const [categories, rooms] = await Promise.all([
    prisma.serviceCategory.findMany({ where: { schoolId: user.schoolId, campusId, active: true }, orderBy: [{ safety: "desc" }, { name: "asc" }], select: { id: true, name: true, kind: true, team: true, safety: true, responseHours: true, resolveHours: true, keywords: true } }),
    prisma.classRoom.findMany({ where: { schoolId: user.schoolId, campusId }, select: { id: true, roomNumber: true }, orderBy: { roomNumber: "asc" }, take: 300 }),
  ]);
  return { campusId, categories, rooms };
}

/** Rule-based suggestion from the category keywords; always confirmed by the requester. */
export function suggestCategory(categories: { id: string; keywords: string[] }[], description: string) {
  const words = description.toLowerCase();
  const scored = categories.map(c => ({ id: c.id, hits: c.keywords.filter(k => words.includes(k)).length })).filter(c => c.hits > 0).sort((a, b) => b.hits - a.hits);
  return scored[0] ? { categoryId: scored[0].id, matches: scored[0].hits } : null;
}

// ─── Access ──────────────────────────────────────────────────────────────

type Req = Prisma.ServiceRequestGetPayload<{ include: { category: true } }>;
async function isAgent(user: AuthUser, req: Req, db: TxClient = prisma) {
  if (canLead(user, req.campusId) || req.ownerId === user.userId || req.category.defaultOwnerId === user.userId || req.category.escalationId === user.userId) return true;
  return Boolean(req.category.departmentId && await db.departmentMember.count({ where: { departmentId: req.category.departmentId, userId: user.userId } }));
}
async function load(user: AuthUser, id: string, db: TxClient = prisma, lock = false) {
  if (!isStaff(user)) throw new ApiError("Request not found", 404);
  if (lock) await db.$queryRaw`SELECT id FROM service_requests WHERE id = ${id} AND school_id = ${user.schoolId} FOR UPDATE`;
  const req = await db.serviceRequest.findFirst({ where: { id, schoolId: user.schoolId }, include: { category: true } });
  if (!req) throw new ApiError("Request not found", 404);
  const agent = await isAgent(user, req, db), requester = req.requesterId === user.userId || req.watcherIds.includes(user.userId);
  // Outside your service scope and not yours: the same answer as not existing.
  if (!agent && !requester) throw new ApiError("Request not found", 404);
  return { req, agent, requester };
}

async function event(tx: TxClient, req: { id: string; schoolId: string }, version: number, kind: string, visibility: "INTERNAL" | "REQUESTER", actorId: string, body: string | null, detail: Record<string, unknown> = {}, attachment?: { key: string; type: string } | null) {
  await tx.serviceRequestEvent.create({ data: { schoolId: req.schoolId, requestId: req.id, version, kind, visibility, actorId, body, detail: detail as Prisma.InputJsonValue, attachmentKey: attachment?.key ?? null, attachmentType: attachment?.type ?? null } });
}

async function attach(user: AuthUser, requestId: string, raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const file = raw as { data?: unknown; contentType?: unknown };
  const contentType = String(file.contentType ?? "");
  if (!IMAGE.includes(contentType)) throw new ApiError("Attach a JPEG, PNG or WebP photo.", 400);
  const bytes = Buffer.from(String(file.data ?? ""), "base64");
  if (bytes.length < 32 || bytes.length > 5 * 1024 * 1024) throw new ApiError("The photo is empty or larger than 5 MB.", 400);
  const key = `service-desk/${user.schoolId}/${requestId}/${randomUUID()}.${contentType.split("/")[1]}`;
  await uploadPrivateObject(key, bytes, contentType);
  return { key, type: contentType };
}

// ─── Requests ────────────────────────────────────────────────────────────

export async function createRequest(user: AuthUser, body: Record<string, unknown>) {
  if (!isStaff(user)) throw new ApiError("The service desk is for staff.", 403);
  const idempotencyKey = String(body.idempotencyKey ?? "");
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) throw new ApiError("Missing request key.", 400);
  const repeated = await prisma.serviceRequest.findUnique({ where: { requesterId_idempotencyKey: { requesterId: user.userId, idempotencyKey } } });
  if (repeated) return { request: repeated, repeated: true, safety: false, escalationId: null as string | null };
  const campusId = campusOf(user, body.campusId);
  const category = await prisma.serviceCategory.findFirst({ where: { id: String(body.categoryId ?? ""), schoolId: user.schoolId, campusId, active: true } });
  if (!category) throw new ApiError("Choose what kind of request this is.", 400);
  const title = text(body.title, 120), description = text(body.description, 3000), location = text(body.location, 160);
  if (!title || !description) throw new ApiError("Describe the problem in a few words.", 400);
  if (!location) throw new ApiError("Say where it is.", 400);
  const roomId = body.roomId ? String(body.roomId) : null, itemId = body.itemId ? String(body.itemId) : null;
  if (roomId && !await prisma.classRoom.count({ where: { id: roomId, schoolId: user.schoolId, campusId } })) throw new ApiError("Room not found", 400);
  if (itemId && !await prisma.item.count({ where: { id: itemId, schoolId: user.schoolId } })) throw new ApiError("Item not found", 400);
  const owner = category.defaultOwnerId && await prisma.user.count({ where: { id: category.defaultOwnerId, schoolId: user.schoolId, isActive: true } }) ? category.defaultOwnerId : null;
  const id = randomUUID();
  const photo = await attach(user, id, body.photo);
  const now = new Date();
  try {
    const request = await schoolAiTransaction(user, async tx => {
      // One reference sequence per school.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`service-desk:${user.schoolId}`}))`;
      const [{ next }] = await tx.$queryRaw<{ next: number }[]>`SELECT COALESCE(MAX(CAST(substring(reference from 4) AS INTEGER)), 100) + 1 AS next FROM service_requests WHERE school_id = ${user.schoolId}`;
      const created = await tx.serviceRequest.create({ data: { id, schoolId: user.schoolId, campusId, reference: `SD-${Number(next)}`, categoryId: category.id, title, description, location, roomId, itemId, requesterId: user.userId, ownerId: owner, priority: category.safety ? "URGENT" : "NORMAL", responseDueAt: category.responseHours ? new Date(now.getTime() + category.responseHours * HOUR) : null, resolveDueAt: category.resolveHours ? new Date(now.getTime() + category.resolveHours * HOUR) : null, idempotencyKey } });
      await event(tx, created, 1, "CREATED", "REQUESTER", user.userId, null, { categoryId: category.id, team: category.team, ownerId: owner, safety: category.safety }, photo);
      return created;
    });
    return { request, repeated: false, safety: category.safety, escalationId: category.escalationId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const again = await prisma.serviceRequest.findUnique({ where: { requesterId_idempotencyKey: { requesterId: user.userId, idempotencyKey } } }); if (again) return { request: again, repeated: true, safety: false, escalationId: null }; }
    throw error;
  }
}

const people = async (schoolId: string, ids: (string | null | undefined)[]) => new Map((await prisma.user.findMany({ where: { schoolId, id: { in: [...new Set(ids.filter((v): v is string => Boolean(v)))] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName ?? ""]));
const late = (due: Date | null, done: Date | null, now: Date) => Boolean(due && !done && due < now);

function summary(r: Req, names: Map<string, string>, now: Date) {
  return { id: r.id, reference: r.reference, title: r.title, location: r.location, category: r.category.name, team: r.category.team, safety: r.category.safety, priority: r.priority, status: r.status, blockedReason: r.blockedReason, owner: r.ownerId ? names.get(r.ownerId) ?? "" : null, ownerId: r.ownerId, requester: names.get(r.requesterId) ?? "", createdAt: r.createdAt, responseDueAt: r.responseDueAt, resolveDueAt: r.resolveDueAt, firstResponseAt: r.firstResponseAt, resolvedAt: r.resolvedAt, firstResolvedAt: r.firstResolvedAt, closedAt: r.closedAt, reopenedCount: r.reopenedCount, version: r.version, overdue: OPEN.includes(r.status) && late(r.resolveDueAt, r.resolvedAt, now), responseOverdue: late(r.responseDueAt, r.firstResponseAt, now) };
}

export async function myRequests(user: AuthUser) {
  if (!isStaff(user)) throw new ApiError("The service desk is for staff.", 403);
  const rows = await prisma.serviceRequest.findMany({ where: { schoolId: user.schoolId, OR: [{ requesterId: user.userId }, { watcherIds: { has: user.userId } }] }, include: { category: true }, orderBy: { createdAt: "desc" }, take: 50 });
  const names = await people(user.schoolId, rows.flatMap(r => [r.ownerId, r.requesterId]));
  return rows.map(r => summary(r, names, new Date()));
}

/** The queue for the agent: unassigned and overdue first, within the agent's service scope. */
export async function queue(user: AuthUser, campusRequested: unknown, status = "OPEN") {
  if (!isStaff(user)) throw new ApiError("The service desk is for staff.", 403);
  const campusId = campusOf(user, campusRequested);
  const lead = canLead(user, campusId);
  const departments = lead ? [] : (await prisma.departmentMember.findMany({ where: { userId: user.userId, schoolId: user.schoolId }, select: { departmentId: true } })).map(d => d.departmentId);
  const scope: Prisma.ServiceRequestWhereInput = lead ? {} : { OR: [{ ownerId: user.userId }, { category: { defaultOwnerId: user.userId } }, { category: { escalationId: user.userId } }, ...(departments.length ? [{ category: { departmentId: { in: departments } } }] : [])] };
  if (!lead && !departments.length && !await prisma.serviceCategory.count({ where: { schoolId: user.schoolId, campusId, OR: [{ defaultOwnerId: user.userId }, { escalationId: user.userId }] } }) && !await prisma.serviceRequest.count({ where: { schoolId: user.schoolId, ownerId: user.userId } })) return { campusId, agent: false, requests: [] };
  const rows = await prisma.serviceRequest.findMany({ where: { schoolId: user.schoolId, campusId, ...(status === "OPEN" ? { status: { in: OPEN } } : status === "DONE" ? { status: { in: ["RESOLVED", "CLOSED"] } } : {}), ...scope }, include: { category: true }, orderBy: { createdAt: "asc" }, take: 200 });
  const names = await people(user.schoolId, rows.flatMap(r => [r.ownerId, r.requesterId]));
  const now = new Date(), PR: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  const list = rows.map(r => summary(r, names, now)).sort((a, b) => Number(Boolean(a.ownerId)) - Number(Boolean(b.ownerId)) || Number(b.overdue) - Number(a.overdue) || PR[a.priority] - PR[b.priority] || +new Date(a.createdAt) - +new Date(b.createdAt));
  const staff = await prisma.user.findMany({ where: { schoolId: user.schoolId, campusId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 300 });
  return { campusId, agent: true, lead, requests: list, staff: staff.map(s => ({ id: s.id, name: s.fullName ?? "" })) };
}

/** One request; requesters and watchers see only requester-visible entries. */
export async function requestView(user: AuthUser, id: string) {
  const { req, agent } = await load(user, id);
  const events = await prisma.serviceRequestEvent.findMany({ where: { requestId: req.id, ...(agent ? {} : { visibility: "REQUESTER" }) }, orderBy: [{ createdAt: "asc" }, { version: "asc" }] });
  const names = await people(user.schoolId, [req.ownerId, req.requesterId, ...req.watcherIds, ...events.map(e => e.actorId)]);
  return { ...summary(req, names, new Date()), description: req.description, agent, watchers: req.watcherIds.map(w => ({ id: w, name: names.get(w) ?? "" })),
    events: events.map(e => ({ id: e.id, kind: e.kind, visibility: e.visibility, actor: e.actorId ? names.get(e.actorId) ?? "" : null, body: e.body, detail: agent ? { ...(e.detail as Record<string, unknown>), ...publicDetail(e.kind, e.detail, names) } : publicDetail(e.kind, e.detail, names), attachment: e.attachmentKey ? `/api/service-desk/${req.id}?attachment=${e.id}` : null, createdAt: e.createdAt })) };
}
const publicDetail = (kind: string, detail: Prisma.JsonValue, names: Map<string, string>) => {
  const d = (detail ?? {}) as Record<string, unknown>;
  if (kind === "ASSIGNED") return { owner: d.ownerId ? names.get(String(d.ownerId)) ?? "" : null };
  if (kind === "CREATED") return { team: d.team };
  return {};
};

export async function attachmentFor(user: AuthUser, id: string, eventId: string) {
  const { req, agent } = await load(user, id);
  const row = await prisma.serviceRequestEvent.findFirst({ where: { id: eventId, requestId: req.id, attachmentKey: { not: null }, ...(agent ? {} : { visibility: "REQUESTER" }) } });
  if (!row?.attachmentKey || !row.attachmentKey.startsWith(`service-desk/${user.schoolId}/${req.id}/`)) throw new ApiError("Attachment not found", 404);
  return { storageKey: row.attachmentKey, contentType: row.attachmentType ?? "image/jpeg", fileName: `${req.reference}-${row.version}.${(row.attachmentType ?? "image/jpeg").split("/")[1]}` };
}

/**
 * Every change to a request. Agents: assign, priority, due, start, block, note, update, resolve.
 * Requesters: confirm, reopen, comment. Anyone with access: watch. Returns who to tell (see ./notify).
 */
export async function actOnRequest(user: AuthUser, id: string, body: Record<string, unknown>) {
  const photoRaw = body.photo;
  return schoolAiTransaction(user, async tx => {
    const { req, agent, requester } = await load(user, id, tx, true);
    if (Number(body.knownVersion) !== req.version) throw new ApiError("This request changed since you opened it. Review the latest update.", 409);
    const action = String(body.action ?? ""), v = req.version + 1, now = new Date();
    const needAgent = () => { if (!agent) throw new ApiError("This request is outside your service scope.", 403); };
    const needOpen = () => { if (!OPEN.includes(req.status)) throw new ApiError("Reopen the request before changing it.", 409); };
    const reason = () => { const r = text(body.reason, 500); if (!r) throw new ApiError("Give a reason for the change.", 400); return r; };
    const save = (data: Prisma.ServiceRequestUpdateInput) => tx.serviceRequest.update({ where: { id: req.id }, data: { ...data, version: v } });
    let notify: { event: string; recipients: string[] } | null = null;
    const audience = [req.requesterId, ...req.watcherIds].filter(x => x !== user.userId);
    switch (action) {
      case "assign": {
        needAgent(); needOpen();
        const ownerId = body.ownerId ? String(body.ownerId) : null;
        if (ownerId && !await tx.user.count({ where: { id: ownerId, schoolId: user.schoolId, campusId: req.campusId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } } })) throw new ApiError("Choose active staff of this campus.", 400);
        if (ownerId === req.ownerId) throw new ApiError("This person already owns the request.", 409);
        await save({ ownerId });
        await event(tx, req, v, "ASSIGNED", "REQUESTER", user.userId, text(body.reason, 500), { ownerId, previousOwnerId: req.ownerId });
        notify = ownerId && ownerId !== user.userId ? { event: "SERVICE_REQUEST_ASSIGNED", recipients: [ownerId] } : null;
        break;
      }
      case "priority": {
        needAgent(); needOpen();
        const priority = String(body.priority ?? "");
        if (!PRIORITIES.includes(priority as typeof PRIORITIES[number]) || priority === req.priority) throw new ApiError("Choose a different priority.", 400);
        if (req.category.safety && priority !== "URGENT") throw new ApiError("Safety requests stay urgent.", 409);
        const why = reason();
        await save({ priority });
        await event(tx, req, v, "PRIORITY", "INTERNAL", user.userId, why, { before: req.priority, after: priority });
        break;
      }
      case "due": {
        needAgent(); needOpen();
        const due = new Date(String(body.resolveDueAt ?? ""));
        if (Number.isNaN(due.getTime()) || due <= now) throw new ApiError("Choose a future due time.", 400);
        const why = reason();
        await save({ resolveDueAt: due });
        await event(tx, req, v, "DUE", "INTERNAL", user.userId, why, { before: req.resolveDueAt, after: due });
        break;
      }
      case "start": {
        needAgent(); needOpen();
        if (req.status === "IN_PROGRESS") throw new ApiError("Work has already started.", 409);
        await save({ status: "IN_PROGRESS", blockedReason: null, firstResponseAt: req.firstResponseAt ?? now, ...(req.ownerId ? {} : { ownerId: user.userId }) });
        await event(tx, req, v, "STATUS", "REQUESTER", user.userId, null, { status: "IN_PROGRESS", ownerId: req.ownerId ?? user.userId });
        notify = { event: "SERVICE_REQUEST_UPDATED", recipients: audience };
        break;
      }
      case "block": {
        needAgent(); needOpen();
        const why = text(body.reason, 300);
        if (!why) throw new ApiError("Say what the work is waiting for.", 400);
        await save({ status: "BLOCKED", blockedReason: why, firstResponseAt: req.firstResponseAt ?? now });
        await event(tx, req, v, "BLOCKED", "REQUESTER", user.userId, why);
        notify = { event: "SERVICE_REQUEST_UPDATED", recipients: audience };
        break;
      }
      case "note": {
        needAgent();
        const note = text(body.body, 3000);
        if (!note) throw new ApiError("Write the note.", 400);
        await save({});
        await event(tx, req, v, "NOTE", "INTERNAL", user.userId, note, {}, await attach(user, req.id, photoRaw));
        break;
      }
      case "update": {
        needAgent();
        const update = text(body.body, 2000);
        if (!update) throw new ApiError("Write the update for the requester.", 400);
        await save({ firstResponseAt: req.firstResponseAt ?? now });
        await event(tx, req, v, "UPDATE", "REQUESTER", user.userId, update, {}, body.sharePhoto === true ? await attach(user, req.id, photoRaw) : null);
        notify = { event: "SERVICE_REQUEST_UPDATED", recipients: audience };
        break;
      }
      case "resolve": {
        needAgent(); needOpen();
        const work = text(body.workPerformed, 2000);
        if (!work) throw new ApiError("Record the work performed before resolving.", 400);
        const photo = await attach(user, req.id, photoRaw);
        await save({ status: "RESOLVED", blockedReason: null, resolvedAt: now, firstResolvedAt: req.firstResolvedAt ?? now, firstResponseAt: req.firstResponseAt ?? now });
        await event(tx, req, v, "RESOLVED", "REQUESTER", user.userId, work, {}, photo && body.sharePhoto !== false ? photo : null);
        if (photo && body.sharePhoto === false) await event(tx, req, v, "NOTE", "INTERNAL", user.userId, "Completion evidence (internal)", {}, photo);
        notify = { event: "SERVICE_REQUEST_RESOLVED", recipients: audience };
        break;
      }
      case "confirm": {
        if (req.requesterId !== user.userId) throw new ApiError("Only the requester confirms the work.", 403);
        if (req.status !== "RESOLVED") throw new ApiError("Nothing is waiting for your confirmation.", 409);
        await save({ status: "CLOSED", closedAt: now });
        await event(tx, req, v, "CONFIRMED", "REQUESTER", user.userId, text(body.body, 1000));
        break;
      }
      case "reopen": {
        if (req.requesterId !== user.userId && !agent) throw new ApiError("Only the requester or the service team reopens a request.", 403);
        if (!["RESOLVED", "CLOSED"].includes(req.status)) throw new ApiError("This request is still open.", 409);
        if (req.closedAt && now.getTime() - req.closedAt.getTime() > 30 * 24 * HOUR) throw new ApiError("This request was closed more than 30 days ago. Create a new request.", 409);
        const why = text(body.reason, 1000);
        if (!why) throw new ApiError("Describe what is still wrong.", 400);
        // First response and first resolution times are kept; only the current resolution is cleared.
        await save({ status: req.ownerId ? "IN_PROGRESS" : "OPEN", resolvedAt: null, closedAt: null, reopenedCount: { increment: 1 } });
        await event(tx, req, v, "REOPENED", "REQUESTER", user.userId, why, { previousResolvedAt: req.resolvedAt });
        notify = { event: "SERVICE_REQUEST_REOPENED", recipients: [req.ownerId ?? req.category.defaultOwnerId ?? req.category.escalationId].filter((x): x is string => Boolean(x) && x !== user.userId) };
        break;
      }
      case "comment": {
        if (!requester) throw new ApiError("Request not found", 404);
        const comment = text(body.body, 2000);
        if (!comment) throw new ApiError("Write your message.", 400);
        await save({});
        await event(tx, req, v, "UPDATE", "REQUESTER", user.userId, comment, { fromRequester: true }, await attach(user, req.id, photoRaw));
        notify = { event: "SERVICE_REQUEST_COMMENT", recipients: [req.ownerId].filter((x): x is string => Boolean(x) && x !== user.userId) };
        break;
      }
      case "watch": {
        const watcherId = String(body.watcherId ?? "");
        if (!await tx.user.count({ where: { id: watcherId, schoolId: user.schoolId, campusId: req.campusId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } } })) throw new ApiError("Choose active staff of this campus.", 400);
        if (req.watcherIds.includes(watcherId) || watcherId === req.requesterId) throw new ApiError("Already following this request.", 409);
        await save({ watcherIds: { push: watcherId } });
        await event(tx, req, v, "NOTE", "INTERNAL", user.userId, null, { watcherAdded: watcherId });
        break;
      }
      default: throw new ApiError("Unknown action", 400);
    }
    return { id: req.id, version: v, campusId: req.campusId, reference: req.reference, notify };
  });
}

/** Overdue open requests not yet escalated for their current due time (cron). */
export async function overdueForEscalation(now = new Date()) {
  return prisma.serviceRequest.findMany({ where: { status: { in: OPEN }, resolveDueAt: { lt: now } }, include: { category: { select: { escalationId: true, defaultOwnerId: true } } }, take: 500 })
    .then(rows => rows.filter(r => r.escalatedForDue?.getTime() !== r.resolveDueAt!.getTime()));
}
