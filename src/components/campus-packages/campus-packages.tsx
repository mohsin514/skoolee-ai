"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Plus, UtensilsCrossed } from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCards, SkeletonRegion } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalActions } from "@/components/ui/modal";

/** One header command per nonce (the console PageHeader pattern, see FeesPanel). */
type PanelCommand = { id: string; nonce: number };
function useHeaderCommand(command: PanelCommand | null | undefined, handlers: Record<string, () => void>, ready: boolean) {
  const handled = useRef(0);
  const latest = useRef(handlers);
  useEffect(() => { latest.current = handlers; });
  useEffect(() => {
    if (!ready || !command || command.nonce === handled.current) return;
    handled.current = command.nonce;
    latest.current[command.id]?.();
  }, [command, ready]);
}
import { minorUnits } from "@/lib/locale/package";

// SKO-456: optional campus packages. Setup names operators and completes a checklist before enabling;
// the canteen and boarding screens appear only while a package is enabled (or disabled, for history).

const API = "/api/campus-packages";
const PACKAGE: Record<string, string> = { CANTEEN: "Canteen", BOARDING: "Boarding operations", SPECIALIST: "Specialist programme" };
const STATUS: Record<string, string> = { OFF: "Off", SETUP: "Setting up", ENABLED: "Enabled", DISABLED: "Disabled · history kept", ARCHIVED: "Archived" };
const ROLE: Record<string, string> = { MANAGER: "Canteen manager", DIETARY_LEAD: "Dietary lead", WARDEN: "Warden", LEAVE_APPROVER: "Leave approver", LEAD: "Package lead" };
const CHECK: Record<string, string> = { food_safety_procedure: "Food safety procedure validated", allergen_procedure_validated: "Allergen procedure validated locally", refund_policy: "Refund policy agreed", menu_publishing_owner: "Menu publishing owner named", missing_student_procedure: "Missing-student procedure in place", leave_policy_validated: "Leave policy validated", roll_call_times: "Roll call times set", night_supervision_rota: "Night supervision rota set", local_requirements_validated: "Local requirements validated", template_reviewed: "Template reviewed with the team" };
const ORDER: Record<string, string> = { PLACED: "Placed", HOLD: "Waiting for a staff check", CANCELLED: "Cancelled", SERVED: "Served" };
const DIET: Record<string, string> = { NEEDS_CONFIRMATION: "Needs confirmation", CONFIRMED: "Confirmed by staff", UNCERTAIN: "Uncertain · staff follow-up" };
const SOURCE: Record<string, string> = { GUARDIAN: "Guardian", CLINIC: "School clinic", DOCTOR_LETTER: "Doctor's letter" };
const EXCEPTION: Record<string, string> = { MISSING: "Missing at roll call", LEAVE_OVERDUE: "Leave return overdue" };
const LEAVE: Record<string, string> = { PLANNED: "Approved · not yet left", OUT: "On leave", RETURNED: "Returned", CANCELLED: "Cancelled" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "");
  return json.data;
}
/** Families and staff type money as they say it ("150.50"); the API stores minor units (R7: no "minor units" copy). */
function toMinor(amount: string, currency: string): number {
  let digits = 2;
  try { digits = minorUnits(currency); } catch { digits = 2; }
  const value = Number(String(amount).replace(/,/g, "").trim());
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) : NaN;
}
function fromMinor(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  let digits = 2;
  try { digits = minorUnits(currency); } catch { digits = 2; }
  return (minor / 10 ** digits).toFixed(digits);
}
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

/** Package states for navigation. Nothing is added while a package is off or being set up. */
export function usePackageStates() {
  const [states, setStates] = useState<Record<string, string>>({});
  useEffect(() => { call(`${API}?view=states`).then(setStates).catch(() => setStates({})); }, []);
  return { canteen: ["ENABLED", "DISABLED"].includes(states.CANTEEN ?? ""), boarding: ["ENABLED", "DISABLED"].includes(states.BOARDING ?? "") };
}

