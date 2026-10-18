"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

// SKO-440: clubs, sports and trips. Families see eligibility, cost, timing and terms before asking for a
// place; a place stays conditional until consent and fee rules are met. Coordinators see who is confirmed
// or conditional and what is missing — never care or medical notes.

type Ui = ReturnType<typeof useUiText>;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
const statusLabel = (ui: Ui, s: string) => ({ WAITLIST: ui("On the waitlist"), OFFERED: ui("Place offered"), RESERVED: ui("Place reserved · conditional"), CONFIRMED: ui("Confirmed"), DECLINED: ui("Declined"), EXPIRED: ui("Offer expired"), CANCELLED: ui("Cancelled") } as Record<string, string>)[s] ?? s;
// A requirement that does not apply is not shown at all.
const reqLabel = (ui: Ui, kind: "consent" | "fee", v: string): string | null => {
  const labels: Record<string, string | null> = kind === "consent" ? { NOT_REQUIRED: null, GRANTED: ui("Consent given"), PENDING: ui("Consent needed"), PARTIAL: ui("Consent: another guardian must answer"), DECLINED: ui("Consent declined") } : { NOT_REQUIRED: null, NONE: null, DUE: ui("Fee due"), PAID: ui("Fee paid"), WAIVED: ui("Fee waived") };
  return v in labels ? labels[v] : v;
};
const kindLabel = (ui: Ui, k: string) => ({ CLUB: ui("Club"), SPORT: ui("Sport"), TRIP: ui("Trip") } as Record<string, string>)[k] ?? k;

type FamilyActivity = { id: string; kind: string; title: string; description: string; location: string; startsAt: string; endsAt: string; costAmount: number; costCurrency: string; cancellationTerms: string; placesLeft: number; capacity: number; blocker: string | null; place: { id: string; status: string; version: number; offerExpiresAt: string | null; waitlistPosition: number | null; requirements: { consent: string; fee: string }; refundState: string | null } | null };

