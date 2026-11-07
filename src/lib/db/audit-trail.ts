// ─────────────────────────────────────────────────────────────────
// Audit trail (SKAI-1162)
//
// Only a fraction of the routes that change school data wrote an
// audit_logs row, because each one had to remember to. This extension
// writes one row for every create, update, upsert and delete on a
// tenant-owned model, from one place, carrying the school and the actor
// from the tenant context the guard already resolves.
//
// Routes that already write their own, richer row keep working. audit_logs is
// append-only, so when a hand-written row arrives for a record this extension
// just logged, it is appended with `supersedesAuditId` naming the automatic
// row (see claimAutoRow), so readers can collapse the pair.
// ─────────────────────────────────────────────────────────────────
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { getTenantContext, resolveTenantFromRequest, runWithTenantContext, type TenantContext } from "./tenant-context";
import { TENANT_MODELS } from "./tenant-models";
import { referenceTransaction } from "./reference-transaction";

const SINGLE_OPERATIONS = new Set(["create", "update", "upsert", "delete"]);
const BULK_OPERATIONS = new Set(["createMany", "createManyAndReturn", "updateMany", "updateManyAndReturn", "deleteMany"]);

/**
 * Models that are themselves a record of something (logs, events, deliveries,
 * sessions, message traffic). Auditing them would audit the audit, or flood the
 * table with rows nobody reviews.
 */
const SKIPPED_MODELS = new Set([
  "auditLog",
  "aIUsageLog",
  "loginSession",
  "passwordHistory",
  "notification",
  "chatMessage",
  "chatAttachment",
  "conversationMember",
  "ragChunk",
  "consentLog",
]);
const SKIPPED_SUFFIX = /(Event|Log|History|Attempt|Delivery|Receipt|Ack)$/;

export function isAuditedModel(delegate: string): boolean {
  return TENANT_MODELS.has(delegate) && !SKIPPED_MODELS.has(delegate) && !SKIPPED_SUFFIX.test(delegate);
}

/** Never copied into an audit row. */
const REDACTED_KEY = /password|token|secret|hash|otp|mfa|credential|apikey/i;
/**
 * SKAI-1796: free-text content (document text, message bodies, prompts, answers, JSON payloads) stays in the
 * record and its scoped revision history; the audit row only says that it changed. AI PII policy: these fields can
 * hold learner or guardian text that must not be copied into a general log.
 */
const CONTENT_KEY = /^(data|payload|content|body|text|transcript|prompt|response|reply|answers?|answerKey|html|markdown)$|(Text|Content|Body|Html|Markdown|Transcript|Prompt)$/;

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return depth > 3 ? "[…]" : value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value !== "object" || value === null) return value;
  if (depth > 3) return "[…]";
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = REDACTED_KEY.test(key) ? "[redacted]" : CONTENT_KEY.test(key) && entry !== null && entry !== undefined ? "[omitted]" : redact(entry, depth + 1);
  }
  return out;
}

/** Table name as audit_logs stores it: the snake_case, plural @@map. */
const tableNames = new Map<string, string>();
for (const model of Prisma.dmmf.datamodel.models) {
  const delegate = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  tableNames.set(delegate, model.dbName ?? delegate);
}

// ─── De-duplication against hand-written audit rows ───────────────
//
// The automatic row is written as soon as the mutation returns; a route that
// audits itself writes its row a moment later. Remember each automatic row
// briefly so that later write can take its place.
const RECENT_TTL_MS = 60_000;
const RECENT_LIMIT = 5_000;
const recent = new Map<string, { id: string; at: number }>();

function recentKey(schoolId: string, recordId: string) {
  return `${schoolId}:${recordId}`;
}

function remember(schoolId: string, recordId: string, id: string) {
  if (recent.size >= RECENT_LIMIT) recent.delete(recent.keys().next().value!);
  recent.set(recentKey(schoolId, recordId), { id, at: Date.now() });
}

/** Returns, and forgets, the automatic row for this record if one was just written. */
export function claimAutoRow(schoolId: string, recordId: string): string | null {
  const key = recentKey(schoolId, recordId);
  const hit = recent.get(key);
  if (!hit) return null;
  recent.delete(key);
  return Date.now() - hit.at <= RECENT_TTL_MS ? hit.id : null;
}

