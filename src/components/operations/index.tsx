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

/* ─── tiny helpers ─── */
const inputCls =
  "h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40";
const labelCls =
  "mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45";
const cardCls =
  "sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]";
const addBoxCls =
  "mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#f6f2fa] p-4";
const thCls =
  "px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45";
const tdCls = "px-3 py-2.5 text-sm font-medium text-[#1d1b20]";

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-sm text-[#4d4354]/60">
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
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-[#4d4354]/60 hover:text-[#1d1b20]"}`}>
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
  // Field names match TransportRoute exactly. This form used to post `name`,
  // which the API rejected with "title is required" on every submission.
  const [form, setForm] = useState({ title: "", description: "", fare: "" });
  const [busy, setBusy] = useState(false);
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

  const add = async () => {
    if (!form.title.trim()) return toast.error("Route name required");
    setBusy(true);
    try {
      const r = await fetch("/api/transport/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, description: form.description, fare: Math.round(Number(form.fare || 0) * 100) }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Route added"); setShowAdd(false); setForm({ title: "", description: "", fare: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

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
          <div><label className={labelCls}>Route Name</label><input className={`${inputCls} w-44`} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Route A" /></div>
          <div className="flex-1"><label className={labelCls}>Description</label><input className={`${inputCls} w-full`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Stops, timings…" /></div>
          {/* The stored value is paisa (multiplied by 100 on save), so the unit
              has to be on the label — otherwise "500" is ambiguous. */}
          <div><label className={labelCls}>Fare (Rs)</label><input className={`${inputCls} w-28`} type="number" min={0} value={form.fare} onChange={(e) => setForm((f) => ({ ...f, fare: e.target.value }))} placeholder="0" /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
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
  const [form, setForm] = useState({ number: "", type: "BUS", capacity: "40", driverName: "", driverPhone: "" });
  const [busy, setBusy] = useState(false);
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

  const add = async () => {
    if (!form.number.trim()) return toast.error("Vehicle number required");
    setBusy(true);
    try {
      const r = await fetch("/api/transport/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: form.number, type: form.type, capacity: Number(form.capacity) || 40, driverName: form.driverName, driverPhone: form.driverPhone }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Vehicle added"); setShowAdd(false); setForm({ number: "", type: "BUS", capacity: "40", driverName: "", driverPhone: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

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
          <div><label className={labelCls}>Number</label><input className={`${inputCls} w-32`} value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="BUS-01" /></div>
          <div><label className={labelCls}>Type</label>
            <select className={`${inputCls} w-28`} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="BUS">Bus</option><option value="VAN">Van</option><option value="CAR">Car</option><option value="OTHER">Other</option>
            </select>
          </div>
          <div><label className={labelCls}>Capacity</label><input className={`${inputCls} w-20`} type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></div>
          <div><label className={labelCls}>Driver Name</label><input className={`${inputCls} w-36`} value={form.driverName} onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))} /></div>
          <div><label className={labelCls}>Driver Phone</label><input className={`${inputCls} w-32`} value={form.driverPhone} onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Number", "Type", "Capacity", "Driver", "Phone", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No vehicles yet" /> : rows.map((v: any) => (
              <tr key={v.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{v.number}</td>
                <td className={tdCls}>{v.type}</td>
                <td className={tdCls}>{v.capacity}</td>
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
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-[#4d4354]/60 hover:text-[#1d1b20]"}`}>
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
  const [form, setForm] = useState({ name: "", description: "", costPerTerm: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/dormitory/room-types"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Type name required");
    setBusy(true);
    try {
      // costPerTerm is sent in paisa, matching invoices, fees and transport fares.
      const r = await fetch("/api/dormitory/room-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, description: form.description, costPerTerm: Math.round(Number(form.costPerTerm || 0) * 100) }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Room type added"); setShowAdd(false); setForm({ name: "", description: "", costPerTerm: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/dormitory/room-types?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Type</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-36`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Single" /></div>
          <div><label className={labelCls}>Cost/Term (Rs)</label><input className={`${inputCls} w-28`} type="number" min={0} value={form.costPerTerm} onChange={(e) => setForm((f) => ({ ...f, costPerTerm: e.target.value }))} placeholder="0" /></div>
          <div className="flex-1"><label className={labelCls}>Description</label><input className={`${inputCls} w-full`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Occupancy, facilities…" /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
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
  const [form, setForm] = useState({ roomNumber: "", roomTypeId: "", capacity: "4", floor: "" });
  const [busy, setBusy] = useState(false);
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

  const add = async () => {
    if (!form.roomNumber.trim()) return toast.error("Room number required");
    if (!form.roomTypeId) return toast.error("Select a room type");
    setBusy(true);
    try {
      const r = await fetch("/api/dormitory/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomNumber: form.roomNumber, roomTypeId: form.roomTypeId, capacity: Number(form.capacity) || 4, floor: form.floor || undefined }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Room added"); setShowAdd(false); setForm({ roomNumber: "", roomTypeId: "", capacity: "4", floor: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/dormitory/rooms?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Room removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Room</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Room #</label><input className={`${inputCls} w-28`} value={form.roomNumber} onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))} placeholder="D-101" /></div>
          <div><label className={labelCls}>Type</label>
            <select className={`${inputCls} w-32`} value={form.roomTypeId} onChange={(e) => setForm((f) => ({ ...f, roomTypeId: e.target.value }))}>
              <option value="">Select…</option>
              {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Capacity</label><input className={`${inputCls} w-20`} type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></div>
          <div><label className={labelCls}>Floor</label><input className={`${inputCls} w-20`} value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Room #", "Type", "Capacity", "Floor", "Occupied", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No dorm rooms yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.roomNumber}</td>
                <td className={tdCls}>{r.roomType?.name || "—"}</td>
                <td className={tdCls}>{r.capacity}</td>
                <td className={tdCls}>{r.floor || "—"}</td>
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
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-[#4d4354]/60 hover:text-[#1d1b20]"}`}>
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
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/library/categories"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try {
      const r = await fetch("/api/library/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Category added"); setShowAdd(false); setForm({ name: "", description: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/library/categories?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Category</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-40`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Fiction" /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Description", "Books", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={4} text="No categories yet" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td>
                <td className={tdCls}>{r.description || "—"}</td>
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
  const [form, setForm] = useState({ title: "", author: "", isbn: "", categoryId: "", totalCopies: "1" });
  const [busy, setBusy] = useState(false);
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

  const add = async () => {
    if (!form.title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      const r = await fetch("/api/library/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, totalCopies: Number(form.totalCopies) || 1 }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Book added"); setShowAdd(false); setForm({ title: "", author: "", isbn: "", categoryId: "", totalCopies: "1" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/library/books?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4d4354]/40" />
          <input className={`${inputCls} w-64 pl-9`} placeholder="Search books…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Book</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Title</label><input className={`${inputCls} w-48`} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div><label className={labelCls}>Author</label><input className={`${inputCls} w-36`} value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} /></div>
          <div><label className={labelCls}>ISBN</label><input className={`${inputCls} w-32`} value={form.isbn} onChange={(e) => setForm((f) => ({ ...f, isbn: e.target.value }))} /></div>
          <div><label className={labelCls}>Category</label>
            <select className={`${inputCls} w-32`} value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
              <option value="">None</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Copies</label><input className={`${inputCls} w-20`} type="number" value={form.totalCopies} onChange={(e) => setForm((f) => ({ ...f, totalCopies: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
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
                <td className={tdCls}>{b.totalCopies}</td>
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
  const [form, setForm] = useState({ userId: "", membershipType: "STUDENT" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/library/members"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.userId.trim()) return toast.error("User ID required");
    setBusy(true);
    try {
      const r = await fetch("/api/library/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Member added"); setShowAdd(false); setForm({ userId: "", membershipType: "STUDENT" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/library/members?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Member</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>User ID</label><input className={`${inputCls} w-64`} value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))} placeholder="Paste user ID" /></div>
          <div><label className={labelCls}>Type</label>
            <select className={`${inputCls} w-32`} value={form.membershipType} onChange={(e) => setForm((f) => ({ ...f, membershipType: e.target.value }))}>
              <option value="STUDENT">Student</option><option value="TEACHER">Teacher</option><option value="STAFF">Staff</option>
            </select>
          </div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Member", "Type", "Active Issues", "Status", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No members yet" /> : rows.map((m: any) => (
              <tr key={m.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{m.user?.fullName || m.userId}</td>
                <td className={tdCls}>{m.membershipType}</td>
                <td className={tdCls}>{m._count?.issues ?? 0}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.isActive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{m.isActive ? "Active" : "Inactive"}</span></td>
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
  const [form, setForm] = useState({ bookId: "", memberId: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
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

  const issue = async () => {
    if (!form.bookId || !form.memberId) return toast.error("Book and member required");
    setBusy(true);
    try {
      const r = await fetch("/api/library/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId: form.bookId, memberId: form.memberId, dueDate: form.dueDate || undefined }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Book issued"); setShowAdd(false); setForm({ bookId: "", memberId: "", dueDate: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

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
          <div><label className={labelCls}>Book</label>
            <select className={`${inputCls} w-48`} value={form.bookId} onChange={(e) => setForm((f) => ({ ...f, bookId: e.target.value }))}>
              <option value="">Select…</option>
              {books.filter((b: any) => b.copiesAvailable > 0).map((b: any) => <option key={b.id} value={b.id}>{b.title} ({b.copiesAvailable} avail)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Member</label>
            <select className={`${inputCls} w-48`} value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}>
              <option value="">Select…</option>
              {members.filter((m: any) => m.isActive).map((m: any) => <option key={m.id} value={m.id}>{m.user?.fullName || m.userId}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Due Date</label><input className={`${inputCls} w-36`} type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={issue} disabled={busy}>{busy ? "Issuing…" : "Issue"}</BrandButton>
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
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tab === t ? "bg-white shadow text-[#8127cf]" : "text-[#4d4354]/60 hover:text-[#1d1b20]"}`}>
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
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/inventory/categories"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try { const r = await fetch("/api/inventory/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Category added"); setShowAdd(false); setForm({ name: "", description: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/categories?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Category</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-40`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Description", "Items", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={4} text="No categories" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.description || "—"}</td><td className={tdCls}>{r._count?.items ?? 0}</td>
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
  const [form, setForm] = useState({ name: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/inventory/stores"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try { const r = await fetch("/api/inventory/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Store added"); setShowAdd(false); setForm({ name: "", location: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/stores?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Store</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-40`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main Store" /></div>
          <div className="flex-1"><label className={labelCls}>Location</label><input className={`${inputCls} w-full`} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Location", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={3} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={3} text="No stores" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.location || "—"}</td>
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
  const [form, setForm] = useState({ name: "", contactName: "", phone: "", email: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/inventory/suppliers"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try { const r = await fetch("/api/inventory/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Supplier added"); setShowAdd(false); setForm({ name: "", contactName: "", phone: "", email: "", address: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/suppliers?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Supplier</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-36`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className={labelCls}>Contact</label><input className={`${inputCls} w-32`} value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} /></div>
          <div><label className={labelCls}>Phone</label><input className={`${inputCls} w-28`} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className={labelCls}>Email</label><input className={`${inputCls} w-36`} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Contact", "Phone", "Email", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={5} text="No suppliers" /> : rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{r.name}</td><td className={tdCls}>{r.contactName || "—"}</td><td className={tdCls}>{r.phone || "—"}</td><td className={tdCls}>{r.email || "—"}</td>
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
  const [form, setForm] = useState({ name: "", categoryId: "", unit: "", description: "" });
  const [busy, setBusy] = useState(false);
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

  const add = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try { const r = await fetch("/api/inventory/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Item added"); setShowAdd(false); setForm({ name: "", categoryId: "", unit: "", description: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const del = async (id: string) => { setDeleting(id); try { const r = await fetch(`/api/inventory/items?id=${id}`, { method: "DELETE" }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Removed"); load(); } catch (e: any) { toast.error(e.message); } finally { setDeleting(null); } };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4d4354]/40" /><input className={`${inputCls} w-64 pl-9`} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Item</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-40`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className={labelCls}>Category</label><select className={`${inputCls} w-32`} value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}><option value="">None</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={labelCls}>Unit</label><input className={`${inputCls} w-24`} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="pcs" /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
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
  const [form, setForm] = useState({ itemId: "", storeId: "", supplierId: "", kind: "RECEIVE", quantity: "1", unitPrice: "", note: "" });
  const [busy, setBusy] = useState(false);

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

  const add = async () => {
    if (!form.itemId || !form.storeId) return toast.error("Item and store required");
    setBusy(true);
    try {
      const r = await fetch("/api/inventory/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, quantity: Number(form.quantity) || 1, unitPrice: form.unitPrice ? Math.round(Number(form.unitPrice) * 100) : undefined, supplierId: form.supplierId || undefined }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast.success("Transaction recorded"); setShowAdd(false); setForm({ itemId: "", storeId: "", supplierId: "", kind: "RECEIVE", quantity: "1", unitPrice: "", note: "" }); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-4 flex justify-end"><BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>New Transaction</BrandButton></div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Kind</label><select className={`${inputCls} w-28`} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}><option value="RECEIVE">Receive</option><option value="ISSUE">Issue</option><option value="SELL">Sell</option><option value="RETURN">Return</option></select></div>
          <div><label className={labelCls}>Item</label><select className={`${inputCls} w-40`} value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}><option value="">Select…</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          <div><label className={labelCls}>Store</label><select className={`${inputCls} w-36`} value={form.storeId} onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}><option value="">Select…</option>{stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className={labelCls}>Qty</label><input className={`${inputCls} w-20`} type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
          {/* unitPrice was already held in state and posted to the API, but no
              input ever rendered it, so the column could only ever be null. */}
          <div><label className={labelCls}>Unit Price (Rs)</label><input className={`${inputCls} w-28`} type="number" min={0} value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} placeholder="0" /></div>
          <div><label className={labelCls}>Supplier</label><select className={`${inputCls} w-36`} value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}><option value="">None</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
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
  const [form, setForm] = useState({ visitorName: "", phone: "", purpose: "", personToMeet: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/visitors"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.visitorName.trim()) return toast.error("Name required");
    setBusy(true);
    try { const r = await fetch("/api/front-desk/visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, checkIn: new Date().toISOString() }) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Visitor logged"); setShowAdd(false); setForm({ visitorName: "", phone: "", purpose: "", personToMeet: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const checkout = async (id: string) => {
    try { const r = await fetch("/api/front-desk/visitors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, checkOut: new Date().toISOString() }) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Checked out"); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Eye} title="Visitor Log" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Log Visitor</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-36`} value={form.visitorName} onChange={(e) => setForm((f) => ({ ...f, visitorName: e.target.value }))} /></div>
          <div><label className={labelCls}>Phone</label><input className={`${inputCls} w-28`} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className={labelCls}>Purpose</label><input className={`${inputCls} w-36`} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} /></div>
          <div><label className={labelCls}>Person to Meet</label><input className={`${inputCls} w-36`} value={form.personToMeet} onChange={(e) => setForm((f) => ({ ...f, personToMeet: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Phone", "Purpose", "Meet", "Check-in", "Check-out", "Action"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={7} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={7} text="No visitor logs" /> : rows.map((v: any) => (
              <tr key={v.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{v.visitorName}</td>
                <td className={tdCls}>{v.phone || "—"}</td>
                <td className={tdCls}>{v.purpose || "—"}</td>
                <td className={tdCls}>{v.personToMeet || "—"}</td>
                <td className={tdCls}>{v.checkIn ? new Date(v.checkIn).toLocaleString() : "—"}</td>
                <td className={tdCls}>{v.checkOut ? new Date(v.checkOut).toLocaleString() : "—"}</td>
                <td className={tdCls}>{!v.checkOut && <button onClick={() => checkout(v.id)} className="rounded-lg bg-[#8127cf]/10 px-2 py-1 text-xs font-bold text-[#8127cf] hover:bg-[#8127cf]/20">Check Out</button>}</td>
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
  const [form, setForm] = useState({ complainantName: "", type: "", description: "", priority: "MEDIUM" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/complaints"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.complainantName.trim() || !form.description.trim()) return toast.error("Name and description required");
    setBusy(true);
    try { const r = await fetch("/api/front-desk/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Complaint logged"); setShowAdd(false); setForm({ complainantName: "", type: "", description: "", priority: "MEDIUM" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const resolve = async (id: string) => {
    try { const r = await fetch("/api/front-desk/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "RESOLVED", resolvedAt: new Date().toISOString() }) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Resolved"); load(); } catch (e: any) { toast.error(e.message); }
  };

  const priorityBadge = (p: string) => {
    const cls = p === "HIGH" ? "bg-red-50 text-red-600" : p === "LOW" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600";
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{p}</span>;
  };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={MessageSquare} title="Complaints" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Log Complaint</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-36`} value={form.complainantName} onChange={(e) => setForm((f) => ({ ...f, complainantName: e.target.value }))} /></div>
          <div><label className={labelCls}>Type</label><input className={`${inputCls} w-28`} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="General" /></div>
          <div><label className={labelCls}>Priority</label><select className={`${inputCls} w-28`} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Name", "Type", "Priority", "Description", "Status", "Action"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={7} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={7} text="No complaints" /> : rows.map((c: any) => (
              <tr key={c.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}>{c.complainantName}</td>
                <td className={tdCls}>{c.type || "—"}</td>
                <td className={tdCls}>{priorityBadge(c.priority || "MEDIUM")}</td>
                <td className={`${tdCls} max-w-[200px] truncate`}>{c.description}</td>
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
  const [form, setForm] = useState({ type: "INCOMING", senderName: "", receiverName: "", referenceNumber: "", description: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/postal"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true);
    try { const r = await fetch("/api/front-desk/postal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Postal record added"); setShowAdd(false); setForm({ type: "INCOMING", senderName: "", receiverName: "", referenceNumber: "", description: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Mail} title="Postal Records" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Add Record</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Type</label><select className={`${inputCls} w-32`} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option value="INCOMING">Incoming</option><option value="OUTGOING">Outgoing</option></select></div>
          <div><label className={labelCls}>Sender</label><input className={`${inputCls} w-32`} value={form.senderName} onChange={(e) => setForm((f) => ({ ...f, senderName: e.target.value }))} /></div>
          <div><label className={labelCls}>Receiver</label><input className={`${inputCls} w-32`} value={form.receiverName} onChange={(e) => setForm((f) => ({ ...f, receiverName: e.target.value }))} /></div>
          <div><label className={labelCls}>Ref #</label><input className={`${inputCls} w-28`} value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Type", "Sender", "Receiver", "Ref #", "Description"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No postal records" /> : rows.map((p: any) => (
              <tr key={p.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.type === "INCOMING" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{p.type}</span></td>
                <td className={tdCls}>{p.senderName || "—"}</td>
                <td className={tdCls}>{p.receiverName || "—"}</td>
                <td className={tdCls}>{p.referenceNumber || "—"}</td>
                <td className={tdCls}>{p.description || "—"}</td>
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
  const [form, setForm] = useState({ callerName: "", phone: "", direction: "INCOMING", purpose: "", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/phone-calls"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.callerName.trim()) return toast.error("Caller name required");
    setBusy(true);
    try { const r = await fetch("/api/front-desk/phone-calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Call logged"); setShowAdd(false); setForm({ callerName: "", phone: "", direction: "INCOMING", purpose: "", note: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={cardCls}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PanelTitle icon={Phone} title="Phone Call Log" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(!showAdd)}>Log Call</BrandButton>
      </div>
      {showAdd && (
        <div className={addBoxCls}>
          <div><label className={labelCls}>Caller</label><input className={`${inputCls} w-36`} value={form.callerName} onChange={(e) => setForm((f) => ({ ...f, callerName: e.target.value }))} /></div>
          <div><label className={labelCls}>Phone</label><input className={`${inputCls} w-28`} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className={labelCls}>Direction</label><select className={`${inputCls} w-28`} value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}><option value="INCOMING">Incoming</option><option value="OUTGOING">Outgoing</option></select></div>
          <div><label className={labelCls}>Purpose</label><input className={`${inputCls} w-32`} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} /></div>
          <div className="flex-1"><label className={labelCls}>Note</label><input className={`${inputCls} w-full`} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Date", "Direction", "Caller", "Phone", "Purpose", "Note"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={6} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={6} text="No calls logged" /> : rows.map((c: any) => (
              <tr key={c.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{new Date(c.createdAt).toLocaleString()}</td>
                <td className={tdCls}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.direction === "INCOMING" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{c.direction}</span></td>
                <td className={tdCls}>{c.callerName}</td>
                <td className={tdCls}>{c.phone || "—"}</td>
                <td className={tdCls}>{c.purpose || "—"}</td>
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
  const [form, setForm] = useState({ name: "", description: "", bodyTemplate: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/front-desk/certificates"); const j = await r.json(); if (j.success) setRows(j.data || []); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Template name required");
    setBusy(true);
    try { const r = await fetch("/api/front-desk/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const j = await r.json(); if (!j.success) throw new Error(j.error); toast.success("Template added"); setShowAdd(false); setForm({ name: "", description: "", bodyTemplate: "" }); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

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
            <div><label className={labelCls}>Name</label><input className={`${inputCls} w-48`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Transfer Certificate" /></div>
            </div>
          <div className="w-full">
            <label className={labelCls}>Body Template</label>
            <textarea className={`${inputCls} w-full min-h-[80px] resize-y py-2`} value={form.bodyTemplate} onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))} placeholder="Use {{studentName}}, {{className}}, etc." />
          </div>
          <BrandButton variant="dark" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save"}</BrandButton>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-[#cfc2d6]/15">{["Name", "Description", "Created", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" /> : rows.length === 0 ? <EmptyRow cols={4} text="No templates" /> : rows.map((t: any) => (
              <tr key={t.id} className="border-b border-[#cfc2d6]/10 hover:bg-[#f6f2fa]/50">
                <td className={tdCls}>{t.name}</td>
                <td className={tdCls}>{t.description || "—"}</td>
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
