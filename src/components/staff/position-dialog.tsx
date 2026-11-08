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

import { fillNodes } from "@/lib/auth/fill-nodes";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  History,
  Link2,
  Network,
  Plus,
  Trash2,
  UserCog,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { SkeletonList } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "@/components/role-dashboard";
import { AvatarImage, initialsOf } from "@/components/ui/avatar-image";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CHANGE_KIND_LABELS,
  DEPARTMENT_KIND_LABELS,
  DEPARTMENT_ROLE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  TRACK_TONES,
} from "@/lib/staff/hierarchy-presets";
import type { OrgNode } from "@/lib/staff/hierarchy";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DeskPill, DeskStats, StatTile, deskTimeline } from "@/components/ui/desk";


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
  const ui = useUiText();
  const [tab, setTab] = useState<"position" | "history">("position");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [chain, setChain] = useState<Array<{ id: string; fullName: string; designation: string | null }>>([]);
  const [lines, setLines] = useState<SecondaryLine[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [extraDeptId, setExtraDeptId] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyFailed, setHistoryFailed] = useState(false);

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
  // §4.5.3: removing a department membership or a reporting line is confirmed first (both are audited and
  // can be added back, so the tone is "warning", not "danger").
  const [pendingRemoval, setPendingRemoval] = useState<{ kind: "member" | "line"; id: string; name: string } | null>(null);
  const [removalBusy, setRemovalBusy] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryFailed(false);
    try {
      const res = await fetch(`/api/staff/appointments?userId=${node.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the service record");
      setHistory(data.appointments ?? []);
      setChain(data.reportingChain ?? []);
      setLines(data.secondaryLines ?? []);
      setMemberships(data.memberships ?? []);
    } catch (error) {
      // R4: shown inline in the service record with a retry, never as a toast.
      console.error(error);
      setHistoryFailed(true);
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
    toast.success(ui("Set to {0}. Check the reporting line, then save.", [nextRank.name]));
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
      if (!res.ok) throw new Error(data.error || "");

      const label = data.changeKind ? CHANGE_KIND_LABELS[data.changeKind as keyof typeof CHANGE_KIND_LABELS] : null;
      toast.success(label ? ui("{0}: {1}", [node.fullName, ui(label)]) : ui("Position saved"));
      await loadHistory();
      onSaved();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the change. Please try again.")));
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
      if (!res.ok) throw new Error(data.error || "");
      toast.success(message);
      await loadHistory();
      onSaved();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the change. Please try again.")));
    }
  };

  const addDepartment = async () => {
    if (!extraDeptId) return;
    const unit = departments.find((d) => d.id === extraDeptId);
    await departmentAction(
      { action: "set-member", departmentId: extraDeptId, userId: node.id, role: "MEMBER" },
      unit?.name ? ui("Added to {0}", [unit.name]) : ui("Added to the department")
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
      if (!res.ok) throw new Error(data.error || "");
      setNewLine({ managerId: "", kind: "FUNCTIONAL", label: "" });
      await loadHistory();
      onSaved();
      toast.success(ui("Secondary reporting line added"));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not add the reporting line. Please try again.")));
    }
  };

  const removeLine = async (id: string) => {
    try {
      const res = await fetch(`/api/staff/reporting-lines?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not remove the line");
      toast.success(ui("Reporting line removed"));
      await loadHistory();
      onSaved();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not remove the reporting line. Please try again.")));
    }
  };

  const tone = node.designation ? TRACK_TONES[node.designation.track as keyof typeof TRACK_TONES] : null;

  return (
    <Modal
      title={node.fullName}
      eyebrow={ui("Position & reporting")}
      subtitle={node.designation?.name || node.designationLabel || ui("No rank set yet")}
      icon={UserCog}
      size="lg"
      tone="violet"
      dirty={dirty}
      onClose={onClose}
      avatar={
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-muted text-sm font-bold text-ink-muted">
          {node.avatarUrl ? <AvatarImage src={node.avatarUrl} name={node.fullName} /> : initialsOf(node.fullName)}
        </span>
      }
      chips={
        <div className="flex flex-wrap items-center gap-1.5">
          {tone ? (
            <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", tone.chip)}>{ui(tone.label)}</span>
          ) : null}
          {node.headOf.map((h) => (
            <Badge key={h.id} variant="default" size="sm">
              {h.isActing ? ui("Acting head") : ui("Head")} · {h.name}
            </Badge>
          ))}
          {node.dueForReview ? (
            <Badge variant="warning" size="sm" dot>{ui("Due for review")}</Badge>
          ) : null}
        </div>
      }
      footer={
        tab === "position" ? (
          <ModalActions
            busy={saving}
            busyLabel={ui("Saving…")}
            actionLabel={ui("Save change")}
            onCancel={onClose}
            onAction={save}
            blockedReason={dirty ? null : ui("Nothing has changed yet.")}
            secondary={
              nextRank ? (
                <BrandButton variant="soft" icon={<ArrowUpRight className="h-4 w-4" />} onClick={promote}>
                  {ui("Promote to {0}", [nextRank.shortName || nextRank.name])}
                </BrandButton>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      <div className="mb-4 flex gap-1 rounded-2xl bg-muted p-1">
        {([
          { key: "position" as const, label: "Position", icon: Network },
          { key: "history" as const, label: "Service record", icon: History },
        ]).map((t) => (
          <Button aria-pressed={tab === t.key} variant="choice" size="sm"
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="flex flex-1 items-center justify-center gap-2"
          >
            <t.icon className="h-3.5 w-3.5" />
            {ui(t.label)}
          </Button>
        ))}
      </div>

      {tab === "position" ? (
        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Rank & unit")}</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={ui("Rank")} hint={currentRank?.minYearsInRank ? ui("Usually held {0} year(s) before promotion", [currentRank.minYearsInRank]) : undefined}>
                <Select value={form.designationId} onChange={(e) => update("designationId", e.target.value)}>
                  <option value="">{ui("No rank set")}</option>
                  {Object.entries(TRACK_TONES).map(([track, t]) => {
                    const inTrack = designations.filter((d) => d.track === track);
                    if (inTrack.length === 0) return null;
                    return (
                      <optgroup key={track} label={ui(t.label)}>
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

              <Field label={ui("Home department")} hint={ui("Where the chart files them. Add any others below.")}>
                <Select value={form.primaryDepartmentId} onChange={(e) => update("primaryDepartmentId", e.target.value)}>
                  <option value="">{ui("No department")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.parentId ? "— " : ""}
                      {d.name} ({ui(DEPARTMENT_KIND_LABELS[d.kind as keyof typeof DEPARTMENT_KIND_LABELS])})
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="sm:col-span-2">
                <Field label={ui("Reports to")} hint={ui("The solid line on the chart. Leave empty for the head of the institution.")}>
                  <Select value={form.reportsToId} onChange={(e) => update("reportsToId", e.target.value)}>
                    <option value="">{ui("Nobody — top of the chart")}</option>
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

          <section className="space-y-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-status-info-text" />
              <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Departments they belong to")}</h4>
            </div>
            <p className="text-xs font-normal text-ink-muted">
              {fillNodes(ui("A school runs many departments and people cross them — a teacher covering Physics and Maths, a professor sitting on admissions. Add as many as apply; the one marked {0} is the one the chart files them under."), <strong className="font-bold">{ui("home")}</strong>)}
            </p>

            {memberships.length > 0 ? (
              <ul className="space-y-1.5">
                {memberships.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                      {m.department.name}
                      <span className="font-semibold text-ink-muted">
                        {" "}
                        · {ui(DEPARTMENT_KIND_LABELS[m.department.kind as keyof typeof DEPARTMENT_KIND_LABELS])}
                      </span>
                    </span>
                    {m.role === "HEAD" ? (
                      <Badge variant="default" size="sm" className="shrink-0">
                        {m.isActing ? ui("Acting head") : ui("Head")}
                      </Badge>
                    ) : m.role !== "MEMBER" ? (
                      <Badge variant="info" size="sm" className="shrink-0">
                        {ui(DEPARTMENT_ROLE_LABELS[m.role])}
                      </Badge>
                    ) : null}
                    {m.isPrimary ? (
                      <Badge variant="success" size="sm" className="shrink-0">{ui("Home unit")}</Badge>
                    ) : (
                      <Button variant="secondary" size="sm"
                        type="button"
                        onClick={() =>
                          departmentAction(
                            { action: "set-member", departmentId: m.department.id, userId: node.id, role: m.role, isPrimary: true },
                            ui("{0} is now their home department", [m.department.name])
                          )
                        }
                        className="shrink-0"
                      >
                        {ui("Make home")}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon"
                      type="button"
                      onClick={() => setPendingRemoval({ kind: "member", id: m.id, name: m.department.name })}
                      className="shrink-0 text-status-error-text actionable-hover:bg-status-error-surface actionable-hover:text-status-error-text"
                      aria-label={ui("Remove from {0}", [m.department.name])}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-card px-3 py-2.5 text-xs font-normal text-ink-muted">
                {ui("Not in any department yet.")}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Select value={extraDeptId} onChange={(e) => setExtraDeptId(e.target.value)} >
                <option value="">{ui("Also belongs to…")}</option>
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
                size="sm"
                icon={<Plus aria-hidden="true" />}
                onClick={addDepartment}
                disabled={!extraDeptId}
              >
                {ui("Add")}
              </BrandButton>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Employment")}</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={ui("Type")}>
                <Select value={form.employmentType} onChange={(e) => update("employmentType", e.target.value)}>
                  {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{ui(label)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={ui("Status")}>
                <Select value={form.employmentStatus} onChange={(e) => update("employmentStatus", e.target.value)}>
                  {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{ui(label)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={ui("Staff code")} hint={ui("Your own employee number")}>
                <Input value={form.employeeCode} onChange={(e) => update("employeeCode", e.target.value)} placeholder={ui("e.g. EMP-0142")} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Record this change")}</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={ui("Effective from")} hint={ui("Backdate it to the date on the order.")}>
                <Input type="date" value={form.effectiveFrom} onChange={(e) => update("effectiveFrom", e.target.value)} />
              </Field>
              <Field label={ui("Order / notification no.")} hint={ui("Optional")}>
                <Input value={form.orderRef} onChange={(e) => update("orderRef", e.target.value)} placeholder={ui("e.g. ADM/2026/114")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={ui("Notes")} hint={ui("Why the change was made. Kept on the service record.")}>
                  <Textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder={ui("Optional")} />
                </Field>
              </div>
              <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                <SystemCheckbox  checked={form.isActing} onChange={(e) => update("isActing", e.target.checked)} className="h-4 w-4 accent-primary" />
                <span className="text-xs font-bold text-ink">
                  {ui("Acting / officiating charge")}
                  <span className="ms-1 font-medium text-ink-muted">{ui("— holding the post without the rank")}</span>
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-status-info-text" />
              <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Secondary reporting lines")}</h4>
            </div>
            <p className="text-xs font-normal text-ink-muted">
              {ui("For work that cuts across the chart — exam duty, a committee, a project. Drawn dashed, and they never change who this person answers to day to day.")}
            </p>

            {lines.length > 0 ? (
              <ul className="space-y-1.5">
                {lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                      {line.manager.fullName}
                      {line.label ? <span className="font-semibold text-ink-muted"> · {line.label}</span> : null}
                    </span>
                    <Badge variant="info" size="sm">{ui(REPORTING_LINE_KIND_LABELS[line.kind] ?? line.kind)}</Badge>
                    <Button variant="ghost" className="text-status-error-text actionable-hover:bg-status-error-surface actionable-hover:text-status-error-text" size="icon" type="button" onClick={() => setPendingRemoval({ kind: "line", id: line.id, name: line.manager.fullName })} aria-label={ui("Remove line")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Select value={newLine.managerId} onChange={(e) => setNewLine((p) => ({ ...p, managerId: e.target.value }))} >
                <option value="">{ui("Also reports to…")}</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName}</option>
                ))}
              </Select>
              <Input
                value={newLine.label}
                onChange={(e) => setNewLine((p) => ({ ...p, label: e.target.value }))}
                placeholder={ui("What for? e.g. Exam duty")}

              />
              <BrandButton variant="soft" size="sm" icon={<Plus aria-hidden="true" />} onClick={addLine} disabled={!newLine.managerId}>
                {ui("Add")}
              </BrandButton>
            </div>
          </section>
        </div>
      ) : (
        <ServiceRecord
          loading={loadingHistory}
          failed={historyFailed}
          onRetry={() => void loadHistory()}
          history={history}
          chain={chain}
          joiningDate={node.joiningDate}
          rankSince={node.rankSince}
        />
      )}
      <ConfirmAction
        open={pendingRemoval !== null}
        tone="warning"
        title={pendingRemoval?.kind === "member" ? ui("Remove from {0}?", [pendingRemoval.name]) : ui("Remove the reporting line to {0}?", [pendingRemoval?.name ?? ""])}
        description={pendingRemoval?.kind === "member"
          ? ui("{0} leaves this unit. Their history is kept and you can add them back at any time.", [node.fullName])
          : ui("{0} stops reporting to this person on this line. The change is recorded in their history.", [node.fullName])}
        confirmLabel={pendingRemoval?.kind === "member" ? ui("Remove from unit") : ui("Remove line")}
        cancelLabel={ui("Keep")}
        busy={removalBusy}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={async () => {
          if (!pendingRemoval) return;
          setRemovalBusy(true);
          if (pendingRemoval.kind === "member") await departmentAction({ action: "remove-member", memberId: pendingRemoval.id }, ui("Removed from {0}", [pendingRemoval.name]));
          else await removeLine(pendingRemoval.id);
          setRemovalBusy(false);
          setPendingRemoval(null);
        }}
      />
    </Modal>
  );
}

/** Secondary reporting line kinds (EN UI keys), never shown as raw enum values. */
const REPORTING_LINE_KIND_LABELS: Record<string, string> = {
  DOTTED: "Dotted line",
  FUNCTIONAL: "Functional",
  PROJECT: "Project",
};

function ServiceRecord({
  loading,
  failed = false,
  onRetry,
  history,
  chain,
  joiningDate,
  rankSince,
}: {
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  history: Appointment[];
  chain: Array<{ id: string; fullName: string; designation: string | null }>;
  joiningDate: string | null;
  rankSince: string | null;
}) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  if (loading) {
    return <SkeletonList rows={3} label={ui("Loading the service record…")} />;
  }
  if (failed) {
    return (
      <ErrorState
        variant="panel"
        title={ui("Couldn't load the service record")}
        description={ui("The appointment history didn't come back. Check your connection and try again.")}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="space-y-5">
      <DeskStats>
        <StatTile icon={CalendarDays} tone="info" label={ui("Joined")} value={<span className="text-base sm:text-lg">{joiningDate ? date(joiningDate) : ui("Not recorded")}</span>} />
        <StatTile icon={ArrowUpRight} index={1} label={ui("In current rank since")} value={<span className="text-base sm:text-lg">{rankSince ? date(rankSince) : ui("Not recorded")}</span>} />
      </DeskStats>

      {chain.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Chain of command")}</h4>
          <ol className="flex flex-wrap items-center gap-1.5">
            {chain.map((person, index) => (
              <li key={person.id} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true" className="inline-block text-ink-muted rtl:rotate-180">→</span> : null}
                <span className="rounded-xl bg-muted px-2.5 py-1.5 text-2xs font-bold text-ink">
                  <bdi>{person.fullName}</bdi>
                  {person.designation ? <span className="font-semibold text-ink-muted"> · {person.designation}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Every position held")}</h4>
        {history.length === 0 ? (
          <EmptyState size="sm" icon={History} title={ui("Nothing recorded yet")} description={ui("The first change you save here starts the record.")} />
        ) : (
          <ol className={deskTimeline}>
            {history.map((entry) => (
              <li key={entry.id} data-tone={entry.effectiveTo ? "neutral" : "success"}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-ink">{ui(CHANGE_KIND_LABELS[entry.changeKind as keyof typeof CHANGE_KIND_LABELS] ?? entry.changeKind)}</span>
                    {entry.isActing ? <DeskPill tone="warning">{ui("Acting")}</DeskPill> : null}
                    {!entry.effectiveTo ? <DeskPill tone="success">{ui("Current")}</DeskPill> : null}
                    <span className="ms-auto text-2xs font-semibold tabular-nums text-ink-muted">
                      {date(entry.effectiveFrom)}
                      {entry.effectiveTo ? <> <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> {date(entry.effectiveTo)}</> : null}
                    </span>
                  </div>
                  <p className="mt-1 text-2xs font-bold text-ink">
                    {entry.designationName || ui("No rank")}
                    {entry.departmentName ? <span className="font-semibold text-ink-muted"> · {entry.departmentName}</span> : null}
                  </p>
                  {entry.reportsToName ? (
                    <p className="text-xs font-normal text-ink-muted">{ui("Reporting to {0}", [entry.reportsToName])}</p>
                  ) : null}
                  {entry.orderRef ? (
                    <p className="mt-1 text-2xs font-bold text-ink-muted">{ui("Order {0}", [entry.orderRef])}</p>
                  ) : null}
                  {entry.notes ? <p className="mt-1 text-xs font-normal text-ink-muted">{entry.notes}</p> : null}
                  {entry.approvedBy ? (
                    <p className="mt-1 text-xs font-normal text-ink-muted">{ui("Recorded by {0}", [entry.approvedBy.fullName])}</p>
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
      <label className="block text-2xs font-bold text-ink">{label}</label>
      {children}
      {hint ? <p className="text-xs font-normal text-ink-muted">{hint}</p> : null}
    </div>
  );
}
