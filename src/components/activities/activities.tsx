"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskRowButton, DeskRowIcon, DeskStats, RelativeTime, StatTile, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { Bus, CalendarDays, CheckCircle2, Clock3, MoreHorizontal, Plus, Sparkles, Ticket, Trophy, Users } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";

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
const placeTone = (s: string): DeskTone => ({ WAITLIST: "info", OFFERED: "warning", RESERVED: "warning", CONFIRMED: "success", DECLINED: "neutral", EXPIRED: "neutral", CANCELLED: "neutral" } as Record<string, DeskTone>)[s] ?? "neutral";
const kindIcon = (k: string) => k === "SPORT" ? Trophy : k === "TRIP" ? Bus : Users;
const kindLabel = (ui: Ui, k: string) => ({ CLUB: ui("Club"), SPORT: ui("Sport"), TRIP: ui("Trip") } as Record<string, string>)[k] ?? k;

type FamilyActivity = { id: string; kind: string; title: string; description: string; location: string; startsAt: string; endsAt: string; costAmount: number; costCurrency: string; cancellationTerms: string; placesLeft: number; capacity: number; blocker: string | null; place: { id: string; status: string; version: number; offerExpiresAt: string | null; waitlistPosition: number | null; requirements: { consent: string; fee: string }; refundState: string | null } | null };

