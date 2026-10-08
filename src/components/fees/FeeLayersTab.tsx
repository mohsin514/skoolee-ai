"use client";

import { UiText, useUiText, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { getFinancialLocale } from "@/app/actions/locale";
import { CurrencySelect } from "@/components/locale/CurrencySelect";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Check, Layers, Loader2, Percent, Plus, Tag, Timer, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalFrame, ModalActions, FormInput, FormSelect } from "@/components/shared-admin";
import type {
  CarryForwardRow,
  ClassOption,
  DiscountAssignmentRow,
  FeeDiscountRow,
  FeeGroupRow,
  FeeTypeRow,
  GroupAssignmentRow,
  MasterLineRow,
  StudentLite,
} from "./fee-types";
import { API, classLabel, formatPKR, rupeesToPaisa, paisaToRupees } from "./fee-utils";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";

const inputClass = "w-full h-14 rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all focus:bg-white";
const labelClass = "block mb-2 pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle";

export function FeeLayersTab({ campusId }: { campusId?: string }) {
 const tr = useUiText();
  const [active, setActive] = useState<"types" | "groups" | "master" | "assign" | "discounts" | "carry">("types");

  const tabs = [
    { key: "types" as const, label: tr("Types"), icon: Tag },
    { key: "groups" as const, label: tr("Groups"), icon: Layers },
    { key: "master" as const, label: tr("Master"), icon: BookOpen },
    { key: "assign" as const, label: tr("Assign"), icon: Check },
    { key: "discounts" as const, label: tr("Discounts"), icon: Percent },
    { key: "carry" as const, label: tr("Carry Forward"), icon: Wallet },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                isActive ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-muted hover:text-[#8127cf]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {active === "types" && <TypesPanel campusId={campusId} />}
      {active === "groups" && <GroupsPanel campusId={campusId} />}
      {active === "master" && <MasterPanel campusId={campusId} />}
      {active === "assign" && <AssignPanel campusId={campusId} />}
      {active === "discounts" && <DiscountsPanel campusId={campusId} />}
      {active === "carry" && <CarryPanel campusId={campusId} />}
    </div>
  );
}

export { TypesPanel, GroupsPanel, MasterPanel, AssignPanel, DiscountsPanel, CarryPanel };

/* ── Types ─────────────────────────────────────────────── */

function TypesPanel({ campusId }: { campusId?: string }) {
  const tr = useUiText();
  const [types, setTypes] = useState<FeeTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeTypeRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FeeTypeRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/types${qp}`);
      const json = await res.json();
      if (json.success) setTypes(json.data);
      else toast.error(tr(json.error || "Failed to load fee types"));
    } catch {
      toast.error(tr("Failed to load fee types"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: FeeTypeRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setDescription(row?.description ?? "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error(tr("Name and code are required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/types`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editing ? { id: editing.id } : { campusId: campusId || undefined }), name: name.trim(), code: code.trim(), description }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Fee type saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save fee type"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: FeeTypeRow) => {
    try {
      const res = await fetch(`${API}/types?id=${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Fee type deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
        setDeleting(null);
      }
    } catch {
      toast.error(tr("Failed to delete fee type"));
      setDeleting(null);
    }
  };

  if (loading) {
    return <SkeletonRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]"><UiText>{"Fee Types"}</UiText></h3>
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle"><UiText>{"Reusable fee heads — Tuition, Admission, Lab, Books&hellip;"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Type"}</UiText></BrandButton>
      </div>

      {types.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={tr("No fee types yet")}
          description={tr("Create fee heads first — groups then price them in the Master tab.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"Create Fee Type"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-2.5">
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#1f1a23]">{t.name}</p>
                <p className="text-[9px] font-bold text-ink-subtle mt-0.5">
                  {t.code} · {t._count?.masters ?? 0}<UiText>{"line(s)"}</UiText>{t.description ? ` · ${t.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => openModal(t)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-colors cursor-pointer text-ink-muted">
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => setDeleting(t)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-ink-muted">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ConfirmAction
                  open={deleting?.id === t.id}
                  title={tr("Delete Fee Type")}
                  description={tr("Delete \"{0}\"? Lines using it in any group will also be removed.", [t.name])}
                  onConfirm={() => handleDelete(t)}
                  onCancel={() => setDeleting(null)}
                  tone="danger"
                  confirmLabel={tr("Delete")}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Fee Type") : tr("New Fee Type")} eyebrow={tr("Fee Layers · Types")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Monthly Tuition")} onChange={setName} />
            <FormInput label={tr("Code")} value={code} placeholder={tr("e.g. MONTHLY_TUITION")} onChange={setCode} />
            <FormInput label={tr("Description (optional)")} value={description} placeholder={tr("e.g. Standard monthly tuition")} onChange={setDescription} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Update Type" : "Create Type"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

/* ── Groups ────────────────────────────────────────────── */

function GroupsPanel({ campusId }: { campusId?: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [groups, setGroups] = useState<FeeGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeGroupRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FeeGroupRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/groups${qp}`);
      const json = await res.json();
      if (json.success) setGroups(json.data);
      else toast.error(tr(json.error || "Failed to load fee groups"));
    } catch {
      toast.error(tr("Failed to load fee groups"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: FeeGroupRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setDescription(row?.description ?? "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(tr("Name is required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/groups`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editing ? { id: editing.id } : { campusId: campusId || undefined }), name: name.trim(), description }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Fee group saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save fee group"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: FeeGroupRow) => {
    try {
      const res = await fetch(`${API}/groups?id=${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Fee group deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
        setDeleting(null);
      }
    } catch {
      toast.error(tr("Failed to delete fee group"));
      setDeleting(null);
    }
  };

  if (loading) {
    return <SkeletonRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]"><UiText>{"Fee Groups"}</UiText></h3>
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle"><UiText>{"Packages bundling multiple fee types — price them in Master"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Group"}</UiText></BrandButton>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={tr("No fee groups yet")}
          description={tr("Create a group like 'Legacy — Grade 1' or 'Day Scholar Package'.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"Create Fee Group"}</UiText></BrandButton>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {groups.map((g) => {
            const lineTotal = g.lines.reduce((s, l) => s + l.amount, 0);
            return (
              <div key={g.id} className="sk-panel p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-black text-[#1f1a23]">{g.name}</p>
                    <p className="text-[9px] font-bold text-ink-subtle mt-0.5">
                      {g.lines.length}<UiText>{"fee line(s) ·"}</UiText>{g.assignments.length}<UiText>{"class assignment(s)"}</UiText></p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => openModal(g)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-colors cursor-pointer text-ink-muted">
                      <BookOpen className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => setDeleting(g)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-ink-muted">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ConfirmAction
                      open={deleting?.id === g.id}
                      title={tr("Delete Fee Group")}
                      description={tr("Delete \"{0}\"? Its lines and class assignments will be removed.", [g.name])}
                      onConfirm={() => handleDelete(g)}
                      onCancel={() => setDeleting(null)}
                      tone="danger"
                      confirmLabel={tr("Delete")}
                    />
                  </div>
                </div>
                <div className="rounded-xl bg-[#fbf0fe]/50 px-3 py-2 flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase text-ink-subtle"><UiText>{"Bundled value"}</UiText></p>
                  <p className="text-sm font-black text-[#8127cf]">{formatPKR(lineTotal, g.currency)}</p>
                </div>
                {g.description && (
                  <p className="text-[10px] font-semibold text-ink-subtle mt-2 px-1">{g.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Fee Group") : tr("New Fee Group")} eyebrow={tr("Fee Layers · Groups")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Day Scholar Package")} onChange={setName} />
            <FormInput label={tr("Description (optional)")} value={description} placeholder={tr("e.g. Tuition + books + lab")} onChange={setDescription} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Update Group" : "Create Group"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

/* ── Master (priced lines) ─────────────────────────────── */

function MasterPanel({ campusId }: { campusId?: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [groups, setGroups] = useState<FeeGroupRow[]>([]);
  const [types, setTypes] = useState<FeeTypeRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MasterLineRow | null>(null);
  const [feeTypeId, setFeeTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MasterLineRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, tRes] = await Promise.all([fetch(`${API}/groups${qp}`), fetch(`${API}/types${qp}`)]);
      const [gJson, tJson] = await Promise.all([gRes.json(), tRes.json()]);
      if (gJson.success) setGroups(gJson.data);
      if (tJson.success) setTypes(tJson.data);
    } catch {
      toast.error(tr("Failed to load master data"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const openModal = (line: MasterLineRow | null) => {
    setEditing(line);
    setFeeTypeId(line?.feeTypeId ?? "");
    setAmount(line ? String(paisaToRupees(line.amount, selectedGroup?.currency)) : "");
    setDueDate(line?.dueDate ? new Date(line.dueDate).toISOString().split("T")[0] : "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!feeTypeId || !amount) {
      toast.error(tr("Fee type and amount required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/master-lines`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { campusId: campusId || undefined, feeGroupId: selectedGroupId }),
          feeTypeId,
          currency: selectedGroup?.currency,
          amount: rupeesToPaisa(amount, selectedGroup?.currency),
          dueDate: dueDate || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Master line saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save master line"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (line: MasterLineRow) => {
    try {
      const res = await fetch(`${API}/master-lines?id=${line.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Master line deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
        setDeleting(null);
      }
    } catch {
      toast.error(tr("Failed to delete master line"));
      setDeleting(null);
    }
  };

  if (loading) {
    return <SkeletonRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:max-w-xs">
          <label className={labelClass}><UiText>{"Fee Group"}</UiText></label>
          <SystemSelect value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} className={inputClass}>
            <option value=""><UiText>{"Select a group..."}</UiText></option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </SystemSelect>
        </div>
        {selectedGroup && (
          <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)} disabled={types.length === 0}><UiText>{"Add Line"}</UiText></BrandButton>
        )}
      </div>

      {!selectedGroup ? (
        <EmptyState icon={BookOpen} title={tr("Pick a fee group")} description={tr("Select a group above to see its priced lines.")} />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">
              {selectedGroup.name}<UiText>{"—"}</UiText>{selectedGroup.lines.length}<UiText>{"line(s)"}</UiText></p>
            <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
              {formatPKR(selectedGroup.lines.reduce((s, l) => s + l.amount, 0), selectedGroup.currency)}<UiText>{"total"}</UiText></p>
          </div>
          {selectedGroup.lines.length === 0 ? (
            <EmptyState icon={BookOpen} title={tr("No lines yet")} description={tr("Price the first fee type in this group.")} />
          ) : (
            selectedGroup.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-black text-[#1f1a23]">{line.feeType?.name ?? "Unknown"}</p>
                  <p className="text-[9px] font-bold text-ink-subtle mt-0.5">
                    {line.feeType?.code}
                    {line.dueDate ? tr(" · due {0}", [new Date(line.dueDate).toLocaleDateString()]) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-black text-[#8127cf]">{formatPKR(line.amount, selectedGroup?.currency)}</p>
                  <button type="button" onClick={() => openModal(line)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-colors cursor-pointer text-ink-muted">
                    <BookOpen className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setDeleting(line)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-ink-muted">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ConfirmAction
                    open={deleting?.id === line.id}
                    title={tr("Delete Master Line")}
                    description={tr("Remove \"{0}\" from {1}?", [line.feeType?.name, selectedGroup.name])}
                    onConfirm={() => handleDelete(line)}
                    onCancel={() => setDeleting(null)}
                    tone="danger"
                    confirmLabel={tr("Delete")}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && selectedGroup && (
        <ModalFrame title={editing ? tr("Edit Master Line") : tr("Add Master Line")} eyebrow={`Fee Layers · ${selectedGroup.name}`} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormSelect label={tr("Fee Type")} value={feeTypeId} onChange={setFeeTypeId}>
              <option value=""><UiText>{"Select fee type..."}</UiText></option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
              ))}
            </FormSelect>
            <FormInput label={`${tr("Amount")} (${selectedGroup?.currency || "PKR"})`} type="number" value={amount} placeholder="e.g. 5000" onChange={setAmount} />
            <FormInput label={tr("Due date (optional)")} type="date" value={dueDate} placeholder="" onChange={setDueDate} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Update Line" : "Add Line"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

/* ── Assign ────────────────────────────────────────────── */

function AssignPanel({ campusId }: { campusId?: string }) {
  const tr = useUiText();
  const [assignments, setAssignments] = useState<GroupAssignmentRow[]>([]);
  const [groups, setGroups] = useState<FeeGroupRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [feeGroupId, setFeeGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<GroupAssignmentRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, gRes, cRes] = await Promise.all([
        fetch(`${API}/assignments${qp}`),
        fetch(`${API}/groups${qp}`),
        fetch(`/api/classes${qp}`),
      ]);
      const [aJson, gJson, cJson] = await Promise.all([aRes.json(), gRes.json(), cRes.json()]);
      if (aJson.success) setAssignments(aJson.data);
      if (gJson.success) setGroups(gJson.data);
      if (cJson.success) setClasses(cJson.data);
    } catch {
      toast.error(tr("Failed to load assignments"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!feeGroupId || !classId || !academicYear) {
      toast.error(tr("Group, class and year required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campusId: campusId || undefined, feeGroupId, classId, academicYear: Number(academicYear) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Assignment created"));
        setShowModal(false);
        setFeeGroupId("");
        setClassId("");
        load();
      } else {
        toast.error(tr(json.error || "Failed to assign"));
      }
    } catch {
      toast.error(tr("Failed to assign group"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: GroupAssignmentRow) => {
    try {
      const res = await fetch(`${API}/assignments?id=${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Assignment removed"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to remove"));
        setDeleting(null);
      }
    } catch {
      toast.error(tr("Failed to remove assignment"));
      setDeleting(null);
    }
  };

  if (loading) {
    return <SkeletonRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]"><UiText>{"Class Assignments"}</UiText></h3>
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle"><UiText>{"Which fee group serves each class, per academic year"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)} disabled={groups.length === 0 || classes.length === 0}><UiText>{"Assign Group"}</UiText></BrandButton>
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={Check} title={tr("No assignments yet")} description={tr("Assign a fee group to a class for the current year.")} />
      ) : (
        <div className="space-y-2.5">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#1f1a23]">
                  {a.class ? classLabel(a.class.name, a.class.section) : tr("Unknown class")}
                </p>
                <p className="text-[9px] font-bold text-ink-subtle mt-0.5">
                  {a.feeGroup?.name} · {a.academicYear}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setDeleting(a)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-ink-muted">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ConfirmAction
                  open={deleting?.id === a.id}
                  title={tr("Remove Assignment")}
                  description={`Stop serving ${a.feeGroup?.name} to ${a.class ? classLabel(a.class.name, a.class.section) : tr("this class")} for ${a.academicYear}?`}
                  onConfirm={() => handleDelete(a)}
                  onCancel={() => setDeleting(null)}
                  tone="danger"
                  confirmLabel={tr("Remove")}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={tr("Assign Fee Group")} eyebrow={tr("Fee Layers · Assign")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormSelect label={tr("Fee Group")} value={feeGroupId} onChange={setFeeGroupId}>
              <option value=""><UiText>{"Select group..."}</UiText></option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </FormSelect>
            <FormSelect label={tr("Class")} value={classId} onChange={setClassId}>
              <option value=""><UiText>{"Select class..."}</UiText></option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
              ))}
            </FormSelect>
            <FormInput label={tr("Academic Year")} type="number" value={academicYear} placeholder="2026" onChange={setAcademicYear} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel="Assign Group" onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

