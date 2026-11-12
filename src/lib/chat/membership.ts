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

function outsideScope(user: AuthUser, loaded: Pick<ConversationRow, "schoolId" | "campusId">) {
  return user.role === "APP_OWNER" || loaded.schoolId !== user.schoolId || !["SUPER_ADMIN", "PARENT", "STUDENT"].includes(user.role) && loaded.campusId !== user.campusId;
}

export async function assertCurrentConversationAccess(user: AuthUser, loaded: ConversationRow, db: TxClient = prisma) {
  if (outsideScope(user, loaded)) throw new ApiError("Conversation not found", 404);
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
 * The same decision as assertCurrentConversationAccess for a page of the inbox, with a fixed number of
 * queries instead of several per row. memberCount matches what the full row would report: active members
 * less parents whose class guardianship has lapsed.
 */
export async function accessibleConversationList(user: AuthUser, loaded: ConversationListRow[], db: TxClient = prisma): Promise<Array<{ row: ConversationRow; memberCount: number }>> {
  const inScope = loaded.filter((row) => !outsideScope(user, row));
  const classRows = inScope.filter((row) => row.kind === "CLASS");
  const classParents = classRows.length ? await db.conversationMember.findMany({
    where: { schoolId: user.schoolId, conversationId: { in: classRows.map((row) => row.id) }, ...conversationInclude.members.where, user: { isActive: true, role: "PARENT" } },
    select: { conversationId: true, userId: true },
  }) : [];
  const classIds = [...new Set(classRows.flatMap((row) => row.classId ? [row.classId] : []))];
  const parentIds = [...new Set(classParents.map((member) => member.userId))];
  const links = classIds.length && parentIds.length ? await db.guardianRelationship.findMany({
    where: { AND: [liveGuardianRelationshipWhere(null, "communication", new Date(), user.schoolId), { guardianUserId: { in: parentIds }, student: { classId: { in: classIds } } }] },
    select: { guardianUserId: true, student: { select: { classId: true } } },
  }) : [];
  const permitted = new Set(links.map((link) => `${link.student.classId}\u0000${link.guardianUserId}`));
  const lapsed = new Map<string, Set<string>>();
  const classRowById = new Map(classRows.map((row) => [row.id, row]));
  for (const member of classParents) {
    const row = classRowById.get(member.conversationId);
    if (row && !(row.classId && permitted.has(`${row.classId}\u0000${member.userId}`))) lapsed.set(row.id, (lapsed.get(row.id) ?? new Set()).add(member.userId));
  }

  const directRows = inScope.filter((row) => row.kind === "DIRECT");
  const peerIds = [...new Set(directRows.flatMap((row) => row.members.filter((member) => member.userId !== user.userId).slice(0, 1).map((member) => member.userId)))];
  const peers: ChatPeer[] = peerIds.length ? await db.user.findMany({ where: { id: { in: peerIds }, schoolId: user.schoolId, isActive: true }, select: { id: true, role: true, campusId: true, isActive: true } }) : [];
  const peerById = new Map(peers.map((peer) => [peer.id, peer]));
  const settings = peers.length ? await getChatSettings(user.schoolId, db) : null;
  const relations = peers.length ? await prefetchChatRelations(user, peers, db) : undefined;

  const checked = await Promise.all(inScope.map(async (row) => {
    const denied = lapsed.get(row.id);
    const { _count, ...rest } = row;
    const current: ConversationRow = denied ? { ...rest, members: rest.members.filter((member) => !denied.has(member.userId)) } : rest;
    if (!current.members.some((member) => member.userId === user.userId)) return null;
    if (row.kind === "DIRECT") {
      const other = current.members.find((member) => member.userId !== user.userId);
      const peer = other && peerById.get(other.userId);
      if (!peer || !settings || !(await canDirectMessage(user, peer, settings, db, relations)).allowed) return null;
    }
    return { row: current, memberCount: _count.members - (denied?.size ?? 0) };
  }));
  return checked.filter((entry): entry is { row: ConversationRow; memberCount: number } => entry !== null);
}
