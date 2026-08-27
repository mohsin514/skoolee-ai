"use client";

/**
 * One staff member's place in the institution.
 *
 * Rank, unit, reporting line and employment state are edited together because
 * that is how a real change arrives: a promotion is usually a new rank AND a
 * new manager AND a salary revision, issued under one office order on one
 * date. Saving them as one change writes one appointment record, which is what
 * a service record is supposed to look like — not four unrelated edits.
 *
 * The "Promote" shortcut fills the form from the ladder the tenant defined
 * (`promotesTo` on the current rank) rather than guessing, so a school whose
 * ladder skips a rung gets its own answer, not ours.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  History,
  Link2,
  Loader2,
  Network,
  Plus,
  Trash2,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "@/components/role-dashboard";
import { AvatarImage, initialsOf } from "@/components/ui/avatar-image";
import { cn } from "@/lib/utils";
import {
  CHANGE_KIND_LABELS,
  DEPARTMENT_KIND_LABELS,
  DEPARTMENT_ROLE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  TRACK_TONES,
} from "@/lib/staff/hierarchy-presets";
import type { OrgNode } from "@/lib/staff/hierarchy";

export interface DesignationOption {
  id: string;
  name: string;
  shortName: string | null;
  level: number;
  track: string;
  canHeadDepartment: boolean;
  isInstitutionHead: boolean;
  promotesToId: string | null;
  minYearsInRank: number | null;
}

interface Appointment {
  id: string;
  changeKind: keyof typeof CHANGE_KIND_LABELS;
  designationName: string | null;
  departmentName: string | null;
  reportsToName: string | null;
  employmentType: string | null;
  employmentStatus: string | null;
  basicSalary: number | null;
  isActing: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  orderRef: string | null;
  notes: string | null;
  approvedBy: { id: string; fullName: string } | null;
}

interface Membership {
  id: string;
  role: "HEAD" | "DEPUTY_HEAD" | "COORDINATOR" | "MEMBER";
  isPrimary: boolean;
  isActing: boolean;
  department: { id: string; name: string; kind: string };
}

interface SecondaryLine {
  id: string;
  kind: string;
  label: string | null;
  manager: { id: string; fullName: string; staffProfile: { designation: string | null } | null };
}

export function PositionDialog({
  node,
  nodes,
  designations,
  departments,
  onClose,
  onSaved,
}: {
  node: OrgNode;
  nodes: OrgNode[];
  designations: DesignationOption[];
  departments: Array<{ id: string; name: string; kind: string; parentId: string | null }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"position" | "history">("position");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [chain, setChain] = useState<Array<{ id: string; fullName: string; designation: string | null }>>([]);
  const [lines, setLines] = useState<SecondaryLine[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [extraDeptId, setExtraDeptId] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [form, setForm] = useState({
    designationId: node.designation?.id ?? "",
    primaryDepartmentId: node.department?.id ?? "",
    reportsToId: node.managerId ?? "",
    employmentType: node.employmentType as string,
    employmentStatus: node.employmentStatus as string,
    employeeCode: node.employeeCode ?? "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    orderRef: "",
    notes: "",
    isActing: false,
  });

  const [newLine, setNewLine] = useState({ managerId: "", kind: "FUNCTIONAL", label: "" });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/staff/appointments?userId=${node.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the service record");
      setHistory(data.appointments ?? []);
      setChain(data.reportingChain ?? []);
      setLines(data.secondaryLines ?? []);
      setMemberships(data.memberships ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the service record");
    } finally {
      setLoadingHistory(false);
    }
  }, [node.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const currentRank = designations.find((d) => d.id === form.designationId) ?? null;
  const nextRank = currentRank?.promotesToId
    ? designations.find((d) => d.id === currentRank.promotesToId) ?? null
    : null;

  /**
   * Who this person may be told to report to.
   *
   * Their own reports are excluded because the server refuses a loop anyway —
   * offering the option and then rejecting the save is a worse experience than
   * not offering it. Seniority is NOT enforced: a lab assistant reporting to a
   * senior teacher is ordinary, and so is a professor reporting to a dean who
   * happens to hold the same rank.
   */
  const managerOptions = useMemo(() => {
    const descendants = new Set<string>();
    const stack = [node.id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const candidate of nodes) {
        if (candidate.managerId === id && !descendants.has(candidate.id)) {
          descendants.add(candidate.id);
          stack.push(candidate.id);
        }
      }
    }
    return nodes
      .filter((n) => n.id !== node.id && !descendants.has(n.id))
      .sort((a, b) => (a.designation?.level ?? 999) - (b.designation?.level ?? 999) || a.fullName.localeCompare(b.fullName));
  }, [nodes, node.id]);

  const dirty =
    form.designationId !== (node.designation?.id ?? "") ||
    form.primaryDepartmentId !== (node.department?.id ?? "") ||
    form.reportsToId !== (node.managerId ?? "") ||
    form.employmentType !== node.employmentType ||
    form.employmentStatus !== node.employmentStatus ||
    form.employeeCode !== (node.employeeCode ?? "") ||
    form.orderRef.trim() !== "" ||
    form.notes.trim() !== "";

  const promote = () => {
    if (!nextRank) return;
    setForm((prev) => ({ ...prev, designationId: nextRank.id }));
    setTab("position");
    toast.success(`Set to ${nextRank.name}. Check the reporting line, then save.`);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/staff/hierarchy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: node.id,
          designationId: form.designationId || null,
          primaryDepartmentId: form.primaryDepartmentId || null,
          reportsToId: form.reportsToId || null,
          employmentType: form.employmentType,
          employmentStatus: form.employmentStatus,
          employeeCode: form.employeeCode.trim() || null,
          effectiveFrom: form.effectiveFrom || null,
          orderRef: form.orderRef.trim() || null,
          notes: form.notes.trim() || null,
          isActing: form.isActing,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the change");

      const label = data.changeKind ? CHANGE_KIND_LABELS[data.changeKind as keyof typeof CHANGE_KIND_LABELS] : null;
      toast.success(label ? `${node.fullName}: ${label.toLowerCase()}` : "Position saved");
      await loadHistory();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the change");
    } finally {
      setSaving(false);
    }
  };

  const departmentAction = async (body: Record<string, unknown>, message: string) => {
    try {
      const res = await fetch("/api/staff/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That did not work");
      toast.success(message);
      await loadHistory();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work");
    }
  };

  const addDepartment = async () => {
    if (!extraDeptId) return;
    const unit = departments.find((d) => d.id === extraDeptId);
    await departmentAction(
      { action: "set-member", departmentId: extraDeptId, userId: node.id, role: "MEMBER" },
      `Added to ${unit?.name ?? "the department"}`
    );
    setExtraDeptId("");
  };

  const addLine = async () => {
    if (!newLine.managerId) return;
    try {
      const res = await fetch("/api/staff/reporting-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: node.id,
          managerId: newLine.managerId,
          kind: newLine.kind,
          label: newLine.label.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add the reporting line");
      setNewLine({ managerId: "", kind: "FUNCTIONAL", label: "" });
      await loadHistory();
      onSaved();
      toast.success("Secondary reporting line added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the reporting line");
    }
  };

  const removeLine = async (id: string) => {
    try {
      const res = await fetch(`/api/staff/reporting-lines?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not remove the line");
      await loadHistory();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the line");
    }
  };

  const tone = node.designation ? TRACK_TONES[node.designation.track as keyof typeof TRACK_TONES] : null;

  return (
    <Modal
      title={node.fullName}
      eyebrow="Position & reporting"
      subtitle={node.designation?.name || node.designationLabel || "No rank set yet"}
      icon={UserCog}
      size="lg"
      tone="violet"
      dirty={dirty}
      onClose={onClose}
      avatar={
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#f3f4f9] text-sm font-black text-ink-muted">
          {node.avatarUrl ? <AvatarImage src={node.avatarUrl} name={node.fullName} /> : initialsOf(node.fullName)}
        </span>
      }
      chips={
        <div className="flex flex-wrap items-center gap-1.5">
          {tone ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase", tone.chip)}>{tone.label}</span>
          ) : null}
          {node.headOf.map((h) => (
            <span key={h.id} className="rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[10px] font-black text-[#8127cf]">
              {h.isActing ? "Acting head" : "Head"} · {h.name}
            </span>
          ))}
          {node.dueForReview ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">Due for review</span>
          ) : null}
        </div>
      }
      footer={
        tab === "position" ? (
          <ModalActions
            busy={saving}
            busyLabel="Saving…"
            actionLabel="Save change"
            onCancel={onClose}
            onAction={save}
            blockedReason={dirty ? null : "Nothing has changed yet."}
            secondary={
              nextRank ? (
                <BrandButton variant="soft" icon={<ArrowUpRight className="h-4 w-4" />} onClick={promote}>
                  Promote to {nextRank.shortName || nextRank.name}
                </BrandButton>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      <div className="mb-4 flex gap-1 rounded-2xl bg-[#f3f4f9] p-1">
        {([
          { key: "position" as const, label: "Position", icon: Network },
          { key: "history" as const, label: "Service record", icon: History },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-all",
              tab === t.key ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-muted hover:text-ink"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "position" ? (
        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Rank & unit</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Rank" hint={currentRank?.minYearsInRank ? `Usually held ${currentRank.minYearsInRank} year(s) before promotion` : undefined}>
                <Select value={form.designationId} onChange={(e) => update("designationId", e.target.value)}>
                  <option value="">No rank set</option>
                  {Object.entries(TRACK_TONES).map(([track, t]) => {
                    const inTrack = designations.filter((d) => d.track === track);
                    if (inTrack.length === 0) return null;
                    return (
                      <optgroup key={track} label={t.label}>
                        {inTrack.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              </Field>

              <Field label="Home department" hint="Where the chart files them. Add any others below.">
                <Select value={form.primaryDepartmentId} onChange={(e) => update("primaryDepartmentId", e.target.value)}>
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.parentId ? "— " : ""}
                      {d.name} ({DEPARTMENT_KIND_LABELS[d.kind as keyof typeof DEPARTMENT_KIND_LABELS]})
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="sm:col-span-2">
                <Field label="Reports to" hint="The solid line on the chart. Leave empty for the head of the institution.">
                  <Select value={form.reportsToId} onChange={(e) => update("reportsToId", e.target.value)}>
                    <option value="">Nobody — top of the chart</option>
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                        {m.designation ? ` — ${m.designation.name}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-[#f3f4f9]/60 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-indigo-600" />
              <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Departments they belong to</h4>
            </div>
            <p className="text-[11px] font-semibold text-ink-muted">
              A school runs many departments and people cross them — a teacher covering Physics and Maths, a
              professor sitting on admissions. Add as many as apply; the one marked <strong className="font-black">home</strong> is
              the one the chart files them under.
            </p>

            {memberships.length > 0 ? (
              <ul className="space-y-1.5">
                {memberships.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                      {m.department.name}
                      <span className="font-semibold text-ink-muted">
                        {" "}
                        · {DEPARTMENT_KIND_LABELS[m.department.kind as keyof typeof DEPARTMENT_KIND_LABELS]}
                      </span>
                    </span>
                    {m.role === "HEAD" ? (
                      <span className="shrink-0 rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[9px] font-black text-[#8127cf]">
                        {m.isActing ? "ACTING HEAD" : "HEAD"}
                      </span>
                    ) : m.role !== "MEMBER" ? (
                      <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black text-indigo-600">
                        {DEPARTMENT_ROLE_LABELS[m.role].toUpperCase()}
                      </span>
                    ) : null}
                    {m.isPrimary ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-600">HOME</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          departmentAction(
                            { action: "set-member", departmentId: m.department.id, userId: node.id, role: m.role, isPrimary: true },
                            `${m.department.name} is now their home department`
                          )
                        }
                        className="shrink-0 rounded-lg px-2 py-0.5 text-[9px] font-black uppercase text-ink-subtle hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                      >
                        Make home
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        departmentAction({ action: "remove-member", memberId: m.id }, `Removed from ${m.department.name}`)
                      }
                      className="shrink-0 rounded-lg p-1 text-ink-muted hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove from ${m.department.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-white px-3 py-2.5 text-[11px] font-semibold text-ink-muted">
                Not in any department yet.
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Select value={extraDeptId} onChange={(e) => setExtraDeptId(e.target.value)} className="h-10 text-xs">
                <option value="">Also belongs to…</option>
                {departments
                  .filter((d) => !memberships.some((m) => m.department.id === d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.parentId ? "— " : ""}
                      {d.name}
                    </option>
                  ))}
              </Select>
              <BrandButton
                variant="soft"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={addDepartment}
                disabled={!extraDeptId}
                className="min-h-10 px-4 text-xs"
              >
                Add
              </BrandButton>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Employment</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Type">
                <Select value={form.employmentType} onChange={(e) => update("employmentType", e.target.value)}>
                  {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.employmentStatus} onChange={(e) => update("employmentStatus", e.target.value)}>
                  {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Staff code" hint="Your own employee number">
                <Input value={form.employeeCode} onChange={(e) => update("employeeCode", e.target.value)} placeholder="e.g. EMP-0142" />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Record this change</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Effective from" hint="Backdate it to the date on the order.">
                <Input type="date" value={form.effectiveFrom} onChange={(e) => update("effectiveFrom", e.target.value)} />
              </Field>
              <Field label="Order / notification no." hint="Optional">
                <Input value={form.orderRef} onChange={(e) => update("orderRef", e.target.value)} placeholder="e.g. ADM/2026/114" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes" hint="Why the change was made. Kept on the service record.">
                  <Textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Optional" />
                </Field>
              </div>
              <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                <input type="checkbox" checked={form.isActing} onChange={(e) => update("isActing", e.target.checked)} className="h-4 w-4 accent-[#8127cf]" />
                <span className="text-xs font-bold text-ink">
                  Acting / officiating charge
                  <span className="ml-1 font-semibold text-ink-muted">— holding the post without the rank</span>
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-[#f3f4f9]/60 p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-cyan-600" />
              <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Secondary reporting lines</h4>
            </div>
            <p className="text-[11px] font-semibold text-ink-muted">
              For work that cuts across the chart — exam duty, a committee, a project. Drawn dashed, and they never change who this person answers to day to day.
            </p>

            {lines.length > 0 ? (
              <ul className="space-y-1.5">
                {lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                      {line.manager.fullName}
                      {line.label ? <span className="font-semibold text-ink-muted"> · {line.label}</span> : null}
                    </span>
                    <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-700">{line.kind}</span>
                    <button type="button" onClick={() => removeLine(line.id)} className="rounded-lg p-1 text-ink-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Select value={newLine.managerId} onChange={(e) => setNewLine((p) => ({ ...p, managerId: e.target.value }))} className="h-10 text-xs">
                <option value="">Also reports to…</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName}</option>
                ))}
              </Select>
              <Input
                value={newLine.label}
                onChange={(e) => setNewLine((p) => ({ ...p, label: e.target.value }))}
                placeholder="What for? e.g. Exam duty"
                className="h-10 text-xs"
              />
              <BrandButton variant="soft" icon={<Plus className="h-3.5 w-3.5" />} onClick={addLine} disabled={!newLine.managerId} className="min-h-10 px-4 text-xs">
                Add
              </BrandButton>
            </div>
          </section>
        </div>
      ) : (
        <ServiceRecord
          loading={loadingHistory}
          history={history}
          chain={chain}
          joiningDate={node.joiningDate}
          rankSince={node.rankSince}
        />
      )}
    </Modal>
  );
}

function ServiceRecord({
  loading,
  history,
  chain,
  joiningDate,
  rankSince,
}: {
  loading: boolean;
  history: Appointment[];
  chain: Array<{ id: string; fullName: string; designation: string | null }>;
  joiningDate: string | null;
  rankSince: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-xs font-bold text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the service record…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat icon={CalendarDays} label="Joined" value={joiningDate ? new Date(joiningDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded"} />
        <Stat icon={ArrowUpRight} label="In current rank since" value={rankSince ? new Date(rankSince).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded"} />
      </div>

      {chain.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Chain of command</h4>
          <ol className="flex flex-wrap items-center gap-1.5">
            {chain.map((person, index) => (
              <li key={person.id} className="flex items-center gap-1.5">
                {index > 0 ? <span className="text-ink-muted">→</span> : null}
                <span className="rounded-xl bg-[#f3f4f9] px-2.5 py-1.5 text-[11px] font-bold text-ink">
                  {person.fullName}
                  {person.designation ? <span className="font-semibold text-ink-muted"> · {person.designation}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Every position held</h4>
        {history.length === 0 ? (
          <p className="rounded-2xl bg-[#f3f4f9]/60 px-4 py-6 text-center text-xs font-semibold text-ink-muted">
            Nothing recorded yet. The first change you save here starts the record.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-[#cfc2d6]/50 pl-5">
            {history.map((entry) => (
              <li key={entry.id} className="relative">
                <span className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white", entry.effectiveTo ? "bg-[#cfc2d6]" : "bg-[#8127cf]")} />
                <div className="rounded-2xl border border-[#cfc2d6]/30 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-ink">{CHANGE_KIND_LABELS[entry.changeKind] ?? entry.changeKind}</span>
                    {entry.isActing ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">ACTING</span> : null}
                    {!entry.effectiveTo ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-600">CURRENT</span> : null}
                    <span className="ml-auto text-[10px] font-bold text-ink-muted">
                      {new Date(entry.effectiveFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {entry.effectiveTo ? ` → ${new Date(entry.effectiveTo).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-ink">
                    {entry.designationName || "No rank"}
                    {entry.departmentName ? <span className="font-semibold text-ink-muted"> · {entry.departmentName}</span> : null}
                  </p>
                  {entry.reportsToName ? (
                    <p className="text-[11px] font-semibold text-ink-muted">Reporting to {entry.reportsToName}</p>
                  ) : null}
                  {entry.orderRef ? (
                    <p className="mt-1 text-[10px] font-bold text-ink-muted">Order {entry.orderRef}</p>
                  ) : null}
                  {entry.notes ? <p className="mt-1 text-[11px] font-semibold text-ink-muted">{entry.notes}</p> : null}
                  {entry.approvedBy ? (
                    <p className="mt-1 text-[10px] font-semibold text-ink-muted">Recorded by {entry.approvedBy.fullName}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-black text-ink">{label}</label>
      {children}
      {hint ? <p className="text-[10px] font-semibold text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#f3f4f9]/60 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-[#8127cf]" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wide text-ink-subtle">{label}</p>
        <p className="truncate text-xs font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}
