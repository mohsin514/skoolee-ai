/**
 * SKO-500: who heads whose department. Skoolee's `Department` has no subject link, so an author's
 * department is their primary membership, and its head is the `headId`, a HEAD or DEPUTY_HEAD member,
 * or an acting member. Ended memberships and inactive departments never count.
 */
import type { TxClient } from "@/lib/db/prisma";

const headedBy = (userId: string) => ({ isActive: true, OR: [{ headId: userId }, { members: { some: { userId, endedAt: null, OR: [{ role: { in: ["HEAD", "DEPUTY_HEAD"] as ("HEAD" | "DEPUTY_HEAD")[] } }, { isActing: true }] } } }] });

/** Does `headUserId` head the primary department of `authorUserId`? Never true for oneself. */
export async function headsAuthorDepartment(tx: TxClient, schoolId: string, headUserId: string, authorUserId: string): Promise<boolean> {
  if (headUserId === authorUserId) return false;
  const row = await tx.departmentMember.findFirst({ where: { schoolId, userId: authorUserId, isPrimary: true, endedAt: null, department: headedBy(headUserId) }, select: { id: true } });
  return Boolean(row);
}

/** The people whose primary department `headUserId` heads (excluding the head). Empty for everyone else. */
export async function membersHeadedBy(tx: TxClient, schoolId: string, headUserId: string): Promise<string[]> {
  const rows = await tx.departmentMember.findMany({ where: { schoolId, isPrimary: true, endedAt: null, userId: { not: headUserId }, department: headedBy(headUserId) }, select: { userId: true }, take: 500 });
  return [...new Set(rows.map(row => row.userId))];
}

/** The heads of an author's primary department, for choosing a default moderator. */
export async function headsOfAuthor(tx: TxClient, schoolId: string, authorUserId: string): Promise<string[]> {
  const memberships = await tx.departmentMember.findMany({ where: { schoolId, userId: authorUserId, isPrimary: true, endedAt: null, department: { isActive: true } }, select: { department: { select: { headId: true, members: { where: { endedAt: null, OR: [{ role: { in: ["HEAD", "DEPUTY_HEAD"] } }, { isActing: true }] }, select: { userId: true, role: true } } } } } });
  const ids: string[] = [];
  for (const { department } of memberships) {
    if (department.headId) ids.push(department.headId);
    for (const member of [...department.members].sort((a, b) => (a.role === "HEAD" ? 0 : 1) - (b.role === "HEAD" ? 0 : 1))) ids.push(member.userId);
  }
  return [...new Set(ids)].filter(id => id !== authorUserId);
}
