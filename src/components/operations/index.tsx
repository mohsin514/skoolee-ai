"use client";

import { useCallback, useEffect, useState } from "react";
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
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PanelTitle } from "@/components/shared-admin";
import { BrandButton } from "@/components/role-dashboard";
import { formatPKR } from "@/components/fees/fee-utils";
import { useValidatedForm } from "@/lib/hooks/use-validated-form";
import { serverFieldErrors } from "@/lib/validators/client";
import { apiErrorMessage } from "@/lib/errors";
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
  phoneCallFormSchema,
  postalFormSchema,
  POSTAL_DIRECTIONS,
  supplierSchema,
  transportRouteFormSchema,
  vehicleFormSchema,
  VEHICLE_MODELS,
  visitorFormSchema,
} from "@/lib/validators/operations";

/* ─── tiny helpers ─── */
const inputCls =
  "h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 aria-[invalid=true]:border-red-500/70 aria-[invalid=true]:bg-red-50/60";
const labelCls =
  "mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-ink-subtle";
const cardCls =
  "sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]";
const addBoxCls =
  "mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#f6f2fa] p-4";
const thCls =
  "px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-ink-subtle";
const tdCls = "px-3 py-2.5 text-sm font-medium text-[#1d1b20]";

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-sm text-ink-muted">
        {text}
      </td>
    </tr>
  );
}

function DeleteBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

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
  return (
    <div className={width}>
      <label className={labelCls}>{label}</label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 pl-1 text-[10px] font-bold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
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

/* ════════════════════════════════════════════════════════════════
   MODULE 14-A — TRANSPORT
   ════════════════════════════════════════════════════════════════ */

export function TransportPanel() {
  const [tab, setTab] = useState<"routes" | "vehicles">("routes");
  return (
    <div className="space-y-5">
      <div className={cardCls}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <PanelTitle icon={Bus} title="Transport Management" />
          <div className="flex gap-1 rounded-xl bg-[#f6f2fa] p-1">
            {(["routes", "vehicles"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-ink-muted hover:text-[#1d1b20]"}`}>
                {t === "routes" ? "Routes" : "Vehicles"}
              </button>
            ))}
          </div>
        </div>
        {tab === "routes" ? <RoutesTab /> : <VehiclesTab />}
      </div>
    </div>
  );
}

function RoutesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/transport/routes");
      const j = await r.json();
      if (j.success) setRows(j.data || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Field names match TransportRoute exactly, and the schema converts the
  // rupees typed here into the paisa the column stores.
  const form = useValidatedForm({
    schema: transportRouteFormSchema,
    initialValues: { title: "", description: "", fare: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/transport/routes", values, form))) return;
      toast.success("Route added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try {
      const r = await fetch(`/api/transport/routes?id=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Route removed"); load();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Route</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Route Name" error={form.errors.title}>
            <input className={`${inputCls} w-44`} {...form.field("title")} placeholder="Route A" />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("description")} placeholder="Stops, timings…" />
          </OpField>
          {/* The stored value is paisa (the schema multiplies by 100 on save),
              so the unit has to be on the label — otherwise "500" is ambiguous. */}
          <OpField label="Fare (Rs)" error={form.errors.fare}>
            <input className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("fare")} placeholder="0" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Route Name", "Description", "Fare", "Vehicles", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No transport routes yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.title}</td>
                <td className={tdCls}>{r.description || "—"}</td>
                <td className={tdCls}>{r.fare != null ? formatPKR(r.fare) : "—"}</td>
                <td className={tdCls}>{r._count?.routeVehicles ?? r.routeVehicles?.length ?? 0}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VehiclesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/transport/vehicles");
      const j = await r.json();
      if (j.success) setRows(j.data || []);
    } catch {} finally { setLoading(false); }
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
      toast.success("Vehicle added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try {
      const r = await fetch(`/api/transport/vehicles?id=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Vehicle removed"); load();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Vehicle</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Number" error={form.errors.number}>
            <input className={`${inputCls} w-32`} {...form.field("number")} placeholder="BUS-01" />
          </OpField>
          <OpField label="Type" error={form.errors.model}>
            <select className={`${inputCls} w-28`} {...form.field("model")}>
              {VEHICLE_MODELS.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </OpField>
          <OpField label="Capacity" error={form.errors.capacity}>
            <input className={`${inputCls} w-20`} type="number" min={1} max={200} {...form.field("capacity")} />
          </OpField>
          <OpField label="Driver Name" error={form.errors.driverName}>
            <input className={`${inputCls} w-36`} {...form.field("driverName")} />
          </OpField>
          <OpField label="Driver Phone" error={form.errors.driverPhone}>
            <input className={`${inputCls} w-32`} inputMode="tel" {...form.field("driverPhone")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Number", "Type", "Capacity", "Driver", "Phone", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No vehicles yet" /> : rows.map((v: any) => (
              <tr key={v.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{v.number}</td>
                <td className={tdCls}>{v.model || "—"}</td>
                <td className={tdCls}>{v.capacity ?? "—"}</td>
                <td className={tdCls}>{v.driverName || "—"}</td>
                <td className={tdCls}>{v.driverPhone || "—"}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(v.id)} loading={deleting === v.id} /></td>
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

export function DormitoryPanel() {
  const [tab, setTab] = useState<"types" | "rooms">("types");
  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        {/* "Hostel" in the sidebar; the page said "Dormitory". Same thing, two
            names, on the same screen. */}
        <PanelTitle icon={Building2} title="Hostel Management" />
        <div className="flex gap-1 rounded-xl bg-[#f6f2fa] p-1">
          {(["types", "rooms"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-ink-muted hover:text-[#1d1b20]"}`}>
              {t === "types" ? "Room Types" : "Rooms"}
            </button>
          ))}
        </div>
      </div>
      {tab === "types" ? <DormRoomTypesTab /> : <DormRoomsTab />}
    </div>
  );
}

function DormRoomTypesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/dormitory/room-types"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // costPerTerm reaches the API in paisa, matching invoices, fees and transport
  // fares — the schema applies the conversion so no call site can double it.
  const form = useValidatedForm({
    schema: dormRoomTypeFormSchema,
    initialValues: { name: "", description: "", costPerTerm: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/dormitory/room-types", values, form))) return;
      toast.success("Room type added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/dormitory/room-types?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Type</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <input className={`${inputCls} w-36`} {...form.field("name")} placeholder="Single" />
          </OpField>
          <OpField label="Cost/Term (Rs)" error={form.errors.costPerTerm}>
            <input className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("costPerTerm")} placeholder="0" />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("description")} placeholder="Occupancy, facilities…" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Description", "Cost/Term", "Rooms", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No room types yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}>{r.description || "—"}</td>
                <td className={tdCls}>{r.costPerTerm ? formatPKR(r.costPerTerm) : "—"}</td>
                <td className={tdCls}>{r._count?.rooms ?? 0}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DormRoomsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rr, tr] = await Promise.all([fetch("/api/dormitory/rooms"), fetch("/api/dormitory/room-types")]);
      const [rj, tj] = await Promise.all([rr.json(), tr.json()]);
      if (rj.success) setRows(rj.data || []);
      if (tj.success) setTypes(tj.data || []);
    } catch {} finally { setLoading(false); }
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
      toast.success("Room added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/dormitory/rooms?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Room removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Room</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Room #" error={form.errors.number}>
            <input className={`${inputCls} w-28`} {...form.field("number")} placeholder="D-101" />
          </OpField>
          <OpField label="Type" error={form.errors.roomTypeId}>
            <select className={`${inputCls} w-32`} {...form.field("roomTypeId")}>
              <option value="">Select…</option>
              {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </OpField>
          <OpField label="Capacity" error={form.errors.capacity}>
            <input className={`${inputCls} w-20`} type="number" min={1} max={50} {...form.field("capacity")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Room #", "Type", "Capacity", "Occupied", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No dorm rooms yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.number}</td>
                <td className={tdCls}>{r.roomType?.name || "—"}</td>
                <td className={tdCls}>{r.capacity}</td>
                <td className={tdCls}>{r._count?.students ?? 0} / {r.capacity}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
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

export function LibraryPanel() {
  const [tab, setTab] = useState<"books" | "members" | "issues" | "categories">("books");
  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={BookOpen} title="Library Management" />
        <div className="flex gap-1 rounded-xl bg-[#f6f2fa] p-1">
          {(["books", "members", "issues", "categories"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-ink-muted hover:text-[#1d1b20]"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {tab === "books" ? <BooksTab /> : tab === "members" ? <MembersTab /> : tab === "issues" ? <IssuesTab /> : <BookCategoriesTab />}
    </div>
  );
}

function BookCategoriesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/library/categories"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); }
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
      toast.success("Category added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/library/categories?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Category</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <input className={`${inputCls} w-40`} {...form.field("name")} placeholder="Fiction" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Books", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={3} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={3} text="No categories yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}>{r._count?.books ?? 0}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BooksTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const [br, cr] = await Promise.all([fetch(`/api/library/books${q}`), fetch("/api/library/categories")]);
      const [bj, cj] = await Promise.all([br.json(), cr.json()]);
      if (bj.success) setRows(bj.data || []);
      if (cj.success) setCats(cj.data || []);
    } catch {} finally { setLoading(false); }
  }, [search]);
  useEffect(() => { load(); }, [load]);

  // The column is `copiesTotal`. This form sent `totalCopies`, so the route
  // read `undefined`, failed its own `Number.isFinite` check, and rejected
  // every attempt to catalogue a book.
  const form = useValidatedForm({
    schema: bookFormSchema,
    initialValues: { title: "", author: "", isbn: "", categoryId: "", copiesTotal: "1" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/library/books", values, form))) return;
      toast.success("Book added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/library/books?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <input className={`${inputCls} w-64 pl-9`} placeholder="Search books…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Book</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Title" error={form.errors.title}>
            <input className={`${inputCls} w-48`} {...form.field("title")} />
          </OpField>
          <OpField label="Author" error={form.errors.author}>
            <input className={`${inputCls} w-36`} {...form.field("author")} />
          </OpField>
          <OpField label="ISBN" error={form.errors.isbn}>
            <input className={`${inputCls} w-32`} {...form.field("isbn")} placeholder="978…" />
          </OpField>
          <OpField label="Category" error={form.errors.categoryId}>
            <select className={`${inputCls} w-32`} {...form.field("categoryId")}>
              <option value="">None</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </OpField>
          <OpField label="Copies" error={form.errors.copiesTotal}>
            <input className={`${inputCls} w-20`} type="number" min={0} {...form.field("copiesTotal")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Title", "Author", "ISBN", "Category", "Total", "Available", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={7} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={7} text="No books yet" /> : rows.map((b: any) => (
              <tr key={b.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{b.title}</td>
                <td className={tdCls}>{b.author || "—"}</td>
                <td className={tdCls}>{b.isbn || "—"}</td>
                <td className={tdCls}>{b.category?.name || "—"}</td>
                <td className={tdCls}>{b.copiesTotal}</td>
                <td className={tdCls}>{b.copiesAvailable}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(b.id)} loading={deleting === b.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MembersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/library/members"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); }
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
      toast.success("Member added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/library/members?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Member</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="User ID" error={form.errors.userId}>
            <input className={`${inputCls} w-64`} {...form.field("userId")} placeholder="Paste user ID" />
          </OpField>
          <OpField label="Member No" error={form.errors.memberNo}>
            <input className={`${inputCls} w-32`} {...form.field("memberNo")} placeholder="LM-001" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Member", "Member No", "Active Issues", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={4} text="No members yet" /> : rows.map((m: any) => (
              <tr key={m.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{m.user?.fullName || m.userId}</td>
                <td className={tdCls}>{m.memberNo || "—"}</td>
                <td className={tdCls}>{m._count?.issues ?? 0}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(m.id)} loading={deleting === m.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function IssuesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [books, setBooks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ir, br, mr] = await Promise.all([fetch("/api/library/issues"), fetch("/api/library/books"), fetch("/api/library/members")]);
      const [ij, bj, mj] = await Promise.all([ir.json(), br.json(), mr.json()]);
      if (ij.success) setRows(ij.data || []);
      if (bj.success) setBooks(bj.data || []);
      if (mj.success) setMembers(mj.data || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The route reads `dueAt`; this form sent `dueDate`, so the librarian's
  // chosen return date was dropped and every loan silently took the default.
  const form = useValidatedForm({
    schema: bookIssueSchema,
    initialValues: { bookId: "", memberId: "", dueAt: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/library/issues", values, form))) return;
      toast.success("Book issued");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const returnBook = async (id: string) => {
    try {
      const r = await fetch("/api/library/issues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "return" }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Book returned"); load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Issue Book</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Book" error={form.errors.bookId}>
            <select className={`${inputCls} w-48`} {...form.field("bookId")}>
              <option value="">Select…</option>
              {books.filter((b: any) => b.copiesAvailable > 0).map((b: any) => <option key={b.id} value={b.id}>{b.title} ({b.copiesAvailable} avail)</option>)}
            </select>
          </OpField>
          <OpField label="Member" error={form.errors.memberId}>
            {/* Previously filtered on `m.isActive`, which LibraryMember does not
                have — the list was therefore always empty and no member could
                be picked. */}
            <select className={`${inputCls} w-48`} {...form.field("memberId")}>
              <option value="">Select…</option>
              {members.map((m: any) => <option key={m.id} value={m.id}>{m.user?.fullName || m.memberNo || m.userId}</option>)}
            </select>
          </OpField>
          <OpField label="Due Date" error={form.errors.dueAt}>
            <input className={`${inputCls} w-36`} type="date" {...form.field("dueAt")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Issuing…" : "Issue"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Book", "Member", "Issued", "Due", "Status", "Action"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No issues yet" /> : rows.map((i: any) => (
              <tr key={i.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{i.book?.title || i.bookId}</td>
                <td className={tdCls}>{i.member?.user?.fullName || i.memberId}</td>
                <td className={tdCls}>{new Date(i.issueDate).toLocaleDateString()}</td>
                <td className={tdCls}>{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "—"}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i.returnDate ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{i.returnDate ? "Returned" : "Issued"}</span></td>
                <td className={tdCls}>{!i.returnDate && <button onClick={() => returnBook(i.id)} className="rounded-lg bg-[#8127cf]/10 px-2 py-1 text-xs font-bold text-[#8127cf] hover:bg-[#8127cf]/20"><RotateCcw className="mr-1 inline h-3 w-3" />Return</button>}</td>
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

export function InventoryPanel() {
  const [tab, setTab] = useState<"items" | "transactions" | "stores" | "suppliers" | "categories">("items");
  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Package} title="Inventory / POS" />
        <div className="flex gap-1 rounded-xl bg-[#f6f2fa] p-1">
          {(["items", "transactions", "stores", "suppliers", "categories"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-ink-muted hover:text-[#1d1b20]"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {tab === "items" ? <ItemsTab /> : tab === "transactions" ? <TransactionsTab /> : tab === "stores" ? <StoresTab /> : tab === "suppliers" ? <SuppliersTab /> : <ItemCategoriesTab />}
    </div>
  );
}

function ItemCategoriesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/inventory/categories"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // ItemCategory holds only a name. The old `description` had no input bound
  // to it and no column behind the table cell that rendered it.
  const form = useValidatedForm({
    schema: itemCategorySchema,
    initialValues: { name: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/categories", values, form))) return;
      toast.success("Category added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/categories?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Category</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <input className={`${inputCls} w-40`} {...form.field("name")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Items", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={3} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={3} text="No categories" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r._count?.items ?? 0}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StoresTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/inventory/stores"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // ItemStore has no `location` column — whatever was typed into that input
  // was discarded on save, and the table column could never fill in.
  const form = useValidatedForm({
    schema: itemStoreSchema,
    initialValues: { name: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/stores", values, form))) return;
      toast.success("Store added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/stores?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Store</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("name")} placeholder="Main Store" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={2} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={2} text="No stores" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SuppliersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/inventory/suppliers"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // Supplier has no `contactName` column, so that input never persisted.
  // `address` does exist and now has an input rather than only living in state.
  const form = useValidatedForm({
    schema: supplierSchema,
    initialValues: { name: "", phone: "", email: "", address: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/suppliers", values, form))) return;
      toast.success("Supplier added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/suppliers?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Supplier</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <input className={`${inputCls} w-36`} {...form.field("name")} />
          </OpField>
          <OpField label="Phone" error={form.errors.phone}>
            <input className={`${inputCls} w-28`} inputMode="tel" {...form.field("phone")} />
          </OpField>
          <OpField label="Email" error={form.errors.email}>
            <input className={`${inputCls} w-36`} type="email" {...form.field("email")} />
          </OpField>
          <OpField label="Address" error={form.errors.address} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("address")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Phone", "Email", "Address", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No suppliers" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.phone || "—"}</td><td className={tdCls}>{r.email || "—"}</td><td className={tdCls}>{r.address || "—"}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const [ir, cr] = await Promise.all([fetch(`/api/inventory/items${q}`), fetch("/api/inventory/categories")]);
      const [ij, cj] = await Promise.all([ir.json(), cr.json()]);
      if (ij.success) setRows(ij.data || []);
      if (cj.success) setCats(cj.data || []);
    } catch {} finally { setLoading(false); }
  }, [search]);
  useEffect(() => { load(); }, [load]);

  // Item is (name, unit, categoryId). `description` had no input and no column.
  const form = useValidatedForm({
    schema: itemSchema,
    initialValues: { name: "", categoryId: "", unit: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/items", values, form))) return;
      toast.success("Item added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/items?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" /><input className={`${inputCls} w-64 pl-9`} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Item</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <input className={`${inputCls} w-40`} {...form.field("name")} />
          </OpField>
          <OpField label="Category" error={form.errors.categoryId}>
            <select className={`${inputCls} w-32`} {...form.field("categoryId")}><option value="">None</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </OpField>
          <OpField label="Unit" error={form.errors.unit}>
            <input className={`${inputCls} w-24`} {...form.field("unit")} placeholder="pcs" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Category", "Unit", "Total Stock", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No items" /> : rows.map((r: any) => {
              const totalStock = (r.stock || []).reduce((s: number, st: any) => s + (st.quantity || 0), 0);
              return (
                <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                  <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.category?.name || "—"}</td><td className={tdCls}>{r.unit || "—"}</td><td className={tdCls}>{totalStock}</td>
                  <td className={tdCls}><DeleteBtn onClick={() => del(r.id)} loading={deleting === r.id} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TransactionsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, ir, sr, spr] = await Promise.all([fetch("/api/inventory/transactions"), fetch("/api/inventory/items"), fetch("/api/inventory/stores"), fetch("/api/inventory/suppliers")]);
      const [tj, ij, sj, spj] = await Promise.all([tr.json(), ir.json(), sr.json(), spr.json()]);
      if (tj.success) setRows(tj.data || []);
      if (ij.success) setItems(ij.data || []);
      if (sj.success) setStores(sj.data || []);
      if (spj.success) setSuppliers(spj.data || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const form = useValidatedForm({
    schema: itemTransactionFormSchema,
    initialValues: { itemId: "", storeId: "", supplierId: "", kind: "RECEIVE", quantity: "1", unitPrice: "", note: "" },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/inventory/transactions", values, form))) return;
      toast.success("Transaction recorded");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>New Transaction</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Kind" error={form.errors.kind}>
            <select className={`${inputCls} w-28`} {...form.field("kind")}>
              {ITEM_TRANSACTION_KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
            </select>
          </OpField>
          <OpField label="Item" error={form.errors.itemId}>
            <select className={`${inputCls} w-40`} {...form.field("itemId")}><option value="">Select…</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          </OpField>
          <OpField label="Store" error={form.errors.storeId}>
            <select className={`${inputCls} w-36`} {...form.field("storeId")}><option value="">Select…</option>{stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </OpField>
          <OpField label="Qty" error={form.errors.quantity}>
            <input className={`${inputCls} w-20`} type="number" min={1} {...form.field("quantity")} />
          </OpField>
          <OpField label="Unit Price (Rs)" error={form.errors.unitPrice}>
            <input className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("unitPrice")} placeholder="0" />
          </OpField>
          <OpField label="Supplier" error={form.errors.supplierId}>
            <select className={`${inputCls} w-36`} {...form.field("supplierId")}><option value="">None</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </OpField>
          <OpField label="Note" error={form.errors.note} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("note")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Kind", "Item", "Store", "Qty", "Unit Price", "Supplier", "Note"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={8} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={8} text="No transactions" /> : rows.map((t: any) => (
              <tr key={t.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.kind === "RECEIVE" || t.kind === "RETURN" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{t.kind}</span></td>
                <td className={tdCls}>{t.item?.name || t.itemId}</td>
                <td className={tdCls}>{t.store?.name || t.storeId}</td>
                <td className={tdCls}>{t.quantity}</td>
                <td className={tdCls}>{t.unitPrice != null ? formatPKR(t.unitPrice) : "—"}</td>
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
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/visitors"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // VisitorLog is (name, phone, purpose, toMeet, inTime, outTime). This panel
  // was written against a different vocabulary entirely — `visitorName`,
  // `personToMeet`, `checkIn`, `checkOut` — so the route rejected every save
  // with "name and inTime are required", and the table below rendered an
  // em-dash in every column because none of those fields are ever returned.
  const form = useValidatedForm({
    schema: visitorFormSchema,
    initialValues: { name: "", phone: "", purpose: "", toMeet: "", note: "" },
    onSubmit: async (values) => {
      const payload = { ...values, inTime: new Date().toISOString() };
      if (!(await submitTo("/api/front-desk/visitors", payload, form))) return;
      toast.success("Visitor logged");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const checkout = async (id: string) => {
    try { const r = await fetch("/api/front-desk/visitors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, outTime: new Date().toISOString() }) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Checked out"); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Eye} title="Visitor Log" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Log Visitor</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <input className={`${inputCls} w-36`} {...form.field("name")} />
          </OpField>
          <OpField label="Phone" error={form.errors.phone}>
            <input className={`${inputCls} w-28`} inputMode="tel" {...form.field("phone")} />
          </OpField>
          <OpField label="Purpose" error={form.errors.purpose}>
            <input className={`${inputCls} w-36`} {...form.field("purpose")} />
          </OpField>
          <OpField label="Person to Meet" error={form.errors.toMeet}>
            <input className={`${inputCls} w-36`} {...form.field("toMeet")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Phone", "Purpose", "Meet", "Check-in", "Check-out", "Action"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={7} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={7} text="No visitor logs" /> : rows.map((v: any) => (
              <tr key={v.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{v.name}</td>
                <td className={tdCls}>{v.phone || "—"}</td>
                <td className={tdCls}>{v.purpose || "—"}</td>
                <td className={tdCls}>{v.toMeet || "—"}</td>
                <td className={tdCls}>{v.inTime ? new Date(v.inTime).toLocaleString() : "—"}</td>
                <td className={tdCls}>{v.outTime ? new Date(v.outTime).toLocaleString() : "—"}</td>
                <td className={tdCls}>{!v.outTime && <button onClick={() => checkout(v.id)} className="rounded-lg bg-[#8127cf]/10 px-2 py-1 text-xs font-bold text-[#8127cf] hover:bg-[#8127cf]/20">Check Out</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ComplaintsPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/complaints"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // Two independent blockers here. The old guard required `description`, which
  // had no input at all — only a state key — so it was always empty and the
  // toast fired before any request was made. Had it got past that, the route
  // requires `date`, which the form never sent. Complaint also has no
  // `priority` column, so that select was discarded on save and the badge
  // below always fell back to "MEDIUM".
  const form = useValidatedForm({
    schema: complaintFormSchema,
    initialValues: {
      complainantName: "",
      type: "",
      phone: "",
      date: new Date().toISOString().slice(0, 10),
      description: "",
    },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/front-desk/complaints", values, form))) return;
      toast.success("Complaint logged");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const resolve = async (id: string) => {
    try { const r = await fetch("/api/front-desk/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "RESOLVED" }) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Resolved"); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={MessageSquare} title="Complaints" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Log Complaint</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.complainantName}>
            <input className={`${inputCls} w-36`} {...form.field("complainantName")} />
          </OpField>
          <OpField label="Type" error={form.errors.type}>
            <input className={`${inputCls} w-28`} {...form.field("type")} placeholder="General" />
          </OpField>
          <OpField label="Phone" error={form.errors.phone}>
            <input className={`${inputCls} w-28`} inputMode="tel" {...form.field("phone")} />
          </OpField>
          <OpField label="Date" error={form.errors.date}>
            <input className={`${inputCls} w-36`} type="date" {...form.field("date")} />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("description")} placeholder="What happened?" />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Name", "Type", "Phone", "Description", "Status", "Action"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={7} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={7} text="No complaints" /> : rows.map((c: any) => (
              <tr key={c.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{c.date ? new Date(c.date).toLocaleDateString() : new Date(c.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}>{c.complainantName}</td>
                <td className={tdCls}>{c.type || "—"}</td>
                <td className={tdCls}>{c.phone || "—"}</td>
                <td className={`${tdCls} max-w-[200px] truncate`}>{c.description || "—"}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.status === "RESOLVED" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{c.status || "OPEN"}</span></td>
                <td className={tdCls}>{c.status !== "RESOLVED" && <button onClick={() => resolve(c.id)} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-100">Resolve</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PostalPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/postal"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // PostalRecord is (direction, fromName, toName, referenceNo, date, note) and
  // direction stores RECEIVE/DISPATCH. Every one of those names differed in the
  // old form, and `date` — which the route requires — was never sent, so this
  // panel could not save a record and its table read six fields that are never
  // returned. Note there was also no client-side guard at all here.
  const form = useValidatedForm({
    schema: postalFormSchema,
    initialValues: {
      direction: "RECEIVE",
      fromName: "",
      toName: "",
      referenceNo: "",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/front-desk/postal", values, form))) return;
      toast.success("Postal record added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Mail} title="Postal Records" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Record</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Type" error={form.errors.direction}>
            <select className={`${inputCls} w-32`} {...form.field("direction")}>
              <option value="RECEIVE">Received</option>
              <option value="DISPATCH">Dispatched</option>
            </select>
          </OpField>
          <OpField label="Sender" error={form.errors.fromName}>
            <input className={`${inputCls} w-32`} {...form.field("fromName")} />
          </OpField>
          <OpField label="Receiver" error={form.errors.toName}>
            <input className={`${inputCls} w-32`} {...form.field("toName")} />
          </OpField>
          <OpField label="Ref #" error={form.errors.referenceNo}>
            <input className={`${inputCls} w-28`} {...form.field("referenceNo")} />
          </OpField>
          <OpField label="Date" error={form.errors.date}>
            <input className={`${inputCls} w-36`} type="date" {...form.field("date")} />
          </OpField>
          <OpField label="Note" error={form.errors.note} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("note")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Type", "Sender", "Receiver", "Ref #", "Note"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No postal records" /> : rows.map((p: any) => (
              <tr key={p.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{p.date ? new Date(p.date).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.direction === "RECEIVE" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{p.direction === "RECEIVE" ? "Received" : "Dispatched"}</span></td>
                <td className={tdCls}>{p.fromName || "—"}</td>
                <td className={tdCls}>{p.toName || "—"}</td>
                <td className={tdCls}>{p.referenceNo || "—"}</td>
                <td className={tdCls}>{p.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PhoneCallsPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/phone-calls"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // PhoneCallLog is (name, phone, direction, date, followUpDate, note), with
  // direction stored as IN/OUT. The old form sent `callerName`, the strings
  // INCOMING/OUTGOING, a `purpose` field with no column behind it, and no
  // `date` — which the route requires — so no call could be logged. `phone` is
  // non-null in the model, so it is required rather than optional here.
  const form = useValidatedForm({
    schema: phoneCallFormSchema,
    initialValues: {
      name: "",
      phone: "",
      direction: "IN",
      date: new Date().toISOString().slice(0, 10),
      followUpDate: "",
      note: "",
    },
    onSubmit: async (values) => {
      if (!(await submitTo("/api/front-desk/phone-calls", values, form))) return;
      toast.success("Call logged");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Phone} title="Phone Call Log" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Log Call</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Caller" error={form.errors.name}>
            <input className={`${inputCls} w-36`} {...form.field("name")} />
          </OpField>
          <OpField label="Phone" error={form.errors.phone}>
            <input className={`${inputCls} w-28`} inputMode="tel" {...form.field("phone")} />
          </OpField>
          <OpField label="Direction" error={form.errors.direction}>
            <select className={`${inputCls} w-28`} {...form.field("direction")}>
              <option value="IN">Incoming</option>
              <option value="OUT">Outgoing</option>
            </select>
          </OpField>
          <OpField label="Date" error={form.errors.date}>
            <input className={`${inputCls} w-36`} type="date" {...form.field("date")} />
          </OpField>
          <OpField label="Follow-up" error={form.errors.followUpDate}>
            <input className={`${inputCls} w-36`} type="date" {...form.field("followUpDate")} />
          </OpField>
          <OpField label="Note" error={form.errors.note} width="flex-1">
            <input className={`${inputCls} w-full`} {...form.field("note")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Direction", "Caller", "Phone", "Follow-up", "Note"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No calls logged" /> : rows.map((c: any) => (
              <tr key={c.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{c.date ? new Date(c.date).toLocaleDateString() : new Date(c.createdAt).toLocaleString()}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.direction === "IN" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{c.direction === "IN" ? "Incoming" : "Outgoing"}</span></td>
                <td className={tdCls}>{c.name}</td>
                <td className={tdCls}>{c.phone || "—"}</td>
                <td className={tdCls}>{c.followUpDate ? new Date(c.followUpDate).toLocaleDateString() : "—"}</td>
                <td className={tdCls}>{c.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CertificatesPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/certificates"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // CertificateTemplate is (kind, name, backgroundKey, layoutJson, pageSize),
  // and the route requires kind, name and layoutJson. The old form sent name,
  // a `description` with no column, and a `bodyTemplate` the route never read
  // — so saving a template always failed on the missing `kind`.
  //
  // The body the user writes is the layout, so it is stored as the layoutJson
  // document rather than being thrown away.
  const form = useValidatedForm({
    schema: certificateTemplateFormSchema,
    initialValues: { kind: "STUDENT_CERTIFICATE", name: "", bodyTemplate: "", pageSize: "A4" },
    onSubmit: async ({ bodyTemplate, ...values }) => {
      const payload = { ...values, layoutJson: { version: 1, body: bodyTemplate } };
      if (!(await submitTo("/api/front-desk/certificates", payload, form))) return;
      toast.success("Template added");
      setShowAdd(false);
      form.reset();
      load();
    },
  });

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/front-desk/certificates?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={FileText} title="Certificate Templates" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Template</BrandButton>
      </div>
      {showAdd && (
        <div className={`${addBoxCls} flex-col`}>
          <div className="flex flex-wrap gap-3">
            <OpField label="Name" error={form.errors.name}>
              <input className={`${inputCls} w-48`} {...form.field("name")} placeholder="Transfer Certificate" />
            </OpField>
            <OpField label="Type" error={form.errors.kind}>
              <select className={`${inputCls} w-48`} {...form.field("kind")}>
                <option value="STUDENT_CERTIFICATE">Student Certificate</option>
                <option value="ID_CARD">ID Card</option>
              </select>
            </OpField>
            <OpField label="Page Size" error={form.errors.pageSize}>
              <select className={`${inputCls} w-32`} {...form.field("pageSize")}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size.replace("_", " ")}</option>)}
              </select>
            </OpField>
            </div>
          <OpField label="Body Template" error={form.errors.bodyTemplate} width="w-full">
            <textarea className={`${inputCls} w-full min-h-[80px] resize-y py-2`} {...form.field("bodyTemplate")} placeholder="Use {{studentName}}, {{className}}, etc." />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Type", "Page Size", "Created", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No templates" /> : rows.map((t: any) => (
              <tr key={t.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{t.name}</td>
                <td className={tdCls}>{t.kind === "ID_CARD" ? "ID Card" : "Certificate"}</td>
                <td className={tdCls}>{t.pageSize || "—"}</td>
                <td className={tdCls}>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}><DeleteBtn onClick={() => del(t.id)} loading={deleting === t.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
