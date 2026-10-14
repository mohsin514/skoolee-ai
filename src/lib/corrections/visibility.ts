import type { TxClient } from "@/lib/db/prisma";
/** Later approved publications may include an earlier pending correction.
 * Never expose a correction merely because its source mark was edited. */
export async function correctionReleased(tx: TxClient, versionIds: string[]) {
    if (!versionIds.length)
        return true;
    const targets = await tx.reportVersion.findMany({ where: { id: { in: versionIds } }, select: { reportCardId: true, number: true } });
    if (targets.length !== versionIds.length)
        return false;
    for (const target of targets)
        if (!await tx.reportVersion.findFirst({ where: { reportCardId: target.reportCardId, number: { gte: target.number }, publishedAt: { not: null } }, select: { id: true } }))
            return false;
    return true;
}
