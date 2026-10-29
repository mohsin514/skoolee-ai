"use client";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { UiText, useUiText, useLocaleFormat, useLocale } from "@/components/locale/LocaleProvider";
import { getFinancialLocale } from "@/app/actions/locale";
import { CurrencySelect } from "@/components/locale/CurrencySelect";

import { useCallback, useEffect, useState, useRef } from "react";
import { BookOpen, Check, Layers, MoreHorizontal, Pencil, Percent, Plus, Tag, Timer, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";
import { checkedJson, readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState as SharedErrorState } from "@/components/ui/error-state";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { ReviewedDelete, ReviewedDeleteDialog } from "@/components/ui/reviewed-delete";
import { ModalActions, FormInput, FormSelect } from "@/components/shared-admin";
import { Modal } from "@/components/ui/modal";
import { Menu, type MenuItem } from "@/components/ui/menu";
import type {
  PanelCommand,
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
import { API, classLabel, formatPKR, rupeesToPaisa, paisaToRupees, usePanelCommand } from "./fee-utils";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";
import { readApiData } from "@/lib/api/envelope-client";

const inputClass = "w-full";
const labelClass = "block mb-2 ps-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle";

export { TypesPanel, GroupsPanel, MasterPanel, AssignPanel, DiscountsPanel, CarryPanel };

/**
 * Every fee-setup panel takes the console's header command "create" (role-ux §4.4b accountant · Fee setup: the
 * section's create action is the PageHeader primary). `hideCreate` drops the panel's own create button so the
 * screen keeps one primary; the empty state may still repeat it (§4.5.7). A command that cannot run yet says why.
 */
export type FeeSetupPanelProps = { campusId?: string; command?: PanelCommand | null; hideCreate?: boolean };

/* ── Types ─────────────────────────────────────────────── */

function TypesPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
  const tr = useUiText();
  const [types, setTypes] = useState<FeeTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeTypeRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FeeTypeRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const res = await readRequest(`${API}/types${qp}`);
      const json = await checkedJson(res);
      if (loadVersion !== loadSequence.current) return;
      if (json.success) setTypes(json.data);
      else throw new Error("Invalid result");
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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

  usePanelCommand(command, { create: () => openModal(null) }, !loading);

  if (loading) {
    return <SkeletonRows />;
  }
  if (loadFailed) {
    return <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Fee types"}</UiText></h3>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Reusable fee heads such as tuition, admission, lab and books."}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New fee type"}</UiText></BrandButton>}
      </div>

      {types.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={tr("No fee types yet")}
          description={tr("Create fee heads first — groups then price them in Amounts.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New fee type"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-2.5">
          {types.map((t) => (
            <div key={t.id} className="sk-panel flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink-strong">{t.name}</p>
                <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                  <span dir="ltr">{t.code}</span> · {tr("Amounts: {0}", [t._count?.masters ?? 0])}{t.description ? <> · <bdi>{t.description}</bdi></> : null}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <RowMenu onEdit={() => openModal(t)} onDelete={() => setDeleting(t)} />
                {deleting?.id === t.id ? <ReviewedDeleteDialog endpoint="fees/types" record={{ id: t.id, campusId }} label={t.name} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit fee type") : tr("New fee type")} eyebrow={tr("Fee setup · Fee types")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Monthly Tuition")} onChange={setName} />
            <FormInput label={tr("Code")} value={code} placeholder={tr("e.g. MONTHLY_TUITION")} onChange={setCode} />
            <FormInput label={tr("Description (optional)")} value={description} placeholder={tr("e.g. Standard monthly tuition")} onChange={setDescription} />
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={editing ? tr("Save changes") : tr("Create fee type")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Groups ────────────────────────────────────────────── */

function GroupsPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [groups, setGroups] = useState<FeeGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeGroupRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FeeGroupRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const res = await readRequest(`${API}/groups${qp}`);
      const json = await checkedJson(res);
      if (loadVersion !== loadSequence.current) return;
      if (json.success) setGroups(json.data);
      else throw new Error("Invalid result");
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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

  usePanelCommand(command, { create: () => openModal(null) }, !loading);

  if (loading) {
    return <SkeletonRows />;
  }
  if (loadFailed) {
    return <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Fee groups"}</UiText></h3>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Bundles of fee types for a class; set their amounts under Amounts."}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New fee group"}</UiText></BrandButton>}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={tr("No fee groups yet")}
          description={tr("Create a group like 'Legacy — Grade 1' or 'Day Scholar Package'.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New fee group"}</UiText></BrandButton>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {groups.map((g) => {
            const lineTotal = g.lines.reduce((s, l) => s + l.amount, 0);
            return (
              <div key={g.id} className="sk-panel p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-ink-strong"><bdi>{g.name}</bdi></p>
                    <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                      {tr("Amounts: {0} · Classes: {1}", [g.lines.length, g.assignments.length])}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RowMenu onEdit={() => openModal(g)} onDelete={() => setDeleting(g)} />
                    {deleting?.id === g.id ? <ReviewedDeleteDialog endpoint="fees/groups" record={{ id: g.id, campusId }} label={g.name} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
                  </div>
                </div>
                <div className="rounded-xl bg-brand-50/50 px-3 py-2 flex items-center justify-between">
                  <p className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Bundled value"}</UiText></p>
                  <p className="text-sm font-bold text-primary">{formatPKR(lineTotal, g.currency)}</p>
                </div>
                {g.description && (
                  <p className="text-2xs font-semibold text-ink-subtle mt-2 px-1">{g.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit fee group") : tr("New fee group")} eyebrow={tr("Fee setup · Fee groups")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Day Scholar Package")} onChange={setName} />
            <FormInput label={tr("Description (optional)")} value={description} placeholder={tr("e.g. Tuition + books + lab")} onChange={setDescription} />
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={editing ? tr("Save changes") : tr("Create fee group")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Master (priced lines) ─────────────────────────────── */

function MasterPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [groups, setGroups] = useState<FeeGroupRow[]>([]);
  const [types, setTypes] = useState<FeeTypeRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MasterLineRow | null>(null);
  const [feeTypeId, setFeeTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MasterLineRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const [gRes, tRes] = await Promise.all([readRequest(`${API}/groups${qp}`), readRequest(`${API}/types${qp}`)]);
      const [gJson, tJson] = await Promise.all([checkedJson(gRes), checkedJson(tRes)]);
      if (loadVersion !== loadSequence.current) return;
      if (gJson.success) setGroups(gJson.data);
      else throw new Error("Invalid result");
      if (tJson.success) setTypes(tJson.data);
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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

  usePanelCommand(command, {
    create: () => {
      if (!selectedGroup) toast.info(tr("Select a fee group first, then add its amounts."));
      else if (types.length === 0) toast.info(tr("Create a fee type first."));
      else openModal(null);
    },
  }, !loading);

  if (loading) {
    return <SkeletonRows />;
  }
  if (loadFailed) {
    return <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <label className="w-full sm:max-w-xs">
          <span className={labelClass}><UiText>{"Fee group"}</UiText></span>
          <SystemSelect value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} className="w-full">
            <option value=""><UiText>{"Select a group..."}</UiText></option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </SystemSelect>
        </label>
        {selectedGroup && !hideCreate && (
          <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)} disabled={types.length === 0}><UiText>{"Add an amount"}</UiText></BrandButton>
        )}
      </div>

      {!selectedGroup ? (
        <EmptyState icon={BookOpen} title={tr("Pick a fee group")} description={tr("Select a group above to see its priced lines.")} />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              <bdi>{selectedGroup.name}</bdi> · {tr("Amounts: {0}", [selectedGroup.lines.length])}</p>
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary">
              {tr("Total {0}", [formatPKR(selectedGroup.lines.reduce((s, l) => s + l.amount, 0), selectedGroup.currency)])}</p>
          </div>
          {selectedGroup.lines.length === 0 ? (
            <EmptyState icon={BookOpen} title={tr("No lines yet")} description={tr("Price the first fee type in this group.")} />
          ) : (
            selectedGroup.lines.map((line) => (
              <div key={line.id} className="sk-panel flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-ink-strong">{line.feeType?.name ?? tr("Unknown")}</p>
                  <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                    {line.feeType?.code}
                    {line.dueDate ? tr(" · due {0}", [new Date(line.dueDate).toLocaleDateString()]) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-primary">{formatPKR(line.amount, selectedGroup?.currency)}</p>
                  <RowMenu onEdit={() => openModal(line)} onDelete={() => setDeleting(line)} />
                  {deleting?.id === line.id ? <ReviewedDeleteDialog endpoint="fees/master-lines" record={{ id: line.id, campusId }} label={line.feeType?.name ?? tr("This fee type")} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && selectedGroup && (
        <Modal title={editing ? tr("Edit amount") : tr("Add an amount")} eyebrow={`${tr("Fee setup")} · ${selectedGroup.name}`} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormSelect label={tr("Fee type")} value={feeTypeId} onChange={setFeeTypeId}>
              <option value=""><UiText>{"Select fee type..."}</UiText></option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
              ))}
            </FormSelect>
            <FormInput label={`${tr("Amount")} (${selectedGroup.currency})`} type="number" value={amount} placeholder={tr("e.g. 5000")} onChange={setAmount} />
            <FormInput label={tr("Due date (optional)")} type="date" value={dueDate} placeholder="" onChange={setDueDate} />
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={editing ? tr("Save changes") : tr("Add amount")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Assign ────────────────────────────────────────────── */

function AssignPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
  const tr = useUiText();
  const [assignments, setAssignments] = useState<GroupAssignmentRow[]>([]);
  const [groups, setGroups] = useState<FeeGroupRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
  const [showModal, setShowModal] = useState(false);
  const [feeGroupId, setFeeGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<GroupAssignmentRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const [aRes, gRes, cRes] = await Promise.all([
        readRequest(`${API}/assignments${qp}`),
        readRequest(`${API}/groups${qp}`),
        readRequest(`/api/classes${qp}`),
      ]);
      const [aJson, gJson, cJson] = await Promise.all([checkedJson(aRes), checkedJson(gRes), checkedJson(cRes)]);
      if (loadVersion !== loadSequence.current) return;
      if (aJson.success) setAssignments(aJson.data);
      if (gJson.success) setGroups(gJson.data);
      if (cJson.success) setClasses(cJson.data);
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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

  usePanelCommand(command, {
    create: () => {
      if (groups.length === 0) toast.info(tr("Create a fee group first."));
      else if (classes.length === 0) toast.info(tr("Add a class before assigning a fee group."));
      else setShowModal(true);
    },
  }, !loading);

  if (loading) {
    return <SkeletonRows />;
  }
  if (loadFailed) {
    return <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Class groups"}</UiText></h3>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Which fee group serves each class, per academic year"}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)} disabled={groups.length === 0 || classes.length === 0}><UiText>{"Assign a fee group"}</UiText></BrandButton>}
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={Check} title={tr("No assignments yet")} description={tr("Assign a fee group to a class for the current year.")} />
      ) : (
        <div className="space-y-2.5">
          {assignments.map((a) => (
            <div key={a.id} className="sk-panel flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink-strong">
                  {a.class ? classLabel(a.class.name, a.class.section) : tr("Unknown class")}
                </p>
                <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                  {a.feeGroup?.name} · {a.academicYear}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <RowMenu onDelete={() => setDeleting(a)} deleteLabel="Remove" />
                {deleting?.id === a.id ? <ReviewedDeleteDialog endpoint="fees/assignments" record={{ id: a.id, campusId }} label={a.feeGroup?.name ?? tr("This fee group")} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={tr("Assign a fee group")} eyebrow={tr("Fee setup · Class groups")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormSelect label={tr("Fee group")} value={feeGroupId} onChange={setFeeGroupId}>
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
            <FormInput label={tr("Academic year")} type="number" value={academicYear} placeholder="2026" onChange={setAcademicYear} />
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={tr("Assign")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Discounts ─────────────────────────────────────────── */

function DiscountsPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  // Starts in the campus currency (locale package) and follows the financial policy once it loads (R7).
  const [currency, setCurrency] = useState<string>(useLocale().currency);
  useEffect(() => { void getFinancialLocale(campusId).then((policy) => setCurrency(policy.currency)).catch(() => {}); }, [campusId]);
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
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
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const [dRes, cRes] = await Promise.all([
        readRequest(`${API}/discounts${qp}`),
        readRequest(`/api/student-categories${qp}`),
      ]);
      const [dJson, cJson] = await Promise.all([checkedJson(dRes), checkedJson(cRes)]);
      if (loadVersion !== loadSequence.current) return;
      if (dJson.success) setDiscounts(dJson.data);
      setCategories(readApiData(cJson, []));
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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


  // A failed load stays in the dialog with a retry (R4: load failures are never a toast).
  const [assignFailed, setAssignFailed] = useState(false);
  const openAssign = async (row: FeeDiscountRow) => {
    setAssigning(row);
    setSearch("");
    setAssignFailed(false);
    try {
      const [sRes, aRes] = await Promise.all([
        fetch(`/api/students${qp ? `${qp}&` : "?"}pageSize=1000`),
        fetch(`${API}/discount-assignments?discountId=${row.id}`),
      ]);
      const [sJson, aJson] = await Promise.all([sRes.json(), aRes.json()]);
      if (sJson.success) setStudents(sJson.data);
      if (aJson.success) setAssigned(aJson.data);
      if (!sJson.success || !aJson.success) setAssignFailed(true);
    } catch {
      setAssignFailed(true);
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

  const refreshAssignments = async () => {
    if (!assigning) return;
    try {
      const response = await fetch(`${API}/discount-assignments?discountId=${assigning.id}`);
      const result = await response.json();
      if (response.ok && result.success) setAssigned(result.data);
      else toast.error(tr("Check your connection and try again."));
    } catch {
      toast.error(tr("Check your connection and try again."));
    }
    load();
  };

  usePanelCommand(command, { create: () => openModal(null) }, !loading);

  if (loading) {
    return <SkeletonRows />;
  }
  if (loadFailed) {
    return <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Discounts"}</UiText></h3>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{tr("Flat amount")} (<bdi>{currency}</bdi>) / {tr("Percent (max 100)")}</p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New discount"}</UiText></BrandButton>}
      </div>

      {discounts.length === 0 ? (
        <EmptyState icon={Percent} title={tr("No discounts yet")} description={tr("Create discounts to apply to students or whole categories.")} />
      ) : (
        <div className="space-y-2.5">
          {discounts.map((d) => (
            <div key={d.id} className="sk-panel flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink-strong">{d.name}</p>
                <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                  {d.code} · {d.type === "PERCENT" ? `${d.value}%` : formatPKR(d.value, d.currency)}
                  {d.category ? tr(" · auto: {0}", [d.category.name]) : ""} · {tr("Students: {0}", [d._count?.assignments ?? 0])}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" type="button" onClick={() => openAssign(d)} className="justify-start px-2.5 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /><UiText>{"Assign"}</UiText></Button>
                <RowMenu onEdit={() => openModal(d)} onDelete={() => setDeleting(d)} />
                {deleting?.id === d.id ? <ReviewedDeleteDialog endpoint="fees/discounts" record={{ id: d.id, campusId }} label={d.name} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit discount") : tr("New discount")} eyebrow={tr("Fee setup · Discounts")} onClose={() => setShowModal(false)}>
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
            <p className="-mt-2 text-xs text-ink-subtle">{type === "PERCENT" ? tr("Percent discounts take this share off the fee, up to 100%.") : tr("Flat discounts take this fixed amount off the fee.")}</p>
            <FormSelect label={tr("Auto-apply category (optional)")} value={categoryId} onChange={setCategoryId}>
              <option value=""><UiText>{"No category"}</UiText></option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </FormSelect>
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={editing ? tr("Save changes") : tr("Create discount")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}

      {assigning && (
        <Modal title={tr("Assign: {0}", [assigning.name])} eyebrow={tr("Fee setup · Discounts")} onClose={() => setAssigning(null)} wide>
          {assignFailed ? (
            <SharedErrorState title={tr("Students for this discount could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void openAssign(assigning)} />
          ) : (
          <div className="space-y-5">
            <label>
              <span className={labelClass}><UiText>{"Find student"}</UiText></span>
              <SystemInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Type name or roll no...")} className="w-full" />
            </label>

            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">{tr("Assigned ({0})", [assigned.length])}
              </p>
              {assigned.length === 0 ? (
                <SharedEmptyState size="sm" icon={Users} title={tr("No students assigned yet.")} description={tr("Search for a student above to assign this discount.")} />
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pe-1">
                  {assigned.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-xl bg-brand-50/50 border border-edge/10 px-3 py-2">
                      <p className="text-xs font-bold text-ink-strong">
                        {a.student?.fullName} <span className="text-ink-subtle font-bold">· {a.student?.rollNo ?? ""}</span>
                      </p>
                      <ReviewedDelete endpoint="fees/discount-assignments" record={{ id: a.id, campusId }} label={a.student?.fullName ?? tr("this student")} onDeleted={() => { void refreshAssignments(); }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-2"><UiText>{"Add student"}</UiText></p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pe-1">
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
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-edge/10 px-3 py-2">
                      <p className="text-xs font-bold text-ink-strong">
                        {s.fullName} <span className="text-ink-subtle font-bold">· {s.rollNo ?? ""}</span>
                      </p>
                      <Button variant="outline"
                        type="button"
                        disabled={assignBusy}
                        onClick={() => addAssignment(s.id)}
                        className="px-2"
                      ><UiText>{"Add"}</UiText></Button>
                    </div>
                  ))}
                {students.filter((s) => !assigned.some((a) => a.studentId === s.id)).length === 0 && (
                  <p className="text-2xs font-semibold text-ink-subtle italic"><UiText>{"All students already assigned."}</UiText></p>
                )}
              </div>
            </div>
          </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ── Carry Forward ─────────────────────────────────────── */

function CarryPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  // Starts in the campus currency (locale package) and follows the financial policy once it loads (R7).
  const [currency, setCurrency] = useState<string>(useLocale().currency);
  useEffect(() => { void getFinancialLocale(campusId).then((policy) => setCurrency(policy.currency)).catch(() => {}); }, [campusId]);
  const [forwards, setForwards] = useState<CarryForwardRow[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
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
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const [fRes, sRes] = await Promise.all([
        readRequest(`${API}/carry-forwards${qp}`),
        readRequest(`/api/students${qp ? `${qp}&` : "?"}pageSize=1000`),
      ]);
      const [fJson, sJson] = await Promise.all([checkedJson(fRes), checkedJson(sRes)]);
      if (loadVersion !== loadSequence.current) return;
      if (fJson.success) setForwards(fJson.data);
      if (sJson.success) setStudents(sJson.data);
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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

  usePanelCommand(command, {
    create: () => { if (students.length === 0) toast.info(tr("There are no students on this campus to carry a balance for.")); else setShowModal(true); },
  }, !loading);

  if (loading) {
    return <SkeletonRows />;
  }
  if (loadFailed) {
    return <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Carry forward"}</UiText></h3>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Session-end balances moved to the next academic year"}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)} disabled={students.length === 0}><UiText>{"New carry-forward"}</UiText></BrandButton>}
      </div>

      {forwards.length === 0 ? (
        <EmptyState icon={Wallet} title={tr("No carry-forwards yet")} description={tr("Move a student's outstanding balance or credit into the next year.")} />
      ) : (
        <div className="space-y-2.5">
          {forwards.map((f) => (
            <div key={f.id} className="sk-panel flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink-strong"><bdi>{f.student?.fullName ?? tr("Unknown")}</bdi></p>
                <p className="text-2xs font-medium text-ink-subtle mt-0.5">
                  {tr("{0} to {1}", [f.fromAcademicYear, f.toAcademicYear])}
                  {f.note ? <> · <bdi>{f.note}</bdi></> : null}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${f.balance < 0 ? "text-status-success-text" : "text-status-error-text"} tabular-nums`}>
                  {f.balance < 0 ? "-" : "+"}{formatPKR(Math.abs(f.balance), f.currency)}
                </span>
                <RowMenu onDelete={() => setDeleting(f)} />
                {deleting?.id === f.id ? <ReviewedDeleteDialog endpoint="fees/carry-forwards" record={{ id: f.id, campusId }} label={f.student?.fullName ?? tr("this student")} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={tr("New carry-forward")} eyebrow={tr("Fee setup · Carry forward")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <CurrencySelect value={currency} onChange={setCurrency} /><FormSelect label={tr("Student")} value={studentId} onChange={setStudentId}>
              <option value=""><UiText>{"Select student..."}</UiText></option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName} ({s.rollNo ?? ""})</option>
              ))}
            </FormSelect>
            <div className="grid grid-cols-2 gap-3">
              <FormInput label={tr("From year")} type="number" value={fromYear} placeholder="2025" onChange={setFromYear} />
              <FormInput label={tr("To year")} type="number" value={toYear} placeholder="2026" onChange={setToYear} />
            </div>
            <FormInput label={`${tr("Balance")} (${currency})`} type="number" value={balance} placeholder={tr("e.g. 2500 or -500")} onChange={setBalance} />
            <p className="-mt-2 text-xs text-ink-subtle">{tr("A positive balance is owed by the student; a negative balance is a credit carried forward.")}</p>
            <FormInput label={tr("Note (optional)")} value={note} placeholder={tr("e.g. outstanding May dues")} onChange={setNote} />
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={tr("Create carry-forward")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
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

export function FineRulesPanel({ campusId, command, hideCreate = false }: FeeSetupPanelProps) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  // Flat and per-day fines are in the campus currency from the school's locale package (R7: never a fixed "PKR").
  // Starts in the campus currency (locale package) and follows the financial policy once it loads (R7).
  const [currency, setCurrency] = useState<string>(useLocale().currency);
  useEffect(() => { void getFinancialLocale(campusId).then((policy) => setCurrency(policy.currency)).catch(() => {}); }, [campusId]);
  const [rules, setRules] = useState<FineRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const loadSequence = useRef(0);
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
    const loadVersion = ++loadSequence.current;
    setLoading(true);
    setLoadFailed(null);
    try {
      const res = await readRequest(`${API}/fine-rules${qp}`);
      const json = await checkedJson(res);
      if (loadVersion !== loadSequence.current) return;
      if (json.success) setRules(json.data);
      else throw new Error("Invalid result");
    } catch (error) {
      if (loadVersion !== loadSequence.current) return;
      setLoadFailed(requestFailure(error));
    } finally {
      if (loadVersion === loadSequence.current) setLoading(false);
    }
  }, [qp]);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [load]);

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


  usePanelCommand(command, { create: () => openModal(null) }, !loading);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Fine rules"}</UiText></h3>
          <p className="text-sm text-ink-muted"><UiText>{"Late-payment fines applied when collecting overdue invoices"}</UiText></p>
          <p className="text-2xs font-medium text-ink-subtle mt-0.5"><UiText>{"Percent: a share of the balance · Flat: one fixed amount · Per day: an amount for each day past due"}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New fine rule"}</UiText></BrandButton>}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : loadFailed ? (
        <SharedErrorState error={loadFailed} title={tr("This fee setup could not be loaded")} description={tr("Check your connection and try again.")} onRetry={load} />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Timer}
          title={tr("No fine rules yet")}
          description={tr("Create a rule to start charging late-payment fines.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New fine rule"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="sk-panel p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Timer className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-strong">
                  {rule.name}
                  {rule.description ? <span className="ms-2 text-2xs font-medium text-ink-subtle">{rule.description}</span> : null}
                </p>
                <p className="text-2xs font-medium text-ink-subtle mt-0.5">
                  {rule.type === "PERCENT"
                    ? tr("{0}% of balance", [rule.value])
                    : rule.type === "PER_DAY"
                      ? tr("{0} per day", [formatPKR(rule.value, currency)])
                      : tr("{0} flat", [formatPKR(rule.value, currency)])}
                  {" · "}{rule.graceDays > 0 ? tr("{0} day grace", [rule.graceDays]) : tr("no grace period")}
                </p>
              </div>
              <Button aria-pressed={rule.isActive} variant="choice"
                type="button"
                onClick={() => handleToggle(rule)}
                loading={togglingId === rule.id}
                className={"justify-start " + (`flex items-center gap-2 px-3 py-1.5 ${
                  ""
                } `)}
              >
                {togglingId !== rule.id && <Check className="w-3 h-3" aria-hidden="true" />}
                {rule.isActive ? tr("Active") : tr("Inactive")}
              </Button>
              <RowMenu onEdit={() => openModal(rule)} onDelete={() => setDeleting(rule)} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit fine rule") : tr("New fine rule")} eyebrow={tr("Fee setup · Fine rules")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Rule name")} value={name} placeholder={tr("e.g. Monthly late fine")} onChange={setName} />
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={labelClass}><UiText>{"Type"}</UiText></span>
                <SystemSelect value={type} onChange={(e) => setType(e.target.value as any)} className="w-full">
                  <option value="PERCENT"><UiText>{"Percent of balance"}</UiText></option>
                  <option value="FLAT"><UiText>{"Flat amount"}</UiText></option>
                  <option value="PER_DAY"><UiText>{"Per day"}</UiText></option>
                </SystemSelect>
              </label>
              <label>
                <span className={labelClass}>{type === "PERCENT" ? tr("Percent of balance") : `${tr("Amount")} (${currency})`}</span>
                <SystemInput type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "PERCENT" ? tr("e.g. 5") : tr("e.g. 200")} className="w-full" />
              </label>
            </div>
            <label>
              <span className={labelClass}><UiText>{"Grace days (0 = none)"}</UiText></span>
              <SystemInput type="number" min="0" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} placeholder="0" className="w-full" />
            </label>
            <FormInput label={tr("Description (optional)")} value={description} placeholder={tr("Shown in reports")} onChange={setDescription} />
            <ModalActions busy={saving} busyLabel={tr("Saving…")} actionLabel={editing ? tr("Save changes") : tr("Create fine rule")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}

      {deleting && (
        <ReviewedDeleteDialog endpoint="fees/fine-rules" record={{ id: deleting.id, campusId }} label={deleting.name} onCancel={() => setDeleting(null)} onDeleted={load} />
      )}
    </div>
  );
}

/* ── Shared ────────────────────────────────────────────── */

/**
 * One row overflow menu (role-ux §4.5.2–3): Edit, then the destructive action last in danger tone. The delete
 * itself still asks through the row's ConfirmAction.
 */
function RowMenu({ onEdit, onDelete, deleteLabel = "Delete" }: { onEdit?: () => void; onDelete: () => void; deleteLabel?: string }) {
  const tr = useUiText();
  const items: MenuItem[] = [
    ...(onEdit ? [{ id: "edit", label: "Edit", icon: Pencil, onSelect: onEdit }] : []),
    { id: "delete", label: deleteLabel, icon: Trash2, tone: "danger" as const, onSelect: onDelete },
  ];
  return (
    <Menu
      label="More actions"
      items={items}
      trigger={<IconButton variant="ghost" label={tr("More actions")}><MoreHorizontal aria-hidden="true" /></IconButton>}
    />
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="sk-panel p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-2">
              <div className="h-4 w-28 rounded-full bg-border-subtle/50 skeleton-shimmer" />
              <div className="h-3 w-40 rounded-full bg-border-subtle/40 skeleton-shimmer" />
            </div>
            <div className="h-8 w-8 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
          </div>
          <div className="h-12 rounded-xl bg-muted/50 skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}
