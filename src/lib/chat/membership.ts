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