/* ── Discounts ─────────────────────────────────────────── */

function DiscountsPanel({ campusId }: { campusId?: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [currency, setCurrency] = useState("PKR");
  useEffect(() => { void getFinancialLocale(campusId).then((policy) => setCurrency(policy.currency)).catch(() => {}); }, [campusId]);
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeDiscountRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FeeDiscountRow | null>(null);
  const [assigning, setAssigning] = useState<FeeDiscountRow | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [assigned, setAssigned] = useState<DiscountAssignmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, cRes] = await Promise.all([
        fetch(`${API}/discounts${qp}`),
        fetch(`/api/student-categories${qp}`),
      ]);
      const [dJson, cJson] = await Promise.all([dRes.json(), cRes.json()]);
      if (dJson.success) setDiscounts(dJson.data);
      if (cJson.success) setCategories(cJson.data);
    } catch {
      toast.error(tr("Failed to load discounts"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: FeeDiscountRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setType(row?.type ?? "PERCENT");
    setValue(row ? String(row.type === "FLAT" ? paisaToRupees(row.value, row.currency) : row.value) : "");
    if (row) setCurrency(row.currency);
    setCategoryId(row?.categoryId ?? "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim() || !value) {
      toast.error(tr("Name, code and value required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/discounts`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { campusId: campusId || undefined }),
          name: name.trim(),
          code: code.trim(),
          type,
          currency,
          value: type === "FLAT" ? rupeesToPaisa(value, currency) : Number(value),
          categoryId: categoryId || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Discount saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save discount"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: FeeDiscountRow) => {
    try {
      const res = await fetch(`${API}/discounts?id=${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Discount deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
        setDeleting(null);
      }
    } catch {
      toast.error(tr("Failed to delete discount"));
      setDeleting(null);
    }
  };

  const openAssign = async (row: FeeDiscountRow) => {
    setAssigning(row);
    setSearch("");
    try {
      const [sRes, aRes] = await Promise.all([
        fetch(`/api/students${qp ? `${qp}&` : "?"}pageSize=1000`),
        fetch(`${API}/discount-assignments?discountId=${row.id}`),
      ]);
      const [sJson, aJson] = await Promise.all([sRes.json(), aRes.json()]);
      if (sJson.success) setStudents(sJson.data);
      if (aJson.success) setAssigned(aJson.data);
    } catch {
      toast.error(tr("Failed to load students"));
    }
  };

  const addAssignment = async (studentId: string) => {
    if (!assigning) return;
    setAssignBusy(true);
    try {
      const res = await fetch(`${API}/discount-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountId: assigning.id, studentId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Discount assigned"));
        const aRes = await fetch(`${API}/discount-assignments?discountId=${assigning.id}`);
        const aJson = await aRes.json();
        if (aJson.success) setAssigned(aJson.data);
        load();
      } else {
        toast.error(tr(json.error || "Failed to assign"));
      }
    } catch {
      toast.error(tr("Failed to assign discount"));
    } finally {
      setAssignBusy(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (!assigning) return;
    setAssignBusy(true);
    try {
      const res = await fetch(`${API}/discount-assignments?id=${assignmentId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        const aRes = await fetch(`${API}/discount-assignments?discountId=${assigning.id}`);
        const aJson = await aRes.json();
        if (aJson.success) setAssigned(aJson.data);
        load();
      } else {
        toast.error(tr(json.error || "Failed to remove"));
      }
    } catch {
      toast.error(tr("Failed to remove assignment"));
    } finally {
      setAssignBusy(false);
    }
  };

  if (loading) {
    return <SkeletonRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]"><UiText>{"Discounts"}</UiText></h3>
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">{tr("Flat amount")} (<bdi>{currency}</bdi>) / {tr("Percent (max 100)")}</p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Discount"}</UiText></BrandButton>
      </div>

      {discounts.length === 0 ? (
        <EmptyState icon={Percent} title={tr("No discounts yet")} description={tr("Create discounts to apply to students or whole categories.")} />
      ) : (
        <div className="space-y-2.5">
          {discounts.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#1f1a23]">{d.name}</p>
                <p className="text-[9px] font-bold text-ink-subtle mt-0.5">
                  {d.code} · {d.type === "PERCENT" ? `${d.value}%` : formatPKR(d.value, d.currency)}
                  {d.category ? tr(" · auto: {0}", [d.category.name]) : ""} · {d._count?.assignments ?? 0}<UiText>{"student(s)"}</UiText></p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => openAssign(d)} className="h-8 px-2.5 rounded-xl bg-[#fbf0fe] text-[#8127cf] flex items-center gap-1 hover:bg-white transition-colors cursor-pointer text-[9px] font-black uppercase tracking-wider">
                  <Users className="w-3.5 h-3.5" /><UiText>{"Assign"}</UiText></button>
                <button type="button" onClick={() => openModal(d)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-colors cursor-pointer text-ink-muted">
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => setDeleting(d)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-ink-muted">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ConfirmAction
                  open={deleting?.id === d.id}
                  title={tr("Delete Discount")}
                  description={tr("Delete \"{0}\"? All student assignments for it will be removed.", [d.name])}
                  onConfirm={() => handleDelete(d)}
                  onCancel={() => setDeleting(null)}
                  tone="danger"
                  confirmLabel={tr("Delete")}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Discount") : tr("New Discount")} eyebrow={tr("Fee Layers · Discounts")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Sibling Discount")} onChange={setName} />
            <FormInput label={tr("Code")} value={code} placeholder={tr("e.g. SIBLING_10")} onChange={setCode} />
            <div className="grid grid-cols-2 gap-3">
              <FormSelect label={tr("Type")} value={type} onChange={(v) => setType(v as "PERCENT" | "FLAT")}>
                <option value="PERCENT"><UiText>{"Percent (%)"}</UiText></option>
                <option value="FLAT">{tr("Flat amount")} ({currency})</option>
              </FormSelect>
              <FormInput
                label={type === "PERCENT" ? tr("Percent (max 100)") : `${tr("Amount")} (${currency})`}
                type="number"
                value={value}
                placeholder={type === "PERCENT" ? "10" : "500"}
                onChange={setValue}
              />
            </div>
            <FormSelect label={tr("Auto-apply category (optional)")} value={categoryId} onChange={setCategoryId}>
              <option value=""><UiText>{"No category"}</UiText></option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </FormSelect>
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Update Discount" : "Create Discount"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}

      {assigning && (
        <ModalFrame title={tr("Assign: {0}", [assigning.name])} eyebrow={tr("Fee Layers · Discounts")} onClose={() => setAssigning(null)} wide>
          <div className="space-y-5">
            <div>
              <label className={labelClass}><UiText>{"Find student"}</UiText></label>
              <SystemInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Type name or roll no...")} className={inputClass} />
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-2"><UiText>{"Assigned ("}</UiText>{assigned.length})
              </p>
              {assigned.length === 0 ? (
                <p className="text-[10px] font-semibold text-ink-subtle italic"><UiText>{"No students assigned yet."}</UiText></p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                  {assigned.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-xl bg-[#fbf0fe]/50 border border-[#cfc2d6]/10 px-3 py-2">
                      <p className="text-xs font-black text-[#1f1a23]">
                        {a.student?.fullName} <span className="text-ink-subtle font-bold">· {a.student?.rollNo ?? ""}</span>
                      </p>
                      <button
                        type="button"
                        disabled={assignBusy}
                        onClick={() => removeAssignment(a.id)}
                        className="h-7 px-2 rounded-lg bg-rose-50 text-rose-500 text-[9px] font-black uppercase hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                      ><UiText>{"Remove"}</UiText></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-2"><UiText>{"Add student"}</UiText></p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                {students
                  .filter((s) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return !assigned.some((a) => a.studentId === s.id);
                    return (
                      s.fullName.toLowerCase().includes(q) ||
                      (s.rollNo ?? "").toLowerCase().includes(q)
                    ) && !assigned.some((a) => a.studentId === s.id);
                  })
                  .slice(0, 20)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-[#cfc2d6]/10 px-3 py-2">
                      <p className="text-xs font-bold text-[#1f1a23]">
                        {s.fullName} <span className="text-ink-subtle font-bold">· {s.rollNo ?? ""}</span>
                      </p>
                      <button
                        type="button"
                        disabled={assignBusy}
                        onClick={() => addAssignment(s.id)}
                        className="h-7 px-2 rounded-lg bg-[#fbf0fe] text-[#8127cf] text-[9px] font-black uppercase hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                      ><UiText>{"Add"}</UiText></button>
                    </div>
                  ))}
                {students.filter((s) => !assigned.some((a) => a.studentId === s.id)).length === 0 && (
                  <p className="text-[10px] font-semibold text-ink-subtle italic"><UiText>{"All students already assigned."}</UiText></p>
                )}
              </div>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

/* ── Carry Forward ─────────────────────────────────────── */

function CarryPanel({ campusId }: { campusId?: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [currency, setCurrency] = useState("PKR");
  useEffect(() => { void getFinancialLocale(campusId).then((policy) => setCurrency(policy.currency)).catch(() => {}); }, [campusId]);
  const [forwards, setForwards] = useState<CarryForwardRow[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [fromYear, setFromYear] = useState(String(new Date().getFullYear()));
  const [toYear, setToYear] = useState(String(new Date().getFullYear() + 1));
  const [balance, setBalance] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CarryForwardRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, sRes] = await Promise.all([
        fetch(`${API}/carry-forwards${qp}`),
        fetch(`/api/students${qp ? `${qp}&` : "?"}pageSize=1000`),
      ]);
      const [fJson, sJson] = await Promise.all([fRes.json(), sRes.json()]);
      if (fJson.success) setForwards(fJson.data);
      if (sJson.success) setStudents(sJson.data);
    } catch {
      toast.error(tr("Failed to load carry-forwards"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!studentId || !fromYear || !toYear || balance === "") {
      toast.error(tr("Student, years and balance required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/carry-forwards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId: campusId || undefined,
          studentId,
          fromAcademicYear: Number(fromYear),
          toAcademicYear: Number(toYear),
          currency,
          balance: rupeesToPaisa(balance, currency),
          note: note || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Carry-forward created"));
        setShowModal(false);
        setStudentId("");
        setBalance("");
        setNote("");
        load();
      } else {
        toast.error(tr(json.error || "Failed to create"));
      }
    } catch {
      toast.error(tr("Failed to create carry-forward"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: CarryForwardRow) => {
    try {
      const res = await fetch(`${API}/carry-forwards?id=${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Carry-forward deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
        setDeleting(null);
      }
    } catch {
      toast.error(tr("Failed to delete carry-forward"));
      setDeleting(null);
    }
  };

  if (loading) {
    return <SkeletonRows />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]"><UiText>{"Carry Forward"}</UiText></h3>
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle"><UiText>{"Session-end balances moved to the next academic year"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)} disabled={students.length === 0}><UiText>{"New Carry-Forward"}</UiText></BrandButton>
      </div>

      {forwards.length === 0 ? (
        <EmptyState icon={Wallet} title={tr("No carry-forwards yet")} description={tr("Move a student's outstanding balance or credit into the next year.")} />
      ) : (
        <div className="space-y-2.5">
          {forwards.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#1f1a23]">{f.student?.fullName ?? "Unknown"}</p>
                <p className="text-[9px] font-bold text-ink-subtle mt-0.5">
                  {f.fromAcademicYear}<UiText>{"&rarr;"}</UiText>{f.toAcademicYear}
                  {f.note ? ` · ${f.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-black ${f.balance < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {f.balance < 0 ? "-" : "+"}{formatPKR(Math.abs(f.balance), f.currency)}
                </span>
                <button type="button" onClick={() => setDeleting(f)} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-ink-muted">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ConfirmAction
                  open={deleting?.id === f.id}
                  title={tr("Delete Carry-Forward")}
                  description={tr("Remove the {0} carry-forward for {1}?", [f.toAcademicYear, f.student?.fullName ?? "this student"])}
                  onConfirm={() => handleDelete(f)}
                  onCancel={() => setDeleting(null)}
                  tone="danger"
                  confirmLabel={tr("Delete")}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={tr("New Carry-Forward")} eyebrow={tr("Fee Layers · Carry Forward")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <CurrencySelect value={currency} onChange={setCurrency} /><FormSelect label={tr("Student")} value={studentId} onChange={setStudentId}>
              <option value=""><UiText>{"Select student..."}</UiText></option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName} ({s.rollNo ?? ""})</option>
              ))}
            </FormSelect>
            <div className="grid grid-cols-2 gap-3">
              <FormInput label={tr("From Year")} type="number" value={fromYear} placeholder="2025" onChange={setFromYear} />
              <FormInput label={tr("To Year")} type="number" value={toYear} placeholder="2026" onChange={setToYear} />
            </div>
            <FormInput label={`${tr("Balance")} (${currency}, ${tr("Carried Credit")} < 0)`} type="number" value={balance} placeholder={tr("e.g. 2500 or -500")} onChange={setBalance} />
            <FormInput label={tr("Note (optional)")} value={note} placeholder={tr("e.g. outstanding May dues")} onChange={setNote} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel="Create Carry-Forward" onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

/* ── Fine Rules ─────────────────────────────────────────── */

interface FineRuleRow {
  id: string;
  name: string;
  graceDays: number;
  type: "PERCENT" | "FLAT" | "PER_DAY";
  value: number;
  isActive: boolean;
  description?: string | null;
}

export function FineRulesPanel({ campusId }: { campusId?: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [rules, setRules] = useState<FineRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FineRuleRow | null>(null);
  const [name, setName] = useState("");
  const [graceDays, setGraceDays] = useState("");
  const [type, setType] = useState<"PERCENT" | "FLAT" | "PER_DAY">("PERCENT");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FineRuleRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fine-rules${qp}`);
      const json = await res.json();
      if (json.success) setRules(json.data);
    } catch {
      toast.error(tr("Failed to load fine rules"));
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: FineRuleRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setGraceDays(row ? String(row.graceDays) : "0");
    setType(row?.type ?? "PERCENT");
    setValue(row ? String(row.value) : "");
    setDescription(row?.description ?? "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !value) {
      toast.error(tr("Name and value required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/fine-rules`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { campusId: campusId || undefined }),
          name: name.trim(),
          graceDays: Math.max(0, parseInt(graceDays) || 0),
          type,
          value: Math.round(parseFloat(value) * (type === "PERCENT" ? 1 : 100)),
          description: description.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Fine rule saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save fine rule"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: FineRuleRow) => {
    setTogglingId(rule.id);
    try {
      const res = await fetch(`${API}/fine-rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      });
      const json = await res.json();
      if (json.success) toast.success(tr(rule.isActive ? "Rule deactivated" : "Rule activated"));
      else toast.error(tr(json.error || "Failed to toggle"));
      load();
    } catch {
      toast.error(tr("Failed to toggle rule"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`${API}/fine-rules?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Fine rule deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
      }
    } catch {
      toast.error(tr("Failed to delete fine rule"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1"><UiText>{"Fine Rules"}</UiText></p>
          <p className="text-sm font-black text-[#1f1a23]"><UiText>{"Late-payment fines applied when collecting overdue invoices"}</UiText></p>
          <p className="text-[10px] font-semibold text-ink-subtle mt-0.5"><UiText>{"PERCENT = % of balance · FLAT = fixed PKR · PER_DAY = PKR per day past due"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Fine Rule"}</UiText></BrandButton>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Timer}
          title={tr("No fine rules yet")}
          description={tr("Create a rule to start charging late-payment fines.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Fine Rule"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8127cf]/10 text-[#8127cf]">
                <Timer className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1f1a23]">
                  {rule.name}
                  {rule.description ? <span className="ml-2 text-[10px] font-semibold text-ink-subtle">{rule.description}</span> : null}
                </p>
                <p className="text-[10px] font-bold text-ink-subtle mt-0.5">
                  {rule.type === "PERCENT"
                    ? tr("{0}% of balance", [rule.value])
                    : rule.type === "PER_DAY"
                      ? tr("{0} per day", [formatPKR(rule.value)])
                      : formatPKR(rule.value) + " flat"}
                  {" · "}{rule.graceDays > 0 ? tr("{0} day grace", [rule.graceDays]) : tr("no grace period")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle(rule)}
                disabled={togglingId === rule.id}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-50 ${
                  rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#f3f4f9] text-ink-subtle"
                }`}
              >
                {togglingId === rule.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {rule.isActive ? tr("Active") : tr("Inactive")}
              </button>
              <button
                type="button"
                onClick={() => openModal(rule)}
                className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-ink-muted hover:text-[#8127cf] transition-colors cursor-pointer"
                aria-label={tr("Edit fine rule")}
              >
                <Tag className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(rule)}
                className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-ink-muted hover:text-rose-500 transition-colors cursor-pointer"
                aria-label={tr("Delete fine rule")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Fine Rule") : tr("New Fine Rule")} eyebrow={tr("Fee Layers · Fine Rules")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Rule Name")} value={name} placeholder={tr("e.g. Monthly late fine")} onChange={setName} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}><UiText>{"Type"}</UiText></label>
                <SystemSelect value={type} onChange={(e) => setType(e.target.value as any)} className={inputClass}>
                  <option value="PERCENT"><UiText>{"Percent of balance"}</UiText></option>
                  <option value="FLAT"><UiText>{"Flat amount"}</UiText></option>
                  <option value="PER_DAY"><UiText>{"Per day"}</UiText></option>
                </SystemSelect>
              </div>
              <div>
                <label className={labelClass}><UiText>{"Value (PKR or %)"}</UiText></label>
                <SystemInput type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "PERCENT" ? "e.g. 5" : "e.g. 200"} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}><UiText>{"Grace Days (0 = none)"}</UiText></label>
              <SystemInput type="number" min="0" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} placeholder="0" className={inputClass} />
            </div>
            <FormInput label={tr("Description (optional)")} value={description} placeholder={tr("Shown in reports")} onChange={setDescription} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Save Changes" : "Create Rule"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}

      {deleting && (
        <ConfirmAction
          open
          title={tr("Delete fine rule?")}
          description={tr("\"{0}\" will no longer be available for late fines.", [deleting.name])}
          confirmLabel={tr("Delete")}
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ── Shared ────────────────────────────────────────────── */

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-2">
              <div className="h-4 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="h-3 w-40 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            </div>
            <div className="h-8 w-8 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
          </div>
          <div className="h-12 rounded-xl bg-[#f3f4f9]/50 skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}
