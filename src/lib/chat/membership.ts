import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { campusScope } from "@/lib/auth/policy";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { canDirectMessage, getChatSettings, prefetchChatRelations, type ChatPeer } from "./policy";

export const conversationInclude = {
  members: {
    where: { leftAt: null, user: { isActive: true } },
    select: {
      userId: true, memberRole: true, unreadCount: true, lastReadAt: true,
      isMuted: true, isPinned: true, isArchived: true,
      user: { select: { id: true, fullName: true, role: true, profileImageUrl: true } },
    },
  },
} satisfies Prisma.ConversationInclude;
export type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

/** AND composition preserves the exact class when adding the shared child/account predicates. */
export function classGuardianMembershipWhere(schoolId: string, classId: string, parentIds: string[]): Prisma.GuardianRelationshipWhereInput {
  return { AND: [liveGuardianRelationshipWhere(null, "communication", new Date(), schoolId), { guardianUserId: { in: parentIds }, student: { classId } }] };
}

/** Recheck class recipients immediately before publishing or creating notifications. */
export async function currentClassMembers(row: ConversationRow, db: TxClient = prisma): Promise<ConversationRow> {
  if (row.kind === "CLASS") {
    const parentIds = row.members.filter(member => member.user.role === "PARENT").map(member => member.userId);
    const links = row.classId && parentIds.length ? await db.guardianRelationship.findMany({ where: classGuardianMembershipWhere(row.schoolId, row.classId, parentIds), select: { guardianUserId: true }, distinct: ["guardianUserId"] }) : [];
    const permitted = new Set(links.flatMap(link => link.guardianUserId ? [link.guardianUserId] : []));
    return { ...row, members: row.members.filter(member => member.user.role !== "PARENT" || permitted.has(member.userId)) };
  }
  return row;
}

/** Roles that see conversations school-wide; every other role sees only its own campus's conversations. */
const SCHOOL_WIDE_CHAT_ROLES: readonly string[] = ["SUPER_ADMIN", "PARENT", "STUDENT"];
export const campusBoundChatRole = (role: string) => role !== "APP_OWNER" && !SCHOOL_WIDE_CHAT_ROLES.includes(role);

function outsideScope(user: AuthUser, loaded: Pick<ConversationRow, "schoolId" | "campusId">) {
  return user.role === "APP_OWNER" || loaded.schoolId !== user.schoolId || campusBoundChatRole(user.role) && loaded.campusId !== user.campusId;
}

/**
 * SKAI-1938: the campus a new group or channel is stamped with. A creator with a campus keeps it. A creator without
 * one (a school-wide SUPER_ADMIN) takes the campus of the campus-bound staff they add, so those staff can see it;
 * staff from two campuses cannot share one room, because each of them only sees their own campus.
 */
export function groupCampusId(user: Pick<AuthUser, "campusId" | "role">, members: Array<{ role: string; campusId: string | null }>): string | null {
  // A campus-bound creator sees only its own campus (even a null one), so its rooms keep that campus as before.
  if (user.campusId || campusBoundChatRole(user.role)) return user.campusId;
  const campuses = new Set(members.filter((member) => campusBoundChatRole(member.role)).map((member) => member.campusId));
  if (campuses.size > 1) throw new ApiError("Staff from different campuses cannot share a group. Create one group per campus.", 400);
  return [...campuses][0] ?? null;
}

/** SKAI-1938: the same campus rule as outsideScope, as a conversation filter (the unread badge counts only visible rooms). */
export function visibleConversationWhere(user: AuthUser): Prisma.ConversationWhereInput {
  return { schoolId: user.schoolId, ...(campusBoundChatRole(user.role) ? { campusId: user.campusId } : {}) };
}

/** A DIRECT thread stays open only while the current messaging policy allows the other member. */
async function assertDirectPeer(user: AuthUser, members: Array<{ userId: string }>, db: TxClient) {
  const other = members.find(member => member.userId !== user.userId);
  const peer = other && await db.user.findFirst({ where: { id: other.userId, schoolId: user.schoolId, isActive: true }, select: { id: true, role: true, campusId: true, isActive: true } });
  if (!peer || !(await canDirectMessage(user, peer, await getChatSettings(user.schoolId, db), db)).allowed) throw new ApiError("Conversation not found", 404);
}