function useResource<T>(view: string | null) {
  const ui = useUiText();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // R4: a load failure is an inline error with Retry; an action's result is one translated toast and a failed
  // action keeps what was typed. (`notice` stays in the shape for the desks below; it is never set now.)
  const notice: string | null = null;
  const load = useCallback(async () => { try { setData(await call(view ? `${API}?view=${view}` : API)); setError(null); } catch (e) { setError(friendlyErrorMessage(e, ui("Check your connection and try again."))); } }, [ui, view]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    if (busy) return null;
    setBusy(true);
    try { const r = await call(API, { method: "POST", body: JSON.stringify(body) }); toast.success(ui(success)); await load(); return r; }
    catch (e) { toast.error(friendlyErrorMessage(e, ui("The change was not saved. Please try again."))); return null; }
    finally { setBusy(false); }
  };
  return { data, error, notice, busy, post, ui, load };
}
function LoadGate({ error, label, onRetry }: { error: string | null; label: string; onRetry: () => void }) {
  const ui = useUiText();
  if (error) return <ErrorState title={ui("Could not load this page")} description={error} onRetry={onRetry} retryLabel={ui("Try again")} />;
  return <SkeletonRegion label={label} className="sk-panel p-4"><SkeletonCards count={2} /></SkeletonRegion>;
}
function useFields() {
  const [form, setForm] = useState<Record<string, string>>({});
  return { val: (k: string) => form[k] ?? "", bind: (k: string) => (e: { target: { value: string } }) => setForm((m) => ({ ...m, [k]: e.target.value })), clear: (k: string) => setForm((m) => ({ ...m, [k]: "" })) };
}
function Messages({ error, notice }: { error: string | null; notice: string | null }) {
  return <div className="space-y-2">{error ? <Alert tone="danger" compact>{error}</Alert> : null}{notice ? <Alert tone="success" compact>{notice}</Alert> : null}</div>;
}

// ─── Setup ──────────────────────────────────────────────────────

