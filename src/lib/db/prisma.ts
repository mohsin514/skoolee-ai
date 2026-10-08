import { AsyncLocalStorage } from "node:async_hooks";
import { AccessDenied } from "@/lib/auth/policy";
import type { TenantContext } from "./tenant-context";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  getTenantContext,
  NO_CONTEXT_MESSAGE,
  requireSchoolId,
  resolveTenantFromRequest,
  runWithTenantContext,
  TenantContextError,
} from "./tenant-context";
import { GLOBAL_MODELS, TENANT_MODELS } from "./tenant-models";

// ─────────────────────────────────────────────────────────────────
// Tenant guard
//
// School A must never read or write School B's rows. Relying on each
// of the ~170 route handlers to remember `where: { schoolId }` is how
// that guarantee gets lost, so it is enforced here instead: every query
// against a tenant-owned model gets the school predicate injected, and
// a query with no tenant context in scope throws rather than running.
//
// This is the application layer of the defence, and it is always on.
// An optional, independent database layer — Postgres row-level security
// keyed on the same school_id column — is provided in prisma/rls.sql.
// It is NOT auto-applied: it only takes effect once the app connects as a
// dedicated non-owner role (Supabase's default role bypasses RLS), so see
// that file's header before enabling it.
// ─────────────────────────────────────────────────────────────────

/** Operations whose `where` selects the rows being read or changed. */
const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

/** The subset of WHERE_OPERATIONS that only reads. */
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** Operations that write new rows and therefore need `schoolId` stamped on. */
const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

/**
 * Models with a nullable `schoolId`, where NULL means "platform-wide default"
 * rather than "belongs to nobody" — currently the template tables, which fall
 * back to a shared default when a school has not defined its own.
 *
 * These are readable as `own OR global`; writes are still pinned to the
 * caller's school, so a tenant can never create or edit a global row.
 */
const SHARED_DEFAULT_DELEGATES = new Set(["notificationTemplate", "promptTemplate"]);

/**
 * Maps `<model>.<relationField>` to the related model's delegate name, so
 * nested writes (`{ students: { create: … } }`) can be stamped too. Built
 * from the generated DMMF rather than hand-maintained.
 */
type ReferenceClient = Record<string, { findFirst: (args: unknown) => Promise<unknown> }>;
declare global { var __skooleeReferenceTransaction: AsyncLocalStorage<ReferenceClient> | undefined; }
const referenceTransaction = globalThis.__skooleeReferenceTransaction ??= new AsyncLocalStorage<ReferenceClient>();
const checkedRelations = new Set<string>();
const listRelations = new Set<string>();
const relationTargets = new Map<string, string>();
const campusModels = new Set<string>();
const nullableCampusModels = new Set<string>();
const foreignKeys = new Map<string, Array<{ field: string; target: string; targetField: string }>>();

