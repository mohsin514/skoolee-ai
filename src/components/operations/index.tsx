"use client";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useId, useState } from "react";
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
import { DormitoryAllocations } from "./dormitory-allocations";
import { VisitorRegister } from "./visitor-register";
import { ComplaintsDesk } from "./complaints-desk";
import { PhoneCallLog } from "./phone-call-log";
import { PostalRegister } from "./postal-register";
import { CertificatesDesk } from "./certificates-desk";
import { useUiText } from "@/components/locale/LocaleProvider";
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
import { FormField } from "@/components/ui/form-field";


/* ─── tiny helpers ─── */
const inputCls =
  "max-w-full";
const labelCls =
  "mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-ink-subtle";
const cardCls =
  "sk-panel sk-rise p-6";
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
    <Button variant="destructive" size="icon" type="button" aria-label="Delete" onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
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
  const fieldName = useId();
  return <FormField name={fieldName} label={label} error={error} className={width}>{children}</FormField>;
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
              <Button aria-pressed={tab === t} variant="choice" size="sm" key={t} onClick={() => setTab(t)} className="">
                {t === "routes" ? "Routes" : "Vehicles"}
              </Button>
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
            <SystemInput className={`${inputCls} w-44`} {...form.field("title")} placeholder="Route A" />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("description")} placeholder="Stops, timings…" />
          </OpField>
          {/* The stored value is paisa (the schema multiplies by 100 on save),
              so the unit has to be on the label — otherwise "500" is ambiguous. */}
          <OpField label="Fare (Rs)" error={form.errors.fare}>
            <SystemInput className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("fare")} placeholder="0" />
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
            <SystemInput className={`${inputCls} w-32`} {...form.field("number")} placeholder="BUS-01" />
          </OpField>
          <OpField label="Type" error={form.errors.model}>
            <SystemSelect className={`${inputCls} w-28`} {...form.field("model")}>
              {VEHICLE_MODELS.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
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
  const ui = useUiText();
  const [tab, setTab] = useState<"allocations" | "types" | "rooms">("allocations");
  return (
    <div className={cardCls}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* "Hostel" in the sidebar; the page said "Dormitory". Same thing, two
            names, on the same screen. */}
        <PanelTitle icon={Building2} title={ui("Hostel Management")} />
        <div className="flex max-w-full flex-wrap gap-1 rounded-xl bg-[#f6f2fa] p-1">
          {(["allocations", "types", "rooms"] as const).map((t) => (
            <Button aria-pressed={tab === t} variant="choice" size="sm" key={t} onClick={() => setTab(t)} className="">
              {ui(t === "allocations" ? "Allocations" : t === "types" ? "Room Types" : "Rooms")}
            </Button>
          ))}
        </div>
      </div>
      {tab === "allocations" ? <DormitoryAllocations /> : tab === "types" ? <DormRoomTypesTab /> : <DormRoomsTab />}
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
            <SystemInput className={`${inputCls} w-36`} {...form.field("name")} placeholder="Single" />
          </OpField>
          <OpField label="Cost/Term (Rs)" error={form.errors.costPerTerm}>
            <SystemInput className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("costPerTerm")} placeholder="0" />
          </OpField>
          <OpField label="Description" error={form.errors.description} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("description")} placeholder="Occupancy, facilities…" />
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
            <SystemInput className={`${inputCls} w-28`} {...form.field("number")} placeholder="D-101" />
          </OpField>
          <OpField label="Type" error={form.errors.roomTypeId}>
            <SystemSelect className={`${inputCls} w-32`} {...form.field("roomTypeId")}>
              <option value="">Select…</option>
              {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Capacity" error={form.errors.capacity}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={1} max={50} {...form.field("capacity")} />
          </OpField>
          <BrandButton variant="dark" onClick={form.handleSubmit} disabled={form.submitting}>{form.submitting ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Room #", "Type", "Capacity", "Occupied today", "Status", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No dorm rooms yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.number}</td>
                <td className={tdCls}>{r.roomType?.name || "—"}</td>
                <td className={tdCls}>{r.capacity}</td>
                <td className={tdCls}>{r.occupied ?? 0} / {r.capacity}{r.upcoming ? ` (+${r.upcoming})` : ""}</td>
                <td className={tdCls}>{r.status === "OUT_OF_SERVICE" ? "Out of service" : "Available"}</td>
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
            <Button aria-pressed={tab === t} variant="choice" size="sm" key={t} onClick={() => setTab(t)} className="">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
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
            <SystemInput className={`${inputCls} w-40`} {...form.field("name")} placeholder="Fiction" />
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
        <InputGroup className="relative">
          <Search data-field-affix="start" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <SystemInput className={`${inputCls} w-64 pl-9`} placeholder="Search books…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Book</BrandButton>
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
              <option value="">None</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Copies" error={form.errors.copiesTotal}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={0} {...form.field("copiesTotal")} />
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
            <SystemInput className={`${inputCls} w-64`} {...form.field("userId")} placeholder="Paste user ID" />
          </OpField>
          <OpField label="Member No" error={form.errors.memberNo}>
            <SystemInput className={`${inputCls} w-32`} {...form.field("memberNo")} placeholder="LM-001" />
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
            <SystemSelect className={`${inputCls} w-48`} {...form.field("bookId")}>
              <option value="">Select…</option>
              {books.filter((b: any) => b.copiesAvailable > 0).map((b: any) => <option key={b.id} value={b.id}>{b.title} ({b.copiesAvailable} avail)</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Member" error={form.errors.memberId}>
            {/* Previously filtered on `m.isActive`, which LibraryMember does not
                have — the list was therefore always empty and no member could
                be picked. */}
            <SystemSelect className={`${inputCls} w-48`} {...form.field("memberId")}>
              <option value="">Select…</option>
              {members.map((m: any) => <option key={m.id} value={m.id}>{m.user?.fullName || m.memberNo || m.userId}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Due Date" error={form.errors.dueAt}>
            <SystemInput className={`${inputCls} w-36`} type="date" {...form.field("dueAt")} />
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
                <td className={tdCls}>{!i.returnDate && <Button variant="secondary" size="sm" onClick={() => returnBook(i.id)} ><RotateCcw className="mr-1 inline h-3 w-3" />Return</Button>}</td>
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
            <Button aria-pressed={tab === t} variant="choice" size="sm" key={t} onClick={() => setTab(t)} className="">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
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
            <SystemInput className={`${inputCls} w-40`} {...form.field("name")} />
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
            <SystemInput className={`${inputCls} w-full`} {...form.field("name")} placeholder="Main Store" />
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
        <InputGroup className="relative"><Search data-field-affix="start" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" /><SystemInput className={`${inputCls} w-64 pl-9`} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} /></InputGroup>
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Item</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <OpField label="Name" error={form.errors.name}>
            <SystemInput className={`${inputCls} w-40`} {...form.field("name")} />
          </OpField>
          <OpField label="Category" error={form.errors.categoryId}>
            <SystemSelect className={`${inputCls} w-32`} {...form.field("categoryId")}><option value="">None</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Unit" error={form.errors.unit}>
            <SystemInput className={`${inputCls} w-24`} {...form.field("unit")} placeholder="pcs" />
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
            <SystemSelect className={`${inputCls} w-28`} {...form.field("kind")}>
              {ITEM_TRANSACTION_KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
            </SystemSelect>
          </OpField>
          <OpField label="Item" error={form.errors.itemId}>
            <SystemSelect className={`${inputCls} w-40`} {...form.field("itemId")}><option value="">Select…</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Store" error={form.errors.storeId}>
            <SystemSelect className={`${inputCls} w-36`} {...form.field("storeId")}><option value="">Select…</option>{stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Qty" error={form.errors.quantity}>
            <SystemInput className={`${inputCls} w-20`} type="number" min={1} {...form.field("quantity")} />
          </OpField>
          <OpField label="Unit Price (Rs)" error={form.errors.unitPrice}>
            <SystemInput className={`${inputCls} w-28`} type="number" min={0} step="0.01" {...form.field("unitPrice")} placeholder="0" />
          </OpField>
          <OpField label="Supplier" error={form.errors.supplierId}>
            <SystemSelect className={`${inputCls} w-36`} {...form.field("supplierId")}><option value="">None</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</SystemSelect>
          </OpField>
          <OpField label="Note" error={form.errors.note} width="flex-1">
            <SystemInput className={`${inputCls} w-full`} {...form.field("note")} />
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