export function FamilyActivities({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { dateTime, money } = useLocaleFormat();
  const [data, setData] = useState<{ child: { name: string }; activities: FamilyActivity[] } | null>(null), [denied, setDenied] = useState(false), [busy, setBusy] = useState(false), [review, setReview] = useState<FamilyActivity | null>(null);
  // Giving up a place cannot be undone by the family (the next family may take it), so it is confirmed first (role-ux R3).
  const [releasing, setReleasing] = useState<{ kind: "withdraw" | "decline"; activity: FamilyActivity } | null>(null);
  const load = useCallback(async () => { try { setData(await call(`/api/family/activities?studentId=${encodeURIComponent(studentId)}`)); } catch { setDenied(true); } }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { const r = await call("/api/family/activities", "POST", body); toast.success(ui(done)); await load(); return r; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); return null; } finally { setBusy(false); } };
  if (denied || !data) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-family-activities>
    <header><h3 className="text-base font-bold">{ui("Clubs, sports and trips")}</h3><p className="text-xs text-ink-muted">{ui("A place is confirmed only when its consent and fee rules are complete.")}</p></header>
    {!data.activities.length ? <EmptyState size="sm" icon={CalendarDays} title={ui("No activities published for this age group yet.")} description={ui("A place is confirmed only when its consent and fee rules are complete.")} /> : <ul className="space-y-2.5">{urgencyFirst(data.activities, a => a.place?.status === "OFFERED" ? 0 : a.place?.status === "RESERVED" ? 1 : a.place ? 3 : 2).map(a => <li key={a.id} className="sk-desk-row" data-tone={a.place?.status === "OFFERED" ? "warning" : a.place?.status === "CONFIRMED" ? "success" : undefined} data-activity={a.id} data-activity-place={a.place?.status ?? "NONE"}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 basis-64 items-start gap-3"><DeskRowIcon icon={kindIcon(a.kind)} /><div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold"><span dir="auto">{a.title}</span> · {kindLabel(ui, a.kind)}</p>
        <p className="text-xs text-ink-muted"><bdi>{dateTime(a.startsAt)}</bdi>–<bdi>{dateTime(a.endsAt)}</bdi> · <span dir="auto">{a.location}</span> · {a.costAmount ? <bdi>{money(a.costAmount, a.costCurrency)}</bdi> : ui("Free")} · {ui("{0} of {1} places left", [String(a.placesLeft), String(a.capacity)])}</p>
        {a.capacity ? <Progress size="sm" value={a.capacity - a.placesLeft} max={a.capacity} tone={a.placesLeft <= 0 ? "danger" : a.placesLeft / a.capacity < 0.2 ? "warning" : "brand"} label={ui("{0} of {1} places left", [String(a.placesLeft), String(a.capacity)])} className="max-w-xs" /> : null}
        {a.place ? <p className="flex flex-wrap items-center gap-1 text-xs text-ink-muted" data-activity-status><DeskPill tone={placeTone(a.place.status)}>{statusLabel(ui, a.place.status)}</DeskPill>{a.place.waitlistPosition ? <> · {ui("Position {0}", [String(a.place.waitlistPosition)])}</> : null}{a.place.status === "OFFERED" && a.place.offerExpiresAt ? <> · {ui("Offer expires {0}", [dateTime(a.place.offerExpiresAt)])} (<RelativeTime iso={a.place.offerExpiresAt} full={dateTime(a.place.offerExpiresAt)} />)</> : null}</p> : null}
        {a.place && ["RESERVED", "CONFIRMED"].includes(a.place.status) ? <p className="text-xs">{[reqLabel(ui, "consent", a.place.requirements.consent), reqLabel(ui, "fee", a.place.requirements.fee)].filter(Boolean).join(" · ")}</p> : null}
        {!a.place || !["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"].includes(a.place.status) ? (a.blocker ? <p className="text-xs font-semibold text-status-error-text" data-activity-blocker>{ui(a.blocker)}</p> : null) : null}
      </div></div>
        <div className="flex flex-wrap gap-2">
          {a.place?.status === "OFFERED" ? <><Button size="sm" disabled={busy} onClick={() => setReview(a)} data-activity-accept>{ui("Accept place")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setReleasing({ kind: "decline", activity: a })} data-activity-decline>{ui("Decline offer")}</Button></> : null}
          {(!a.place || !["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"].includes(a.place.status)) && !a.blocker ? <Button size="sm" disabled={busy} onClick={() => setReview(a)} data-activity-request>{a.placesLeft > 0 ? ui("Request a place") : ui("Join the waitlist")}</Button> : null}
          {a.place && ["WAITLIST", "RESERVED", "CONFIRMED"].includes(a.place.status) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setReleasing({ kind: "withdraw", activity: a })} data-activity-withdraw>{ui("Withdraw")}</Button> : null}
        </div></div>
    </li>)}</ul>}
    <ConfirmAction
      open={Boolean(releasing)}
      busy={busy}
      tone="danger"
      title={ui(releasing?.kind === "decline" ? "Decline this offer?" : "Withdraw from this activity?")}
      description={releasing ? ui(releasing.kind === "decline"
        ? "{0} is not given a place in \"{1}\" and the place is offered to the next family on the waiting list."
        : "{0}'s place in \"{1}\" is released and may be offered to the next family on the waiting list. A paid place follows the activity's cancellation terms.", [data.child.name, releasing.activity.title]) : ""}
      confirmLabel={ui(releasing?.kind === "decline" ? "Decline offer" : "Withdraw")}
      cancelLabel={ui("Keep editing")}
      onConfirm={() => {
        const r = releasing; setReleasing(null);
        if (!r?.activity.place) return;
        if (r.kind === "decline") void run({ action: "answer", placeId: r.activity.place.id, knownVersion: r.activity.place.version, accept: false }, "Offer declined.");
        else void run({ action: "withdraw", placeId: r.activity.place.id }, "Place withdrawn.");
      }}
      onCancel={() => setReleasing(null)}
    />
    {review ? <Modal title={review.title} eyebrow={kindLabel(ui, review.kind)} subtitle={data.child.name} icon={review.kind === "TRIP" ? Bus : review.kind === "SPORT" ? Trophy : Ticket} tone="sky" onClose={() => setReview(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setReview(null)}>{ui("Back")}</Button><Button disabled={busy} onClick={async () => { const r = review.place?.status === "OFFERED" ? await run({ action: "answer", placeId: review.place.id, knownVersion: review.place.version, accept: true }, "Place reserved. One or more requirements remain.") : await run({ action: "request", activityId: review.id, studentId }, "Request recorded."); if (r) setReview(null); }} data-activity-confirm>{review.place?.status === "OFFERED" ? ui("Accept place") : review.placesLeft > 0 ? ui("Reserve the place") : ui("Join the waitlist")}</Button></div>}>
      <div className="space-y-2 text-sm" data-activity-review>
        {review.description ? <p dir="auto">{review.description}</p> : null}
        <p><bdi>{dateTime(review.startsAt)}</bdi>–<bdi>{dateTime(review.endsAt)}</bdi> · <span dir="auto">{review.location}</span></p>
        <p className="font-bold">{review.costAmount ? <>{ui("Cost")}: <bdi>{money(review.costAmount, review.costCurrency)}</bdi></> : ui("Free")}</p>
        <div className="rounded-(--radius-control) border border-border-subtle bg-surface-subtle p-3 text-xs"><p className="font-bold text-ink-strong">{ui("Cancellation and refunds")}</p><p dir="auto">{review.cancellationTerms}</p></div>
        {review.kind === "TRIP" ? <p className="text-xs">{ui("Trip consent is requested separately; the place stays conditional until it is given.")}</p> : null}
      </div>
    </Modal> : null}
  </section>;
}