for (const model of Prisma.dmmf.datamodel.models) {
  const delegate = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  if (model.fields.some((field) => field.name === "campusId")) campusModels.add(delegate);
  if (model.fields.some((field) => field.name === "campusId" && !field.isRequired)) nullableCampusModels.add(delegate);
  for (const field of model.fields) {
    if (field.kind === "object" && field.type) {
      const target = field.type.charAt(0).toLowerCase() + field.type.slice(1);
      relationTargets.set(`${delegate}.${field.name}`, target);
      if (field.isList) listRelations.add(`${delegate}.${field.name}`);
      if (field.relationFromFields?.length) checkedRelations.add(`${delegate}.${field.name}`);
      if (field.relationFromFields?.length === 1 && field.relationToFields?.length === 1) {
        foreignKeys.set(delegate, [...(foreignKeys.get(delegate) ?? []), { field: field.relationFromFields[0], target, targetField: field.relationToFields[0] }]);
      }
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function campusWhere(model: string, context: TenantContext): Record<string, unknown> {
  // Families use explicit pupil relationships, allowing siblings across campuses.
  if (!context.role || ["SUPER_ADMIN", "APP_OWNER", "PARENT", "STUDENT"].includes(context.role)) return {};
  if (model !== "campus" && !campusModels.has(model)) return {};
  if (!context.campusId) throw new AccessDenied("campus", "view", context);
  if (nullableCampusModels.has(model)) return { OR: [{ campusId: context.campusId }, { campusId: null }] };
  return model === "campus" ? { id: context.campusId } : { campusId: context.campusId };
}

/** Validate every scalar foreign key before a bulk/nested write executes. */
async function validateReferences(model: string, data: unknown, context: TenantContext): Promise<void> {
  if (Array.isArray(data)) { for (const row of data) await validateReferences(model, row, context); return; }
  if (!isPlainObject(data)) return;
  const client = referenceTransaction.getStore() ?? prisma as unknown as ReferenceClient;
  for (const ref of foreignKeys.get(model) ?? []) {
    const rawValue = data[ref.field];
    const value = isPlainObject(rawValue) ? rawValue.set : rawValue;
    if (value === undefined || value === null || !TENANT_MODELS.has(ref.target)) continue;
    const row = await client[ref.target].findFirst({ where: { AND: [{ [ref.targetField]: value }, { schoolId: context.schoolId, ...campusWhere(ref.target, context) }] }, select: { [ref.targetField]: true } });
    if (!row) throw new AccessDenied("reference", "write", context);
  }
  for (const [key, value] of Object.entries(data)) {
    const target = relationTargets.get(`${model}.${key}`);
    if (!target || !isPlainObject(value)) continue;
    for (const [operation, payload] of Object.entries(value)) {
      const entries = Array.isArray(payload) ? payload : [payload];
      for (const entry of entries) {
        if (["connect", "set", "disconnect", "delete"].includes(operation) && TENANT_MODELS.has(target)) {
          if (!isPlainObject(entry)) throw new AccessDenied("reference", "write", context);
          const row = await client[target].findFirst({ where: { AND: [entry, { schoolId: context.schoolId, ...campusWhere(target, context) }] } });
          if (!row) throw new AccessDenied("reference", "write", context);
        }
        if (operation === "create") await validateReferences(target, entry, context);
        if (isPlainObject(entry)) {
          if (operation === "createMany") await validateReferences(target, entry.data, context);
          if (["update", "updateMany", "upsert", "connectOrCreate"].includes(operation)) {
            for (const part of ["data", "create", "update"]) if (part in entry) await validateReferences(target, entry[part], context);
            if (operation === "update" && !("data" in entry)) await validateReferences(target, entry, context);
          }
        }
      }
    }
  }
}

/**
 * Injects `schoolId` into a `where`. If the caller already pinned a
 * different school, that is a cross-tenant access attempt, not a
 * refinement — refuse it.
 */
function scopeWhere(
  model: string,
  where: unknown,
  schoolId: string,
  allowSharedDefaults = false,
  context?: TenantContext
): Record<string, unknown> {
  const current = isPlainObject(where) ? { ...where } : {};
  const existing = current.schoolId;

  if (typeof existing === "string" && existing !== schoolId) {
    throw new AccessDenied("tenant", "view", context);
  }

  // Reads of a shared-default model see their own rows plus the global ones
  // (schoolId IS NULL). Combined with AND so it cannot be widened by, or
  // silently drop, a filter the caller already supplied.
  if (allowSharedDefaults && SHARED_DEFAULT_DELEGATES.has(model)) {
    delete current.schoolId;
    const existingAnd = current.AND;
    const preserved = Array.isArray(existingAnd)
      ? existingAnd
      : existingAnd !== undefined
        ? [existingAnd]
        : [];
    current.AND = [...preserved, { OR: [{ schoolId }, { schoolId: null }] }, ...(context ? [campusWhere(model, context)] : [])];
    return current;
  }

  // An object filter (`{ in: [...] }`, `{ not: … }`) could widen the scope,
  // so replace it outright rather than trusting it.
  current.schoolId = schoolId;
  if (context) {
    const scope = campusWhere(model, context);
    const previous = current.AND;
    current.AND = [...(Array.isArray(previous) ? previous : previous ? [previous] : []), scope];
  }
  return current;
}

/**
 * Stamps `schoolId` onto a create payload and every nested create beneath
 * it, so a nested write cannot slip a row into another school.
 */
function scopeCreateData(model: string, data: unknown, schoolId: string, context?: TenantContext, update = false): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => scopeCreateData(model, item, schoolId, context, update));
  }

  if (!isPlainObject(data)) return data;

  const next: Record<string, unknown> = { ...data };

  if (TENANT_MODELS.has(model)) {
    const existing = next.schoolId;
    if (typeof existing === "string" && existing !== schoolId) {
      throw new AccessDenied("tenant", "write", context);
    }
    if ("school" in next) {
      const relation = next.school;
      if (!isPlainObject(relation) || !isPlainObject(relation.connect) || relation.connect.id !== schoolId || Object.keys(relation).length !== 1) throw new AccessDenied("school", "write", context);
    }
    if (update) delete next.schoolId;
    else if (Object.keys(next).some((key) => checkedRelations.has(`${model}.${key}`))) {
      delete next.schoolId;
      next.school = { connect: { id: schoolId } };
    } else next.schoolId = schoolId;
  }

  if (context) {
    const scope = campusWhere(model, context);
    if ("campusId" in scope && "campusId" in next && next.campusId !== scope.campusId) throw new AccessDenied("campus", "write", context);
  }
  for (const [key, value] of Object.entries(next)) {
    const target = relationTargets.get(`${model}.${key}`);
    if (!target || !isPlainObject(value)) continue;

    const nested: Record<string, unknown> = { ...value };
    for (const op of ["create", "createMany", "connectOrCreate", "upsert"]) {
      if (!(op in nested)) continue;

      if (op === "createMany" && isPlainObject(nested[op])) {
        const payload = nested[op] as Record<string, unknown>;
        nested[op] = { ...payload, data: scopeCreateData(target, payload.data, schoolId, context) };
        continue;
      }

      if (op === "connectOrCreate" || op === "upsert") {
        const branch = nested[op];
        const apply = (entry: unknown) => {
          if (!isPlainObject(entry)) return entry;
          const copy = { ...entry };
          if ("create" in copy) copy.create = scopeCreateData(target, copy.create, schoolId, context);
          if ("update" in copy) copy.update = scopeCreateData(target, copy.update, schoolId, context, true);
          if ("where" in copy) copy.where = scopeWhere(target, copy.where, schoolId, false, context);
          return copy;
        };
        nested[op] = Array.isArray(branch) ? branch.map(apply) : apply(branch);
        continue;
      }

      nested[op] = scopeCreateData(target, nested[op], schoolId, context);
    }

    if (TENANT_MODELS.has(target)) {
      for (const op of ["connect", "set", "disconnect", "delete"]) {
        if (!(op in nested)) continue;
        const apply = (entry: unknown) => scopeWhere(target, entry, schoolId, false, context);
        nested[op] = Array.isArray(nested[op]) ? (nested[op] as unknown[]).map(apply) : apply(nested[op]);
      }
      for (const op of ["update", "updateMany", "deleteMany"]) {
        if (!(op in nested)) continue;
        const apply = (entry: unknown): unknown => {
          if (!isPlainObject(entry)) throw new AccessDenied("reference", "write", context);
          if (op === "deleteMany") return scopeWhere(target, entry, schoolId, false, context);
          return { where: scopeWhere(target, entry.where, schoolId, false, context),
            data: scopeCreateData(target, entry.data ?? Object.fromEntries(Object.entries(entry).filter(([k]) => k !== "where")), schoolId, context, true) };
        };
        nested[op] = Array.isArray(nested[op]) ? (nested[op] as unknown[]).map(apply) : apply(nested[op]);
      }
    }
    next[key] = nested;
  }

  return next;
}

