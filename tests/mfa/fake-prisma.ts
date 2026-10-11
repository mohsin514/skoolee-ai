/**
 * In-memory stand-in for the slice of Prisma the MFA routes touch.
 *
 * Injected through `globalThis.prisma` before the route is imported
 * (src/lib/db/prisma.ts uses `globalThis.prisma ?? new PrismaClient()`), so the
 * real route handlers run without a database. Only the query shapes those
 * routes use are supported: equality, `{ gt }`, `{ lt }`, `{ equals }` on
 * arrays in `where`, and `{ increment }` in `data`. Anything else throws, so a
 * route change that relies on an unsupported shape fails loudly instead of
 * silently matching.
 */
type Row = Record<string, unknown>;

export interface FakeState {
  users: Row[];
  schools: Row[];
  auditLogs: Row[];
  loginSessions: Row[];
  authAttempts: Row[];
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${process.pid}-${++sequence}`;

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  return value;
}

function comparable(value: unknown) {
  return value instanceof Date ? value.getTime() : value;
}

function matchesField(actual: unknown, expected: unknown): boolean {
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    for (const [operator, operand] of Object.entries(expected)) {
      if (operator === "gt") { if (actual == null || !((comparable(actual) as number) > (comparable(operand) as number))) return false; }
      else if (operator === "lt") { if (actual == null || !((comparable(actual) as number) < (comparable(operand) as number))) return false; }
      else if (operator === "equals") {
        if (!Array.isArray(actual) || !Array.isArray(operand) || actual.length !== operand.length || actual.some((item, i) => item !== operand[i])) return false;
      } else throw new Error(`fake-prisma: unsupported where operator ${operator}`);
    }
    return true;
  }
  if (Array.isArray(expected)) throw new Error("fake-prisma: bare array equality is not supported, use { equals }");
  return (actual ?? null) === (expected ?? null);
}

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([field, expected]) => matchesField(row[field], expected));
}

function apply(row: Row, data: Row) {
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      if ("increment" in value) { row[field] = (row[field] as number) + (value as { increment: number }).increment; continue; }
      throw new Error(`fake-prisma: unsupported data operator on ${field}`);
    }
    row[field] = clone(value);
  }
}

function select(row: Row, shape?: Row) {
  if (!shape) return clone(row);
  return Object.fromEntries(Object.keys(shape).filter(key => shape[key]).map(key => [key, clone(row[key])]));
}

export function createFakePrisma(initial?: Partial<FakeState>) {
  const state: FakeState = {
    users: clone(initial?.users ?? []),
    schools: clone(initial?.schools ?? []),
    auditLogs: clone(initial?.auditLogs ?? []),
    loginSessions: clone(initial?.loginSessions ?? []),
    authAttempts: clone(initial?.authAttempts ?? []),
  };

  const findUser = (where: Row) => state.users.find(row => matches(row, where));

  const client = {
    state,
    user: {
      async findFirst({ where, include }: { where: Row; include?: Row }) {
        const row = findUser(where);
        if (!row) return null;
        const result = clone(row);
        if (include?.school) result.school = clone(state.schools.find(school => school.id === row.schoolId) ?? null);
        if (include?.campus) result.campus = row.campusId ? { schoolId: row.schoolId } : null;
        return result;
      },
      async findUnique({ where }: { where: Row }) {
        const row = findUser(where);
        return row ? clone(row) : null;
      },
      async findUniqueOrThrow({ where }: { where: Row }) {
        const row = findUser(where);
        if (!row) throw new Error("fake-prisma: user not found");
        return clone(row);
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = findUser(where);
        if (!row) throw new Error("fake-prisma: user not found");
        apply(row, data);
        return clone(row);
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const rows = state.users.filter(row => matches(row, where));
        for (const row of rows) apply(row, data);
        return { count: rows.length };
      },
    },
    school: {
      async findUniqueOrThrow({ where, select: shape }: { where: Row; select?: Row }) {
        const row = state.schools.find(school => matches(school, where));
        if (!row) throw new Error("fake-prisma: school not found");
        return select(row, shape);
      },
    },
    auditLog: {
      async create({ data }: { data: Row }) {
        const row = { id: nextId("audit"), createdAt: new Date(), ...clone(data) };
        state.auditLogs.push(row);
        return clone(row);
      },
    },
    superAdminAuditLog: {
      async create({ data }: { data: Row }) { return clone(data); },
    },
    loginSession: {
      async create({ data }: { data: Row }) {
        const row = { id: nextId("session"), isActive: true, loginAt: new Date(), logoutAt: null, ...clone(data) };
        state.loginSessions.push(row);
        return clone(row);
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const rows = state.loginSessions.filter(row => matches(row, where));
        for (const row of rows) apply(row, data);
        return { count: rows.length };
      },
    },
    authAttempt: {
      async upsert({ where, create, update, select: shape }: { where: Row; create: Row; update: Row; select?: Row }) {
        let row = state.authAttempts.find(attempt => matches(attempt, where));
        if (row) apply(row, update);
        else { row = { count: 1, ...clone(create) }; state.authAttempts.push(row); }
        return select(row, shape);
      },
      async deleteMany({ where }: { where: Row }) {
        const before = state.authAttempts.length;
        state.authAttempts = state.authAttempts.filter(row => !matches(row, where));
        return { count: before - state.authAttempts.length };
      },
    },
    async $transaction(first: unknown) {
      if (typeof first === "function") return (first as (tx: unknown) => unknown)(client);
      return Promise.all(first as Promise<unknown>[]);
    },
  };
  return client;
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;

/** JSON with Dates preserved, for handing state to a restarted process. */
export function serializeState(state: FakeState) {
  return JSON.stringify(state, function (key, value) {
    const raw = (this as Row)[key];
    return raw instanceof Date ? { $date: raw.toISOString() } : value;
  });
}

export function deserializeState(text: string): FakeState {
  return JSON.parse(text, (_key, value) => (value && typeof value === "object" && typeof value.$date === "string" ? new Date(value.$date) : value));
}