export function FamilyActivities({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { dateTime, money } = useLocaleFormat();
  const [data, setData] = useState<{ child: { name: string }; activities: FamilyActivity[] } | null>(null), [denied, setDenied] = useState(false), [busy, setBusy] = useState(false), [review, setReview] = useState<FamilyActivity | null>(null);
  const load = useCallback(async () => { try { setData(await call(`/api/family/activities?studentId=${encodeURIComponent(studentId)}`)); } catch { setDenied(true); } }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { const r = await call("/api/family/activities", "POST", body); toast.success(ui(done)); await load(); return r; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); return null; } finally { setBusy(false); } };
  if (denied || !data) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-family-activities>
    <header><h3 className="text-base font-bold">{ui("Clubs, sports and trips")}</h3><p className="text-xs text-ink-muted">{ui("A place is confirmed only when its consent and fee rules are complete.")}</p></header>
    {!data.activities.length ? <EmptyState size="sm" icon={CalendarDays} title={ui("No activities published for this age group yet.")} description={ui("A place is confirmed only when its consent and fee rules are complete.")} /> : <ul className="space-y-2">{data.activities.map(a => <li key={a.id} className={cn("rounded-xl border p-3", a.place?.status === "OFFERED" ? "border-status-warning-border bg-status-warning-surface/40" : "border-edge/40")} data-activity={a.id} data-activity-place={a.place?.status ?? "NONE"}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div>
        <p className="text-sm font-bold"><span dir="auto">{a.title}</span> · {kindLabel(ui, a.kind)}</p>
        <p className="text-xs text-ink-muted"><bdi>{dateTime(a.startsAt)}</bdi>–<bdi>{dateTime(a.endsAt)}</bdi> · <span dir="auto">{a.location}</span> · {a.costAmount ? <bdi>{money(a.costAmount, a.costCurrency)}</bdi> : ui("Free")} · {ui("{0} of {1} places left", [String(a.placesLeft), String(a.capacity)])}</p>
        {a.place ? <p className="flex flex-wrap items-center gap-1 text-xs text-ink-muted" data-activity-status><Badge size="sm" variant={a.place.status === "CONFIRMED" ? "success" : a.place.status === "OFFERED" ? "warning" : "neutral"} dot>{statusLabel(ui, a.place.status)}</Badge>{a.place.waitlistPosition ? <> · {ui("Position {0}", [String(a.place.waitlistPosition)])}</> : null}{a.place.status === "OFFERED" && a.place.offerExpiresAt ? <> · {ui("Offer expires {0}", [dateTime(a.place.offerExpiresAt)])}</> : null}</p> : null}
        {a.place && ["RESERVED", "CONFIRMED"].includes(a.place.status) ? <p className="text-xs">{[reqLabel(ui, "consent", a.place.requirements.consent), reqLabel(ui, "fee", a.place.requirements.fee)].filter(Boolean).join(" · ")}</p> : null}
        {!a.place || !["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"].includes(a.place.status) ? (a.blocker ? <p className="text-xs font-semibold text-status-error-text" data-activity-blocker>{ui(a.blocker)}</p> : null) : null}
      </div>
        <div className="flex flex-wrap gap-2">
          {a.place?.status === "OFFERED" ? <><Button size="sm" disabled={busy} onClick={() => setReview(a)} data-activity-accept>{ui("Accept place")}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => void run({ action: "answer", placeId: a.place!.id, knownVersion: a.place!.version, accept: false }, "Offer declined.")} data-activity-decline>{ui("Decline offer")}</Button></> : null}
          {(!a.place || !["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"].includes(a.place.status)) && !a.blocker ? <Button size="sm" disabled={busy} onClick={() => setReview(a)} data-activity-request>{a.placesLeft > 0 ? ui("Request a place") : ui("Join the waitlist")}</Button> : null}
          {a.place && ["WAITLIST", "RESERVED", "CONFIRMED"].includes(a.place.status) ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run({ action: "withdraw", placeId: a.place!.id }, "Place withdrawn.")} data-activity-withdraw>{ui("Withdraw")}</Button> : null}
        </div></div>
    </li>)}</ul>}
    {review ? <ModalFrame title={review.title} eyebrow={kindLabel(ui, review.kind)} subtitle={data.child.name} onClose={() => setReview(null)}>
      <div className="space-y-2 text-sm" data-activity-review>
        {review.description ? <p dir="auto">{review.description}</p> : null}
        <p><bdi>{dateTime(review.startsAt)}</bdi>–<bdi>{dateTime(review.endsAt)}</bdi> · <span dir="auto">{review.location}</span></p>
        <p className="font-bold">{review.costAmount ? <>{ui("Cost")}: <bdi>{money(review.costAmount, review.costCurrency)}</bdi></> : ui("Free")}</p>
        <div className="rounded-lg bg-surface-sunken p-2 text-xs"><p className="font-bold">{ui("Cancellation and refunds")}</p><p dir="auto">{review.cancellationTerms}</p></div>
        {review.kind === "TRIP" ? <p className="text-xs">{ui("Trip consent is requested separately; the place stays conditional until it is given.")}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReview(null)}>{ui("Back")}</Button><Button disabled={busy} onClick={async () => { const r = review.place?.status === "OFFERED" ? await run({ action: "answer", placeId: review.place.id, knownVersion: review.place.version, accept: true }, "Place reserved. One or more requirements remain.") : await run({ action: "request", activityId: review.id, studentId }, "Request recorded."); if (r) setReview(null); }} data-activity-confirm>{review.place?.status === "OFFERED" ? ui("Accept place") : review.placesLeft > 0 ? ui("Reserve the place") : ui("Join the waitlist")}</Button></div>
      </div>
    </ModalFrame> : null}
  </section>;
}

type Roster = { activity: { id: string; title: string; kind: string; capacity: number; placesTaken: number; startsAt: string; costAmount: number; costCurrency: string; status: string }; places: { id: string; studentId: string; name: string; className: string; status: string; feeStatus: string; refundState: string | null; cancelReason: string | null; requirements: { consent: string; fee: string } }[]; sessions: { id: string; startsAt: string; endsAt: string; marks: { studentId: string; status: string }[] }[] };

