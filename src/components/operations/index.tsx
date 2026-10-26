"use client";
import { Pagination } from "@/components/shared-admin/workspace";
import { loadListPages } from "@/lib/lists/load-pages";
import { useListPagination } from "@/hooks/use-list-page";
import { useListField } from "@/hooks/use-list-field";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bus,
  Building2,
  BookOpen,
  Package,
  Plus,
  Trash2,
  Search,
  UserPlus,
  RotateCcw,
  Eye,
  Phone,
  Mail,
  MessageSquare,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { PanelTitle } from "@/components/shared-admin";
import { DormitoryAllocations } from "./dormitory-allocations";
import { VisitorRegister } from "./visitor-register";
import { ComplaintsDesk } from "./complaints-desk";
import { PhoneCallLog } from "./phone-call-log";
import { PostalRegister } from "./postal-register";
import { CertificatesDesk } from "./certificates-desk";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { BrandButton } from "@/components/role-dashboard";
import { forwardCommand, usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { SectionPicker } from "./console-page";
import { useValidatedForm } from "@/lib/hooks/use-validated-form";
import { serverFieldErrors } from "@/lib/validators/client";
import { apiErrorMessage } from "@/lib/errors";
import { roleLabel } from "@/lib/roles";
import {
  bookCategorySchema,
  bookFormSchema,
  bookIssueSchema,
  CALL_DIRECTIONS,
  certificateTemplateFormSchema,
  CERTIFICATE_KINDS,
  complaintFormSchema,
  dormRoomFormSchema,
  dormRoomTypeFormSchema,
  itemCategorySchema,
  itemSchema,
  itemStoreSchema,
  itemTransactionFormSchema,
  ITEM_TRANSACTION_KINDS,
  libraryMemberSchema,
  PAGE_SIZES,
  POSTAL_DIRECTIONS,
  supplierSchema,
  transportRouteFormSchema,
  vehicleFormSchema,
  VEHICLE_MODELS,
  visitorFormSchema,
} from "@/lib/validators/operations";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ReviewedDelete } from "@/components/ui/reviewed-delete";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { FormField } from "@/components/ui/form-field";
import { RidersPlanner, TripsPlanner } from "@/components/transport/transport";
import { downloadCSV } from "@/lib/csv";


/* ─── tiny helpers ─── */
const inputCls =
  "max-w-full";
const labelCls =
  "mb-1 block ps-1 text-2xs font-semibold uppercase tracking-wider text-ink-subtle";
const cardCls =
  "sk-panel sk-rise p-6";
const addBoxCls =
  "mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-edge/20 bg-surface-sunken p-4";
const thCls =
  "px-3 py-2 text-start text-2xs font-semibold uppercase tracking-wider text-ink-subtle";
const tdCls = "px-3 py-2.5 text-sm font-medium text-ink-strong";

const TXN_KIND_LABEL: Record<string, string> = { RECEIVE: "Received", SELL: "Sold", ISSUE: "Issued", RETURN: "Returned" };
/** What each stock movement is called in the add row (EN UI keys). */
const TXN_KIND_OPTION: Record<string, string> = { RECEIVE: "Receive", SELL: "Sell", ISSUE: "Issue", RETURN: "Return" };
const VEHICLE_MODEL_LABEL: Record<string, string> = { BUS: "Bus", VAN: "Van", CAR: "Car", OTHER: "Other" };

function EmptyRow({ cols, text, hint, state, onRetry }: { cols: number; text?: string; hint?: string; state?: "loading" | "error"; onRetry?: () => void }) {
  const ui = useUiText();
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6">
        {state === "loading" ? (
          <SkeletonTable rows={3} columns={Math.min(cols, 5)} />
        ) : state === "error" ? (
          <ErrorState
            title={ui("These records could not be loaded")}
            description={ui("Check your connection, then try again.")}
            onRetry={onRetry}
          />
        ) : (
          <EmptyState size="sm" title={ui(text ?? "Nothing here yet")} description={hint ? ui(hint) : undefined} />
        )}
      </td>
    </tr>
  );
}

/**
 * The row's overflow menu (role-ux §4.5.2–3): destructive actions never sit inline in a row. "Delete" is the last,
 * danger-toned item and is confirmed (R3: consequence, "Keep editing" to back out).
 */

/**
 * A labelled cell in one of the inline "add" rows.
 *
 * These panels lay their fields out horizontally rather than in a dialog, so
 * the message sits under its own input and the row grows rather than shifting
 * the neighbouring fields.
 */
function OpField({
  label,
  error,
  width,
  children,
}: {
  label: string;
  error?: string;
  width?: string;
  children: React.ReactNode;
}) {
  const fieldName = useId();
  const ui = useUiText();
  // Labels are EN UI keys; translated here so every inline add row follows the display language (role-ux R11).
  return <FormField name={fieldName} label={ui(label)} error={error} className={width}>{children}</FormField>;
}

/** Money in the campus currency from the school's locale package (role-ux R7/F23 — never a hard-coded "Rs"). */
function useCampusMoney() {
  const { money } = useLocaleFormat();
  const { currency } = useLocale();
  return (minor: number) => money(minor, currency);
}

/**
 * Posts a validated payload and routes the outcome back into the form.
 *
 * Field-level errors from the API (a duplicate room number, a member number
 * already in use) are merged into the same error map the schema writes to, so
 * a server rejection marks the offending input instead of only raising a toast
 * that disappears.
 */