export async function assertCurrentConversationAccess(user: AuthUser, loaded: ConversationRow, db: TxClient = prisma) {
  if (outsideScope(user, loaded)) throw new ApiError("Conversation not found", 404);
  const row = await currentClassMembers(loaded, db);
  const me = row.members.find(member => member.userId === user.userId);
  if (!me) throw new ApiError("Conversation not found", 404);
  if (row.kind === "DIRECT") await assertDirectPeer(user, row.members, db);
  return { row, me };
}

export async function requireMembership(user: AuthUser, conversationId: string, db: TxClient = prisma) {
  const row = await db.conversation.findFirst({ where: { id: conversationId, ...campusScope(user) }, include: conversationInclude });
  if (!row) throw new ApiError("Conversation not found", 404);
  return assertCurrentConversationAccess(user, row, db);
}

/**
 * SKAI-1879: requireMembership's decision for one conversation without its roster, for callers that only need
 * "may this user read or act here" (message pages, read receipts, attachments). It reads the caller's own membership
 * (and the other member of a DIRECT thread), checks only the caller's own class guardian link, and runs the same
 * DIRECT policy, so the cost no longer grows with the size of a class or group channel.
 */
export async function requireConversationAccess(user: AuthUser, conversationId: string, db: TxClient = prisma) {
  const row = await db.conversation.findFirst({
    where: { id: conversationId, ...campusScope(user) },
    select: {
      id: true, kind: true, schoolId: true, campusId: true, classId: true,
      members: { where: { ...conversationInclude.members.where, OR: [{ userId: user.userId }, { conversation: { kind: "DIRECT" } }] }, select: { userId: true, memberRole: true, user: { select: { role: true } } } },
    },
  });
  if (!row || outsideScope(user, row)) throw new ApiError("Conversation not found", 404);
  const me = row.members.find(member => member.userId === user.userId);
  if (!me) throw new ApiError("Conversation not found", 404);
  // currentClassMembers: a parent stays in a CLASS channel only while a live guardian link to that class holds.
  if (row.kind === "CLASS" && me.user.role === "PARENT") {
    const links = row.classId ? await db.guardianRelationship.findMany({ where: classGuardianMembershipWhere(row.schoolId, row.classId, [user.userId]), select: { guardianUserId: true }, take: 1 }) : [];
    if (!links.length) throw new ApiError("Conversation not found", 404);
  }
  if (row.kind === "DIRECT") await assertDirectPeer(user, row.members, db);
  return { row, me };
}

/**
 * SKAI-1879: how many members currentClassMembers would keep, counted in the database: active members, less CLASS
 * parents without a live guardian link to the class. Lets a caller skip loading a large roster it would not use.
 */
export async function currentMemberCount(row: { id: string; kind: string; schoolId: string; classId: string | null }, db: TxClient = prisma) {
  const linked: Prisma.UserWhereInput[] = row.classId ? [{ role: "PARENT", guardianRelationships: { some: { AND: [liveGuardianRelationshipWhere(null, "communication", new Date(), row.schoolId), { student: { classId: row.classId } }] } } }] : [];
  const user: Prisma.UserWhereInput = row.kind === "CLASS" ? { isActive: true, OR: [{ role: { not: "PARENT" } }, ...linked] } : { isActive: true };
  return db.conversationMember.count({ where: { schoolId: row.schoolId, conversationId: row.id, leftAt: null, user } });
}

/**
 * SKAI-1839: requireMembership's decision for many conversations at once (the notification list), without loading
 * every member of every channel. Same rules: campus scope, an active membership (a CLASS parent only while a live
 * guardian link to that class holds) and, for a DIRECT thread, the current messaging policy with the other member.
 */
