// SKO-448: device storage for offline capture (browser only). Everything is filed under the signed-in account, so
// another account on the same device never sees it; prepared registers expire after 12 hours and pending changes
// after 3 days. Nothing here is shown to families or treated as recorded until the server accepts it.

export type OpState = "LOCAL" | "SYNCING" | "ACCEPTED" | "CONFLICT" | "REJECTED_ACCESS" | "EXPIRED" | "INVALID" | "RESOLVED_SERVER" | "RESOLVED_LOCAL" | "CORRECTION_REQUESTED";
export type Op = { operationId: string; kind: "ATTENDANCE_MARK"; classId: string; date: string; studentId: string; capturedAt: string; base: { status: string | null; version: number }; payload: { status: string; arrivalTime?: string | null }; state: OpState; message?: string | null; server?: { status?: string; arrivalTime?: string | null; version?: number; markedBy?: string | null; markedAt?: string | null } | null; confirmedAt?: string };
export type Snapshot = { owner: { userId: string; schoolId: string }; class: { id: string; name: string }; date: string; registerStatus: string; preparedAt: string; expiresAt: string; entries: { studentId: string; name: string; rollNo: string; status: string | null; arrivalTime: string | null; version: number }[] };
// SKAI-193: class/section edits share the account bucket. `classes` is the last server copy, `classCursor` the
// reconnect cursor (latest class updatedAt seen), `classOps` the pending queue with each edit's base version.
export type ClassRow = { id: string; name: string; section: string | null; capacity: number | null; updatedAt: string; archived: boolean };
export type ClassOp = { operationId: string; kind: "CLASS_EDIT"; classId: string; capturedAt: string; baseUpdatedAt: string; payload: { name?: string; section?: string | null; capacity?: number | null }; state: OpState; message?: string | null; server?: ClassRow | null; sent?: boolean };
type Bucket = { snapshots: Record<string, Snapshot>; ops: Op[]; lastConfirmedAt?: string; classes?: Record<string, ClassRow>; classCursor?: string | null; classOps?: ClassOp[] };

const KEY = "sk-offline-v1", DEVICE = "sk-offline-device", OPS_DAYS = 3;
const read = (): Record<string, Bucket> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (all: Record<string, Bucket>) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ } };
const owner = (userId: string, schoolId: string) => `${schoolId}:${userId}`;

export function deviceId() {
  try { let id = localStorage.getItem(DEVICE); if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE, id); } return id; } catch { return "unavailable-device"; }
}

/** The signed-in account's bucket, with expired snapshots removed and old pending changes marked expired. */
export function load(userId: string, schoolId: string): Bucket {
  const all = read(), k = owner(userId, schoolId), b = all[k] ?? { snapshots: {}, ops: [] }, now = Date.now();
  for (const [id, s] of Object.entries(b.snapshots)) if (new Date(s.expiresAt).getTime() < now || s.owner.userId !== userId) delete b.snapshots[id];
  b.ops = b.ops.filter(o => !(["ACCEPTED", "RESOLVED_SERVER", "RESOLVED_LOCAL", "CORRECTION_REQUESTED"].includes(o.state) && now - new Date(o.capturedAt).getTime() > 86_400_000));
  for (const o of b.ops) if (o.state === "LOCAL" && now - new Date(o.capturedAt).getTime() > OPS_DAYS * 86_400_000) o.state = "EXPIRED";
  all[k] = b; write(all);
  return b;
}
export function save(userId: string, schoolId: string, b: Bucket) { const all = read(); all[owner(userId, schoolId)] = b; write(all); }
export const pending = (b: Bucket) => b.ops.filter(o => o.state === "LOCAL" || o.state === "SYNCING").length;

/** For sign-out: how much unsynced work this device holds for anyone. */
export function pendingOnDevice() { return Object.values(read()).reduce((n, b) => n + [...b.ops, ...(b.classOps ?? [])].filter(o => o.state === "LOCAL" || o.state === "SYNCING" || o.state === "CONFLICT").length, 0); }

/** Folds a reconnect page into the server copy; the cursor only moves forward. */
export function mergeClassChanges(b: Bucket, items: ClassRow[], cursor: string | null) {
  const classes = { ...(b.classes ?? {}) };
  for (const row of items) classes[row.id] = row;
  const next = cursor && (!b.classCursor || cursor > b.classCursor) ? cursor : b.classCursor ?? null;
  return { ...b, classes, classCursor: next };
}

/** Queues an edit. A second edit to a class that was never sent folds into the same operation (same id, same base);
 *  once sent, the server may already hold that id, so a new edit gets its own id. */
export function queueClassEdit(b: Bucket, row: ClassRow, payload: ClassOp["payload"], newId: () => string, now = new Date()) {
  const ops = b.classOps ?? [], prior = ops.find(o => o.classId === row.id && o.state === "LOCAL" && !o.sent);
  const op: ClassOp = prior ? { ...prior, payload: { ...prior.payload, ...payload }, capturedAt: now.toISOString() } : { operationId: newId(), kind: "CLASS_EDIT", classId: row.id, capturedAt: now.toISOString(), baseUpdatedAt: row.updatedAt, payload, state: "LOCAL" };
  return { ...b, classOps: [...ops.filter(o => o !== prior), op] };
}

/** Shared-device policy on sign-out: prepared registers (names) and unsynced changes are removed from this device. */
export function clearOnSignOut() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }
