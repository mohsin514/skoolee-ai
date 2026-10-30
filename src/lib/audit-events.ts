import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";

/**
 * SKO-476 audit event contract. Call it with the same transaction client as
 * the mutation it describes, so the change and its event commit together.
 *
 * Only identifiers, states and versions belong in `before`/`after`: never
 * passwords, tokens, message bodies, contact details or whole records. The
 * history view further reduces what it shows (see minimizedAuditChanges).
 */
export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "ARCHIVE" | "RESTORE" | "APPROVE" | "REJECT" | "LOCK" | "GRANT" | "REVOKE";
type AuditValue = string | number | boolean | null;

const FORBIDDEN_KEYS = /pass(word)?|token|secret|otp|code|email|phone|address|cnic|note|body|message|content|iban|account(number|no)/i;

function minimal(values: Record<string, AuditValue> | undefined): Prisma.InputJsonValue | undefined {
  if (!values) return undefined;
  const kept = Object.entries(values).filter(([key]) => !FORBIDDEN_KEYS.test(key));
  return Object.fromEntries(kept) as Prisma.InputJsonValue;
}

export async function writeAuditEvent(tx: TxClient, user: AuthUser, event: {
  table: string; recordId: string; action: AuditAction; campusId?: string | null;
  before?: Record<string, AuditValue>; after?: Record<string, AuditValue>;
}) {
  const after = minimal({ action: event.action, ...event.after });
  await tx.auditLog.create({ data: {
    schoolId: user.schoolId,
    ...(event.campusId !== undefined ? { campusId: event.campusId } : {}),
    tableName: event.table,
    recordId: event.recordId,
    userId: user.userId,
    ...(event.before ? { oldValue: minimal(event.before) } : {}),
    ...(event.action === "DELETE" ? {} : { newValue: after }),
  } });
}