export function ActivitiesDesk() {
  const ui = useUiText();
  const { dateTime, money } = useLocaleFormat();
  const [list, setList] = useState<{ activities: { id: string; title: string; kind: string; capacity: number; startsAt: string; status: string; counts: Record<string, number> }[]; classes: { id: string; name: string }[]; trips: { id: string; title: string }[] } | null>(null), [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null), [roster, setRoster] = useState<Roster | null>(null), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "CLUB", title: "", description: "", location: "", startsAt: "", endsAt: "", capacity: "20", costAmount: "0", costCurrency: "PKR", cancellationTerms: "", tripId: "", classIds: [] as string[] });
  const load = useCallback(async () => { try { setList(await call("/api/activities")); } catch (e) { setError(ui(e instanceof Error ? e.message : "Activities could not be loaded.")); } }, [ui]);
  const loadRoster = useCallback(async (id: string) => { setOpen(id); setRoster(await call(`/api/activities?id=${encodeURIComponent(id)}`)); }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { await call("/api/activities", "POST", body); toast.success(ui(done)); if (open) await loadRoster(open); await load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  if (error) return <section className="sk-panel p-5" data-activities-desk><p className="text-sm text-rose-700">{error}</p></section>;
  if (!list) return <section className="sk-panel p-5" data-activities-desk aria-busy="true"><p className="text-sm text-ink-muted">{ui("Checking places before reserving.")}</p></section>;
  return <section className="sk-panel space-y-4 p-4 sm:p-5" data-activities-desk>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">{ui("Clubs, sports and trips")}</h2><p className="text-xs text-ink-muted">{ui("Interest, reservation and confirmed participation are kept apart.")}</p></div><Button size="sm" onClick={() => setCreating(true)} data-activity-new>{ui("Publish activity")}</Button></header>
    {!list.activities.length ? <EmptyState size="sm" icon={CalendarDays} title={ui("No activities yet.")} description={ui("Interest, reservation and confirmed participation are kept apart.")} action={<Button size="sm" onClick={() => setCreating(true)}>{ui("Publish activity")}</Button>} /> : <ul className="space-y-2">{list.activities.map(a => <li key={a.id}><Button type="button" variant="ghost" className={cn("block h-auto w-full whitespace-normal rounded-xl border p-3 text-start font-normal", open === a.id ? "border-primary" : "border-edge/40")} onClick={() => void loadRoster(a.id)} data-activity-row={a.id}>
      <span className="block text-sm font-bold"><span dir="auto">{a.title}</span> · {kindLabel(ui, a.kind)}{a.status === "CANCELLED" ? ` · ${ui("Cancelled")}` : ""}</span>
      <span className="block text-xs text-ink-muted"><bdi>{dateTime(a.startsAt)}</bdi> · {ui("{0} confirmed, {1} conditional, {2} waiting of {3}", [String(a.counts.CONFIRMED ?? 0), String((a.counts.RESERVED ?? 0) + (a.counts.OFFERED ?? 0)), String(a.counts.WAITLIST ?? 0), String(a.capacity)])}</span>
    </Button></li>)}</ul>}

    {roster ? <div className="space-y-3 rounded-2xl border p-3" data-activity-roster={roster.activity.id}>
      <p className="text-sm font-bold"><span dir="auto">{roster.activity.title}</span> · {ui("Places: {0} of {1}", [String(roster.activity.placesTaken), String(roster.activity.capacity)])}</p>
      <ul className="divide-y text-sm">{roster.places.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-roster-place={p.id} data-roster-status={p.status}>
        <span><bdi>{p.name}</bdi> · <bdi>{p.className}</bdi> · {statusLabel(ui, p.status)}{["RESERVED", "CONFIRMED"].includes(p.status) ? <> · {[reqLabel(ui, "consent", p.requirements.consent), reqLabel(ui, "fee", p.requirements.fee)].filter(Boolean).join(" · ")}</> : null}{p.refundState === "NEEDED" ? <> · <span className="font-bold text-amber-800">{ui("Refund request needed")}</span></> : p.refundState === "REQUESTED" ? <> · {ui("Refund requested")}</> : null}</span>
        <span className="flex flex-wrap gap-1">
          {p.status === "RESERVED" && p.requirements.fee === "DUE" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "fee", placeId: p.id, feeStatus: "WAIVED" }, "Fee waived.")} data-roster-waive>{ui("Waive fee")}</Button> : null}
          {p.refundState === "NEEDED" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "refund", placeId: p.id }, "Refund request sent to finance.")} data-roster-refund>{ui("Send refund request")}</Button> : null}
          {["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"].includes(p.status) ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: "cancel-place", placeId: p.id, reason: "Cancelled by the coordinator" }, "Place cancelled.")} data-roster-cancel>{ui("Cancel place")}</Button> : null}
        </span>
      </li>)}</ul>
      <div className="space-y-2" data-activity-sessions><p className="sk-eyebrow">{ui("Sessions")}</p>
        {roster.sessions.map(s => <div key={s.id} className="rounded-lg border p-2" data-session={s.id}><p className="text-xs font-bold"><bdi>{dateTime(s.startsAt)}</bdi></p><div className="mt-1 flex flex-wrap gap-2">{roster.places.filter(p => p.status === "CONFIRMED").map(p => { const mark = s.marks.find(m => m.studentId === p.studentId)?.status; return <span key={p.id} className="flex items-center gap-1 text-xs"><bdi>{p.name}</bdi>{["PRESENT", "ABSENT"].map(st => <Button key={st} size="sm" variant={mark === st ? "default" : "outline"} disabled={busy} onClick={() => void act({ action: "attend", sessionId: s.id, studentId: p.studentId, status: st }, "Attendance saved.")} data-attend={st}>{st === "PRESENT" ? ui("Present") : ui("Absent")}</Button>)}</span>; })}</div></div>)}
        <Button size="sm" variant="outline" loading={busy} onClick={() => void act({ action: "session", activityId: roster.activity.id, startsAt: roster.activity.startsAt, endsAt: new Date(new Date(roster.activity.startsAt).getTime() + 3_600_000).toISOString() }, "Session added.")} data-session-add>{ui("Add a session")}</Button>
      </div>
      {roster.activity.status !== "CANCELLED" ? <div className="flex justify-end"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: "cancel", activityId: roster.activity.id }, "Activity cancelled. Families were told.")} data-activity-cancel>{ui("Cancel activity")}</Button></div> : null}
      <p className="text-2xs text-ink-muted">{ui("Participant lists exclude private care narratives.")}{roster.activity.costAmount ? <> · {ui("Cost")}: <bdi>{money(roster.activity.costAmount, roster.activity.costCurrency)}</bdi></> : null}</p>
    </div> : null}

    {creating ? <ModalFrame title={ui("Publish activity")} onClose={() => setCreating(false)} wide>
      <div className="space-y-2" data-activity-form>
        <div className="grid gap-2 sm:grid-cols-3">
          <FormField name="af-kind" label={ui("Kind")}><Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{["CLUB", "SPORT", "TRIP"].map(k => <option key={k} value={k}>{kindLabel(ui, k)}</option>)}</Select></FormField>
          <FormField name="af-title" label={ui("Title")}><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField name="af-location" label={ui("Location")}><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></FormField>
          <FormField name="af-start" label={ui("Starts at")}><Input type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></FormField>
          <FormField name="af-end" label={ui("Ends at")}><Input type="datetime-local" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></FormField>
          <FormField name="af-cap" label={ui("Places")}><Input type="number" min={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></FormField>
          <FormField name="af-cost" label={ui("Cost (0 for free)")}><Input type="number" min={0} value={form.costAmount} onChange={e => setForm({ ...form, costAmount: e.target.value })} /></FormField>
          {form.kind === "TRIP" ? <FormField name="af-trip" label={ui("Trip consent record")}><Select value={form.tripId} onChange={e => setForm({ ...form, tripId: e.target.value })}><option value="">{ui("Choose a trip")}</option>{list.trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></FormField> : null}
        </div>
        <FormField name="af-desc" label={ui("Description")}><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
        <FormField name="af-terms" label={ui("Cancellation and refunds")} hint={ui("Shown to families before they ask for a place.")}><Textarea rows={2} value={form.cancellationTerms} onChange={e => setForm({ ...form, cancellationTerms: e.target.value })} /></FormField>
        <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="text-xs font-bold">{ui("Open to (none = every class)")}</legend>{list.classes.map(c => <label key={c.id} className="flex items-center gap-1"><Checkbox checked={form.classIds.includes(c.id)} onChange={e => setForm({ ...form, classIds: e.target.checked ? [...form.classIds, c.id] : form.classIds.filter(x => x !== c.id) })} /> <bdi>{c.name}</bdi></label>)}</fieldset>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(false)}>{ui("Back")}</Button><Button disabled={busy || !form.title || !form.startsAt || !form.endsAt} onClick={async () => { setBusy(true); try { await call("/api/activities", "POST", { action: "create", ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), capacity: Number(form.capacity), costAmount: Number(form.costAmount), tripId: form.tripId || undefined }); toast.success(ui("Activity published.")); setCreating(false); await load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } }} data-activity-publish>{ui("Publish")}</Button></div>
      </div>
    </ModalFrame> : null}
    <Link href="/" className="text-xs underline">{ui("Back")}</Link>
  </section>;
}