export function resetAuditTrailState() {
  recent.clear();
}

// ─── The extension ────────────────────────────────────────────────

type Delegate = Record<string, (args: unknown) => Promise<any>>;
type AuditClient = Record<string, Delegate>;

/**
 * Set while a mutation is in flight, so the guard re-issuing the same query
 * inside its RLS transaction is not audited a second time.
 */
// Pinned to globalThis like the tenant and reference-transaction stores: the cached Prisma client's extension
// reads this store, so a second copy of this module (server actions vs route handlers, HMR) must share it,
// or withoutAutoAudit() in that copy is invisible to the extension (SKAI-139: two audit rows per campus save).
declare global { var __skooleeAuditInFlight: AsyncLocalStorage<true> | undefined; }
const inFlight = globalThis.__skooleeAuditInFlight ??= new AsyncLocalStorage<true>();

/**
 * SKAI-1770: run a mutation whose caller writes its own, richer audit row for the same action, so the
 * extension does not log it a second time. The caller must write that row; audit_logs keeps exactly one.
 * Awaited inside the scope: a Prisma query is a lazy PrismaPromise that only runs when awaited, so returning
 * it unawaited would run the query (and the extension) outside the scope.
 */
export function withoutAutoAudit<T>(fn: () => PromiseLike<T>): Promise<T> {
  return inFlight.run(true, async () => await fn());
}

// ─── Rows written inside an interactive transaction ──────────────
//
// SKAI-1796: inside a transaction the automatic rows wait until the callback returns. A route's own row for the same
// record then replaces the pending one (one row per create, not an automatic row plus a superseding one), and the
// remaining rows are written as the last statements of the transaction. A failed write there is not swallowed: the
// transaction is already aborted in PostgreSQL, so it must fail as a whole (and a serialization failure be retried).
interface PendingRow { schoolId: string; userId?: string; recordId: string; data: Record<string, unknown>; claimed: boolean }
declare global { var __skooleeAuditPending: AsyncLocalStorage<PendingRow[]> | undefined; }
const pendingRows = globalThis.__skooleeAuditPending ??= new AsyncLocalStorage<PendingRow[]>();

export async function withTransactionAudit<T>(tx: unknown, fn: () => Promise<T>): Promise<T> {
  const pending: PendingRow[] = [];
  const result = await pendingRows.run(pending, fn);
  const writer = tx as AuditClient;
  const written: Array<{ schoolId: string; recordId: string; id: string }> = [];
  await pendingRows.exit(async () => {
    for (const row of pending) {
      if (row.claimed) continue;
      const { id } = await runWithTenantContext({ schoolId: row.schoolId, userId: row.userId }, () =>
        writer.auditLog.create({ data: row.data, select: { id: true } })
      );
      if (row.recordId !== "*") written.push({ schoolId: row.schoolId, recordId: row.recordId, id });
    }
  });
  for (const row of written) remember(row.schoolId, row.recordId, row.id);
  return result;
}

function claimPending(schoolId: string, recordId: string): boolean {
  const row = pendingRows.getStore()?.find((entry) => !entry.claimed && entry.schoolId === schoolId && entry.recordId === recordId);
  if (row) row.claimed = true;
  return Boolean(row);
}

function rowSchool(row: unknown, context: TenantContext): string | null {
  const own = (row as { schoolId?: unknown } | null)?.schoolId;
  if (typeof own === "string" && own) return own;
  // An unscoped (platform owner) bulk change can span schools; there is no one school to file it under.
  return context.unscoped ? null : context.schoolId || null;
}

function whereId(args: Record<string, unknown>): string | null {
  const id = (args.where as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}

async function actorIp(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers");
    const { clientIp } = await import("@/lib/http/client-ip");
    const ip = clientIp(await headers());
    return ip === "unknown" ? undefined : ip;
  } catch {
    return undefined; // outside a request (workers, scripts, tests)
  }
}

export interface AuditedOperation {
  delegate: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
  client: AuditClient;
}

