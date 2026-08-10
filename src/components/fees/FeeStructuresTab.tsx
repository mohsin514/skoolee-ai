"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Edit3,
  History,
  Layers,
  Loader2,
  Percent,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { TypesPanel, GroupsPanel, MasterPanel, AssignPanel, DiscountsPanel, CarryPanel, FineRulesPanel } from "./FeeLayersTab";
import type { ClassOption, FeeStructure } from "./fee-types";
import { API, classLabel, formatPKR } from "./fee-utils";

type StructureSubTab = "types" | "groups" | "master" | "assign" | "discounts" | "carry" | "fines" | "legacy";

const SUB_TABS: { key: StructureSubTab; label: string; icon: typeof Layers }[] = [
  { key: "types", label: "Types", icon: Layers },
  { key: "groups", label: "Groups", icon: BookOpen },
  { key: "master", label: "Master", icon: BookOpen },
  { key: "assign", label: "Assign", icon: BookOpen },
  { key: "discounts", label: "Discounts", icon: Percent },
  { key: "carry", label: "Carry Forward", icon: History },
  { key: "fines", label: "Fine Rules", icon: Percent },
  { key: "legacy", label: "Legacy", icon: History },
];

export function FeeStructuresTab({ campusId }: { campusId?: string }) {
  const [subTab, setSubTab] = useState<StructureSubTab>("types");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? "bg-white text-[#8127cf] shadow-sm"
                  : "text-[#4d4354]/50 hover:text-[#8127cf]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {subTab === "types" && <TypesPanel campusId={campusId} />}
      {subTab === "groups" && <GroupsPanel campusId={campusId} />}
      {subTab === "master" && <MasterPanel campusId={campusId} />}
      {subTab === "assign" && <AssignPanel campusId={campusId} />}
      {subTab === "discounts" && <DiscountsPanel campusId={campusId} />}
      {subTab === "carry" && <CarryPanel campusId={campusId} />}
      {subTab === "fines" && <FineRulesPanel campusId={campusId} />}
      {subTab === "legacy" && <LegacyStructuresTab campusId={campusId} />}
    </div>
  );
}