type Pkg = { key: string; status: string; roles: string[]; checklist: string[]; operators: Record<string, string[]>; done: Record<string, { note: string }>; settings: Record<string, string>; gaps: string[]; obligations: string[] };
export function CampusPackagesPanel() {
  const { data, error, notice, busy, post, ui, load } = useResource<{ packages: Pkg[]; staff: { id: string; fullName: string }[]; templates: string[] }>(null);
  const { val, bind } = useFields();
  // F16: disabling stops new transactions and archiving retires the package; both are confirmed first.
  const [confirming, setConfirming] = useState<{ key: string; archive: boolean } | null>(null);
  if (!data) return <LoadGate error={error} label={ui("Checking prerequisites and active commitments…")} onRetry={() => void load()} />;
  return (
    <section aria-labelledby="campus-packages" className="sk-panel space-y-4 p-4">
      <div><h2 id="campus-packages" className="text-lg font-bold text-ink-strong">{ui("Optional packages")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("Enable only what this campus uses. Enabling a package grants no access to private student care records.")}</p></div>
      <Messages error={error} notice={notice} />
      <ConfirmAction
        open={Boolean(confirming)}
        title={confirming?.archive ? ui("Archive {0}?", [ui(PACKAGE[confirming?.key ?? ""] ?? "")]) : ui("Disable {0}?", [ui(PACKAGE[confirming?.key ?? ""] ?? "")])}
        description={confirming?.archive
          ? ui("The package leaves this campus. Its records stay in the history; turning it on again needs the full setup.")
          : ui("New orders and transactions stop straight away. Families see that it is paused, and the history is kept.")}
        confirmLabel={confirming?.archive ? ui("Archive") : ui("Disable")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          if (!confirming) return;
          const { key, archive } = confirming;
          const done = await post({ action: "disable", data: { package: key, ...(archive ? { archive: true } : {}), reason: val(`${key}-reason`) } }, archive ? "Package archived." : "Package disabled. New transactions stopped; history is kept.");
          if (done !== null) setConfirming(null);
        }}
      />
      {data.packages.map((p) => (
        <div key={p.key} className="sk-panel space-y-2 p-3 text-sm">
          <h3 className="font-semibold">{ui(PACKAGE[p.key])} · {ui(STATUS[p.status] ?? p.status)}</h3>
          {p.key === "SPECIALIST" ? <p className="text-xs text-ink-subtle">{ui("A template to adapt, not a universal workflow. Local requirements must be validated.")}</p> : null}
          <div className="grid gap-2 md:grid-cols-2">
            {p.roles.map((role) => (
              <form key={role} className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "setup", data: { package: p.key, operators: { [role]: [val(`${p.key}-${role}`)] } } }, "Operator saved."); }}>
                <FormField name={`${p.key}-${role}`} label={ui(ROLE[role])} className="flex-1"><Select value={val(`${p.key}-${role}`) || p.operators[role]?.[0] || ""} onChange={bind(`${p.key}-${role}`)}><option value="">{ui("Not assigned")}</option>{data.staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></FormField>
                <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Save")}</Button>
              </form>
            ))}
          </div>
          {p.key === "SPECIALIST" ? (
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "setup", data: { package: p.key, template: val("template") } }, "Template chosen."); }}>
              <FormField name="pk-template" label={ui("Template")}><Select value={val("template") || p.settings.template || ""} onChange={bind("template")}><option value="">{ui("Choose a template")}</option>{data.templates.map((t) => <option key={t} value={t}>{ui(t)}</option>)}</Select></FormField>
              <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Save")}</Button>
            </form>
          ) : null}
          <ul className="space-y-1">{p.checklist.map((item) => (
            <li key={item} className="flex flex-wrap items-end gap-2">
              <span className="flex min-w-56 items-center gap-2">{p.done[item] ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-status-success-text" /> : <Circle aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />}<span className="sr-only">{ui(p.done[item] ? "Done" : "To do")}: </span>{ui(CHECK[item] ?? item)}{p.done[item] ? <span className="text-xs text-ink-subtle"> · <bdi>{p.done[item].note}</bdi></span> : null}</span>
              {!p.done[item] ? <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "setup", data: { package: p.key, check: { item, note: val(`${p.key}-${item}`) } } }, "Checklist item recorded."); }}>
                <FormField name={`${p.key}-${item}`} label={ui("How this was validated")} className="w-64"><Input value={val(`${p.key}-${item}`)} onChange={bind(`${p.key}-${item}`)} /></FormField>
                <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Record")}</Button>
              </form> : null}
            </li>
          ))}</ul>
          {p.gaps.length && p.status !== "ARCHIVED" ? <ul className="text-xs text-status-error-text">{p.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul> : null}
          {p.obligations.length ? <ul className="text-xs text-status-error-text" aria-label={ui("Open obligations")}>{p.obligations.map((o, i) => <li key={i}>{o}</li>)}</ul> : null}
          <div className="flex flex-wrap items-end gap-2">
            {["OFF", "SETUP", "DISABLED"].includes(p.status) ? <Button type="button" size="sm" disabled={busy || p.gaps.length > 0} onClick={() => void post({ action: "enable", data: { package: p.key } }, "Package enabled for this campus with the approved staff roles.")}>{ui("Enable package")}</Button> : null}
            {["ENABLED", "DISABLED"].includes(p.status) ? <>
              <FormField name={`${p.key}-reason`} label={ui("Reason")} className="w-64"><Input value={val(`${p.key}-reason`)} onChange={bind(`${p.key}-reason`)} /></FormField>
              {p.status === "ENABLED" ? <Button type="button" size="sm" variant="secondary" disabled={busy || val(`${p.key}-reason`).trim().length < 5} onClick={() => setConfirming({ key: p.key, archive: false })}>{ui("Disable")}</Button> : null}
              <Button type="button" size="sm" variant="secondary" disabled={busy || p.obligations.length > 0 || val(`${p.key}-reason`).trim().length < 5} onClick={() => setConfirming({ key: p.key, archive: true })}>{ui("Archive")}</Button>
            </> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

// ─── Canteen (staff) ────────────────────────────────────────────

type Item = { id: string; name: string; serviceDate: string; price: number; currency: string; capacity: number; sold: number; allergens: string[] };
type Order = { id: string; itemId: string; studentName: string; quantity: number; amount: number; currency: string; status: string; holdReason: string | null };
type Dietary = { id: string; studentName: string; allergens: string[]; diet: string | null; source: string; sourceDate: string; status: string };
/**
 * The campus canteen (admin `canteen`). A console whose PageHeader carries "Add meal" passes `embedded` (no
 * section heading of its own), sends the `add-meal` command and learns from `onCanAddMeal` whether the viewer
 * runs the menu; the meal form opens in a dialog. The `orders` command scrolls to the order list.
 */
export function CanteenPanel({ embedded = false, command, onCanAddMeal }: { embedded?: boolean; command?: PanelCommand | null; onCanAddMeal?: (canAdd: boolean) => void } = {}) {
  const { data, error, notice, busy, post, ui, load } = useResource<{ status: string; isManager: boolean; isDietary: boolean; items: Item[]; orders: Order[]; reconciliation: { charged: number; refunded: number; orders: number; mismatches: unknown[] }; dietary: Dietary[] | null }>("canteen");
  const { money, date } = useLocaleFormat();
  const { currency: schoolCurrency } = useLocale();
  const { val, bind, clear } = useFields();
  const [addingMeal, setAddingMeal] = useState(false);
  const canAddMeal = Boolean(data?.isManager && data.status === "ENABLED");
  useEffect(() => { if (data) onCanAddMeal?.(canAddMeal); }, [data, canAddMeal, onCanAddMeal]);
  useHeaderCommand(command, {
    "add-meal": () => { if (canAddMeal) setAddingMeal(true); },
    orders: () => document.getElementById("canteen-orders")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  }, Boolean(data));
  if (!data) return <LoadGate error={error} label={ui("Loading the canteen…")} onRetry={() => void load()} />;
  const itemName = (id: string) => data.items.find((i) => i.id === id)?.name ?? "";
  const addMeal = async () => {
    const done = await post({ action: "menu-item", data: { serviceDate: val("d"), name: val("n"), price: toMinor(val("p"), val("c") || schoolCurrency), currency: val("c") || schoolCurrency, capacity: Number(val("q")), allergens: val("a").split(",").map((x) => x.trim()).filter(Boolean) } }, "Meal added to the menu.");
    if (done !== null) { for (const key of ["d", "n", "p", "q", "a"]) clear(key); setAddingMeal(false); }
  };
  return (
    <section aria-labelledby={embedded ? undefined : "canteen"} aria-label={embedded ? ui("Canteen") : undefined} className="sk-panel space-y-4 p-4">
      {embedded ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.status === "ENABLED" ? "success" : "neutral"} dot>{ui(STATUS[data.status] ?? data.status)}</Badge>
          <p className="text-sm leading-relaxed text-ink-muted">{ui("Allergen information supports staff checks. It is not a guarantee of allergen safety.")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="canteen" className="text-lg font-bold text-ink-strong">{ui("Canteen")} · {ui(STATUS[data.status] ?? data.status)}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("Allergen information supports staff checks. It is not a guarantee of allergen safety.")}</p></div>
          {canAddMeal ? <Button type="button" size="sm" onClick={() => setAddingMeal(true)}><Plus aria-hidden="true" />{ui("Add meal")}</Button> : null}
        </div>
      )}
      <Messages error={error} notice={notice} />
      <p className="text-sm tabular-nums">{ui("Charged {0} · refunded {1} · {2} orders · {3} not reconciled", [money(data.reconciliation.charged, data.items[0]?.currency ?? schoolCurrency), money(data.reconciliation.refunded, data.items[0]?.currency ?? schoolCurrency), data.reconciliation.orders, data.reconciliation.mismatches.length])}</p>
      <ul className="space-y-1 text-sm">{data.items.map((i) => <li key={i.id}><bdi>{i.name}</bdi> · {date(i.serviceDate)} · <span dir="ltr" className="tabular-nums">{money(i.price, i.currency)}</span> · {ui("{0} of {1} sold", [i.sold, i.capacity])}{i.allergens.length ? ` · ${ui("Allergens")}: ${i.allergens.join(", ")}` : ""}</li>)}</ul>
      {addingMeal ? (
        <Modal
          title={ui("Add meal")}
          eyebrow={ui("Canteen")}
          subtitle={ui("Families see it on the menu for the service date until it sells out.")}
          icon={UtensilsCrossed}
          size="md"
          dirty={Boolean(val("n") || val("p"))}
          onClose={() => setAddingMeal(false)}
          footer={<ModalActions busy={busy} busyLabel={ui("Saving…")} actionLabel={ui("Add meal")} onCancel={() => setAddingMeal(false)} onAction={() => void addMeal()} blockedReason={!val("d") || !val("n") || !val("p") || !val("q") ? ui("Enter the service date, meal, price and how many are available.") : null} />}
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void addMeal(); }}>
            <FormField name="ct-d" label={ui("Service date")} required><Input type="date" dir="ltr" value={val("d")} onChange={bind("d")} /></FormField>
            <FormField name="ct-n" label={ui("Meal")} required><Input value={val("n")} onChange={bind("n")} /></FormField>
            <FormField name="ct-p" label={ui("Price")} required><Input inputMode="decimal" dir="ltr" value={val("p")} onChange={bind("p")} placeholder="0.00" /></FormField>
            <FormField name="ct-c" label={ui("Currency")}><Input dir="ltr" value={val("c") || schoolCurrency} onChange={bind("c")} /></FormField>
            <FormField name="ct-q" label={ui("Meals available")} required><Input inputMode="numeric" dir="ltr" value={val("q")} onChange={bind("q")} /></FormField>
            <FormField name="ct-a" label={ui("Declared allergens (comma separated)")}><Input value={val("a")} onChange={bind("a")} /></FormField>
          </form>
        </Modal>
      ) : null}
      <div id="canteen-orders" className="scroll-mt-4 space-y-1 text-sm"><h3 className="font-semibold">{ui("Orders")}</h3>{data.orders.length === 0 ? <p className="text-ink-muted">{ui("No orders yet.")}</p> : null}{data.orders.map((o) => (
        <div key={o.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
          <span><bdi>{o.studentName}</bdi> · <bdi>{itemName(o.itemId)}</bdi> × {o.quantity} · <span dir="ltr" className="tabular-nums">{money(o.amount, o.currency)}</span> · {ui(ORDER[o.status] ?? o.status)}{o.holdReason ? <> · <bdi>{ui(o.holdReason)}</bdi></> : null}</span>
          {o.status === "HOLD" && data.isDietary ? <>
            <FormField name={`ho-${o.id}`} label={ui("What was checked")} className="w-64"><Input value={val(`ho-${o.id}`)} onChange={bind(`ho-${o.id}`)} /></FormField>
            <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "order-decision", id: o.id, data: { action: "RELEASE", note: val(`ho-${o.id}`) } }, "Order released and charged.")}>{ui("Release")}</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "order-decision", id: o.id, data: { action: "REJECT", note: val(`ho-${o.id}`) } }, "Order declined; nothing was charged.")}>{ui("Decline")}</Button>
          </> : null}
          {o.status === "PLACED" && data.isManager ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "order-decision", id: o.id, data: { action: "SERVE" } }, "Marked as served.")}>{ui("Mark served")}</Button> : null}
        </div>
      ))}</div>
      {data.dietary ? (
        <div className="sk-panel space-y-1 p-3 text-sm">
          <h3 className="font-semibold">{ui("Dietary records · restricted to the dietary lead")}</h3>
          {data.dietary.map((d) => (
            <div key={d.id} className="flex flex-wrap items-end gap-2">
              <span><bdi>{d.studentName}</bdi> · {d.allergens.join(", ") || ui("No allergens recorded")}{d.diet ? <> · <bdi>{d.diet}</bdi></> : null} · {ui("Source")}: {ui(SOURCE[d.source] ?? d.source)}, {date(d.sourceDate)} · {ui(DIET[d.status] ?? d.status)}</span>
              {d.status !== "CONFIRMED" ? <>
                <FormField name={`dn-${d.id}`} label={ui("How it was confirmed")} className="w-64"><Input value={val(`dn-${d.id}`)} onChange={bind(`dn-${d.id}`)} /></FormField>
                <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "dietary-review", id: d.id, data: { status: "CONFIRMED", note: val(`dn-${d.id}`) } }, "Dietary record confirmed.")}>{ui("Confirm")}</Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "dietary-review", id: d.id, data: { status: "UNCERTAIN", note: val(`dn-${d.id}`) } }, "Marked uncertain for follow-up.")}>{ui("Uncertain")}</Button>
              </> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─── Boarding operations ────────────────────────────────────────