async function submitTo(
  url: string,
  payload: unknown,
  form: { setServerErrors: (errors: unknown) => boolean },
  options: { method?: string } = {}
): Promise<boolean> {
  const res = await fetch(url, {
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body (a proxy error page) must not surface as a parse crash.
  }

  const ok = res.ok && (body as { success?: boolean } | null)?.success !== false;
  if (ok) return true;

  if (!form.setServerErrors(serverFieldErrors(body))) {
    toast.error(apiErrorMessage((body as { error?: unknown } | null)?.error, "Could not save. Please try again."));
  }
  return false;
}

/**
 * A header "Export" for a module list (role-ux §4.4b): fetches the list the open section shows and saves it as a
 * CSV (BOM included, cells guarded against formula injection). Nothing to export → a translated notice, not an
 * empty file; a failed read → an error toast (the result of the viewer's own action).
 */
async function exportList(
  ui: ReturnType<typeof useUiText>,
  url: string,
  filename: string,
  header: string[],
  toRow: (row: any) => unknown[],
) {
  try {
    let rows: any[];
    if (["/api/inventory/items", "/api/library/books"].includes(url)) rows = await loadListPages(url);
    else {
      const response = await fetch(url, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error();
      rows = Array.isArray(json.data) ? json.data : [];
    }
    if (!rows.length) { toast.info(ui("Nothing to export yet.")); return; }
    downloadCSV(`${filename}-${new Date().toISOString().slice(0, 10)}`, [header, ...rows.map(toRow)]);
  } catch {
    toast.error(ui("The export could not be prepared. Check your connection, then try again."));
  }
}

/** Section switcher for a module panel: one row of choice buttons (the only tab row on its screen). */
function SectionChoices<T extends string>({ items, value, onChange, label, dataAttr }: { items: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (id: T) => void; label: string; dataAttr?: string }) {
  const ui = useUiText();
  return (
    <div role="group" aria-label={ui(label)} className="flex max-w-full flex-wrap gap-1 rounded-xl bg-surface-sunken p-1">
      {items.map((item) => (
        <Button aria-pressed={value === item.id} variant="choice" size="sm" key={item.id} onClick={() => onChange(item.id)} {...(dataAttr ? { [dataAttr]: item.id } : {})}>
          {ui(item.label)}
        </Button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODULE 14-A — TRANSPORT
   ════════════════════════════════════════════════════════════════ */

export type TransportTab = "routes" | "vehicles" | "riders" | "trips";
const TRANSPORT_TABS: { id: TransportTab; label: string }[] = [
  { id: "routes", label: "Routes" },
  { id: "vehicles", label: "Vehicles" },
  { id: "riders", label: "Riders & stops" },
  { id: "trips", label: "Trips" },
];

/**
 * Transport (routes, vehicles, riders, trips). `hideHeader` makes the panel the page body under a console's
 * PageHeader (§4.4b admin · Transport: **Add route** · Vehicles · Export): no card or title of its own and no
 * in-panel "Add route". `command` "add-route" opens the add-route row on Routes, "vehicles" opens Vehicles, and
 * "export" saves the open list (vehicles on Vehicles, routes otherwise) as CSV.
 */
export function TransportPanel({ hideHeader = false, command }: { hideHeader?: boolean; command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const campusMoney = useCampusMoney();
  const [tab, setTab] = useState<TransportTab>("routes");
  // A forwarded header command reaches only the section it is for; changing section drops it.
  const [forwarded, setForwarded] = useState<{ tab: TransportTab; command: PanelCommand } | null>(null);
  const select = (next: TransportTab) => { setTab(next); setForwarded(null); };
  usePanelCommand(command, {
    "add-route": () => { setTab("routes"); const copy = forwardCommand(command); setForwarded(copy ? { tab: "routes", command: copy } : null); },
    vehicles: () => select("vehicles"),
    export: () => tab === "vehicles"
      ? void exportList(ui, "/api/transport/vehicles", "transport-vehicles", ["Number", "Type", "Capacity", "Driver", "Phone"], (v) => [v.number, v.model ?? "", v.capacity ?? "", v.driverName ?? "", v.driverPhone ?? ""])
      : void exportList(ui, "/api/transport/routes", "transport-routes", ["Route", "Description", "Fare", "Vehicles"], (r) => [r.title, r.description ?? "", r.fare != null ? campusMoney(r.fare) : "", r._count?.routeVehicles ?? r.routeVehicles?.length ?? 0]),
  });
  const choices = <SectionChoices label="Transport sections" items={TRANSPORT_TABS} value={tab} onChange={select} dataAttr="data-transport-tab" />;
  return (
    <div className="space-y-5">
      <div className={hideHeader ? "space-y-5" : cardCls}>
        {hideHeader ? choices : (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <PanelTitle icon={Bus} title={ui("Transport")} />
            {choices}
          </div>
        )}
        {/* SKO-437: riders, stops and dated trips with a frozen manifest. */}
        {tab === "routes" ? <RoutesTab hideAdd={hideHeader} command={forwarded?.tab === "routes" ? forwarded.command : null} /> : tab === "vehicles" ? <VehiclesTab /> : tab === "riders" ? <RidersPlanner /> : <TripsPlanner />}
      </div>
    </div>
  );
}

function RoutesTab({ hideAdd = false, command }: { hideAdd?: boolean; command?: PanelCommand | null }) {
  const ui = useUiText();
  const campusMoney = useCampusMoney();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const r = await fetch("/api/transport/routes");
      const j = await r.json();
      if (j.success) setRows(j.data || []);
    } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Field names match TransportRoute exactly, and the schema converts the
  // rupees typed here into the paisa the column stores.
  const form = useValidatedForm({
    schema: transportRouteFormSchema,
    initialValues: { title: "", description: "", fare: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/transport/routes", values, form))) return;
      toast.success(ui("Route added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  usePanelCommand(command, { "add-route": () => setShowAdd(true) });

  return (
    <>
      {hideAdd ? null : (
        <div className="mb-4 flex justify-end">
          <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add route")}</BrandButton>
        </div>
      )}
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Route Name" error={form.errors.title}>
            <SystemInput className={`${inputCls} w-44`} {...form.field("title")} placeholder={ui("Route A")} />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("description")} placeholder={ui("Stops, timings…")} />
          </OpField>
          {/* The stored value is paisa (the schema multiplies by 100 on save),
              so the unit has to be on the label — otherwise "500" is ambiguous. */}
          <OpField label="Fare" error={form.errors.fare}>
            <SystemInput className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("fare")} placeholder="0" />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
          {/* Opened from the PageHeader, the row needs its own way out (the in-panel toggle is hidden). */}
          {hideAdd ? <Button variant="ghost" onClick={() => { setShowAdd(false); form.reset(); }}>{ui("Cancel")}</Button> : null}
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Route Name", "Description", "Fare", "Vehicles", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} state="loading" /> : loadFailed ? <EmptyRow cols={5} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={5} text="No transport routes yet" hint="Add your first route." /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.title}</td>
                <td className={tdCls}>{r.description || "—"}</td>
                <td className={tdCls}>{r.fare != null ? campusMoney(r.fare) : "—"}</td>
                <td className={tdCls}>{r._count?.routeVehicles ?? r.routeVehicles?.length ?? 0}</td>
                <td className={tdCls}><ReviewedDelete endpoint="transport/routes" record={r} label={r.title} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VehiclesTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const r = await fetch("/api/transport/vehicles");
      const j = await r.json();
      if (j.success) setRows(j.data || []);
    } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The column is `model`. This form posted `type`, which the route never read,
  // so the bus/van choice was discarded on save and the Type column below
  // rendered `undefined` for every row.
  const form = useValidatedForm({
    schema: vehicleFormSchema,
    initialValues: { number: "", model: "BUS", capacity: "40", driverName: "", driverPhone: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/transport/vehicles", values, form))) return;
      toast.success(ui("Vehicle added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      <div className="mb-4 flex justify-end">
        <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add vehicle")}</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Number" error={form.errors.number}>
            <SystemInput className={`${inputCls} w-32`} {...form.field("number")} placeholder="BUS-01" />
          </OpField>
          <OpField label="Type" error={form.errors.model}>
            <SystemSelect className={`${inputCls} w-28`} {...form.field("model")}>
              {VEHICLE_MODELS.map((value) => (
                <option key={value} value={value}>
                  {ui(VEHICLE_MODEL_LABEL[value] ?? value)}
                </option>
              ))}
            </SystemSelect>
          </OpField>
          <OpField label="Capacity" error={form.errors.capacity}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={1} max={200} {...form.field("capacity")} />
          </OpField>
          <OpField label="Driver Name" error={form.errors.driverName}>
            <SystemInput className={`${inputCls} w-36`} {...form.field("driverName")} />
          </OpField>
          <OpField label="Driver Phone" error={form.errors.driverPhone}>
            <SystemInput className={`${inputCls} w-32`} inputMode="tel" {...form.field("driverPhone")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Number", "Type", "Capacity", "Driver", "Phone", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} state="loading" /> : loadFailed ? <EmptyRow cols={6} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={6} text="No vehicles yet" hint="Add your first vehicle." /> : rows.map((v: any) => (
              <tr key={v.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{v.number}</td>
                <td className={tdCls}>{v.model ? ui(VEHICLE_MODEL_LABEL[v.model] ?? v.model) : "—"}</td>
                <td className={tdCls}>{v.capacity ?? "—"}</td>
                <td className={tdCls}>{v.driverName || "—"}</td>
                <td className={tdCls}>{v.driverPhone || "—"}</td>
                <td className={tdCls}><ReviewedDelete endpoint="transport/vehicles" record={v} label={v.number} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODULE 14-B — DORMITORY
   ════════════════════════════════════════════════════════════════ */

export type DormitoryTab = "allocations" | "types" | "rooms";
const DORMITORY_TABS: { id: DormitoryTab; label: string }[] = [
  { id: "allocations", label: "Allocations" },
  { id: "types", label: "Room types" },
  { id: "rooms", label: "Rooms" },
];

/**
 * Hostel (allocations, room types, rooms). `hideHeader` makes the panel the page body under a console's PageHeader
 * (§4.4b admin · Hostel: **Allocate bed** · Rooms): no card or title of its own and no in-panel "Allocate student".
 * `command` "allocate-bed" opens the allocation dialog on Allocations (once the rooms are loaded) and "rooms"
 * opens Rooms.
 */
export function DormitoryPanel({ hideHeader = false, command }: { hideHeader?: boolean; command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const [tab, setTab] = useState<DormitoryTab>("allocations");
  const [forwarded, setForwarded] = useState<{ tab: DormitoryTab; command: PanelCommand } | null>(null);
  const select = (next: DormitoryTab) => { setTab(next); setForwarded(null); };
  usePanelCommand(command, {
    "allocate-bed": () => { setTab("allocations"); const copy = forwardCommand(command); setForwarded(copy ? { tab: "allocations", command: copy } : null); },
    rooms: () => select("rooms"),
    "add-room-type": () => { setTab("types"); const copy = forwardCommand(command); setForwarded(copy ? { tab: "types", command: copy } : null); },
  });
  const choices = <SectionChoices label="Hostel sections" items={DORMITORY_TABS} value={tab} onChange={select} />;
  return (
    <div className={hideHeader ? "space-y-5" : cardCls}>
      {hideHeader ? choices : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {/* "Hostel" in the sidebar; the page said "Dormitory". Same thing, two
              names, on the same screen. */}
          <PanelTitle icon={Building2} title={ui("Hostel management")} />
          {choices}
        </div>
      )}
      {tab === "allocations" ? <DormitoryAllocations hideAllocate={hideHeader} command={forwarded?.tab === "allocations" ? forwarded.command : null} /> : tab === "types" ? <DormRoomTypesTab hideAdd={hideHeader} command={forwarded?.tab === "types" ? forwarded.command : null} /> : <DormRoomsTab />}
    </div>
  );
}

function DormRoomTypesTab({ hideAdd = false, command }: { hideAdd?: boolean; command?: PanelCommand | null } = {}) {
  const campusMoney = useCampusMoney();
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try { const r = await fetch("/api/dormitory/room-types"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // costPerTerm reaches the API in paisa, matching invoices, fees and transport
  // fares — the schema applies the conversion so no call site can double it.
  const form = useValidatedForm({
    schema: dormRoomTypeFormSchema,
    initialValues: { name: "", description: "", costPerTerm: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/dormitory/room-types", values, form))) return;
      toast.success(ui("Room type added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  usePanelCommand(command, { "add-room-type": () => setShowAdd(true) });

  return (
    <>
      {hideAdd ? null : <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add room type")}</BrandButton></div>}
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <SystemInput className={`${inputCls} w-36`} {...form.field("name")} placeholder={ui("Single")} />
          </OpField>
          <OpField label="Cost per term" error={form.errors.costPerTerm}>
            <SystemInput className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("costPerTerm")} placeholder="0" />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("description")} placeholder={ui("Occupancy, facilities…")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Name", "Description", "Cost/Term", "Rooms", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} state="loading" /> : loadFailed ? <EmptyRow cols={5} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={5} text="No room types yet" hint="Add your first room type." /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}>{r.description || "—"}</td>
                <td className={tdCls}>{r.costPerTerm ? campusMoney(r.costPerTerm) : "—"}</td>
                <td className={tdCls}>{r._count?.rooms ?? 0}</td>
                <td className={tdCls}><ReviewedDelete endpoint="dormitory/room-types" record={r} label={r.name} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DormRoomsTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [rr, tr] = await Promise.all([fetch("/api/dormitory/rooms"), fetch("/api/dormitory/room-types")]);
      const [rj, tj] = await Promise.all([rr.json(), tr.json()]);
      if (rj.success) setRows(rj.data || []);
      if (tj.success) setTypes(tj.data || []);
    } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The column is `number`; this form posted `roomNumber`, so every save was
  // rejected with "number is required" and the table below read a field that
  // was never returned. `floor` is gone because DormRoom has no such column —
  // whatever was typed there was discarded silently on every save.
  const form = useValidatedForm({
    schema: dormRoomFormSchema,
    initialValues: { number: "", roomTypeId: "", capacity: "4" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/dormitory/rooms", values, form))) return;
      toast.success(ui("Room added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add room")}</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Room #" error={form.errors.number}>
            <SystemInput className={`${inputCls} w-28`} {...form.field("number")} placeholder="D-101" />
          </OpField>
          <OpField label="Type" error={form.errors.roomTypeId}>
            <SystemSelect className={`${inputCls} w-32`} {...form.field("roomTypeId")}>
              <option value="">{ui("Select…")}</option>
              {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Capacity" error={form.errors.capacity}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={1} max={50} {...form.field("capacity")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Room #", "Type", "Capacity", "Occupied today", "Status", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} state="loading" /> : loadFailed ? <EmptyRow cols={6} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={6} text="No dorm rooms yet" hint="Add a room type first, then add rooms." /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.number}</td>
                <td className={tdCls}>{r.roomType?.name || "—"}</td>
                <td className={tdCls}>{r.capacity}</td>
                <td className={tdCls}>{r.occupied ?? 0} / {r.capacity}{r.upcoming ? ` (+${r.upcoming})` : ""}</td>
                <td className={tdCls}>{ui(r.status === "OUT_OF_SERVICE" ? "Out of service" : "Available")}</td>
                <td className={tdCls}><ReviewedDelete endpoint="dormitory/rooms" record={r} label={r.number} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODULE 14-C — LIBRARY
   ════════════════════════════════════════════════════════════════ */

export type LibraryTab = "books" | "members" | "issues" | "categories";
const LIBRARY_TABS: { id: LibraryTab; label: string }[] = [
  { id: "books", label: "Titles" },
  { id: "members", label: "Members" },
  { id: "issues", label: "Issues" },
  { id: "categories", label: "Categories" },
];

/** Catalogue sections the librarian console shows as its PageHeader tabs (the Issues tab is retired, M84). */
export const CATALOGUE_TABS = LIBRARY_TABS.filter((item) => item.id !== "issues");
/** The PageHeader primary for each catalogue section and the command it sends (EN UI keys; §4.4 "Add book"). */
export const CATALOGUE_CREATE: Record<Exclude<LibraryTab, "issues">, { id: string; label: string }> = {
  books: { id: "add-book", label: "Add book" },
  members: { id: "add-member", label: "Add member" },
  categories: { id: "add-category", label: "Add category" },
};

/**
 * Catalogue and members. `hideIssues` removes the old Issues tab (role-ux M84/F24): issuing, renewing and returning
 * live on the lending desk (`LendingDesk`), which handles copies, fines and reader cards correctly. `command`
 * "add-book" opens the add-book row from the console's PageHeader (`hideHeader` drops the panel title and the
 * in-panel Add book button, and the panel becomes the page body: no card of its own).
 *
 * One tab row per screen (§3.1): the librarian console renders the sections as its PageHeader tabs
 * (`sectionNav="none"`); under another tab row (the campus admin's Library › Catalogue) they are a section picker.
 */
export function LibraryPanel({ hideIssues = false, hideHeader = false, command, tab: wanted, onTabChange, sectionNav = "picker" }: { hideIssues?: boolean; hideHeader?: boolean; command?: PanelCommand | null; tab?: string | null; onTabChange?: (tab: LibraryTab) => void; sectionNav?: "picker" | "none" } = {}) {
  const ui = useUiText();
  const items = LIBRARY_TABS.filter((item) => !(hideIssues && item.id === "issues"));
  const [localTab, setLocalTab] = useState<LibraryTab>("books");
  const tab: LibraryTab = items.some((item) => item.id === wanted) ? (wanted as LibraryTab) : onTabChange ? "books" : localTab;
  // A forwarded header command reaches only the section it is for; changing section drops it.
  const [forwarded, setForwarded] = useState<{ tab: LibraryTab; command: PanelCommand } | null>(null);
  const select = (next: LibraryTab) => { setLocalTab(next); onTabChange?.(next); setForwarded(null); };
  const forwardTo = (target: LibraryTab) => { select(target); const copy = forwardCommand(command); setForwarded(copy ? { tab: target, command: copy } : null); };
  usePanelCommand(command, { "add-book": () => forwardTo("books"), "add-member": () => forwardTo("members"), "add-category": () => forwardTo("categories") });
  const commandFor = (target: LibraryTab) => (forwarded?.tab === target ? forwarded.command : null);
  const picker = sectionNav === "picker" ? <SectionPicker label="Catalogue section" items={items} value={tab} onChange={select} /> : null;
  return (
    <div className={hideHeader ? "space-y-5" : cardCls}>
      {hideHeader ? picker : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <PanelTitle icon={BookOpen} title={ui("Catalogue and members")} />
          {picker}
        </div>
      )}
      {tab === "books" ? <BooksTab command={commandFor("books")} hideAdd={hideHeader} /> : tab === "members" ? <MembersTab command={commandFor("members")} hideAdd={hideHeader} /> : tab === "issues" ? <IssuesTab /> : <BookCategoriesTab command={commandFor("categories")} hideAdd={hideHeader} />}
    </div>
  );
}

function BookCategoriesTab({ command, hideAdd = false }: { command?: PanelCommand | null; hideAdd?: boolean }) {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  usePanelCommand(command, { "add-category": () => setShowAdd(true) });

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try { const r = await fetch("/api/library/categories"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // BookCategory has only a name. The old `description` lived in state, had no
  // input bound to it, and was rendered in a table column that could never be
  // anything but an em-dash.
  const form = useValidatedForm({
    schema: bookCategorySchema,
    initialValues: { name: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/library/categories", values, form))) return;
      toast.success(ui("Category added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      {hideAdd ? null : <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add category")}</BrandButton></div>}
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <SystemInput className={`${inputCls} w-40`} {...form.field("name")} placeholder={ui("Fiction")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Name", "Titles", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={3} state="loading" /> : loadFailed ? <EmptyRow cols={3} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={3} text="No categories yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}>{r._count?.books ?? 0}</td>
                <td className={tdCls}><ReviewedDelete endpoint="library/categories" record={r} label={r.name} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BooksTab({ command, hideAdd = false }: { command?: PanelCommand | null; hideAdd?: boolean }) {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useListField<string>("library.search", "", "library.page");
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useListField<string>("library.category", "", "library.page");
  const [sort, setSort] = useListField<string>("library.sort", "name", "library.page");
  const [showAdd, setShowAdd] = useState(false);
  const [cats, setCats] = useState<any[]>([]);

  const requestVersion = useRef(0);
  const paged = useListPagination(total, "library");
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadFailed(false);
    try {
      const q = `?${new URLSearchParams({ search, categoryId: category, sort, page: String(paged.requestedPage), limit: String(paged.controls.perPage) })}`;
      const [br, cr] = await Promise.all([fetch(`/api/library/books${q}`), fetch("/api/library/categories")]);
      const [bj, cj] = await Promise.all([br.json(), cr.json()]);
      if (version !== requestVersion.current) return;
      if (!br.ok || !cr.ok || !bj.success || !cj.success) throw new Error("List failed");
      if (bj.success) { setRows(bj.data || []); setTotal(bj.pagination.total); }
      if (cj.success) setCats(cj.data || []);
    } catch { if (version === requestVersion.current) setLoadFailed(true); } finally { if (version === requestVersion.current) setLoading(false); }
  }, [search, category, sort, paged.requestedPage, paged.controls.perPage]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); requestVersion.current++; }; }, [load]);

  // The column is `copiesTotal`. This form sent `totalCopies`, so the route
  // read `undefined`, failed its own `Number.isFinite` check, and rejected
  // every attempt to catalogue a book.
  const form = useValidatedForm({
    schema: bookFormSchema,
    initialValues: { title: "", author: "", isbn: "", categoryId: "", copiesTotal: "1" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/library/books", values, form))) return;
      toast.success(ui("Book added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  usePanelCommand(command, { "add-book": () => setShowAdd(true) });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <InputGroup className="relative w-full sm:w-72">
          <Search data-field-affix="start" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <SystemInput className={`${inputCls} w-full ps-9`} placeholder={ui("Search books…")} aria-label={ui("Search books")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        {hideAdd ? null : <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add book")}</BrandButton>}
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Title" error={form.errors.title}>
            <SystemInput className={`${inputCls} w-48`} {...form.field("title")} />
          </OpField>
          <OpField label="Author" error={form.errors.author}>
            <SystemInput className={`${inputCls} w-36`} {...form.field("author")} />
          </OpField>
          <OpField label="ISBN" error={form.errors.isbn}>
            <SystemInput className={`${inputCls} w-32`} {...form.field("isbn")} placeholder="978…" />
          </OpField>
          <OpField label="Category" error={form.errors.categoryId}>
            <SystemSelect className={`${inputCls} w-32`} {...form.field("categoryId")}>
              <option value="">{ui("None")}</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Copies" error={form.errors.copiesTotal}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={0} {...form.field("copiesTotal")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-3">
        <SystemSelect aria-label={ui("Category")} value={category} onChange={event => setCategory(event.target.value)}><option value="">{ui("All")}</option>{cats.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</SystemSelect>
        <SystemSelect aria-label={ui("Sort by")} value={sort} onChange={event => setSort(event.target.value)}><option value="name">{ui("Name")} ↑</option><option value="name-desc">{ui("Name")} ↓</option></SystemSelect>
      </div>
      <Pagination {...paged.controls} />
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Title", "Author", "ISBN", "Category", "Total", "Available", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={7} state="loading" /> : loadFailed ? <EmptyRow cols={7} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={7} text="No books yet" /> : rows.map((b: any) => (
              <tr key={b.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{b.title}</td>
                <td className={tdCls}>{b.author || "—"}</td>
                <td className={tdCls}>{b.isbn || "—"}</td>
                <td className={tdCls}>{b.category?.name || "—"}</td>
                <td className={tdCls}>{b.copiesTotal}</td>
                <td className={tdCls}>{b.copiesAvailable}</td>
                <td className={tdCls}><ReviewedDelete endpoint="library/books" record={b} label={b.title} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Reader = { id: string; fullName: string; detail: string };

/**
 * Finds a library reader by name (F24) without depending on who may message whom (P8-05): learners come from the
 * campus roster (`/api/students`, the librarian's read access to student records, §2.2 #27) and only those with a
 * sign-in can be members; staff come from the staff directory as a second, best-effort source. A failed search says
 * so in place with a retry (R4) instead of reading as "no one found".
 */
function PersonPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const ui = useUiText();
  const { language } = useLocale();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Reader[]>([]);
  const [picked, setPicked] = useState<{ id: string; fullName: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFound([]); setFailed(false); return; }
    let live = true;
    const timer = setTimeout(() => {
      setSearching(true);
      setFailed(false);
      const learners = fetch(`/api/students?${new URLSearchParams({ search: q, limit: "8" })}`, { cache: "no-store" })
        .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok || !j?.success) throw new Error("students"); return j.data as Array<{ fullName: string; rollNo?: string | null; class?: { name: string; section: string | null } | null; studentUser?: { id: string; isActive: boolean } | null }>; })
        .then((rows) => rows.filter((row) => row.studentUser?.id && row.studentUser.isActive !== false).map((row): Reader => ({ id: row.studentUser!.id, fullName: row.fullName, detail: [ui("Student"), [row.class?.name, row.class?.section].filter(Boolean).join(" ")].filter(Boolean).join(" · ") })));
      // Staff readers: best effort (a school may limit the directory); learners never depend on it.
      const staff = fetch(`/api/chat/directory?${new URLSearchParams({ q, limit: "8" })}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => ((j?.success ? j.contacts : []) as Array<{ id: string; fullName: string; role: string; campusName: string | null }>).filter((person) => person.role !== "STUDENT" && person.role !== "PARENT").map((person): Reader => ({ id: person.id, fullName: person.fullName, detail: roleLabel(person.role, language) })))
        .catch(() => [] as Reader[]);
      void Promise.allSettled([learners, staff]).then(([a, b]) => {
        if (!live) return;
        const people = [...(a.status === "fulfilled" ? a.value : []), ...(b.status === "fulfilled" ? b.value : [])];
        const unique = people.filter((person, index) => people.findIndex((other) => other.id === person.id) === index);
        setFound(unique);
        setFailed(a.status === "rejected" && unique.length === 0);
        setSearching(false);
      });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, attempt, ui, language]);
  if (picked && picked.id === value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-edge/40 bg-card px-3 py-2 text-sm">
        <bdi className="font-semibold text-ink-strong">{picked.fullName}</bdi>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setPicked(null); onChange(""); setQuery(""); }}>{ui("Change")}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <SystemInput className={`${inputCls} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ui("Type a name")} aria-label={ui("Find a reader by name")} />
      {query.trim().length >= 2 ? (
        failed ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-status-error-text">
            <span>{ui("Readers could not be searched. Check your connection and try again.")}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>{ui("Try again")}</Button>
          </div>
        ) : found.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-edge/30 bg-card p-1" aria-label={ui("Matching people")}>
            {found.map((person) => (
              <li key={person.id}>
                <Button type="button" variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2 text-start font-normal" onClick={() => { setPicked({ id: person.id, fullName: person.fullName }); onChange(person.id); }}>
                  <span className="min-w-0">
                    <bdi className="block font-semibold text-ink-strong">{person.fullName}</bdi>
                    <span className="block text-xs text-ink-muted"><bdi>{person.detail}</bdi></span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-muted" role="status">{ui(searching ? "Searching…" : "No one found. Check the spelling; a learner needs a sign-in before joining the library.")}</p>
        )
      ) : null}
    </div>
  );
}

function MembersTab({ command, hideAdd = false }: { command?: PanelCommand | null; hideAdd?: boolean }) {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  usePanelCommand(command, { "add-member": () => setShowAdd(true) });

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try { const r = await fetch("/api/library/members"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // LibraryMember is (userId, memberNo). The old form posted `membershipType`,
  // which is not a column, and never posted `memberNo`, which the route
  // requires — so every save failed with "memberNo is required".
  const form = useValidatedForm({
    schema: libraryMemberSchema,
    initialValues: { userId: "", memberNo: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/library/members", values, form))) return;
      toast.success(ui("Member added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      {hideAdd ? null : <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add member")}</BrandButton></div>}
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Reader" error={form.errors.userId} width="w-full sm:w-72">
            <PersonPicker value={String(form.values.userId ?? "")} onChange={(id) => form.setValue("userId", id)} />
          </OpField>
          <OpField label="Member No" error={form.errors.memberNo}>
            <SystemInput className={`${inputCls} w-32`} {...form.field("memberNo")} placeholder="LM-001" />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Member", "Member No", "Active Issues", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={4} state="loading" /> : loadFailed ? <EmptyRow cols={4} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={4} text="No members yet" /> : rows.map((m: any) => (
              <tr key={m.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{m.user?.fullName || m.userId}</td>
                <td className={tdCls}>{m.memberNo || "—"}</td>
                <td className={tdCls}>{m._count?.issues ?? 0}</td>
                <td className={tdCls}><ReviewedDelete endpoint="library/members" record={m} label={m.memberNo} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function IssuesTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [books, setBooks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [ir, br, mr] = await Promise.all([fetch("/api/library/issues"), loadListPages("/api/library/books"), fetch("/api/library/members")]);
      const [ij, mj] = await Promise.all([ir.json(), mr.json()]);
      const bj = { success: true, data: br };
      if (ij.success) setRows(ij.data || []);
      if (bj.success) setBooks(bj.data || []);
      if (mj.success) setMembers(mj.data || []);
    } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The route reads `dueAt`; this form sent `dueDate`, so the librarian's
  // chosen return date was dropped and every loan silently took the default.
  const form = useValidatedForm({
    schema: bookIssueSchema,
    initialValues: { bookId: "", memberId: "", dueAt: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/library/issues", values, form))) return;
      toast.success(ui("Book issued."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const returnBook = async (id: string) => {
    try {
      const r = await fetch("/api/library/issues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "return" }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success(ui("Book returned.")); load();
    } catch (e: any) { toast.error(e); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Issue book")}</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Book" error={form.errors.bookId}>
            <SystemSelect className={`${inputCls} w-48`} {...form.field("bookId")}>
              <option value="">{ui("Select…")}</option>
              {books.filter((b: any) => b.copiesAvailable > 0).map((b: any) => <option key={b.id} value={b.id}>{b.title} ({ui("{0} available", [b.copiesAvailable])})</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Member" error={form.errors.memberId}>
            {/* Previously filtered on `m.isActive`, which LibraryMember does not
                have — the list was therefore always empty and no member could
                be picked. */}
            <SystemSelect className={`${inputCls} w-48`} {...form.field("memberId")}>
              <option value="">{ui("Select…")}</option>
              {members.map((m: any) => <option key={m.id} value={m.id}>{m.user?.fullName || m.memberNo || m.userId}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Due Date" error={form.errors.dueAt}>
            <SystemInput className={`${inputCls} w-36`} type="date" {...form.field("dueAt")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Issuing…") : ui("Issue")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Book", "Member", "Issued", "Due", "Status", "Action"].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} state="loading" /> : loadFailed ? <EmptyRow cols={6} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={6} text="No issues yet" /> : rows.map((i: any) => (
              <tr key={i.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{i.book?.title || i.bookId}</td>
                <td className={tdCls}>{i.member?.user?.fullName || i.memberId}</td>
                <td className={tdCls}>{new Date(i.issueDate).toLocaleDateString()}</td>
                <td className={tdCls}>{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "—"}</td>
                <td className={tdCls}><Badge size="sm" dot variant={i.returnDate ? "success" : "warning"}>{ui(i.returnDate ? "Returned" : "Issued")}</Badge></td>
                <td className={tdCls}>{!i.returnDate && <Button variant="secondary" size="sm" onClick={() => returnBook(i.id)} ><RotateCcw className="me-1 inline h-3 w-3" aria-hidden="true" />{ui("Return")}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODULE 14-D — INVENTORY
   ════════════════════════════════════════════════════════════════ */

export type InventoryTab = "items" | "transactions" | "stores" | "suppliers" | "categories";
const INVENTORY_TABS: { id: InventoryTab; label: string }[] = [
  { id: "items", label: "Items" },
  { id: "transactions", label: "Transactions" },
  { id: "stores", label: "Stores" },
  { id: "suppliers", label: "Suppliers" },
  { id: "categories", label: "Categories" },
];

/**
 * Stock: items, movements, stores, suppliers and categories. `hideHeader` drops the panel's card and title (use it
 * when the panel is the page body; under another section — the campus admin's purchase requests — pass `command`
 * only and keep the titled card). `command` (§4.4b admin · Inventory: Receive goods · Export) "receive-goods" opens
 * a Receive movement on Transactions; "export" saves the movements on Transactions, the stock list otherwise.
 */
export function InventoryPanel({ hideHeader = false, command }: { hideHeader?: boolean; command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const campusMoney = useCampusMoney();
  const { date: formatDate } = useLocaleFormat();
  const [tab, setTab] = useState<InventoryTab>("items");
  const [forwarded, setForwarded] = useState<{ tab: InventoryTab; command: PanelCommand } | null>(null);
  const select = (next: InventoryTab) => { setTab(next); setForwarded(null); };
  usePanelCommand(command, {
    "receive-goods": () => { setTab("transactions"); const copy = forwardCommand(command); setForwarded(copy ? { tab: "transactions", command: copy } : null); },
    export: () => tab === "transactions"
      ? void exportList(ui, "/api/inventory/transactions", "stock-movements", ["Date", "Kind", "Item", "Store", "Qty", "Unit price", "Supplier", "Note"], (t) => [formatDate(t.createdAt), TXN_KIND_LABEL[t.kind] ?? t.kind, t.item?.name ?? t.itemId, t.store?.name ?? t.storeId, t.quantity, t.unitPrice != null ? campusMoney(t.unitPrice) : "", t.supplier?.name ?? "", t.note ?? ""])
      : void exportList(ui, "/api/inventory/items", "stock", ["Name", "Category", "Unit", "Total stock"], (r) => [r.name, r.category?.name ?? "", r.unit ?? "", (r.stock || []).reduce((sum: number, st: any) => sum + (st.quantity || 0), 0)]),
  });
  const choices = <SectionChoices label="Inventory sections" items={INVENTORY_TABS} value={tab} onChange={select} />;
  return (
    <div className={hideHeader ? "space-y-5" : cardCls}>
      {hideHeader ? choices : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <PanelTitle icon={Package} title={ui("Inventory")} />
          {choices}
        </div>
      )}
      {tab === "items" ? <ItemsTab /> : tab === "transactions" ? <TransactionsTab command={forwarded?.tab === "transactions" ? forwarded.command : null} /> : tab === "stores" ? <StoresTab /> : tab === "suppliers" ? <SuppliersTab /> : <ItemCategoriesTab />}
    </div>
  );
}

function ItemCategoriesTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => { setLoading(true); setLoadFailed(false); try { const r = await fetch("/api/inventory/categories"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch { setLoadFailed(true); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // ItemCategory holds only a name. The old `description` had no input bound
  // to it and no column behind the table cell that rendered it.
  const form = useValidatedForm({
    schema: itemCategorySchema,
    initialValues: { name: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/categories", values, form))) return;
      toast.success(ui("Category added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add category")}</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <SystemInput className={`${inputCls} w-40`} {...form.field("name")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Name", "Items", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={3} state="loading" /> : loadFailed ? <EmptyRow cols={3} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={3} text="No categories" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r._count?.items ?? 0}</td>
                <td className={tdCls}><ReviewedDelete endpoint="inventory/categories" record={r} label={r.name} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StoresTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => { setLoading(true); setLoadFailed(false); try { const r = await fetch("/api/inventory/stores"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch { setLoadFailed(true); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // ItemStore has no `location` column — whatever was typed into that input
  // was discarded on save, and the table column could never fill in.
  const form = useValidatedForm({
    schema: itemStoreSchema,
    initialValues: { name: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/stores", values, form))) return;
      toast.success(ui("Store added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add store")}</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("name")} placeholder={ui("Main store")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Name", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={2} state="loading" /> : loadFailed ? <EmptyRow cols={2} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={2} text="No stores" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}><ReviewedDelete endpoint="inventory/stores" record={r} label={r.name} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SuppliersTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => { setLoading(true); setLoadFailed(false); try { const r = await fetch("/api/inventory/suppliers"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch { setLoadFailed(true); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // Supplier has no `contactName` column, so that input never persisted.
  // `address` does exist and now has an input rather than only living in state.
  const form = useValidatedForm({
    schema: supplierSchema,
    initialValues: { name: "", phone: "", email: "", address: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/suppliers", values, form))) return;
      toast.success(ui("Supplier added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add supplier")}</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <SystemInput className={`${inputCls} w-36`} {...form.field("name")} />
          </OpField>
          <OpField label="Phone" error={form.errors.phone}>
            <SystemInput className={`${inputCls} w-28`} inputMode="tel" {...form.field("phone")} />
          </OpField>
          <OpField label="Email" error={form.errors.email}>
            <SystemInput className={`${inputCls} w-36`} type="email" {...form.field("email")} />
          </OpField>
          <OpField label="Address" error={form.errors.address} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("address")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Name", "Phone", "Email", "Address", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} state="loading" /> : loadFailed ? <EmptyRow cols={5} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={5} text="No suppliers" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.phone || "—"}</td><td className={tdCls}>{r.email || "—"}</td><td className={tdCls}>{r.address || "—"}</td>
                <td className={tdCls}><ReviewedDelete endpoint="inventory/suppliers" record={r} label={r.name} onDeleted={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemsTab() {
  const ui = useUiText();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useListField<string>("inventory.search", "", "inventory.page");
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useListField<string>("inventory.category", "", "inventory.page");
  const [sort, setSort] = useListField<string>("inventory.sort", "name", "inventory.page");
  const [showAdd, setShowAdd] = useState(false);
  const [cats, setCats] = useState<any[]>([]);

  const requestVersion = useRef(0);
  const paged = useListPagination(total, "inventory");
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadFailed(false);
    try {
      const q = `?${new URLSearchParams({ search, categoryId: category, sort, page: String(paged.requestedPage), limit: String(paged.controls.perPage) })}`;
      const [ir, cr] = await Promise.all([fetch(`/api/inventory/items${q}`), fetch("/api/inventory/categories")]);
      const [ij, cj] = await Promise.all([ir.json(), cr.json()]);
      if (version !== requestVersion.current) return;
      if (!ir.ok || !cr.ok || !ij.success || !cj.success) throw new Error("List failed");
      if (ij.success) { setRows(ij.data || []); setTotal(ij.pagination.total); }
      if (cj.success) setCats(cj.data || []);
    } catch { if (version === requestVersion.current) setLoadFailed(true); } finally { if (version === requestVersion.current) setLoading(false); }
  }, [search, category, sort, paged.requestedPage, paged.controls.perPage]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); requestVersion.current++; }; }, [load]);

  // Item is (name, unit, categoryId). `description` had no input and no column.
  const form = useValidatedForm({
    schema: itemSchema,
    initialValues: { name: "", categoryId: "", unit: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/items", values, form))) return;
      toast.success(ui("Item added."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });


  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <InputGroup className="relative"><Search data-field-affix="start" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" /><SystemInput className={`${inputCls} w-64 ps-9`} aria-label={ui("Search items…")} placeholder={ui("Search items…")} value={search} onChange={(e) => setSearch(e.target.value)} /></InputGroup>
        <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("Add item")}</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <SystemInput className={`${inputCls} w-40`} {...form.field("name")} />
          </OpField>
          <OpField label="Category" error={form.errors.categoryId}>
            <SystemSelect className={`${inputCls} w-32`} {...form.field("categoryId")}><option value="">{ui("None")}</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Unit" error={form.errors.unit}>
            <SystemInput className={`${inputCls} w-24`} {...form.field("unit")} placeholder={ui("pcs")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-3">
        <SystemSelect aria-label={ui("Category")} value={category} onChange={event => setCategory(event.target.value)}><option value="">{ui("All")}</option>{cats.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</SystemSelect>
        <SystemSelect aria-label={ui("Sort by")} value={sort} onChange={event => setSort(event.target.value)}><option value="name">{ui("Name")} ↑</option><option value="name-desc">{ui("Name")} ↓</option></SystemSelect>
      </div>
      <Pagination {...paged.controls} />
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Name", "Category", "Unit", "Total Stock", ""].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} state="loading" /> : loadFailed ? <EmptyRow cols={5} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={5} text="No items" /> : rows.map((r: any) => {
              const totalStock = (r.stock || []).reduce((s: number, st: any) => s + (st.quantity || 0), 0);
              return (
                <tr key={r.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                  <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.category?.name || "—"}</td><td className={tdCls}>{r.unit || "—"}</td><td className={tdCls}>{totalStock}</td>
                  <td className={tdCls}><ReviewedDelete endpoint="inventory/items" record={r} label={r.name} onDeleted={load} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TransactionsTab({ command }: { command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const campusMoney = useCampusMoney();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [tr, ir, sr, spr] = await Promise.all([fetch("/api/inventory/transactions"), loadListPages("/api/inventory/items"), fetch("/api/inventory/stores"), fetch("/api/inventory/suppliers")]);
      const [tj, sj, spj] = await Promise.all([tr.json(), sr.json(), spr.json()]);
      const ij = { success: true, data: ir };
      if (tj.success) setRows(tj.data || []);
      if (ij.success) setItems(ij.data || []);
      if (sj.success) setStores(sj.data || []);
      if (spj.success) setSuppliers(spj.data || []);
    } catch { setLoadFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const form = useValidatedForm({
    schema: itemTransactionFormSchema,
    initialValues: { itemId: "", storeId: "", supplierId: "", kind: "RECEIVE", quantity: "1", unitPrice: "", note: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/transactions", values, form))) return;
      toast.success(ui("Transaction recorded."));
      setShowAdd(false);
      form.reset();
      load();
    },
  });
  // "Receive goods" from the PageHeader: a Receive movement, ready for the item, store and quantity.
  usePanelCommand(command, { "receive-goods": () => { form.setValues({ kind: "RECEIVE" }); setShowAdd(true); } });

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>{ui("New transaction")}</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Kind" error={form.errors.kind}>
            <SystemSelect className={`${inputCls} w-28`} {...form.field("kind")}>
              {ITEM_TRANSACTION_KINDS.map((k) => <option key={k} value={k}>{ui(TXN_KIND_OPTION[k] ?? k)}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Item" error={form.errors.itemId}>
            <SystemSelect className={`${inputCls} w-40`} {...form.field("itemId")}><option value="">{ui("Select…")}</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Store" error={form.errors.storeId}>
            <SystemSelect className={`${inputCls} w-36`} {...form.field("storeId")}><option value="">{ui("Select…")}</option>{stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Qty" error={form.errors.quantity}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={1} {...form.field("quantity")} />
          </OpField>
          <OpField label="Unit price" error={form.errors.unitPrice}>
            <SystemInput className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("unitPrice")} placeholder="0" />
          </OpField>
          <OpField label="Supplier" error={form.errors.supplierId}>
            <SystemSelect className={`${inputCls} w-36`} {...form.field("supplierId")}><option value="">{ui("None")}</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Note" error={form.errors.note} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("note")} />
          </OpField>
          <BrandButton onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? ui("Saving…") : ui("Save")}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full">
          <thead><tr className="border-b border-edge/15">{["Date", "Kind", "Item", "Store", "Qty", "Unit Price", "Supplier", "Note"].map((h) => <th key={h} className={thCls}>{h ? ui(h) : null}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={8} state="loading" /> : loadFailed ? <EmptyRow cols={8} state="error" onRetry={load} /> : rows.length === 0 ? <EmptyRow cols={8} text="No transactions" /> : rows.map((t: any) => (
              <tr key={t.id} className="border-b border-edge/10 hover:bg-surface-sunken/50">
                <td className={tdCls}>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}><Badge size="sm" dot variant={t.kind === "RECEIVE" || t.kind === "RETURN" ? "success" : "warning"}>{ui(TXN_KIND_LABEL[t.kind] ?? t.kind)}</Badge></td>
                <td className={tdCls}>{t.item?.name || t.itemId}</td>
                <td className={tdCls}>{t.store?.name || t.storeId}</td>
                <td className={tdCls}>{t.quantity}</td>
                <td className={tdCls}>{t.unitPrice != null ? campusMoney(t.unitPrice) : "—"}</td>
                <td className={tdCls}>{t.supplier?.name || "—"}</td>
                <td className={tdCls}>{t.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODULE 15 — FRONT DESK
   ════════════════════════════════════════════════════════════════ */

export function VisitorsPanel() {
  // SKO-466: the register (on site first, refusals, corrections, retention) lives in its own component.
  return <VisitorRegister />;
}

export function ComplaintsPanel() {
  // SKO-467: owned cases, confidential routing and history live in ComplaintsDesk.
  return <ComplaintsDesk />;
}

export function PostalPanel() {
  // SKO-464: handoff tracking, corrections and history live in PostalRegister.
  return <PostalRegister />;
}

export function PhoneCallsPanel() {
  // SKO-465: owned callbacks, restricted notes and history live in PhoneCallLog.
  return <PhoneCallLog />;
}

export function CertificatesPanel() {
  // SKO-469: approved template versions, issuing with preview, approval, reissue and revocation live in CertificatesDesk.
  return <CertificatesDesk />;
}
