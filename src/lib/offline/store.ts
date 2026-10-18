// SKO-448: device storage for offline capture (browser only). Everything is filed under the signed-in account, so
// another account on the same device never sees it; prepared registers expire after 12 hours and pending changes
// after 3 days. Nothing here is shown to families or treated as recorded until the server accepts it.

export type OpState = "LOCAL" | "SYNCING" | "ACCEPTED" | "CONFLICT" | "REJECTED_ACCESS" | "EXPIRED" | "INVALID" | "RESOLVED_SERVER" | "RESOLVED_LOCAL" | "CORRECTION_REQUESTED";
export type Op = { operationId: string; kind: "ATTENDANCE_MARK"; classId: string; date: string; studentId: string; capturedAt: string; base: { status: string | null; version: number }; payload: { status: string; arrivalTime?: string | null }; state: OpState; message?: string | null; server?: { status?: string; arrivalTime?: string | null; version?: number; markedBy?: string | null; markedAt?: string | null } | null; confirmedAt?: string };
export type Snapshot = { owner: { userId: string; schoolId: string }; class: { id: string; name: string }; date: string; registerStatus: string; preparedAt: string; expiresAt: string; entries: { studentId: string; name: string; rollNo: string; status: string | null; arrivalTime: string | null; version: number }[] };
type Bucket = { snapshots: Record<string, Snapshot>; ops: Op[]; lastConfirmedAt?: string };

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
export function pendingOnDevice() { return Object.values(read()).reduce((n, b) => n + b.ops.filter(o => o.state === "LOCAL" || o.state === "SYNCING" || o.state === "CONFLICT").length, 0); }

/** Shared-device policy on sign-out: prepared registers (names) and unsynced changes are removed from this device. */
export function clearOnSignOut() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }
