import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { campusScope } from "@/lib/auth/policy";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { canDirectMessage, getChatSettings } from "./policy";

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

export async function assertCurrentConversationAccess(user: AuthUser, loaded: ConversationRow, db: TxClient = prisma) {
  if (user.role === "APP_OWNER" || loaded.schoolId !== user.schoolId || !["SUPER_ADMIN", "PARENT", "STUDENT"].includes(user.role) && loaded.campusId !== user.campusId) throw new ApiError("Conversation not found", 404);
  const row = await currentClassMembers(loaded, db);
  const me = row.members.find(member => member.userId === user.userId);
  if (!me) throw new ApiError("Conversation not found", 404);
  if (row.kind === "DIRECT") {
    const other = row.members.find(member => member.userId !== user.userId);
    const peer = other && await db.user.findFirst({ where: { id: other.userId, schoolId: user.schoolId, isActive: true }, select: { id: true, role: true, campusId: true, isActive: true } });
    if (!peer || !(await canDirectMessage(user, peer, await getChatSettings(user.schoolId, db), db)).allowed) throw new ApiError("Conversation not found", 404);
  }
  return { row, me };
}

export async function requireMembership(user: AuthUser, conversationId: string, db: TxClient = prisma) {
  const row = await db.conversation.findFirst({ where: { id: conversationId, ...campusScope(user) }, include: conversationInclude });
  if (!row) throw new ApiError("Conversation not found", 404);
  return assertCurrentConversationAccess(user, row, db);
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
  const reachable = rows.filter((row) => row.schoolId === user.schoolId && (["SUPER_ADMIN", "PARENT", "STUDENT"].includes(user.role) || row.campusId === user.campusId) && mine(row));
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
  if (settings) for (const peer of peers) if ((await canDirectMessage(user, peer, settings, db)).allowed) permittedPeers.add(peer.id);
  for (const row of reachable) {
    if (parentClasses.has(row.id) && !(row.classId && linkedClasses.has(row.classId))) continue;
    if (row.kind === "DIRECT" && !permittedPeers.has(other(row) ?? "")) continue;
    allowed.add(row.id);
  }
  return allowed;
}