export async function auditedOperation({ delegate, operation, args, query, client }: AuditedOperation): Promise<unknown> {
  // Hand-written audit rows: appended, linked to the automatic row they supersede.
  if (delegate === "auditLog" && (operation === "create" || operation === "createMany")) {
    return mergeManualAudit(operation, args, query, client);
  }

  const single = SINGLE_OPERATIONS.has(operation);
  if (inFlight.getStore() || !isAuditedModel(delegate) || (!single && !BULK_OPERATIONS.has(operation))) {
    return query(args);
  }

  const context = getTenantContext() ?? (await resolveTenantFromRequest());
  if (!context) return query(args); // the guard refuses this query anyway

  const input = (args ?? {}) as Record<string, unknown>;
  // SKAI-1443: read the prior row inside the caller's transaction. A lookup on the pool while a transaction
  // holds its connection needs a second connection, and under a small pool the transactions wait on each other.
  const reader = (referenceTransaction.getStore() ?? client) as AuditClient;
  const before =
    single && operation !== "create"
      ? await reader[delegate].findUnique({ where: input.where }).catch(() => null)
      : null;

  const result = await inFlight.run(true, () => query(args));
  const pending = referenceTransaction.getStore() ? pendingRows.getStore() : undefined;

  try {
    const schoolId = rowSchool(single ? result ?? before : null, context);
    if (!schoolId) return result;

    const recordId = single
      ? String((result as { id?: unknown } | null)?.id ?? (before as { id?: unknown } | null)?.id ?? whereId(input) ?? "")
      : "*";
    const row = {
      tableName: tableNames.get(delegate) ?? delegate,
      recordId,
      oldValue: (before ? redact(before) : undefined) as Prisma.InputJsonValue | undefined,
      newValue: redact(
        single
          ? { operation, ...(operation === "delete" ? {} : (result as object)) }
          : { operation, where: input.where ?? null, count: (result as { count?: number })?.count ?? (Array.isArray(result) ? result.length : null) }
      ) as Prisma.InputJsonValue,
      userId: context.userId ?? "system",
      ipAddress: await actorIp(),
    };

    if (pending) {
      pending.push({ schoolId, userId: context.userId, recordId, data: row, claimed: false });
      return result;
    }
    // SKAI-1358: inside a transaction the row must join it, or it cannot see the uncommitted parent rows.
    const writer = (referenceTransaction.getStore() ?? client) as AuditClient;
    const written = await runWithTenantContext({ schoolId, userId: context.userId }, () =>
      writer.auditLog.create({ data: row, select: { id: true } })
    );
    if (single && recordId) remember(schoolId, recordId, written.id);
  } catch (error) {
    // The change itself succeeded; a failed audit write must not undo it for the user.
    console.warn(`[audit-trail] could not record ${operation} on ${delegate}`, error);
  }

  return result;
}

async function mergeManualAudit(
  operation: string,
  args: unknown,
  query: (args: unknown) => Promise<unknown>,
  _client: AuditClient
): Promise<unknown> {
  // audit_logs is append-only (SKO-476 trigger refuses UPDATE), so a route's own row cannot
  // overwrite the automatic one. It is appended as the newer event and names the row it supersedes.
  const input = (args ?? {}) as { data?: unknown };
  const context = getTenantContext() ?? (await resolveTenantFromRequest());
  const link = (entry: unknown) => {
    const data = entry as { schoolId?: string; recordId?: string; newValue?: unknown } | undefined;
    const schoolId = data?.schoolId || context?.schoolId;
    if (schoolId && data?.recordId && claimPending(schoolId, data.recordId)) return entry;
    const autoId = schoolId && data?.recordId ? claimAutoRow(schoolId, data.recordId) : null;
    if (!autoId) return entry;
    const newValue = data!.newValue;
    return { ...data, newValue: newValue && typeof newValue === "object" && !Array.isArray(newValue) ? { ...newValue, supersedesAuditId: autoId } : { value: newValue ?? null, supersedesAuditId: autoId } };
  };
  const data = Array.isArray(input.data) ? input.data.map(link) : link(input.data);
  return query({ ...(args as object), data });
}

export function auditTrail() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "audit-trail",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const delegate = model.charAt(0).toLowerCase() + model.slice(1);
            return auditedOperation({
              delegate,
              operation,
              args,
              query: query as (args: unknown) => Promise<unknown>,
              client: client as unknown as AuditClient,
            }) as Promise<never>;
          },
        },
      },
    })
  );
}