function LegacyStructuresTab({ campusId }: { campusId?: string }) {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch(`${API}/structure${qp}`),
        fetch(`/api/classes${qp}`),
      ]);
      const sJson = await sRes.json();
      const cJson = await cRes.json();
      if (sJson.success) setStructures(sJson.data);
      if (cJson.success) setClasses(cJson.data);
    } catch {
      toast.error("Failed to load fee structures");
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`${API}/structure/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Structure deactivated");
        loadData();
      } else {
        toast.error(json.error || "Failed to deactivate");
      }
    } catch {
      toast.error("Failed to deactivate structure");
    }
  };

  const activeStructures = structures.filter(
    (s) => !s.activeTo || new Date(s.activeTo) > new Date()
  );
  const inactiveStructures = structures.filter(
    (s) => s.activeTo && new Date(s.activeTo) <= new Date()
  );

  const assignedClassIds = new Set(activeStructures.map((s) => s.classId));
  const unassignedClasses = classes.filter((c) => !assignedClassIds.has(c.id));

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-start justify-between mb-3">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-3 w-40 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
              </div>
              <div className="flex gap-1.5">
                <div className="h-8 w-8 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
                <div className="h-8 w-8 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="rounded-xl bg-[#f3f4f9]/50 p-2">
                  <div className="h-2 w-12 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer mb-1" />
                  <div className="h-4 w-16 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]">Fee Structures</h3>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
            {activeStructures.length} active · {unassignedClasses.length} classes without fees
          </p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowModal(true); }}>
          New Structure
        </BrandButton>
      </div>

      {unassignedClasses.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-amber-700 mb-1">
            Classes Without Fee Structure
          </p>
          <p className="text-xs font-bold text-amber-800">
            {unassignedClasses.map((c) => classLabel(c.name, c.section)).join(", ")}
          </p>
        </div>
      )}

      {activeStructures.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No fee structures yet"
          description="Create your first fee structure to start managing fees."
          action={
            <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowModal(true); }}>
              Create Fee Structure
            </BrandButton>
          }
        />
      ) : (
        <div className="space-y-3">
          {activeStructures.map((fs) => (
            <StructureCard
              key={fs.id}
              structure={fs}
              onEdit={() => { setEditing(fs); setShowModal(true); }}
              onDeactivate={() => handleDeactivate(fs.id)}
            />
          ))}
        </div>
      )}

      {inactiveStructures.length > 0 && (
        <div>
          <h4 className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 mb-3">
            Inactive Structures
          </h4>
          <div className="space-y-2 opacity-60">
            {inactiveStructures.map((fs) => (
              <div key={fs.id} className="flex items-center justify-between rounded-2xl bg-[#f3f4f9]/50 px-4 py-3 border border-[#cfc2d6]/10">
                <div>
                  <p className="text-sm font-black text-[#1f1a23]">
                    {classLabel(fs.class.name, fs.class.section)}
                  </p>
                  <p className="text-[9px] font-bold text-[#4d4354]/45">
                    {formatPKR(fs.monthlyFee)}/mo · Ended {new Date(fs.activeTo!).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[9px] font-black uppercase text-gray-400 px-2 py-1 rounded-lg bg-gray-100">
                  Inactive
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <StructureModal
          campusId={campusId}
          classes={classes}
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); loadData(); }}
        />
      )}
    </div>
  );
}

function StructureCard({
  structure: fs,
  onEdit,
  onDeactivate,
}: {
  structure: FeeStructure;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const oneTimeFees = fs.oneTimeFeesJson ?? {};
  const discountRules = fs.discountRulesJson ?? {};
  const oneTimeTotal = Object.values(oneTimeFees).reduce((s, v) => s + v, 0);
  const hasExtras = Object.keys(oneTimeFees).length > 0 || Object.keys(discountRules).length > 0;

  return (
    <div className="rounded-[24px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-black text-[#1f1a23]">
            {classLabel(fs.class.name, fs.class.section)}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45 mt-0.5">
            Since {new Date(fs.activeFrom).toLocaleDateString()} · {fs.installmentType ?? "standard"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-colors cursor-pointer text-[#4d4354]/50"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-[#4d4354]/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ConfirmAction
            open={confirmOpen}
            title="Deactivate Structure"
            description={`This will deactivate the fee structure for ${classLabel(fs.class.name, fs.class.section)}. Existing invoices won't be affected.`}
            onConfirm={() => { setConfirmOpen(false); onDeactivate(); }}
            onCancel={() => setConfirmOpen(false)}
            tone="danger"
            confirmLabel="Deactivate"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-xl bg-[#fbf0fe]/50 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Monthly</p>
          <p className="text-sm font-black text-[#8127cf]">{formatPKR(fs.monthlyFee)}</p>
        </div>
        {oneTimeTotal > 0 && (
          <div className="rounded-xl bg-blue-50/50 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-[#4d4354]/40">One-Time</p>
            <p className="text-sm font-black text-blue-600">{formatPKR(oneTimeTotal)}</p>
          </div>
        )}
        <div className="rounded-xl bg-amber-50/50 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Late Fee</p>
          <p className="text-sm font-black text-amber-600">
            {fs.lateFeePercentage}%{fs.compoundLateFee ? " cpd" : ""}
          </p>
        </div>
        {(fs.taxPercentage ?? 0) > 0 && (
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Tax</p>
            <p className="text-sm font-black text-gray-600">{fs.taxPercentage}%</p>
          </div>
        )}
      </div>

      {hasExtras && (
        <div className="space-y-1.5">
          {Object.entries(oneTimeFees).map(([name, amount]) => (
            <div key={name} className="flex items-center justify-between text-[10px] font-bold text-[#4d4354]/55 px-1">
              <span>{name}</span>
              <span>{formatPKR(amount)}</span>
            </div>
          ))}
          {Object.entries(discountRules).map(([name, pct]) => (
            <div key={name} className="flex items-center justify-between text-[10px] font-bold text-emerald-600/70 px-1">
              <span>{name} discount</span>
              <span>-{pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StructureModal({
  campusId,
  classes,
  editing,
  onClose,
  onSaved,
}: {
  campusId?: string;
  classes: ClassOption[];
  editing: FeeStructure | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [classId, setClassId] = useState(editing?.classId ?? "");
  const [monthlyFee, setMonthlyFee] = useState(editing ? String(editing.monthlyFee / 100) : "");
  const [installmentType, setInstallmentType] = useState(editing?.installmentType ?? "11-month");
  const [lateFeePct, setLateFeePct] = useState(String(editing?.lateFeePercentage ?? 2.0));
  const [compoundLateFee, setCompoundLateFee] = useState(editing?.compoundLateFee ?? true);
  const [taxPct, setTaxPct] = useState(String(editing?.taxPercentage ?? 0));
  const [oneTimeFees, setOneTimeFees] = useState<{ name: string; amount: string }[]>(
    editing?.oneTimeFeesJson
      ? Object.entries(editing.oneTimeFeesJson).map(([name, amount]) => ({
          name,
          amount: String(amount / 100),
        }))
      : []
  );
  const [discountRules, setDiscountRules] = useState<{ name: string; pct: string }[]>(
    editing?.discountRulesJson
      ? Object.entries(editing.discountRulesJson).map(([name, pct]) => ({
          name,
          pct: String(pct),
        }))
      : []
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!classId || !monthlyFee) {
      toast.error("Class and monthly fee required");
      return;
    }
    setSaving(true);

    const otfObj: Record<string, number> = {};
    for (const row of oneTimeFees) {
      if (row.name.trim() && row.amount) otfObj[row.name.trim()] = Math.round(parseFloat(row.amount) * 100);
    }
    const drObj: Record<string, number> = {};
    for (const row of discountRules) {
      if (row.name.trim() && row.pct) drObj[row.name.trim()] = parseFloat(row.pct);
    }

    const payload = {
      campusId: campusId || "",
      classId,
      monthlyFee: Math.round(parseFloat(monthlyFee) * 100),
      installmentType,
      lateFeePercentage: parseFloat(lateFeePct),
      compoundLateFee,
      taxPercentage: parseFloat(taxPct),
      oneTimeFeesJson: Object.keys(otfObj).length > 0 ? JSON.stringify(otfObj) : undefined,
      discountRulesJson: Object.keys(drObj).length > 0 ? JSON.stringify(drObj) : undefined,
      activeFrom: editing
        ? new Date(editing.activeFrom).toISOString().split("T")[0]
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    };

    try {
      const url = editing ? `${API}/structure/${editing.id}` : `${API}/structure`;
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Fee structure saved");
        onSaved();
      } else {
        toast.error(json.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save fee structure");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full h-11 rounded-2xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-4 text-sm font-bold outline-none focus:border-[#8127cf]/30 transition-colors";
  const labelClass = "text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-[#1f1a23]">
            {editing ? "Edit Fee Structure" : "New Fee Structure"}
          </h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#e8e0ec] transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
              <option value="">Select class...</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Monthly Fee (PKR)</label>
              <input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder="e.g. 5000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Installment Plan</label>
              <select value={installmentType} onChange={(e) => setInstallmentType(e.target.value)} className={inputClass}>
                <option value="11-month">11 Months (Jul-May)</option>
                <option value="6-month">6 Months</option>
                <option value="quarterly">Quarterly</option>
                <option value="one-time">One Time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Late Fee %</label>
              <input type="number" step="0.1" value={lateFeePct} onChange={(e) => setLateFeePct(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Compound</label>
              <button
                type="button"
                onClick={() => setCompoundLateFee(!compoundLateFee)}
                className={`w-full h-11 rounded-2xl border px-4 text-sm font-bold transition-colors cursor-pointer ${compoundLateFee ? "border-[#8127cf]/30 bg-[#fbf0fe] text-[#8127cf]" : "border-[#cfc2d6]/20 bg-[#f3f4f9] text-[#4d4354]/50"}`}
              >
                {compoundLateFee ? "Yes" : "No"}
              </button>
            </div>
            <div>
              <label className={labelClass}>Tax %</label>
              <input type="number" step="0.1" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#cfc2d6]/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                One-Time Fees
              </p>
              <button
                type="button"
                onClick={() => setOneTimeFees([...oneTimeFees, { name: "", amount: "" }])}
                className="text-[9px] font-black uppercase text-[#8127cf] hover:underline cursor-pointer"
              >
                + Add Fee
              </button>
            </div>
            <div className="space-y-2">
              {oneTimeFees.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Fee name"
                    value={row.name}
                    onChange={(e) => {
                      const copy = [...oneTimeFees];
                      copy[i] = { ...copy[i], name: e.target.value };
                      setOneTimeFees(copy);
                    }}
                    className="flex-1 h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-xs font-bold outline-none focus:border-[#8127cf]/30"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={row.amount}
                    onChange={(e) => {
                      const copy = [...oneTimeFees];
                      copy[i] = { ...copy[i], amount: e.target.value };
                      setOneTimeFees(copy);
                    }}
                    className="w-28 h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-xs font-bold outline-none focus:border-[#8127cf]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setOneTimeFees(oneTimeFees.filter((_, j) => j !== i))}
                    className="h-9 w-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {oneTimeFees.length === 0 && (
                <p className="text-[10px] font-semibold text-[#4d4354]/30 italic">
                  e.g. Admission Fee, Lab Fee, Books
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#cfc2d6]/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                Discount Rules
              </p>
              <button
                type="button"
                onClick={() => setDiscountRules([...discountRules, { name: "", pct: "" }])}
                className="text-[9px] font-black uppercase text-[#8127cf] hover:underline cursor-pointer"
              >
                + Add Discount
              </button>
            </div>
            <div className="space-y-2">
              {discountRules.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Discount name"
                    value={row.name}
                    onChange={(e) => {
                      const copy = [...discountRules];
                      copy[i] = { ...copy[i], name: e.target.value };
                      setDiscountRules(copy);
                    }}
                    className="flex-1 h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-xs font-bold outline-none focus:border-[#8127cf]/30"
                  />
                  <div className="relative w-24">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="%"
                      value={row.pct}
                      onChange={(e) => {
                        const copy = [...discountRules];
                        copy[i] = { ...copy[i], pct: e.target.value };
                        setDiscountRules(copy);
                      }}
                      className="w-full h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 pr-7 text-xs font-bold outline-none focus:border-[#8127cf]/30"
                    />
                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4d4354]/30" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscountRules(discountRules.filter((_, j) => j !== i))}
                    className="h-9 w-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {discountRules.length === 0 && (
                <p className="text-[10px] font-semibold text-[#4d4354]/30 italic">
                  e.g. Sibling 10%, Staff Child 25%
                </p>
              )}
            </div>
          </div>

          <BrandButton className="w-full h-12" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {saving ? "Saving..." : editing ? "Update Structure" : "Create Structure"}
          </BrandButton>
        </div>
      </div>
    </div>
  );
}
