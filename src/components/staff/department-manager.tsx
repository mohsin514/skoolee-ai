"use client";

/**
 * Departments, faculties and sections.
 *
 * The tree nests because institutions do: a university has departments inside
 * faculties, a school has subject departments beside year sections, and both
 * have admin units that teach nobody. One `kind` field and one `parentId`
 * covers all of it without a separate model per shape.
 *
 * Headship lives here rather than on the person, because it is a POST held on
 * top of a rank. Handing Science to someone else changes who runs Science; it
 * does not promote them, and it does not demote the person who had it.
 */

import { useUiText } from "@/components/locale/LocaleProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { AvatarImage, initialsOf } from "@/components/ui/avatar-image";
import { cn } from "@/lib/utils";
import { DEPARTMENT_KIND_LABELS, DEPARTMENT_ROLE_LABELS } from "@/lib/staff/hierarchy-presets";
import type { OrgNode } from "@/lib/staff/hierarchy";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { SkeletonList, SkeletonRegion } from "@/components/ui/skeleton";


interface Member {
  id: string;
  role: keyof typeof DEPARTMENT_ROLE_LABELS;
  isPrimary: boolean;
  isActing: boolean;
  user: {
    id: string;
    fullName: string;
    profileImageUrl: string | null;
    staffProfile: { designation: string | null; seniorityLevel: number | null } | null;
  };
}

interface Unit {
  id: string;
  name: string;
  code: string | null;
  kind: keyof typeof DEPARTMENT_KIND_LABELS;
  parentId: string | null;
  headId: string | null;
  description: string | null;
  isActive: boolean;
  head: { id: string; fullName: string; profileImageUrl: string | null } | null;
  members: Member[];
}

const emptyDraft = {
  id: "",
  name: "",
  code: "",
  kind: "DEPARTMENT" as keyof typeof DEPARTMENT_KIND_LABELS,
  parentId: "",
  description: "",
};

