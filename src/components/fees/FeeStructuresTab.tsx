"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { UiText, useUiText, useLocaleFormat, useLocale } from "@/components/locale/LocaleProvider";
import { getFinancialLocale } from "@/app/actions/locale";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useState, useRef } from "react";
import {
  Archive,
  BookOpen,
  Edit3,
  MoreHorizontal,
  Loader2,
  Percent,
  Plus,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Modal } from "@/components/ui/modal";
import { Menu } from "@/components/ui/menu";
import { IconButton } from "@/components/ui/icon-button";
import { checkedJson, readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionPicker, UiSentence } from "@/components/operations/console-page";
import { TypesPanel, GroupsPanel, MasterPanel, AssignPanel, DiscountsPanel, CarryPanel, FineRulesPanel } from "./FeeLayersTab";
import type { ClassOption, FeeStructure, PanelCommand } from "./fee-types";
import { API, classLabel, formatPKR, forwardCommand, paisaToRupees, rupeesToPaisa, usePanelCommand } from "./fee-utils";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";

export type StructureSubTab = "types" | "groups" | "master" | "assign" | "discounts" | "carry" | "fines" | "legacy";

/** Fee setup sections, in the order a school sets them up (also the accountant's PageHeader tabs). */
export const FEE_SETUP_TABS: { id: StructureSubTab; label: string }[] = [
  { id: "types", label: "Fee types" },
  { id: "groups", label: "Fee groups" },
  { id: "master", label: "Amounts" },
  { id: "assign", label: "Class groups" },
  { id: "discounts", label: "Discounts" },
  { id: "carry", label: "Carry forward" },
  { id: "fines", label: "Fine rules" },
  { id: "legacy", label: "Class structures" },
];

/**
 * The section a `?tab=` value opens. `layers` (the registry alias for the retired Fee layers view, M75) opens the
 * first layer and `structures` the per-class structures; the console rewrites the URL to the section it opened.
 */
export function feeSetupSection(tab: string | null | undefined): StructureSubTab {
  const requested = tab === "layers" ? "types" : tab === "structures" ? "legacy" : tab;
  return FEE_SETUP_TABS.some((item) => item.id === requested) ? (requested as StructureSubTab) : "types";
}

/** The PageHeader primary for each Fee setup section (role-ux §4.4b; EN UI keys). */
export const FEE_SETUP_CREATE: Record<StructureSubTab, string> = {
  types: "New fee type",
  groups: "New fee group",
  master: "Add an amount",
  assign: "Assign a fee group",
  discounts: "New discount",
  carry: "New carry-forward",
  fines: "New fine rule",
  legacy: "New fee structure",
};

/**
 * Fee setup — the one place fee types, groups, amounts, discounts, carry-forward, fine rules and per-class
 * structures are kept (role-ux M75: the separate "Fee Layers" view duplicated these panels and is retired;
 * `?tab=layers` opens the first layer). `tab`/`onTabChange` let a console persist the section as `?tab=`.
 * `command` "create" runs the open section's create action from the console's PageHeader, and `hideCreate`
 * removes the sections' own create buttons so the screen keeps one primary (labels: `FEE_SETUP_CREATE`).
 */
export function FeeStructuresTab({ campusId, tab, onTabChange, command, hideCreate = false, sectionNav = "picker" }: { campusId?: string; tab?: string | null; onTabChange?: (tab: StructureSubTab) => void; command?: PanelCommand | null; hideCreate?: boolean; sectionNav?: "picker" | "none" }) {
  const [localTab, setLocalTab] = useState<StructureSubTab>("types");
  const subTab: StructureSubTab = onTabChange || tab ? feeSetupSection(tab) : localTab;
  // The header command goes to the open section only; changing section drops it so no section replays it.
  const [forwarded, setForwarded] = useState<{ section: StructureSubTab; command: PanelCommand } | null>(null);
  const select = (next: StructureSubTab) => { setLocalTab(next); onTabChange?.(next); setForwarded(null); };
  usePanelCommand(command, { create: () => { const copy = forwardCommand(command); setForwarded(copy ? { section: subTab, command: copy } : null); } });
  const panel = { campusId, command: forwarded?.section === subTab ? forwarded.command : null, hideCreate };

  return (
    <div className="space-y-5">
      {/* One tab row per screen (§3.1): the console renders these sections as its PageHeader tabs ("none"); under
          another tab row they are a section picker. */}
      {sectionNav === "picker" ? <SectionPicker label="Fee setup section" items={FEE_SETUP_TABS} value={subTab} onChange={select} /> : null}

      {subTab === "types" && <TypesPanel {...panel} />}
      {subTab === "groups" && <GroupsPanel {...panel} />}
      {subTab === "master" && <MasterPanel {...panel} />}
      {subTab === "assign" && <AssignPanel {...panel} />}
      {subTab === "discounts" && <DiscountsPanel {...panel} />}
      {subTab === "carry" && <CarryPanel {...panel} />}
      {subTab === "fines" && <FineRulesPanel {...panel} />}
      {subTab === "legacy" && <LegacyStructuresTab {...panel} />}
    </div>
  );
}