type Roster = { activity: { id: string; title: string; kind: string; capacity: number; placesTaken: number; startsAt: string; costAmount: number; costCurrency: string; status: string; canRun?: boolean }; places: { id: string; studentId: string; name: string; className: string; status: string; feeStatus: string; refundState: string | null; cancelReason: string | null; requirements: { consent: string; fee: string } }[]; sessions: { id: string; startsAt: string; endsAt: string; marks: { studentId: string; status: string }[] }[] };
type StaffList = { activities: { id: string; title: string; kind: string; capacity: number; startsAt: string; status: string; canRun?: boolean; counts: Record<string, number> }[]; classes: { id: string; name: string }[]; trips: { id: string; title: string }[]; canLead?: boolean; canPublish?: boolean; currency?: string };

/**
 * The staff desk at /activities, framed in the caller's console. It is the page itself, so it draws no card of its
 * own (the shell's one page card holds it). Who sees what follows the server (§2.2 #46, §4.5.11): coordinators and
 * campus operators run an activity (sessions, attendance, places); campus admins and teachers publish; only the
 * campus admin waives a fee, hands a refund to finance or cancels an activity; the principal reads.
 */
export function ActivitiesDesk() {
  const ui = useUiText();
  const { dateTime, money } = useLocaleFormat();
  const locale = useLocale();
  const [list, setList] = useState<StaffList | null>(null), [error, setError] = useState("");
  // role-ux M71/G38: waiving a fee, handing a refund to finance and cancelling an activity are the campus admin's.
  const [confirming, setConfirming] = useState<{ kind: "cancel-activity"; id: string; title: string } | { kind: "cancel-place"; id: string; name: string } | null>(null);
  // Waiving a fee is a money decision: confirmed with a typed reason that is kept in the audit trail (R3, §4.5.5).
  const [waiving, setWaiving] = useState<{ id: string; name: string } | null>(null);
  // A counter narrows the list to activities with that kind of place; the quick filter matches titles.
  const [tile, setTile] = useState<"" | "CONFIRMED" | "OFFERED" | "WAITLIST">(""), [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null), [roster, setRoster] = useState<Roster | null>(null), [rosterError, setRosterError] = useState(false), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false);
  // The cost is in the campus currency (locale package); the server applies the same default (R7: no hard-coded "PKR").
  const [form, setForm] = useState({ kind: "CLUB", title: "", description: "", location: "", startsAt: "", endsAt: "", capacity: "20", costAmount: "0", cancellationTerms: "", tripId: "", classIds: [] as string[] });
  const load = useCallback(async () => { try { setList(await call("/api/activities")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Activities could not be loaded."); } }, []);
  // A roster that fails to load says so in place, with a retry (R4), instead of leaving the previous one on screen.
  const loadRoster = useCallback(async (id: string) => { setOpen(id); setRosterError(false); try { setRoster(await call(`/api/activities?id=${encodeURIComponent(id)}`)); } catch { setRoster(null); setRosterError(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { await call("/api/activities", "POST", body); toast.success(ui(done)); if (open) await loadRoster(open); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (error && !list) return <div data-activities-desk><ErrorState title={ui("Activities could not be loaded")} description={ui(error)} onRetry={() => { setError(""); void load(); }} retryLabel={ui("Try again")} /></div>;
  if (!list) return <div data-activities-desk aria-busy="true"><SkeletonList rows={3} label={ui("Loading activities…")} /></div>;
  const lead = list.canLead === true;
  const publish = list.canPublish === true;
  const currency = list.currency || locale.currency;
  const running = roster?.activity.canRun !== false;
  const total = (k: string) => list.activities.filter(a => a.status !== "CANCELLED").reduce((n, a) => n + (a.counts[k] ?? 0), 0);
  const toggle = (next: typeof tile) => setTile(t => t === next ? "" : next);
  const needle = q.trim().toLowerCase();
  const pendingPlaces = (a: StaffList["activities"][number]) => (a.counts.OFFERED ?? 0) + (a.counts.RESERVED ?? 0);
  // Activities with families waiting on an answer come first, then the soonest; cancelled ones sink.
  const shown = urgencyFirst(list.activities.filter(a => (!needle || a.title.toLowerCase().includes(needle))
    && (tile === "" || (tile === "OFFERED" ? pendingPlaces(a) > 0 : (a.counts[tile] ?? 0) > 0))), a => a.status === "CANCELLED" ? 3 : pendingPlaces(a) ? 0 : (a.counts.WAITLIST ?? 0) ? 1 : 2);
  return <div className="space-y-4" data-activities-desk>
    <PageHeader
      icon={CalendarDays}
      title="Activities"
      description={publish ? "Clubs, sports and trips. Interest, reservation and confirmed participation are kept apart." : "Clubs, sports and trips on your campus. Their coordinators run them; you can open any roster."}
      primaryAction={publish ? { id: "publish-activity", label: "Publish activity", icon: Plus, onClick: () => setCreating(true) } : undefined}
    />
    {list.activities.length ? <DeskStats data-activities-pulse>
      <StatTile index={0} icon={CalendarDays} tone="brand" value={list.activities.filter(a => a.status !== "CANCELLED").length} label={ui("Activities")} onSelect={() => { setTile(""); setQ(""); }} selected={!tile && !needle} />
      <StatTile index={1} icon={CheckCircle2} tone="success" value={total("CONFIRMED")} label={ui("Confirmed")} onSelect={() => toggle("CONFIRMED")} selected={tile === "CONFIRMED"} />
      <StatTile index={2} icon={Ticket} tone={total("OFFERED") + total("RESERVED") ? "warning" : "neutral"} value={total("OFFERED") + total("RESERVED")} label={ui("Place offered")} onSelect={() => toggle("OFFERED")} selected={tile === "OFFERED"} />
      <StatTile index={3} icon={Clock3} tone={total("WAITLIST") ? "info" : "neutral"} value={total("WAITLIST")} label={ui("On the waitlist")} onSelect={() => toggle("WAITLIST")} selected={tile === "WAITLIST"} />
    </DeskStats> : null}
    {list.activities.length > 8 ? <DeskQuickFilter value={q} onChange={setQ} label={ui("Filter this list")} /> : null}
    {list.activities.length ? <DeskFilterStatus shown={shown.length} total={list.activities.length} onClear={() => { setTile(""); setQ(""); }} /> : null}
    {!list.activities.length ? <EmptyState size="sm" icon={CalendarDays} title={ui("No activities yet.")} description={ui(publish ? "Interest, reservation and confirmed participation are kept apart." : "Activities you coordinate or help run appear here.")} action={publish ? <Button size="sm" onClick={() => setCreating(true)}>{ui("Publish activity")}</Button> : undefined} /> : <ul className="space-y-2.5">{shown.map(a => { const taken = (a.counts.CONFIRMED ?? 0) + (a.counts.RESERVED ?? 0) + (a.counts.OFFERED ?? 0); return <li key={a.id}><DeskRowButton tone={a.status === "CANCELLED" ? "muted" : undefined} icon={kindIcon(a.kind)} trailing={<DeskPill tone={a.status === "CANCELLED" ? "neutral" : taken >= a.capacity ? "danger" : "brand"}>{a.status === "CANCELLED" ? ui("Cancelled") : kindLabel(ui, a.kind)}</DeskPill>} className={cn(open === a.id && "border-primary")} onClick={() => void loadRoster(a.id)} aria-expanded={open === a.id} data-activity-row={a.id}>
      <span className="block text-sm font-bold text-ink-strong"><span dir="auto">{a.title}</span> · {kindLabel(ui, a.kind)}{a.status === "CANCELLED" ? ` · ${ui("Cancelled")}` : ""}</span>
      <span className="block text-xs text-ink-muted"><bdi>{dateTime(a.startsAt)}</bdi> · {ui("{0} confirmed, {1} conditional, {2} waiting of {3}", [String(a.counts.CONFIRMED ?? 0), String((a.counts.RESERVED ?? 0) + (a.counts.OFFERED ?? 0)), String(a.counts.WAITLIST ?? 0), String(a.capacity)])}</span>
      {a.capacity ? <Progress size="sm" value={taken} max={a.capacity} tone={taken >= a.capacity ? "danger" : taken / a.capacity > 0.8 ? "warning" : "brand"} aria-label={ui("Places: {0} of {1}", [String(taken), String(a.capacity)])} className="max-w-sm pt-1" /> : null}
    </DeskRowButton></li>; })}</ul>}

    {rosterError && open ? <ErrorState title={ui("This roster could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void loadRoster(open)} retryLabel={ui("Try again")} /> : null}
    {roster ? <section className="sk-desk-section" aria-label={roster.activity.title} data-activity-roster={roster.activity.id}>
      <div className="flex items-center gap-3"><DeskRowIcon icon={kindIcon(roster.activity.kind)} /><p className="min-w-0 flex-1 text-sm font-bold text-ink-strong"><span dir="auto">{roster.activity.title}</span> · {ui("Places: {0} of {1}", [String(roster.activity.placesTaken), String(roster.activity.capacity)])}</p></div>
      {roster.activity.capacity ? <Progress value={roster.activity.placesTaken} max={roster.activity.capacity} tone={roster.activity.placesTaken >= roster.activity.capacity ? "danger" : "brand"} aria-label={ui("Places: {0} of {1}", [String(roster.activity.placesTaken), String(roster.activity.capacity)])} /> : null}
      {!running ? <p className="text-xs text-ink-muted" data-activity-readonly>{ui("Read only: the coordinator and your campus admin run this activity.")}</p> : null}
      <ul className="divide-y divide-border-subtle text-sm">{roster.places.map(p => {
        // Row actions live in one overflow menu (§4.5.2–3): waiving and the refund hand-off are the campus admin's
        // money decisions; cancelling a place is destructive and confirmed.
        const items: MenuItem[] = [];
        if (lead && p.status === "RESERVED" && p.requirements.fee === "DUE") items.push({ id: "waive", label: "Waive fee", onSelect: () => setWaiving({ id: p.id, name: p.name }), disabled: busy });
        if (lead && p.refundState === "NEEDED") items.push({ id: "refund", label: "Send refund request", onSelect: () => void act({ action: "refund", placeId: p.id }, "Refund request sent to finance."), disabled: busy });
        if (running && ["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"].includes(p.status)) items.push({ id: "cancel-place", label: "Cancel place", tone: "danger", onSelect: () => setConfirming({ kind: "cancel-place", id: p.id, name: p.name }), disabled: busy });
        return <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-roster-place={p.id} data-roster-status={p.status}>
          <span className="min-w-0"><bdi className="font-semibold text-ink-strong">{p.name}</bdi> · <bdi>{p.className}</bdi> <DeskPill tone={placeTone(p.status)} className="ms-1">{statusLabel(ui, p.status)}</DeskPill>{["RESERVED", "CONFIRMED"].includes(p.status) ? <> · {[reqLabel(ui, "consent", p.requirements.consent), reqLabel(ui, "fee", p.requirements.fee)].filter(Boolean).join(" · ")}</> : null}{p.refundState === "NEEDED" ? <> · <span className="font-bold text-status-warning-text">{ui("Refund request needed")}</span></> : p.refundState === "REQUESTED" ? <> · {ui("Refund requested")}</> : null}</span>
          {items.length ? <Menu label="More actions" items={items} trigger={<IconButton variant="ghost" label={ui("More actions")} data-roster-actions><MoreHorizontal aria-hidden="true" /></IconButton>} /> : null}
        </li>;
      })}</ul>
      <div className="space-y-2" data-activity-sessions><p className="sk-eyebrow">{ui("Sessions")}</p>
        {roster.sessions.map(s => <div key={s.id} className="rounded-(--radius-control-small) border border-border-subtle bg-surface-subtle p-2.5" data-session={s.id}><p className="text-xs font-bold"><bdi>{dateTime(s.startsAt)}</bdi></p><div className="mt-1 flex flex-wrap gap-2">{roster.places.filter(p => p.status === "CONFIRMED").map(p => { const mark = s.marks.find(m => m.studentId === p.studentId)?.status; return <span key={p.id} className="flex items-center gap-1 text-xs"><bdi>{p.name}</bdi>{running ? ["PRESENT", "ABSENT"].map(st => <Button key={st} size="sm" variant={mark === st ? "default" : "outline"} disabled={busy} aria-pressed={mark === st} onClick={() => void act({ action: "attend", sessionId: s.id, studentId: p.studentId, status: st }, "Attendance saved.")} data-attend={st}>{st === "PRESENT" ? ui("Present") : ui("Absent")}</Button>) : <span className="text-ink-muted">{mark === "PRESENT" ? ui("Present") : mark === "ABSENT" ? ui("Absent") : "—"}</span>}</span>; })}</div></div>)}
        {running ? <Button size="sm" variant="outline" loading={busy} onClick={() => void act({ action: "session", activityId: roster.activity.id, startsAt: roster.activity.startsAt, endsAt: new Date(new Date(roster.activity.startsAt).getTime() + 3_600_000).toISOString() }, "Session added.")} data-session-add>{ui("Add a session")}</Button> : null}
      </div>
      {lead && running && roster.activity.status !== "CANCELLED" ? <div className="flex justify-start border-t border-border-subtle pt-3"><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirming({ kind: "cancel-activity", id: roster.activity.id, title: roster.activity.title })} data-activity-cancel>{ui("Cancel activity")}</Button></div> : null}
      <p className="text-2xs text-ink-muted">{ui("Participant lists exclude private care narratives.")}{roster.activity.costAmount ? <> · {ui("Cost")}: <bdi>{money(roster.activity.costAmount, roster.activity.costCurrency)}</bdi></> : null}</p>
    </section> : null}

    {creating ? <Modal title={ui("Publish activity")} subtitle={ui("Families see the cost, timing and refund terms before they ask for a place.")} icon={Sparkles} onClose={() => setCreating(false)} wide footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(false)}>{ui("Back")}</Button><Button disabled={busy || !form.title || !form.startsAt || !form.endsAt} loading={busy} onClick={async () => { setBusy(true); try { await call("/api/activities", "POST", { action: "create", ...form, costCurrency: currency, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), capacity: Number(form.capacity), costAmount: Number(form.costAmount), tripId: form.tripId || undefined }); toast.success(ui("Activity published.")); setCreating(false); await load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } }} data-activity-publish>{ui("Publish")}</Button></div>}>
      <div className="space-y-2" data-activity-form>
        <div className="grid gap-2 sm:grid-cols-3">
          <FormField name="af-kind" label={ui("Kind")}><Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{["CLUB", "SPORT", "TRIP"].map(k => <option key={k} value={k}>{kindLabel(ui, k)}</option>)}</Select></FormField>
          <FormField name="af-title" label={ui("Title")}><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField name="af-location" label={ui("Location")}><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></FormField>
          <FormField name="af-start" label={ui("Starts at")}><Input type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></FormField>
          <FormField name="af-end" label={ui("Ends at")}><Input type="datetime-local" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></FormField>
          <FormField name="af-cap" label={ui("Places")}><Input type="number" min={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></FormField>
          <FormField name="af-cost" label={ui("Cost in {0} (0 for free)", [currency])}><Input type="number" min={0} value={form.costAmount} onChange={e => setForm({ ...form, costAmount: e.target.value })} /></FormField>
          {form.kind === "TRIP" ? <FormField name="af-trip" label={ui("Trip consent record")}><Select value={form.tripId} onChange={e => setForm({ ...form, tripId: e.target.value })}><option value="">{ui("Choose a trip")}</option>{list.trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></FormField> : null}
        </div>
        <FormField name="af-desc" label={ui("Description")}><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
        <FormField name="af-terms" label={ui("Cancellation and refunds")} hint={ui("Shown to families before they ask for a place.")}><Textarea rows={2} value={form.cancellationTerms} onChange={e => setForm({ ...form, cancellationTerms: e.target.value })} /></FormField>
        <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="text-xs font-bold">{ui("Open to (none = every class)")}</legend>{list.classes.map(c => <label key={c.id} className="flex min-h-11 items-center gap-1"><Checkbox checked={form.classIds.includes(c.id)} onChange={e => setForm({ ...form, classIds: e.target.checked ? [...form.classIds, c.id] : form.classIds.filter(x => x !== c.id) })} /> <bdi>{c.name}</bdi></label>)}</fieldset>
      </div>
    </Modal> : null}
    <ConfirmAction
      open={Boolean(confirming)}
      busy={busy}
      tone="danger"
      title={ui(confirming?.kind === "cancel-activity" ? "Cancel this activity?" : "Cancel this place?")}
      description={confirming?.kind === "cancel-activity" ? ui("\"{0}\" is cancelled for everyone and families are told. Paid places are marked for a refund request to the finance desk.", [confirming.title]) : confirming ? ui("{0} loses this place and the next family on the waiting list is offered it. A paid place is marked for a refund request.", [confirming.name]) : ""}
      confirmLabel={ui(confirming?.kind === "cancel-activity" ? "Cancel activity" : "Cancel place")}
      cancelLabel={ui("Keep editing")}
      onConfirm={async () => { const c = confirming; if (!c) return; const saved = c.kind === "cancel-activity" ? await act({ action: "cancel", activityId: c.id }, "Activity cancelled. Families were told.") : await act({ action: "cancel-place", placeId: c.id, reason: "Cancelled by the coordinator" }, "Place cancelled."); if (saved) setConfirming(null); }}
      onCancel={() => setConfirming(null)}
    />
    <ConfirmAction
      open={Boolean(waiving)}
      busy={busy}
      tone="warning"
      title={ui("Waive this fee?")}
      description={waiving ? ui("{0} keeps the place without paying for it. The waiver and your reason are recorded and cannot be undone here.", [waiving.name]) : ""}
      requireReason={{ label: ui("Reason for waiving the fee") }}
      confirmLabel={ui("Waive fee")}
      cancelLabel={ui("Keep editing")}
      onConfirm={async (reason) => { const w = waiving; if (w && await act({ action: "fee", placeId: w.id, feeStatus: "WAIVED", reason }, "Fee waived.")) setWaiving(null); }}
      onCancel={() => setWaiving(null)}
    />
  </div>;
}