/** Prisma does not invoke query extensions for included collections. */
function scopeIncludes(model: string, selection: unknown, context: TenantContext): unknown {
  if (!isPlainObject(selection)) return selection;
  const next = { ...selection };
  for (const [key, value] of Object.entries(next)) {
    const target = relationTargets.get(`${model}.${key}`);
    if (!target || !value) continue;
    const relation = isPlainObject(value) ? { ...value } : {};
    if (listRelations.has(`${model}.${key}`) && TENANT_MODELS.has(target)) {
      relation.where = scopeWhere(target, relation.where, context.schoolId, true, context);
    }
    for (const kind of ["include", "select"]) if (kind in relation) relation[kind] = scopeIncludes(target, relation[kind], context);
    if (Object.keys(relation).length) next[key] = relation;
  }
  return next;
}

// ─── Database-layer RLS support (opt-in) ─────────────────────────
//
// The policies in prisma/rls.sql compare school_id against the
// `app.current_school_id` setting. That setting has to be applied on the same
// connection as the query, and `SET LOCAL` only survives inside a transaction —
// so under RLS each unit of work runs as: BEGIN → set_config → query.
//
// This costs an extra round trip per standalone query, which is why it is off
// unless TENANT_RLS is set. The app-layer guard above is unaffected and always
// on; this only exists so Postgres can independently enforce the same rule.
export const RLS_ENABLED = /^(1|on|true|yes)$/i.test(process.env.TENANT_RLS ?? "");