export function DepartmentManager({
  campusId,
  staff,
  onChanged,
  addRequest,
  hideAdd = false,
}: {
  campusId?: string;
  staff: OrgNode[];
  onChanged?: () => void;
  /** Each change opens "New unit" (the console's PageHeader primary "Add unit"); the first value never fires. */
  addRequest?: number;
  /** The console's PageHeader carries "Add unit", so the section header does not repeat it. */
  hideAdd?: boolean;
}) {
  const ui = useUiText();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberFor, setMemberFor] = useState<Unit | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Unit | null>(null);
  // R3: taking someone out of a unit is a removal, so it confirms first (it used to act on one click).
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<{ id: string; name: string; unit: string } | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastAddRequest = useRef(addRequest);
  useEffect(() => {
    if (addRequest === undefined || addRequest === lastAddRequest.current) return;
    lastAddRequest.current = addRequest;
    setDraft({ ...emptyDraft });
  }, [addRequest]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/departments${campusId ? `?campusId=${campusId}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load departments");
      setUnits(data.departments ?? []);
      setLoadError(false);
    } catch (error) {
      // R4: the inline ErrorState below (with retry) is the only signal; no toast on top of it.
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Unit[]>();
    for (const unit of units) {
      const key = unit.parentId;
      const list = map.get(key) ?? [];
      list.push(unit);
      map.set(key, list);
    }
    return map;
  }, [units]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...(draft.id ? { id: draft.id } : campusId ? { campusId } : {}),
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        kind: draft.kind,
        parentId: draft.parentId || null,
        description: draft.description.trim() || null,
      };
      const res = await fetch("/api/staff/departments", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      toast.success(draft.id ? ui("Unit updated") : ui("{0} created", [payload.name]));
      setDraft(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the unit. Please try again.")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (unit: Unit) => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/staff/departments?id=${unit.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      toast.success(data.message || ui("{0} removed", [unit.name]));
      setPendingRemoval(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not remove the unit. Please try again.")));
    } finally {
      setRemoving(false);
    }
  };

  const act = async (body: Record<string, unknown>, successMessage: string) => {
    try {
      const res = await fetch("/api/staff/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      toast.success(successMessage);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the change. Please try again.")));
    }
  };

  if (loading) {
    return (
      <SkeletonRegion label={ui("Loading departments…")} className="py-2">
        <SkeletonList rows={4} />
      </SkeletonRegion>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title={ui("Departments did not load")}
        description={ui("Could not load the department list. Check your connection and try again.")}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  const renderUnit = (unit: Unit, depth: number): React.ReactNode => {
    const children = childrenOf.get(unit.id) ?? [];
    const isOpen = expanded.has(unit.id);
    const head = unit.members.find((m) => m.role === "HEAD");

    return (
      <li key={unit.id} style={{ marginInlineStart: depth * 20 }} className="space-y-1.5">
        <div
          className={cn(
            "sk-hover-lift rounded-2xl border bg-card px-3.5 py-3",
            unit.isActive ? "border-edge/40" : "border-dashed border-edge/60 opacity-60"
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <IconButton variant="secondary"
              onClick={() => toggle(unit.id)}
              label={isOpen ? ui("Collapse {0}", [unit.name]) : ui("Expand {0}", [unit.name])}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" className="rtl:rotate-180" />}
            </IconButton>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-ink-strong">{unit.name}</span>
                {unit.code ? <span className="text-xs font-medium text-ink-muted">{unit.code}</span> : null}
                <Badge variant="secondary" size="sm">
                  {ui(DEPARTMENT_KIND_LABELS[unit.kind])}
                </Badge>
                {!unit.isActive ? (
                  <Badge variant="neutral" size="sm" dot>{ui("Archived")}</Badge>
                ) : null}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-ink-subtle">
                {head ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Crown className="h-3 w-3" />
                    {head.isActing ? ui("Acting head") : ui("Head")}: {head.user.fullName}
                  </span>
                ) : (
                  <span className="font-medium text-status-warning-text">{ui("No head assigned")}</span>
                )}
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Users aria-hidden="true" className="h-3 w-3" /> <span className="tabular-nums">{unit.members.length}</span>
                </span>
              </span>
            </span>

            <span className="flex shrink-0 gap-1">
              <IconButton variant="secondary"
                onClick={() => setMemberFor(unit)}
                label={ui("Manage people in {0}", [unit.name])}
              >
                <UserPlus aria-hidden="true" />
              </IconButton>
              <IconButton variant="secondary"
                label={ui("Edit {0}", [unit.name])}
                onClick={() =>
                  setDraft({
                    id: unit.id,
                    name: unit.name,
                    code: unit.code ?? "",
                    kind: unit.kind,
                    parentId: unit.parentId ?? "",
                    description: unit.description ?? "",
                  })
                }
              >
                <Pencil aria-hidden="true" />
              </IconButton>
              <IconButton variant="ghost" className="text-status-error-text actionable-hover:bg-status-error-surface actionable-hover:text-status-error-text"
                onClick={() => setPendingRemoval(unit)}
                label={ui("Remove {0}", [unit.name])}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </span>
          </div>

          {isOpen ? (
            <div className="mt-3 space-y-2 border-t border-edge/30 pt-3">
              {unit.description ? <p className="text-sm font-normal leading-relaxed text-ink-muted">{unit.description}</p> : null}
              {unit.members.length === 0 ? (
                <p className="text-sm font-normal leading-relaxed text-ink-muted">
                  {ui("Nobody in this unit yet. Add people, then give one of them charge of it.")}
                </p>
              ) : (
                <ul className="space-y-1">
                  {unit.members.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card text-2xs font-bold text-ink-muted">
                        {member.user.profileImageUrl ? (
                          <AvatarImage src={member.user.profileImageUrl} name={member.user.fullName} />
                        ) : (
                          initialsOf(member.user.fullName)
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-strong">
                        <bdi>{member.user.fullName}</bdi>
                        {member.user.staffProfile?.designation ? (
                          <span className="font-normal text-ink-muted"> · {member.user.staffProfile.designation}</span>
                        ) : null}
                      </span>
                      {member.isPrimary ? (
                        <Tooltip content={ui("This is their home department")}>
                          <span tabIndex={0} className="shrink-0 rounded-full">
                            <Badge variant="neutral" size="sm">{ui("Home unit")}</Badge>
                          </span>
                        </Tooltip>
                      ) : null}
                      <Select
                        value={member.role}
                        onChange={(e) =>
                          act(
                            { action: "set-member", departmentId: unit.id, userId: member.user.id, role: e.target.value },
                            ui("{0} is now {1} of {2}", [member.user.fullName, ui(DEPARTMENT_ROLE_LABELS[e.target.value as keyof typeof DEPARTMENT_ROLE_LABELS]), unit.name])
                          )
                        }
                        className="w-auto shrink-0 px-2 py-0"
                      >
                        {Object.entries(DEPARTMENT_ROLE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{ui(label)}</option>
                        ))}
                      </Select>
                      <IconButton variant="ghost" className="text-status-error-text actionable-hover:bg-status-error-surface actionable-hover:text-status-error-text"
                        onClick={() => setPendingMemberRemoval({ id: member.id, name: member.user.fullName, unit: unit.name })}
                        label={ui("Remove {0} from {1}", [member.user.fullName, unit.name])}
                      >
                        <Trash2 aria-hidden="true" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {children.length > 0 ? <ul className="space-y-1.5">{children.map((child) => renderUnit(child, depth + 1))}</ul> : null}
      </li>
    );
  };

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink-strong">{ui("Departments & units")}</h3>
          <p className="mt-0.5 max-w-2xl text-sm font-normal leading-relaxed text-ink-muted">
            {ui("Faculties, departments, year sections and admin units. Nest them however your institution is organised — a school usually keeps one flat level, a university nests departments inside faculties.")}
          </p>
        </div>
        {hideAdd ? null : (
          <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
            {ui("Add unit")}
          </BrandButton>
        )}
      </div>

      {roots.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={ui("No departments yet")}
          description={ui("Applying a preset on the Rank ladder tab creates a starting set for your kind of institution, or add your own here.")}
          action={
            <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
              {ui("Add unit")}
            </BrandButton>
          }
        />
      ) : (
        <ul className="space-y-1.5">{roots.map((unit) => renderUnit(unit, 0))}</ul>
      )}

      <ConfirmAction
        open={pendingRemoval !== null}
        tone={pendingRemoval && pendingRemoval.members.length > 0 ? "warning" : "danger"}
        title={pendingRemoval ? ui("Remove {0}?", [pendingRemoval.name]) : ""}
        description={
          pendingRemoval && pendingRemoval.members.length > 0
            ? ui("{0} people still belong to this unit, so it will be archived rather than deleted — their history stays intact.", [pendingRemoval.members.length])
            : ui("Nobody belongs to this unit, so it will be deleted outright.")
        }
        confirmLabel={pendingRemoval && pendingRemoval.members.length > 0 ? ui("Archive unit") : ui("Delete unit")}
        busy={removing}
        onConfirm={async () => { if (pendingRemoval) await remove(pendingRemoval); }}
        onCancel={() => setPendingRemoval(null)}
      />

      <ConfirmAction
        open={pendingMemberRemoval !== null}
        tone="warning"
        title={pendingMemberRemoval ? ui("Remove {0} from {1}?", [pendingMemberRemoval.name, pendingMemberRemoval.unit]) : ""}
        description={ui("Their record in this unit is kept, and you can add them back at any time. Their rank and salary do not change.")}
        confirmLabel={ui("Remove from unit")}
        busy={removingMember}
        onConfirm={async () => {
          if (!pendingMemberRemoval) return;
          setRemovingMember(true);
          try {
            await act({ action: "remove-member", memberId: pendingMemberRemoval.id }, ui("{0} removed from {1}", [pendingMemberRemoval.name, pendingMemberRemoval.unit]));
          } finally {
            setRemovingMember(false);
            setPendingMemberRemoval(null);
          }
        }}
        onCancel={() => setPendingMemberRemoval(null)}
      />

      {draft ? (
        <Modal
          title={draft.id ? draft.name ? ui("Edit {0}", [draft.name]) : ui("Edit unit") : ui("New unit")}
          eyebrow={ui("Departments")}
          icon={Building2}
          size="md"
          onClose={() => setDraft(null)}
          footer={
            <ModalActions
              busy={saving}
              busyLabel={ui("Saving…")}
              actionLabel={draft.id ? ui("Save unit") : ui("Create unit")}
              onCancel={() => setDraft(null)}
              onAction={save}
              blockedReason={draft.name.trim() ? null : ui("Give the unit a name.")}
            />
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Labelled label={ui("Name")} required>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={ui("e.g. Faculty of Science")} />
              </Labelled>
            </div>
            <Labelled label={ui("Code")} hint={ui("Short identifier used on lists")}>
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder={ui("e.g. FSC")} />
            </Labelled>
            <Labelled label={ui("Kind")}>
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as typeof draft.kind })}>
                {Object.entries(DEPARTMENT_KIND_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{ui(label)}</option>
                ))}
              </Select>
            </Labelled>
            <div className="sm:col-span-2">
              <Labelled label={ui("Sits inside")} hint={ui("Leave empty for a top-level unit.")}>
                <Select value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
                  <option value="">{ui("Nothing — top level")}</option>
                  {units
                    .filter((u) => u.id !== draft.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({ui(DEPARTMENT_KIND_LABELS[u.kind])})
                      </option>
                    ))}
                </Select>
              </Labelled>
            </div>
            <div className="sm:col-span-2">
              <Labelled label={ui("Description")} hint={ui("Optional")}>
                <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Labelled>
            </div>
          </div>
        </Modal>
      ) : null}

      {memberFor ? (
        <MemberPicker
          unit={memberFor}
          staff={staff}
          onClose={() => setMemberFor(null)}
          onAct={act}
        />
      ) : null}
    </div>
  );
}

function MemberPicker({
  unit,
  staff,
  onClose,
  onAct,
}: {
  unit: Unit;
  staff: OrgNode[];
  onClose: () => void;
  onAct: (body: Record<string, unknown>, message: string) => Promise<void>;
}) {
  const ui = useUiText();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<keyof typeof DEPARTMENT_ROLE_LABELS>("MEMBER");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [busy, setBusy] = useState(false);

  const inUnit = new Set(unit.members.map((m) => m.user.id));
  const available = staff.filter((s) => !inUnit.has(s.id));
  const head = unit.members.find((m) => m.role === "HEAD");

  const add = async () => {
    if (!userId) return;
    setBusy(true);
    const person = staff.find((s) => s.id === userId);
    await onAct(
      role === "HEAD"
        ? { action: "set-head", departmentId: unit.id, userId, isActing }
        : { action: "set-member", departmentId: unit.id, userId, role, isPrimary },
      ui("{0} added to {1}", [person?.fullName ?? ui("Staff member"), unit.name])
    );
    setUserId("");
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title={ui("People in {0}", [unit.name])}
      eyebrow={ui(DEPARTMENT_KIND_LABELS[unit.kind])}
      subtitle={ui("Headship is a post, not a rank — giving someone charge here does not change their designation or their salary.")}
      icon={Users}
      size="sm"
      onClose={onClose}
      footer={
        <ModalActions
          busy={busy}
          busyLabel={ui("Adding…")}
          actionLabel={ui("Add to unit")}
          onCancel={onClose}
          onAction={add}
          blockedReason={userId ? null : ui("Pick someone first.")}
        />
      }
    >
      <div className="space-y-3">
        {head ? (
          <div className="flex items-center gap-2 rounded-2xl bg-brand-50/60 px-3.5 py-2.5">
            <Crown aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink-strong">
              {head.isActing ? ui("Acting head") : ui("Head")}: <bdi>{head.user.fullName}</bdi>
            </p>
            <Button variant="outline" size="sm"
              type="button"
              onClick={() => onAct({ action: "set-head", departmentId: unit.id, userId: null }, ui("{0} has no head now", [unit.name]))}
              className="shrink-0"
            >
              {ui("Clear")}
            </Button>
          </div>
        ) : null}

        <Labelled label={ui("Staff member")} required>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{ui("Pick someone…")}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
                {s.designation ? ` — ${s.designation.name}` : ""}
              </option>
            ))}
          </Select>
        </Labelled>

        <Labelled label={ui("Their role here")}>
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {Object.entries(DEPARTMENT_ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{ui(label)}</option>
            ))}
          </Select>
        </Labelled>

        {role === "HEAD" ? (
          <label className="flex cursor-pointer items-start gap-2.5">
            <SystemCheckbox  checked={isActing} onChange={(e) => setIsActing(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="block text-sm font-semibold text-ink-strong">{ui("Acting charge")}</span>
              <span className="block text-xs font-normal leading-relaxed text-ink-muted">
                {ui("Covering the post without holding it permanently. Whoever heads it now steps back to member.")}
              </span>
            </span>
          </label>
        ) : (
          <label className="flex cursor-pointer items-start gap-2.5">
            <SystemCheckbox  checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="block text-sm font-semibold text-ink-strong">{ui("Make this their home department")}</span>
              <span className="block text-xs font-normal leading-relaxed text-ink-muted">
                {ui("The one the org chart files them under. Someone can belong to several; only one is home.")}
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function Labelled({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-ink-strong">
        {label}
        {required ? <span aria-hidden="true" className="ms-0.5 text-status-error-text">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs font-normal leading-relaxed text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