export async function accessibleConversationIds(user: AuthUser, ids: string[], db: TxClient = prisma): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (!ids.length || user.role === "APP_OWNER") return allowed;
  const rows = await db.conversation.findMany({
    where: { id: { in: ids }, ...campusScope(user) },
    select: {
      id: true, kind: true, schoolId: true, campusId: true, classId: true,
      // Only this reader's own membership, plus the other member of a DIRECT thread (never a class roster).
      members: { where: { leftAt: null, user: { isActive: true }, OR: [{ userId: user.userId }, { conversation: { kind: "DIRECT" } }] }, select: { userId: true, user: { select: { role: true } } } },
    },
  });
  const mine = (row: typeof rows[number]) => row.members.find((member) => member.userId === user.userId);
  const reachable = rows.filter((row) => row.schoolId === user.schoolId && (!campusBoundChatRole(user.role) || row.campusId === user.campusId) && mine(row));
  // currentClassMembers: a parent stays in a CLASS channel only while a live guardian link to that class holds.
  const parentClasses = new Set(reachable.filter((row) => row.kind === "CLASS" && mine(row)?.user.role === "PARENT").map((row) => row.id));
  const classIds = [...new Set(reachable.flatMap((row) => (parentClasses.has(row.id) && row.classId ? [row.classId] : [])))];
  const links = classIds.length ? await db.guardianRelationship.findMany({
    where: { AND: [liveGuardianRelationshipWhere(null, "communication", new Date(), user.schoolId), { guardianUserId: user.userId, student: { classId: { in: classIds } } }] },
    select: { student: { select: { classId: true } } },
  }) : [];
  const linkedClasses = new Set(links.flatMap((link) => (link.student?.classId ? [link.student.classId] : [])));
  const other = (row: typeof rows[number]) => row.members.find((member) => member.userId !== user.userId)?.userId;
  const peerIds = [...new Set(reachable.flatMap((row) => { const id = row.kind === "DIRECT" ? other(row) : undefined; return id ? [id] : []; }))];
  const peers = peerIds.length ? await db.user.findMany({ where: { id: { in: peerIds }, schoolId: user.schoolId, isActive: true }, select: { id: true, role: true, campusId: true, isActive: true } }) : [];
  const settings = peers.length ? await getChatSettings(user.schoolId, db) : null;
  const permittedPeers = new Set<string>();
  const relations = peers.length ? await prefetchChatRelations(user, peers, db) : undefined;
  if (settings) for (const peer of peers) if ((await canDirectMessage(user, peer, settings, db, relations)).allowed) permittedPeers.add(peer.id);
  for (const row of reachable) {
    if (parentClasses.has(row.id) && !(row.classId && linkedClasses.has(row.classId))) continue;
    if (row.kind === "DIRECT" && !permittedPeers.has(other(row) ?? "")) continue;
    allowed.add(row.id);
  }
  return allowed;
}

/**
 * SKAI-1837: the inbox needs only the viewer's own membership (and the peer on a DIRECT thread) plus a member
 * count, not every member of every class channel.
 */
export function conversationListInclude(viewerId: string) {
  return {
    members: { ...conversationInclude.members, where: { ...conversationInclude.members.where, OR: [{ userId: viewerId }, { conversation: { kind: "DIRECT" as const } }] } },
    _count: { select: { members: { where: conversationInclude.members.where } } },
  } satisfies Prisma.ConversationInclude;
}
export type ConversationListRow = Prisma.ConversationGetPayload<{ include: ReturnType<typeof conversationListInclude> }>;

/**
 * SKAI-1981: per CLASS channel, how many active parent members currentMemberCount would drop (no live
 * "communication" guardian link to the channel's class; every parent when the class is gone). One correlated query:
 * a Prisma OR per channel re-evaluates the guardian predicate over the whole school once per channel (SKAI-1981, qa-big). The SQL mirrors
 * liveGuardianRelationshipWhere(null, "communication", at, schoolId); keep the two in step. Only the shown count uses it.
 */
async function lapsedClassParentCounts(schoolId: string, conversationIds: string[], at: Date, db: TxClient): Promise<Array<{ conversationId: string; lapsed: number }>> {
  // LATERAL ... LIMIT 1 keeps the check per member (an index lookup on the member's own links); a plain NOT EXISTS
  // lets the planner build every live link in the school first.
  return db.$queryRaw<Array<{ conversationId: string; lapsed: number }>>(Prisma.sql`
    SELECT m.conversation_id AS "conversationId", COUNT(*)::int AS lapsed
    FROM conversation_members m
    JOIN users u ON u.id = m.user_id
    JOIN conversations c ON c.id = m.conversation_id AND c.school_id = m.school_id
    LEFT JOIN LATERAL (
      SELECT 1 AS live FROM guardian_relationships r
      JOIN students s ON s.id = r.student_id AND s.school_id = r.school_id
      JOIN campuses k ON k.id = s.campus_id AND k.school_id = s.school_id
      WHERE r.school_id = ${schoolId} AND r.guardian_user_id = m.user_id AND u.school_id = ${schoolId} AND s.class_id = c.class_id
        AND r.status = 'ACTIVE' AND r.verified_at IS NOT NULL AND r.valid_from <= ${at}::timestamptz AND (r.valid_until IS NULL OR r.valid_until > ${at}::timestamptz)
        AND s.archived_at IS NULL AND s.consolidated_into_id IS NULL AND s.status ILIKE 'active' AND k.archived_at IS NULL
        AND EXISTS (SELECT 1 FROM guardian_access_versions v WHERE v.relationship_id = r.id AND v.school_id = r.school_id
          AND v.effective_from <= ${at}::timestamptz AND (v.effective_until IS NULL OR v.effective_until > ${at}::timestamptz) AND v.permissions #> ARRAY['communication'] = 'true'::jsonb)
        AND NOT EXISTS (SELECT 1 FROM guardian_access_versions v WHERE v.relationship_id = r.id AND v.school_id = r.school_id
          AND v.effective_from <= ${at}::timestamptz AND (v.effective_until IS NULL OR v.effective_until > ${at}::timestamptz) AND v.permissions #> ARRAY['communication'] = 'false'::jsonb)
      LIMIT 1) l ON true
    WHERE m.school_id = ${schoolId} AND m.conversation_id IN (${Prisma.join(conversationIds)}) AND m.left_at IS NULL
      AND u.is_active = true AND u.role = 'PARENT' AND l.live IS NULL
    GROUP BY m.conversation_id`);
}

