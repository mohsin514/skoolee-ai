import { prisma } from "@/lib/db/prisma";

export async function createAuditLog(params: {
  tableName: string;
  recordId: string;
  oldValue?: any;
  newValue?: any;
  userId: string;
}) {
  await prisma.auditLog.create({ data: params });
}
