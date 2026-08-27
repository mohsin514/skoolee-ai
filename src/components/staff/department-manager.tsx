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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
}: {
  campusId: string;
  staff: OrgNode[];
  onChanged?: () => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberFor, setMemberFor] = useState<Unit | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Unit | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/departments?campusId=${campusId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load departments");
      setUnits(data.departments ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load departments");
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
        ...(draft.id ? { id: draft.id } : { campusId }),
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
      if (!res.ok) throw new Error(data.error || "Could not save the unit");
      toast.success(draft.id ? "Unit updated" : `${payload.name} created`);
      setDraft(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the unit");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (unit: Unit) => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/staff/departments?id=${unit.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove the unit");
      toast.success(data.message || `${unit.name} removed`);
      setPendingRemoval(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the unit");
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
      if (!res.ok) throw new Error(data.error || "That did not work");
      toast.success(successMessage);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading departments…
      </div>
    );
  }

  const renderUnit = (unit: Unit, depth: number): React.ReactNode => {
    const children = childrenOf.get(unit.id) ?? [];
    const isOpen = expanded.has(unit.id);
    const head = unit.members.find((m) => m.role === "HEAD");

    return (
      <li key={unit.id} style={{ marginLeft: depth * 20 }} className="space-y-1.5">
        <div
          className={cn(
            "rounded-2xl border bg-white px-3.5 py-3",
            unit.isActive ? "border-[#cfc2d6]/40" : "border-dashed border-[#cfc2d6]/60 opacity-60"
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => toggle(unit.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f9] text-muted transition-colors hover:text-[#8127cf]"
              aria-label={isOpen ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
            >
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-black text-ink">{unit.name}</span>
                {unit.code ? <span className="text-[10px] font-bold text-muted">{unit.code}</span> : null}
                <span className="rounded-full bg-[#f3f4f9] px-2 py-0.5 text-[9px] font-black uppercase text-muted">
                  {DEPARTMENT_KIND_LABELS[unit.kind]}
                </span>
                {!unit.isActive ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">ARCHIVED</span>
                ) : null}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-muted">
                {head ? (
                  <span className="inline-flex items-center gap-1 text-[#8127cf]">
                    <Crown className="h-3 w-3" />
                    {head.isActing ? "Acting head" : "Head"}: {head.user.fullName}
                  </span>
                ) : (
                  <span className="text-amber-600">No head assigned</span>
                )}
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {unit.members.length}
                </span>
              </span>
            </span>

            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setMemberFor(unit)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                aria-label={`Manage people in ${unit.name}`}
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
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
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                aria-label={`Edit ${unit.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPendingRemoval(unit)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${unit.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>

          {isOpen ? (
            <div className="mt-3 space-y-2 border-t border-[#cfc2d6]/30 pt-3">
              {unit.description ? <p className="text-[11px] font-semibold text-muted">{unit.description}</p> : null}
              {unit.members.length === 0 ? (
                <p className="text-[11px] font-semibold text-muted">
                  Nobody in this unit yet. Add people, then give one of them charge of it.
                </p>
              ) : (
                <ul className="space-y-1">
                  {unit.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2 rounded-xl bg-[#f3f4f9]/60 px-2.5 py-1.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-[9px] font-black text-muted">
                        {member.user.profileImageUrl ? (
                          <AvatarImage src={member.user.profileImageUrl} name={member.user.fullName} />
                        ) : (
                          initialsOf(member.user.fullName)
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-ink">
                        {member.user.fullName}
                        {member.user.staffProfile?.designation ? (
                          <span className="font-semibold text-muted"> · {member.user.staffProfile.designation}</span>
                        ) : null}
                      </span>
                      {member.isPrimary ? (
                        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black text-muted" title="This is their home department">
                          HOME
                        </span>
                      ) : null}
                      <Select
                        value={member.role}
                        onChange={(e) =>
                          act(
                            { action: "set-member", departmentId: unit.id, userId: member.user.id, role: e.target.value },
                            `${member.user.fullName} is now ${DEPARTMENT_ROLE_LABELS[e.target.value as keyof typeof DEPARTMENT_ROLE_LABELS].toLowerCase()} of ${unit.name}`
                          )
                        }
                        className="h-7 w-auto shrink-0 rounded-lg px-2 py-0 text-[10px]"
                      >
                        {Object.entries(DEPARTMENT_ROLE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => act({ action: "remove-member", memberId: member.id }, `${member.user.fullName} removed from ${unit.name}`)}
                        className="shrink-0 rounded-lg p-1 text-muted hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove ${member.user.fullName} from ${unit.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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
          <h3 className="text-sm font-black text-ink">Departments & units</h3>
          <p className="mt-0.5 max-w-2xl text-xs font-semibold text-muted">
            Faculties, departments, year sections and admin units. Nest them however your institution is
            organised — a school usually keeps one flat level, a university nests departments inside faculties.
          </p>
        </div>
        <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
          Add unit
        </BrandButton>
      </div>

      {roots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cfc2d6]/60 bg-[#fafaff] px-6 py-12 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm font-black text-ink">No departments yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-muted">
            Applying a preset on the Rank ladder tab creates a starting set for your kind of institution, or add
            your own here.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">{roots.map((unit) => renderUnit(unit, 0))}</ul>
      )}

      <ConfirmAction
        open={pendingRemoval !== null}
        tone={pendingRemoval && pendingRemoval.members.length > 0 ? "warning" : "danger"}
        title={pendingRemoval ? `Remove ${pendingRemoval.name}?` : ""}
        description={
          pendingRemoval && pendingRemoval.members.length > 0
            ? `${pendingRemoval.members.length} people still belong to this unit, so it will be archived rather than deleted — their history stays intact.`
            : "Nobody belongs to this unit, so it will be deleted outright."
        }
        confirmLabel={pendingRemoval && pendingRemoval.members.length > 0 ? "Archive unit" : "Delete unit"}
        busy={removing}
        onConfirm={() => pendingRemoval && remove(pendingRemoval)}
        onCancel={() => setPendingRemoval(null)}
      />

      {draft ? (
        <Modal
          title={draft.id ? `Edit ${draft.name || "unit"}` : "New unit"}
          eyebrow="Departments"
          icon={Building2}
          size="md"
          onClose={() => setDraft(null)}
          footer={
            <ModalActions
              busy={saving}
              busyLabel="Saving…"
              actionLabel={draft.id ? "Save unit" : "Create unit"}
              onCancel={() => setDraft(null)}
              onAction={save}
              blockedReason={draft.name.trim() ? null : "Give the unit a name."}
            />
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Labelled label="Name" required>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Faculty of Science" />
              </Labelled>
            </div>
            <Labelled label="Code" hint="Short identifier used on lists">
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="e.g. FSC" />
            </Labelled>
            <Labelled label="Kind">
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as typeof draft.kind })}>
                {Object.entries(DEPARTMENT_KIND_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </Labelled>
            <div className="sm:col-span-2">
              <Labelled label="Sits inside" hint="Leave empty for a top-level unit.">
                <Select value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
                  <option value="">Nothing — top level</option>
                  {units
                    .filter((u) => u.id !== draft.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({DEPARTMENT_KIND_LABELS[u.kind]})
                      </option>
                    ))}
                </Select>
              </Labelled>
            </div>
            <div className="sm:col-span-2">
              <Labelled label="Description" hint="Optional">
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
      `${person?.fullName ?? "Staff member"} added to ${unit.name}`
    );
    setUserId("");
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title={`People in ${unit.name}`}
      eyebrow={DEPARTMENT_KIND_LABELS[unit.kind]}
      subtitle="Headship is a post, not a rank — giving someone charge here does not change their designation or their salary."
      icon={Users}
      size="sm"
      onClose={onClose}
      footer={
        <ModalActions
          busy={busy}
          busyLabel="Adding…"
          actionLabel="Add to unit"
          onCancel={onClose}
          onAction={add}
          blockedReason={userId ? null : "Pick someone first."}
        />
      }
    >
      <div className="space-y-3">
        {head ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[#fbf0fe]/60 px-3.5 py-2.5">
            <Crown className="h-4 w-4 shrink-0 text-[#8127cf]" />
            <p className="min-w-0 flex-1 text-xs font-bold text-ink">
              {head.isActing ? "Acting head" : "Head"}: {head.user.fullName}
            </p>
            <button
              type="button"
              onClick={() => onAct({ action: "set-head", departmentId: unit.id, userId: null }, `${unit.name} has no head now`)}
              className="shrink-0 text-[10px] font-black uppercase text-muted hover:text-rose-600"
            >
              Clear
            </button>
          </div>
        ) : null}

        <Labelled label="Staff member" required>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Pick someone…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
                {s.designation ? ` — ${s.designation.name}` : ""}
              </option>
            ))}
          </Select>
        </Labelled>

        <Labelled label="Their role here">
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {Object.entries(DEPARTMENT_ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </Labelled>

        {role === "HEAD" ? (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={isActing} onChange={(e) => setIsActing(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8127cf]" />
            <span>
              <span className="block text-xs font-black text-ink">Acting charge</span>
              <span className="block text-[10px] font-semibold text-muted">
                Covering the post without holding it permanently. Whoever heads it now steps back to member.
              </span>
            </span>
          </label>
        ) : (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8127cf]" />
            <span>
              <span className="block text-xs font-black text-ink">Make this their home department</span>
              <span className="block text-[10px] font-semibold text-muted">
                The one the org chart files them under. Someone can belong to several; only one is home.
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
      <label className="block text-[11px] font-black text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[10px] font-semibold text-muted">{hint}</p> : null}
    </div>
  );
}