/**
 * The same decision as assertCurrentConversationAccess for a page of the inbox, with a fixed number of
 * queries instead of several per row. memberCount matches what the full row would report: active members
 * less parents whose class guardianship has lapsed.
 */
export async function accessibleConversationList(user: AuthUser, loaded: ConversationListRow[], db: TxClient = prisma): Promise<Array<{ row: ConversationRow; memberCount: number }>> {
  const inScope = loaded.filter((row) => !outsideScope(user, row));
  const classRows = inScope.filter((row) => row.kind === "CLASS");
  const now = new Date();
  const live = liveGuardianRelationshipWhere(null, "communication", now, user.schoolId);
  // SKAI-1981: a CLASS row only ever carries the viewer's own membership, so only the viewer's own guardian link
  // decides access; the parents dropped from memberCount are counted in the database, never loaded.
  const parentClassRows = classRows.filter((row) => row.members.some((member) => member.userId === user.userId && member.user.role === "PARENT"));
  const viewerClassIds = [...new Set(parentClassRows.flatMap((row) => row.classId ? [row.classId] : []))];
  const viewerLinks = viewerClassIds.length ? await db.guardianRelationship.findMany({
    where: { AND: [live, { guardianUserId: user.userId, student: { classId: { in: viewerClassIds } } }] },
    select: { student: { select: { classId: true } } },
  }) : [];
  const viewerClasses = new Set(viewerLinks.flatMap((link) => link.student?.classId ? [link.student.classId] : []));
  const viewerLapsed = new Set(parentClassRows.filter((row) => !(row.classId && viewerClasses.has(row.classId))).map((row) => row.id));
  const lapsedGroups = classRows.length ? await lapsedClassParentCounts(user.schoolId, classRows.map((row) => row.id), now, db) : [];
  const lapsedCount = new Map(lapsedGroups.map((group) => [group.conversationId, group.lapsed]));

  const directRows = inScope.filter((row) => row.kind === "DIRECT");
  const peerIds = [...new Set(directRows.flatMap((row) => row.members.filter((member) => member.userId !== user.userId).slice(0, 1).map((member) => member.userId)))];
  const peers: ChatPeer[] = peerIds.length ? await db.user.findMany({ where: { id: { in: peerIds }, schoolId: user.schoolId, isActive: true }, select: { id: true, role: true, campusId: true, isActive: true } }) : [];
  const peerById = new Map(peers.map((peer) => [peer.id, peer]));
  const settings = peers.length ? await getChatSettings(user.schoolId, db) : null;
  const relations = peers.length ? await prefetchChatRelations(user, peers, db) : undefined;

  const checked = await Promise.all(inScope.map(async (row) => {
    const { _count, ...rest } = row;
    const current: ConversationRow = rest;
    if (viewerLapsed.has(row.id) || !current.members.some((member) => member.userId === user.userId)) return null;
    if (row.kind === "DIRECT") {
      const other = current.members.find((member) => member.userId !== user.userId);
      const peer = other && peerById.get(other.userId);
      if (!peer || !settings || !(await canDirectMessage(user, peer, settings, db, relations)).allowed) return null;
    }
    return { row: current, memberCount: _count.members - (lapsedCount.get(row.id) ?? 0) };
  }));
  return checked.filter((entry): entry is { row: ConversationRow; memberCount: number } => entry !== null);
}