function LegacyStructuresTab({ campusId, command, hideCreate = false }: { campusId?: string; command?: PanelCommand | null; hideCreate?: boolean }) {
  const { money: formatPKR, date } = useLocaleFormat();
  const tr = useUiText();
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const loadData = useCallback(async () => {
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const [sRes, cRes] = await Promise.all([
        readRequest(`${API}/structure${qp}`),
        readRequest(`/api/classes${qp}`),
      ]);
      const sJson = await checkedJson(sRes);
      const cJson = await checkedJson(cRes);
      if (loadVersion !== loadSequence.current) return;
      if (sJson.success) setStructures(sJson.data);
      else throw new Error("Invalid result");
      if (cJson.success) setClasses(cJson.data);
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
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
        toast.success(tr(json.message || "Structure deactivated"));
        loadData();
        return true;
      } else {
        toast.error(tr(json.error || "Failed to deactivate"));
      }
    } catch {
      toast.error(tr("Failed to deactivate structure"));
    }
    return false;
  };

  const activeStructures = structures.filter(
    (s) => !s.activeTo || new Date(s.activeTo) > new Date()
  );
  const inactiveStructures = structures.filter(
    (s) => s.activeTo && new Date(s.activeTo) <= new Date()
  );

  const assignedClassIds = new Set(activeStructures.map((s) => s.classId));
  const unassignedClasses = classes.filter((c) => !assignedClassIds.has(c.id));
  usePanelCommand(command, { create: () => { setEditing(null); setShowModal(true); } }, !loading);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="sk-panel p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-start justify-between mb-3">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                <div className="h-3 w-40 rounded-full bg-border-subtle/40 skeleton-shimmer" />
              </div>
              <div className="flex gap-1.5">
                <div className="h-8 w-8 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
                <div className="h-8 w-8 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="rounded-xl bg-muted/50 p-2">
                  <div className="h-2 w-12 rounded-full bg-border-subtle/40 skeleton-shimmer mb-1" />
                  <div className="h-4 w-16 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadFailed) {
    return <ErrorState error={loadFailed} title={tr("Fee structures could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void loadData()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Fee structures"}</UiText></h3>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
            <UiSentence text="{0} active · {1} classes without fees" values={[activeStructures.length, unassignedClasses.length]} /></p>
        </div>
        {hideCreate ? null : <Button onClick={() => { setEditing(null); setShowModal(true); }}><Plus className="size-4" aria-hidden="true" /><UiText>{"New fee structure"}</UiText></Button>}
      </div>

      {unassignedClasses.length > 0 && (
        <Alert tone="warning" live="off" compact title={tr("Classes without fee structure")}>
            {unassignedClasses.map((c) => classLabel(c.name, c.section)).join(", ")}
          </Alert>
      )}

      {activeStructures.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={tr("No fee structures yet")}
          description={tr("Create your first fee structure to start managing fees.")}
          action={
            <Button onClick={() => { setEditing(null); setShowModal(true); }}><Plus className="size-4" aria-hidden="true" /><UiText>{"New fee structure"}</UiText></Button>
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
          <h4 className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-3"><UiText>{"Inactive structures"}</UiText></h4>
          <div className="space-y-2 opacity-60">
            {inactiveStructures.map((fs) => (
              <div key={fs.id} className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 border border-edge/10">
                <div>
                  <p className="text-sm font-bold text-ink-strong">
                    {classLabel(fs.class.name, fs.class.section)}
                  </p>
                  <p className="text-2xs font-medium text-ink-subtle tabular-nums">
                    {formatPKR(fs.monthlyFee, fs.currency)}<UiText>{"/mo · Ended"}</UiText>{" "}{date(fs.activeTo!)}
                  </p>
                </div>
                <Badge variant="neutral" size="sm" dot><UiText>{"Inactive"}</UiText></Badge>
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
  onDeactivate: () => Promise<boolean>;
}) {
  const { money: formatPKR, date } = useLocaleFormat();
  const tr = useUiText();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const oneTimeFees = fs.oneTimeFeesJson ?? {};
  const discountRules = fs.discountRulesJson ?? {};
  const oneTimeTotal = Object.values(oneTimeFees).reduce((s, v) => s + v, 0);
  const hasExtras = Object.keys(oneTimeFees).length > 0 || Object.keys(discountRules).length > 0;

  return (
    <div className="sk-panel p-5 transition-all hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-ink-strong">
            {classLabel(fs.class.name, fs.class.section)}
          </p>
          <p className="text-2xs font-semibold tracking-wide text-ink-subtle mt-0.5"><UiText>{"Since"}</UiText>{" "}{date(fs.activeFrom)} · {fs.installmentType ?? tr("Standard")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Row overflow (role-ux §4.4b Fee setup: Archive in the overflow, behind ConfirmAction). */}
          <Menu
            label="More actions"
            items={[
              { id: "edit", label: "Edit", icon: Edit3, onSelect: onEdit },
              { id: "deactivate", label: "Deactivate", icon: Archive, tone: "danger", onSelect: () => setConfirmOpen(true) },
            ]}
            trigger={<IconButton variant="ghost" label={tr("More actions")}><MoreHorizontal aria-hidden="true" /></IconButton>}
          />
          <ConfirmAction
            open={confirmOpen}
            title={tr("Deactivate this fee structure?")}
            description={tr("This will deactivate the fee structure for {0}. Existing invoices won't be affected.", [classLabel(fs.class.name, fs.class.section)])}
            onConfirm={async () => { if (await onDeactivate()) setConfirmOpen(false); }}
            onCancel={() => setConfirmOpen(false)}
            tone="danger"
            confirmLabel={tr("Deactivate")}
            cancelLabel={tr("Keep editing")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-xl bg-brand-50/50 px-3 py-2">
          <p className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Monthly"}</UiText></p>
          <p className="text-sm font-bold text-primary">{formatPKR(fs.monthlyFee, fs.currency)}</p>
        </div>
        {oneTimeTotal > 0 && (
          <div className="rounded-xl bg-status-info-surface px-3 py-2">
            <p className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"One-Time"}</UiText></p>
            <p className="text-sm font-bold text-status-info-text">{formatPKR(oneTimeTotal, fs.currency)}</p>
          </div>
        )}
        <div className="rounded-xl bg-status-warning-surface px-3 py-2">
          <p className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Late fee"}</UiText></p>
          <p className="text-sm font-bold text-status-warning-text">
            {fs.lateFeePercentage}%{fs.compoundLateFee ? tr(" cpd") : ""}
          </p>
        </div>
        {(fs.taxPercentage ?? 0) > 0 && (
          <div className="rounded-xl bg-surface-subtle px-3 py-2">
            <p className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Tax"}</UiText></p>
            <p className="text-sm font-bold text-ink-muted">{fs.taxPercentage}%</p>
          </div>
        )}
      </div>

      {hasExtras && (
        <div className="space-y-1.5">
          {Object.entries(oneTimeFees).map(([name, amount]) => (
            <div key={name} className="flex items-center justify-between text-2xs font-bold text-ink-muted px-1">
              <span>{name}</span>
              <span>{formatPKR(amount, fs.currency)}</span>
            </div>
          ))}
          {Object.entries(discountRules).map(([name, pct]) => (
            <div key={name} className="flex items-center justify-between text-2xs font-bold text-status-success-text px-1">
              <span><UiSentence text="{0} discount" values={[name]} /></span>
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
  const tr = useUiText();
  // The school's currency from the locale package, refined to the chosen campus's; a failed refinement keeps the
  // school's currency (no toast for a background read, R4).
  const schoolCurrency = useLocale().currency;
  const [currency, setCurrency] = useState<string>(editing?.currency || schoolCurrency);
  useEffect(() => { if (!editing) void getFinancialLocale(campusId).then((policy) => setCurrency(policy.currency)).catch(() => undefined); }, [campusId, editing]);
  const [classId, setClassId] = useState(editing?.classId ?? "");
  const [monthlyFee, setMonthlyFee] = useState(editing ? String(paisaToRupees(editing.monthlyFee, editing.currency)) : "");
  const [installmentType, setInstallmentType] = useState(editing?.installmentType ?? "11-month");
  const [lateFeePct, setLateFeePct] = useState(String(editing?.lateFeePercentage ?? 2.0));
  const [compoundLateFee, setCompoundLateFee] = useState(editing?.compoundLateFee ?? true);
  const [taxPct, setTaxPct] = useState(String(editing?.taxPercentage ?? 0));
  const [oneTimeFees, setOneTimeFees] = useState<{ name: string; amount: string }[]>(
    editing?.oneTimeFeesJson
      ? Object.entries(editing.oneTimeFeesJson).map(([name, amount]) => ({
          name,
          amount: String(paisaToRupees(amount, editing.currency)),
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
    if (!classId || !monthlyFee || !currency) {
      toast.error(tr("Class and monthly fee required"));
      return;
    }
    setSaving(true);

    const otfObj: Record<string, number> = {};
    for (const row of oneTimeFees) {
      if (row.name.trim() && row.amount) otfObj[row.name.trim()] = rupeesToPaisa(row.amount, currency);
    }
    const drObj: Record<string, number> = {};
    for (const row of discountRules) {
      if (row.name.trim() && row.pct) drObj[row.name.trim()] = parseFloat(row.pct);
    }

    const payload = {
      currency,
      campusId: campusId || "",
      classId,
      monthlyFee: rupeesToPaisa(monthlyFee, currency),
      installmentType,
      lateFeePercentage: parseFloat(lateFeePct),
      compoundLateFee,
      taxPercentage: parseFloat(taxPct),
      oneTimeFeesJson: Object.keys(otfObj).length > 0 ? JSON.stringify(otfObj) : undefined,
      discountRulesJson: Object.keys(drObj).length > 0 ? JSON.stringify(drObj) : undefined,
      activeFrom: editing
        ? new Date(editing.activeFrom).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
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
        toast.success(tr(json.message || "Fee structure saved"));
        onSaved();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save fee structure"));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full";
  const labelClass = "text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1";

  return (
    <Modal
      title={editing ? tr("Edit fee structure") : tr("New fee structure")}
      eyebrow={tr("Fees")}
      subtitle={tr("Sets what a class is billed each cycle, plus any standing discounts.")}
      icon={editing ? Edit3 : Plus}
      size="sm"
      onClose={onClose}
      footer={
        <BrandButton className="w-full h-12" onClick={handleSave} disabled={saving} aria-busy={saving || undefined}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : editing ? <Edit3 className="w-4 h-4" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
          {saving ? tr("Saving...") : editing ? tr("Update structure") : tr("Create structure")}
        </BrandButton>
      }
    >
        <div className="space-y-4">
          <label>
            <span className={labelClass}><UiText>{"Class"}</UiText></span>
            <SystemSelect value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
              <option value=""><UiText>{"Select class..."}</UiText></option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
              ))}
            </SystemSelect>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelClass}>{tr("Monthly fee")} (<bdi>{currency}</bdi>)</span>
              <SystemInput type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder={tr("e.g. 5000")} className={inputClass} />
            </label>
            <label>
              <span className={labelClass}><UiText>{"Installment plan"}</UiText></span>
              <SystemSelect value={installmentType} onChange={(e) => setInstallmentType(e.target.value)} className={inputClass}>
                <option value="11-month"><UiText>{"11 Months (Jul-May)"}</UiText></option>
                <option value="6-month"><UiText>{"6 Months"}</UiText></option>
                <option value="quarterly"><UiText>{"Quarterly"}</UiText></option>
                <option value="one-time"><UiText>{"One time"}</UiText></option>
              </SystemSelect>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label>
              <span className={labelClass}><UiText>{"Late fee %"}</UiText></span>
              <SystemInput type="number" step="0.1" value={lateFeePct} onChange={(e) => setLateFeePct(e.target.value)} className={inputClass} />
            </label>
            <div>
              <label className={labelClass}><UiText>{"Compound"}</UiText></label>
              <Button aria-pressed={compoundLateFee} variant="choice"
                type="button"
                onClick={() => setCompoundLateFee(!compoundLateFee)}
                className={`w-full h-11 px-4 ${""} `}
              >
                {compoundLateFee ? tr("Yes") : tr("No")}
              </Button>
            </div>
            <label>
              <span className={labelClass}><UiText>{"Tax %"}</UiText></span>
              <SystemInput type="number" step="0.1" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className={inputClass} />
            </label>
          </div>

          <div className="rounded-2xl border border-edge/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"One-Time Fees"}</UiText></p>
              <Button variant="link"
                type="button"
                onClick={() => setOneTimeFees([...oneTimeFees, { name: "", amount: "" }])}
                className="hover:underline"
              ><UiText>{"+ Add Fee"}</UiText></Button>
            </div>
            <div className="space-y-2">
              {oneTimeFees.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <SystemInput
                    type="text"
                    placeholder={tr("Fee name")}
                    value={row.name}
                    onChange={(e) => {
                      const copy = [...oneTimeFees];
                      copy[i] = { ...copy[i], name: e.target.value };
                      setOneTimeFees(copy);
                    }}
                    className="flex-1"
                  />
                  <SystemInput
                    type="number"
                    placeholder={tr("Amount")}
                    value={row.amount}
                    onChange={(e) => {
                      const copy = [...oneTimeFees];
                      copy[i] = { ...copy[i], amount: e.target.value };
                      setOneTimeFees(copy);
                    }}
                    className="w-28"
                  />
                  <Button aria-label={tr("Remove one-time fee")} variant="secondary" size="icon"
                    type="button"
                    onClick={() => setOneTimeFees(oneTimeFees.filter((_, j) => j !== i))}
                    className="flex items-center justify-center shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {oneTimeFees.length === 0 && (
                <p className="text-2xs font-semibold text-ink-subtle italic"><UiText>{"e.g. Admission Fee, Lab Fee, Books"}</UiText></p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-edge/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Discount rules"}</UiText></p>
              <Button variant="link"
                type="button"
                onClick={() => setDiscountRules([...discountRules, { name: "", pct: "" }])}
                className="hover:underline"
              ><UiText>{"+ Add Discount"}</UiText></Button>
            </div>
            <div className="space-y-2">
              {discountRules.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <SystemInput
                    type="text"
                    placeholder={tr("Discount name")}
                    value={row.name}
                    onChange={(e) => {
                      const copy = [...discountRules];
                      copy[i] = { ...copy[i], name: e.target.value };
                      setDiscountRules(copy);
                    }}
                    className="flex-1"
                  />
                  <InputGroup surfaceClassName="bg-muted" className="relative w-24">
                    <SystemInput
                      type="number"
                      step="0.5"
                      placeholder="%"
                      value={row.pct}
                      onChange={(e) => {
                        const copy = [...discountRules];
                        copy[i] = { ...copy[i], pct: e.target.value };
                        setDiscountRules(copy);
                      }}
                      className="w-full pe-7"
                    />
                    <Percent data-field-affix="end" className="absolute end-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-subtle" />
                  </InputGroup>
                  <Button aria-label={tr("Remove discount rule")} variant="secondary" size="icon"
                    type="button"
                    onClick={() => setDiscountRules(discountRules.filter((_, j) => j !== i))}
                    className="flex items-center justify-center shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {discountRules.length === 0 && (
                <p className="text-2xs font-semibold text-ink-subtle italic"><UiText>{"e.g. Sibling 10%, Staff Child 25%"}</UiText></p>
              )}
            </div>
          </div>

        </div>
    </Modal>
  );
}
