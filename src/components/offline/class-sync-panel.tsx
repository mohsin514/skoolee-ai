"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { deviceId, load, mergeClassChanges, queueClassEdit, save, type ClassOp, type ClassRow, type OpState } from "@/lib/offline/store";

// SKAI-193: class and section edits that survive a lost connection. Edits are saved under the signed-in account on
// this device with a stable operation id, sent when the connection returns, and labelled pending until the server
// accepts them. On reconnect the device first asks only for classes changed since its cursor; a class someone else
// changed meanwhile is shown beside your edit for a decision.

type Ui = ReturnType<typeof useUiText>;
type Bucket = ReturnType<typeof load>;
const OPEN: OpState[] = ["LOCAL", "SYNCING", "CONFLICT"];
const badge = (ui: Ui, s: OpState | undefined) => !s ? null
  : s === "LOCAL" || s === "SYNCING" ? <Badge variant="warning" data-class-sync-state="pending">{s === "SYNCING" ? ui("Syncing…") : ui("Pending sync")}</Badge>
  : s === "CONFLICT" ? <Badge variant="danger" data-class-sync-state="conflict">{ui("Needs your decision")}</Badge>
  : s === "ACCEPTED" || s === "RESOLVED_LOCAL" ? <Badge variant="success" data-class-sync-state="synced">{ui("Synced")}</Badge>
  : s === "RESOLVED_SERVER" ? <Badge variant="neutral" data-class-sync-state="kept">{ui("Kept the server value")}</Badge>
  : <Badge variant="danger" data-class-sync-state="refused">{ui("Not synced")}</Badge>;
const label = (r: { name?: string; section?: string | null }) => `${r.name ?? ""}${r.section ? ` · ${r.section}` : ""}`;