type Leave = { id: string; studentId: string; studentName: string; destination: string; collectedBy: string; expectedReturnAt: string; status: string; overdue: boolean };
type Roll = { id: string; label: string; takenAt: string; present: number; exceptions: { studentId: string; studentName: string; kind: string; resolvedAt?: string; resolution?: string }[] };
export function BoardingOperations() {
  const { data, error, notice, busy, post, ui, load } = useResource<{ status: string; isWarden: boolean; isApprover: boolean; boarders: { studentId: string; name: string; room: string }[]; leave: Leave[]; rollCalls: Roll[] }>("boarding");
  const { dateTime } = useLocaleFormat();
  const { val, bind } = useFields();
  const [present, setPresent] = useState<Record<string, boolean>>({});
  if (!data) return error ? <LoadGate error={error} label="" onRetry={() => void load()} /> : null;
  const open = data.rollCalls.flatMap((r) => r.exceptions.filter((e) => !e.resolvedAt).map((e) => ({ ...e, rollId: r.id, label: r.label })));
  return (
    <section aria-labelledby="boarding-ops" className="sk-panel space-y-4 p-4">
      <div><h2 id="boarding-ops" className="text-lg font-bold text-ink-strong">{ui("Boarding operations")} · {ui(STATUS[data.status] ?? data.status)}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("School emergency procedures govern missing students.")}</p></div>
      <Messages error={error} notice={notice} />
      {open.length ? <div role="alert" className="space-y-2 rounded-xl border border-status-error-text p-3 text-sm">
        <h3 className="font-semibold">{ui("{0} boarding exceptions need follow-up", [open.length])}</h3>
        {open.map((e) => (
          <div key={`${e.rollId}-${e.studentId}-${e.kind}`} className="flex flex-wrap items-end gap-2">
            <span><bdi>{e.studentName}</bdi> · {ui(EXCEPTION[e.kind] ?? e.kind)} · {e.label}</span>
            {data.isWarden ? <>
              <FormField name={`rs-${e.rollId}-${e.studentId}`} label={ui("Follow-up taken")} className="w-64"><Input value={val(`rs-${e.rollId}-${e.studentId}`)} onChange={bind(`rs-${e.rollId}-${e.studentId}`)} /></FormField>
              <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "resolve-exception", id: e.rollId, data: { studentId: e.studentId, resolution: val(`rs-${e.rollId}-${e.studentId}`) } }, "Exception resolved.")}>{ui("Resolve")}</Button>
            </> : null}
          </div>
        ))}
      </div> : null}
      {data.isWarden && data.status === "ENABLED" ? (
        <form className="sk-panel space-y-2 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); void post({ action: "roll-call", data: { label: val("label") || "Roll call", present: Object.entries(present).filter(([, v]) => v).map(([k]) => k) } }, "Roll call saved."); }}>
          <h3 className="font-semibold">{ui("Roll call")}</h3>
          <FormField name="bo-label" label={ui("Roll call time")} className="w-40"><Input dir="ltr" value={val("label")} onChange={bind("label")} /></FormField>
          <ul className="grid gap-1 md:grid-cols-2">{data.boarders.map((b) => <li key={b.studentId}><label className="flex min-h-11 items-center gap-2"><Checkbox checked={!!present[b.studentId]} onChange={(e) => setPresent((m) => ({ ...m, [b.studentId]: e.target.checked }))} /> <bdi>{b.name}</bdi> · <span dir="ltr">{b.room}</span></label></li>)}</ul>
          <Button type="submit" size="sm" disabled={busy}>{ui("Save roll call")}</Button>
        </form>
      ) : null}
      <div className="space-y-1 text-sm"><h3 className="font-semibold">{ui("Leave")}</h3>
        {data.leave.map((l) => (
          <div key={l.id} className="flex flex-wrap items-end gap-2">
            <span className={l.overdue ? "font-semibold text-status-error-text" : ""}><bdi>{l.studentName}</bdi> · <bdi>{l.destination}</bdi> · {ui("Collected by")} <bdi>{l.collectedBy}</bdi> · {ui("Due back {0}", [dateTime(l.expectedReturnAt)])} · {ui(LEAVE[l.status] ?? l.status)}{l.overdue ? ` · ${ui("Overdue")}` : ""}</span>
            {data.isWarden && l.status === "PLANNED" ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "leave-handover", id: l.id, data: { step: "DEPART" } }, "Departure handover recorded.")}>{ui("Record departure")}</Button> : null}
            {data.isWarden && l.status === "OUT" ? <>
              <FormField name={`rt-${l.id}`} label={ui("Handed back by")} className="w-48"><Input value={val(`rt-${l.id}`)} onChange={bind(`rt-${l.id}`)} /></FormField>
              {l.overdue ? <FormField name={`lr-${l.id}`} label={ui("Reason for late return")} className="w-56"><Input value={val(`lr-${l.id}`)} onChange={bind(`lr-${l.id}`)} /></FormField> : null}
              <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "leave-handover", id: l.id, data: { step: "RETURN", returnedTo: val(`rt-${l.id}`), ...(val(`lr-${l.id}`) ? { lateReason: val(`lr-${l.id}`) } : {}) } }, "Return handover recorded.")}>{ui("Resolve return")}</Button>
            </> : null}
          </div>
        ))}
        {data.isApprover && data.status === "ENABLED" ? (
          <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "leave", data: { studentId: val("ls"), departAt: val("lf") ? new Date(val("lf")).toISOString() : "", expectedReturnAt: val("lt") ? new Date(val("lt")).toISOString() : "", destination: val("ld"), collectedBy: val("lc") } }, "Leave approved."); }}>
            <FormField name="bo-ls" label={ui("Boarder")}><Select value={val("ls")} onChange={bind("ls")}><option value="">{ui("Choose a boarder")}</option>{data.boarders.map((b) => <option key={b.studentId} value={b.studentId}>{b.name}</option>)}</Select></FormField>
            <FormField name="bo-lf" label={ui("Leaves at")}><Input type="datetime-local" dir="ltr" value={val("lf")} onChange={bind("lf")} /></FormField>
            <FormField name="bo-lt" label={ui("Due back at")}><Input type="datetime-local" dir="ltr" value={val("lt")} onChange={bind("lt")} /></FormField>
            <FormField name="bo-ld" label={ui("Destination")}><Input value={val("ld")} onChange={bind("ld")} /></FormField>
            <FormField name="bo-lc" label={ui("Collected by")}><Input value={val("lc")} onChange={bind("lc")} /></FormField>
            <Button type="submit" size="sm" disabled={busy}>{ui("Approve leave")}</Button>
          </form>
        ) : null}
      </div>
      {data.rollCalls.length ? <p className="text-xs text-ink-subtle">{ui("Recent roll calls")}: {data.rollCalls.map((r) => `${r.label} · ${dateTime(r.takenAt)} · ${ui("{0} present", [r.present])}`).join(" | ")}</p> : null}
    </section>
  );
}

