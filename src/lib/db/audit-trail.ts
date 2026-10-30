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

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return depth > 3 ? "[…]" : value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value !== "object" || value === null) return value;
  if (depth > 3) return "[…]";
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = REDACTED_KEY.test(key) ? "[redacted]" : redact(entry, depth + 1);
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
const inFlight = new AsyncLocalStorage<true>();

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
  const before =
    single && operation !== "create"
      ? await client[delegate].findUnique({ where: input.where }).catch(() => null)
      : null;

  const result = await inFlight.run(true, () => query(args));

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

    const written = await runWithTenantContext({ schoolId, userId: context.userId }, () =>
      client.auditLog.create({ data: row, select: { id: true } })
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