export function ClassSyncPanel({ onSynced }: { onSynced?: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [me, setMe] = useState<{ id: string; schoolId: string } | null>(null), [online, setOnline] = useState(true), [bucket, setBucket] = useState<Bucket | null>(null);
  const [editing, setEditing] = useState<ClassRow | null>(null), [form, setForm] = useState({ name: "", section: "", capacity: "" }), [resolving, setResolving] = useState<ClassOp | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ref = useRef<Bucket | null>(null), running = useRef(false), again = useRef(false), syncLatest = useRef<() => Promise<void>>(async () => undefined);
  const persist = useCallback((next: Bucket) => { if (!me) return; ref.current = next; save(me.id, me.schoolId, next); setBucket(next); }, [me]);
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).then(j => { if (j.user) { setMe({ id: j.user.id, schoolId: j.user.schoolId }); const b = load(j.user.id, j.user.schoolId); ref.current = b; setBucket(b); } }).catch(() => undefined);
    const on = () => setOnline(navigator.onLine); on();
    window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  const call = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };
  /** Reconnect: pull changes since the cursor, then push the queue. */
  const sync = useCallback(async () => {
    if (!me || !ref.current) return;
    // A reconnect or new edit during a running sync is not dropped: it runs once that sync ends.
    if (running.current) { again.current = true; return; }
    running.current = true; setBusy(true); setError("");
    // Every step applies its result to the latest bucket, so an edit queued while a request is in flight survives.
    const cur = () => ref.current!;
    try {
      for (let more = true; more;) {
        const cursor = cur().classCursor;
        const r = await fetch(`/api/offline?view=class-changes${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error);
        persist(mergeClassChanges(cur(), j.data.items, j.data.cursor)); more = j.data.more;
      }
      const queue = (cur().classOps ?? []).filter(o => o.state === "LOCAL");
      if (queue.length) {
        const ids = new Set(queue.map(o => o.operationId));
        persist({ ...cur(), classOps: (cur().classOps ?? []).map(o => ids.has(o.operationId) ? { ...o, state: "SYNCING" as OpState, sent: true } : o) });
        const { r, j } = await call({ action: "class-sync", deviceId: deviceId(), operations: queue.map(({ state: _s, message: _m, server: _v, sent: _t, ...op }) => op) });
        if (!r.ok || !j.success) throw new Error(j.error);
        const out = new Map<string, { status: OpState; message?: string; server?: ClassRow }>(j.data.outcomes.map((o: { operationId: string }) => [o.operationId, o]));
        const b = cur(), classes = { ...(b.classes ?? {}) };
        const classOps = (b.classOps ?? []).map(o => { const res = out.get(o.operationId); if (!res) return o; if (res.status === "ACCEPTED" && res.server) classes[o.classId] = res.server; return { ...o, state: res.status, message: res.message ?? null, server: res.server ?? null }; });
        persist({ ...b, classes, classOps });
        const conflicts = classOps.filter(o => o.state === "CONFLICT").length;
        toast[conflicts ? "warning" : "success"](conflicts ? ui("{0} class edit(s) need your decision.", [String(conflicts)]) : ui("Class changes synced."));
        if (j.data.accepted) onSynced?.();
      }
    } catch {
      persist({ ...cur(), classOps: (cur().classOps ?? []).map(o => o.state === "SYNCING" ? { ...o, state: "LOCAL" as OpState } : o) });
      setError(ui("No connection. Your class edits stay on this device until the server accepts them."));
    } finally {
      running.current = false; setBusy(false);
      if (again.current && navigator.onLine) { again.current = false; setTimeout(() => void syncLatest.current(), 0); }
    }
  }, [me, persist, ui, onSynced]);
  useEffect(() => { syncLatest.current = sync; }, [sync]);
  useEffect(() => { if (me && online) void sync(); }, [me, online]);
  const queue = () => {
    const b = ref.current; if (!b || !editing) return;
    const capacity = form.capacity.trim() === "" ? null : Number(form.capacity);
    if (!form.name.trim()) { setError(ui("A class name is required")); return; }
    if (capacity !== null && !(Number.isInteger(capacity) && capacity >= 1 && capacity <= 200)) { setError(ui("Capacity must be a whole number from 1 to 200, or left blank.")); return; }
    const payload: ClassOp["payload"] = {};
    if (form.name.trim() !== editing.name) payload.name = form.name.trim();
    if ((form.section.trim() || null) !== editing.section) payload.section = form.section.trim() || null;
    if (capacity !== editing.capacity) payload.capacity = capacity;
    setEditing(null);
    if (!Object.keys(payload).length) return;
    persist(queueClassEdit(b, editing, payload, () => crypto.randomUUID()));
    if (navigator.onLine) setTimeout(() => void sync(), 0);
    else toast.info(ui("Saved on this device. It syncs when you are back online."));
  };
  const decide = async (decision: "KEEP_SERVER" | "APPLY_LOCAL") => {
    const b = ref.current; if (!b || !resolving) return;
    setBusy(true); setError("");
    try {
      const { r, j } = await call({ action: "class-resolve", operationId: resolving.operationId, decision });
      if (r.status === 409) { setError(ui("The class changed again. Review the latest value.")); setResolving(null); setBusy(false); await sync(); return; }
      if (!r.ok || !j.success) throw new Error(j.error);
      const classes = { ...(b.classes ?? {}) }; if (j.data.server) classes[resolving.classId] = j.data.server;
      persist({ ...b, classes, classOps: (b.classOps ?? []).map(o => o.operationId === resolving.operationId ? { ...o, state: j.data.status, server: j.data.server ?? o.server } : o) });
      setResolving(null); toast.success(ui("Decision recorded. Both observations stay in the history.")); if (decision === "APPLY_LOCAL") onSynced?.();
    } catch { setError(ui("The change was not saved.")); } finally { setBusy(false); }
  };
  const rows = useMemo(() => Object.values(bucket?.classes ?? {}).filter(c => !c.archived).sort((a, b) => label(a).localeCompare(label(b))), [bucket]);
  const latest = useMemo(() => new Map((bucket?.classOps ?? []).map(o => [o.classId, o])), [bucket]);
  if (!bucket) return null;
  const pendingCount = (bucket.classOps ?? []).filter(o => o.state === "LOCAL" || o.state === "SYNCING").length;
  return <section className="sk-panel sk-rise min-w-0 space-y-4 p-4 sm:p-6" data-class-sync aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h2 className="text-lg font-bold text-ink-strong">{ui("Class edits on this device")}</h2><p className="text-sm text-ink-muted">{ui("Rename a class, change its section or seats even without a connection. Edits sync when you reconnect.")}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {online ? <Badge variant="success" data-class-sync-online>{ui("Connected")}</Badge> : <Badge variant="warning" data-class-sync-online="offline"><CloudOff aria-hidden="true" />{ui("Offline")}</Badge>}
        <Badge variant="neutral" data-class-sync-pending={pendingCount}>{ui("Pending: {0}", [String(pendingCount)])}</Badge>
        <Button size="sm" variant="outline" disabled={busy || !online} onClick={() => void sync()} data-class-sync-now><RefreshCw className="size-4" aria-hidden="true" />{ui("Sync now")}</Button>
      </div>
    </div>
    {error ? <Alert tone="warning" compact>{error}</Alert> : null}
    {rows.length === 0 ? <EmptyState size="sm" icon={CloudOff} title={ui("No classes on this device yet.")} description={ui("Connect once to keep a copy of your campus classes here.")} />
      : <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rows.map(c => { const op = latest.get(c.id), open = op && OPEN.includes(op.state); return <li key={c.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-edge p-3" data-class-sync-row={c.id}>
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-ink-strong"><bdi>{label(open ? { ...c, ...op!.payload } : c)}</bdi></p><div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-subtle">{badge(ui, op?.state)}{op?.message && op.state !== "ACCEPTED" ? <span>{ui(op.message)}</span> : null}</div></div>
          {op?.state === "CONFLICT" ? <Button size="sm" onClick={() => setResolving(op)} data-class-sync-review>{ui("Review")}</Button>
            : <Button size="sm" variant="outline" disabled={op?.state === "SYNCING"} onClick={() => { setError(""); const shown = open ? { ...c, ...op!.payload } : c; setForm({ name: shown.name, section: shown.section ?? "", capacity: shown.capacity == null ? "" : String(shown.capacity) }); setEditing(c); }} data-class-sync-edit>{ui("Edit")}</Button>}
        </li>; })}</ul>}
    {editing ? <ModalFrame title={ui("Edit {0}", [label(editing)])} onClose={() => setEditing(null)}><div className="space-y-3" data-class-sync-form>
      <FormField name="cs-name" label={ui("Class name")}><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-class-sync-name /></FormField>
      <FormField name="cs-section" label={ui("Section")}><Input value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} data-class-sync-section /></FormField>
      <FormField name="cs-capacity" label={ui("Capacity (seats per class)")}><Input inputMode="numeric" dir="ltr" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></FormField>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>{ui("Back")}</Button><Button onClick={queue} data-class-sync-save>{online ? ui("Save") : ui("Save on this device")}</Button></div>
    </div></ModalFrame> : null}
    {resolving ? <ModalFrame title={ui("Sync conflict review")} onClose={() => setResolving(null)}><div className="space-y-3" data-class-sync-resolve>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-edge p-3 text-sm"><p className="font-semibold text-ink-strong">{ui("Yours (this device)")}</p><p><bdi>{label({ ...(bucket.classes?.[resolving.classId] ?? {}), ...resolving.payload })}</bdi></p>{resolving.payload.capacity !== undefined ? <p className="text-xs">{ui("Capacity (seats per class)")}: <bdi dir="ltr">{resolving.payload.capacity ?? "—"}</bdi></p> : null}<p className="text-xs text-ink-muted">{ui("Captured {0}", [dateTime(resolving.capturedAt)])}</p></div>
        <div className="rounded-xl border border-edge p-3 text-sm"><p className="font-semibold text-ink-strong">{ui("On the server")}</p><p><bdi>{resolving.server ? label(resolving.server) : "—"}</bdi></p><p className="text-xs">{ui("Capacity (seats per class)")}: <bdi dir="ltr">{resolving.server?.capacity ?? "—"}</bdi></p>{resolving.server ? <p className="text-xs text-ink-muted">{ui("Changed {0}", [dateTime(resolving.server.updatedAt)])}</p> : null}</div>
      </div>
      <p className="text-xs text-ink-muted">{ui("Both observations remain in the history. Nothing is overwritten without your decision.")}</p>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || !online} onClick={() => void decide("APPLY_LOCAL")} data-class-sync-apply>{ui("Apply mine")}</Button><Button disabled={busy || !online} onClick={() => void decide("KEEP_SERVER")} data-class-sync-keep>{ui("Keep the server value")}</Button></div>
    </div></ModalFrame> : null}
  </section>;
}