// ─── Canteen (families) ─────────────────────────────────────────

type Child = { studentId: string; name: string; status: string; menu: (Item & { remaining: number })[]; orders: { id: string; itemId: string; quantity: number; amount: number; currency: string; status: string; holdReason: string | null }[]; limit: number | null; dietary: { allergens: string[]; diet: string | null; source: string; sourceDate: string; status: string } | null };
/**
 * Canteen ordering for families. Defaults keep the Home behaviour (nothing rendered while loading or when no
 * child has a canteen). `/parent/canteen` passes `hideWhenEmpty={false}` (skeleton, inline error with retry and an
 * empty state instead of a blank page) and `embedded` (its PageHeader is the title); its "Order" primary bumps
 * `orderRequest`, which brings the first orderable meal into view and focuses its button.
 */
export function FamilyCanteen({ hideWhenEmpty = true, orderRequest, embedded = false }: { hideWhenEmpty?: boolean; orderRequest?: number; embedded?: boolean } = {}) {
  const { data, error, notice, busy, post, ui, load } = useResource<{ children: Child[] }>("family");
  const { money, date } = useLocaleFormat();
  const { currency: schoolCurrency } = useLocale();
  const { val, bind } = useFields();
  const sectionRef = useRef<HTMLElement>(null);
  // R3: cancelling an order refunds money, so it is confirmed first.
  const [cancelling, setCancelling] = useState<{ id: string; meal: string; child: string } | null>(null);
  useEffect(() => {
    if (!orderRequest) return;
    const first = sectionRef.current?.querySelector<HTMLButtonElement>("button[data-order-meal]:not(:disabled)");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first?.focus({ preventScroll: true });
  }, [orderRequest]);
  if (!data) return hideWhenEmpty ? null : <LoadGate error={error} label={ui("Loading the canteen…")} onRetry={() => void load()} />;
  if (!data.children.length) {
    return hideWhenEmpty ? null : (
      <section className="sk-panel">
        <EmptyState icon={UtensilsCrossed} title={ui("No canteen menu yet")} description={ui("Your children's campus has not opened canteen ordering. Meals appear here once it does.")} />
      </section>
    );
  }
  return (
    <section ref={sectionRef} aria-labelledby={embedded ? undefined : "family-canteen"} aria-label={embedded ? ui("Canteen") : undefined} className="sk-panel space-y-4 p-4">
      {embedded
        ? <p className="text-sm leading-relaxed text-ink-muted">{ui("Allergen information supports staff checks. It is not a guarantee of allergen safety.")}</p>
        : <div><h2 id="family-canteen" className="text-lg font-bold text-ink-strong">{ui("Canteen")}</h2><p className="text-sm leading-relaxed text-ink-muted">{ui("Allergen information supports staff checks. It is not a guarantee of allergen safety.")}</p></div>}
      <Messages error={error} notice={notice} />
      <ConfirmAction
        open={Boolean(cancelling)}
        title={ui("Cancel this order?")}
        description={cancelling ? ui("{0} for {1} is cancelled and any charge is refunded. This cannot be undone.", [cancelling.meal, cancelling.child]) : ""}
        confirmLabel={ui("Cancel order")}
        cancelLabel={ui("Keep order")}
        tone="danger"
        busy={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await post({ action: "order-decision", id: cancelling.id, data: { action: "CANCEL" } }, "Order cancelled; any charge was refunded.");
          setCancelling(null);
        }}
      />
      {data.children.map((c) => (
        <div key={c.studentId} className="sk-panel space-y-3 p-3 text-sm">
          <h3 className="font-semibold"><bdi>{c.name}</bdi>{c.status === "DISABLED" ? ` · ${ui("Ordering is paused")}` : ""}</h3>
          <p>{c.dietary ? <>{ui("Dietary record")}: {c.dietary.allergens.join(", ") || ui("No allergens recorded")} · {ui("Source")}: {ui(SOURCE[c.dietary.source] ?? c.dietary.source)}, {date(c.dietary.sourceDate)} · {ui(DIET[c.dietary.status] ?? c.dietary.status)}</> : ui("No dietary record yet.")}</p>
          <ul className="space-y-2">{c.menu.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <span><bdi>{m.name}</bdi> · {date(m.serviceDate)} · <span dir="ltr" className="tabular-nums">{money(m.price, m.currency)}</span> · {m.remaining > 0 ? ui("{0} left", [m.remaining]) : ui("Sold out")}{m.allergens.length ? ` · ${ui("Allergens")}: ${m.allergens.join(", ")}` : ""}</span>
              <Button type="button" size="sm" data-order-meal disabled={busy || m.remaining < 1} onClick={() => void post({ action: "order", data: { studentId: c.studentId, itemId: m.id, quantity: 1, idempotencyKey: newKey() } }, "Order received.")}>{ui("Order meal")}</Button>
            </li>
          ))}</ul>
          {c.orders.length ? <ul>{c.orders.map((o) => <li key={o.id} className="flex flex-wrap items-center gap-2">{c.menu.find((m) => m.id === o.itemId)?.name ?? ""} × {o.quantity} · <span dir="ltr" className="tabular-nums">{money(o.amount, o.currency)}</span> · {ui(ORDER[o.status] ?? o.status)}{o.holdReason ? <> · <bdi>{ui(o.holdReason)}</bdi></> : null}{["PLACED", "HOLD"].includes(o.status) ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setCancelling({ id: o.id, meal: c.menu.find((m) => m.id === o.itemId)?.name ?? ui("Meal"), child: c.name })}>{ui("Cancel order")}</Button> : null}</li>)}</ul> : null}
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "limit", data: { studentId: c.studentId, dailyLimit: toMinor(val(`lim-${c.studentId}`), c.menu[0]?.currency ?? schoolCurrency) } }, "Daily limit saved."); }}>
            <FormField name={`lim-${c.studentId}`} label={ui("Daily spending limit")} className="w-56"><Input inputMode="decimal" dir="ltr" value={val(`lim-${c.studentId}`) || fromMinor(c.limit, c.menu[0]?.currency ?? schoolCurrency)} onChange={bind(`lim-${c.studentId}`)} placeholder="0.00" /></FormField>
            <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Save limit")}</Button>
          </form>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "dietary", data: { studentId: c.studentId, allergens: val(`al-${c.studentId}`).split(",").map((x) => x.trim()).filter(Boolean), source: "GUARDIAN", sourceDate: new Date().toISOString().slice(0, 10) } }, "Dietary information sent for staff confirmation."); }}>
            <FormField name={`al-${c.studentId}`} label={ui("Allergies (comma separated)")} className="w-64"><Input value={val(`al-${c.studentId}`)} onChange={bind(`al-${c.studentId}`)} /></FormField>
            <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Update dietary information")}</Button>
          </form>
        </div>
      ))}
    </section>
  );
}