/**
 * Binds a school to the current transaction for RLS. `true` as the third
 * argument makes it transaction-local, so it cannot leak to the next borrower
 * of a pooled connection.
 */
async function applySchoolGuc(tx: { $executeRawUnsafe: (q: string, ...v: unknown[]) => Promise<unknown> }, schoolId: string) {
  await tx.$executeRawUnsafe(`SELECT set_config('app.current_school_id', $1, true)`, schoolId);
}

/**
 * Explicitly typed back-reference to the extended client, set once it exists.
 *
 * The guard needs `$transaction` to open an RLS session, but the client is
 * built *from* the guard — referencing `prisma` directly would make its type
 * circular and collapse the whole client to `any`. A hand-written type breaks
 * that cycle.
 */
type RlsCapableClient = {
  $transaction: <R>(fn: (tx: RlsTransactionClient) => Promise<R>) => Promise<R>;
};

type RlsTransactionClient = {
  $executeRawUnsafe: (q: string, ...v: unknown[]) => Promise<unknown>;
} & Record<string, Record<string, (args: unknown) => Promise<unknown>>>;

let rlsClient: RlsCapableClient | null = null;

function tenantGuard() {
  return Prisma.defineExtension({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const delegate = model.charAt(0).toLowerCase() + model.slice(1);

          if (!TENANT_MODELS.has(delegate)) {
            if (!GLOBAL_MODELS.has(delegate)) {
              // A model the registry has never seen — almost certainly a new
              // one added without re-running the generator. Refuse rather
              // than silently leaving it unguarded.
              throw new TenantContextError(
                `Model "${delegate}" is missing from the tenant registry. Run ` +
                  `\`node scripts/gen-tenant-registry.mjs\` after changing the schema.`
              );
            }
            return query(args);
          }

          // Explicitly bound context wins (background jobs, runUnscoped, and
          // entry points that bind their own). Otherwise fall back to the
          // request's session cookie, which is what covers ordinary
          // authenticated traffic without wrapping every route handler.
          const context = getTenantContext() ?? (await resolveTenantFromRequest());
          if (context?.unscoped) return query(args);

          if (!context?.schoolId) throw new TenantContextError(NO_CONTEXT_MESSAGE);
          const schoolId = context.schoolId;
          // `args` is a union of every operation's argument type across every
          // model; widening it before spreading keeps the checker out of an
          // intractable union.
          const received = args as unknown as Record<string, unknown> | undefined;
          const next: Record<string, unknown> = isPlainObject(received) ? { ...received } : {};

          if (WHERE_OPERATIONS.has(operation)) {
            next.where = scopeWhere(
              delegate,
              next.where,
              schoolId,
              READ_OPERATIONS.has(operation), context
            );
            if ("data" in next && operation.startsWith("update")) {
              // Never let an update move a row into another school.
              next.data = scopeCreateData(delegate, next.data, schoolId, context, true);
            }
          } else if (CREATE_OPERATIONS.has(operation)) {
            next.data = scopeCreateData(delegate, next.data, schoolId, context);
          } else if (operation === "upsert") {
            next.where = scopeWhere(delegate, next.where, schoolId, false, context);
            next.create = scopeCreateData(delegate, next.create, schoolId, context);
            next.update = scopeCreateData(delegate, next.update, schoolId, context, true);
          } else {
            throw new TenantContextError(
              `Unhandled Prisma operation "${operation}" on tenant model ` +
                `"${delegate}". Add it to the tenant guard before using it.`
            );
          }

          for (const kind of ["include", "select"]) if (kind in next) next[kind] = scopeIncludes(delegate, next[kind], context);
          if (!READ_OPERATIONS.has(operation)) {
            for (const key of ["data", "create", "update"]) if (key in next) await validateReferences(delegate, next[key], context);
          }

          // Without RLS, or when we are already inside a transaction that has
          // set the tenant, run the (now scoped) query directly.
          if (!RLS_ENABLED || context.rlsSession) {
            return query(next as typeof args);
          }

          // RLS mode: the policy reads app.current_school_id, which only lives
          // for the length of a transaction, so give this query one. The
          // rlsSession flag stops the re-issued call below from recursing.
          return runWithTenantContext({ ...context, rlsSession: true }, () =>
            rlsClient!.$transaction(async (tx) => {
              await applySchoolGuc(tx, schoolId);
              return tx[delegate][operation](next);
            })
          );
        },
      },
    },
  });
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasourceUrl: process.env.DATABASE_URL,
  }).$extends(tenantGuard());
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const guardedClient = globalThis.prisma ?? prismaClientSingleton();
// Reference checks in an interactive transaction must see its earlier writes.
export const prisma = new Proxy(guardedClient, {
  get(target, property, receiver) {
    if (property !== "$transaction") return Reflect.get(target, property, receiver);
    return (first: unknown, options?: unknown) => {
      const transact = target.$transaction.bind(target) as (arg: unknown, options?: unknown) => unknown;
      if (typeof first !== "function") return transact(first, options);
      return transact((tx: ReferenceClient) => referenceTransaction.run(tx, async () => await first(tx)), options);
    };
  },
});

/**
 * The client handed to an interactive `$transaction` callback. It carries the
 * tenant guard like the top-level client does, so helpers that take a `tx`
 * should type it as this rather than `Prisma.TransactionClient` — the latter
 * describes the unextended client and no longer matches.
 */
export type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = guardedClient;
}

// Now that the client exists, hand the guard its transaction entry point.
rlsClient = prisma as unknown as RlsCapableClient;

/**
 * Runs `fn` in one transaction with the RLS tenant set, so every query inside
 * shares a single BEGIN/set_config instead of each paying for its own.
 *
 * With TENANT_RLS enabled, application code that needs a transaction should use
 * this instead of `prisma.$transaction` — otherwise the guard would try to open
 * a nested transaction for every query inside the outer one.
 */
export function tenantTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const schoolId = requireSchoolId();
  const context = getTenantContext();

  return runWithTenantContext({ ...context, schoolId, rlsSession: true }, () =>
    prisma.$transaction(async (tx) => {
      if (RLS_ENABLED) await applySchoolGuc(tx, schoolId);
      return fn(tx as TxClient);
    })
  );
}
