"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, ShieldAlert, UserPlus, Users } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { inviteStaff } from "@/app/actions/invite";
import { INVITABLE_ROLES, membershipPreview, type InvitableRole } from "@/lib/membership-access";
import { roleLabelFor, type UserRole } from "@/lib/roles";
import type { InstitutionKind } from "@/lib/auth/institution";
import { signOutInvalidSession } from "@/lib/auth/invalid-session";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";

/**
 * Everyone with an account, and what each may manage (M13, extracted from the orphan `/memberships` page). Mounted
 * by the institution authority: `/super?view=access&tab=members` (group admin) and
 * `/admin?view=access&tab=members` (school admin). Copy and role names follow the kind of school (§1.5, R-I11):
 * a single school has a school admin and no group admins.
 *
 * - Inviting and reviewing access happen in dialogs; the list is the screen.
 * - "May pay for the subscription" is offered only in a school group, only for a member whose role is the
 *   authority role (another group admin), and that change is flag-only: the stored role and campus are sent as
 *   they are — a group admin's campus is null and stays null (G7b; P1 validates it against the stored row).
 * - Every saved change to someone's access — revoke, restore, role or campus, a delegation on or off — is
 *   confirmed with a typed reason that goes into the audit row (§8.1 R3, §4.5.3, §4.5.5).
 * - Turning a delegation on needs two-step sign-in (G7, F28): without it an unset switch is not offered and one
 *   Alert says how to turn it on; a switch that is already on stays, so it can still be turned off. Plain
 *   invitations need no MFA.
 * - A host that owns the PageHeader passes `exportRequest` (a counter): the panel then drops its own Export
 *   button and exports each time the counter changes (§4.4 People & access secondary "Export members").
 */
type Member = { id: string; fullName: string; email: string; role: UserRole; campusId: string | null; isActive: boolean; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean; accessVersion: number };
type Data = {
  members: Member[]; campuses: { id: string; name: string }[]; school: { name: string; registrationKind: string }; canManage: boolean; isOwner: boolean;
  isAuthority?: boolean; currentUserId: string; institutionKind?: InstitutionKind | null; authorityRole?: "SUPER_ADMIN" | "ADMIN" | null;
};
type Draft = { email: string; role: UserRole; campusId: string; purchase: boolean; manage: boolean; active: boolean };

/** What a saved review changes for one member. The confirmation names each change; an empty list saves nothing. */
export type AccessChange = "revoke" | "restore" | "role" | "campus" | "manage-on" | "manage-off" | "purchase-on" | "purchase-off";
export function accessChanges(member: Pick<Member, "role" | "campusId" | "isActive" | "canManageMemberships" | "canPurchaseSubscription">, draft: Pick<Draft, "role" | "campusId" | "active" | "manage" | "purchase">, flagOnly: boolean, purchaseAllowed = true): AccessChange[] {
  const changes: AccessChange[] = [];
  if (member.isActive && !draft.active) changes.push("revoke");
  if (!member.isActive && draft.active) changes.push("restore");
  if (!flagOnly && draft.role !== member.role) changes.push("role");
  if (!flagOnly && (draft.campusId || null) !== member.campusId) changes.push("campus");
  if (draft.manage !== member.canManageMemberships) changes.push(draft.manage ? "manage-on" : "manage-off");
  // Only another group admin can hold the purchase flag; for everyone else a stale one is cleared on save.
  const purchase = flagOnly && purchaseAllowed ? draft.purchase : false;
  if (purchase !== member.canPurchaseSubscription) changes.push(purchase ? "purchase-on" : "purchase-off");
  return changes;
}

const CHANGE_TEXT: Record<AccessChange, string> = {
  revoke: "Their access ends and they are signed out.",
  restore: "Their access is restored.",
  role: "Their work role changes.",
  campus: "They move to another campus.",
  "manage-on": "They may invite and remove staff.",
  "manage-off": "They may no longer invite or remove staff.",
  "purchase-on": "They may pay for the SkooleeAI subscription.",
  "purchase-off": "They may no longer pay for the SkooleeAI subscription.",
};

/** CSV cells that spreadsheet apps would execute are neutralised. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function MembershipsPanel({ exportRequest }: { exportRequest?: number } = {}) {
  const t = useUiText();
  const { language } = useLocale();
  const access = useConsoleAccess();
  const mfaReady = !access.ready || access.has("mfaVerified");
  const [data, setData] = useState<Data | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<Draft>({ email: "", role: "TEACHER", campusId: "", purchase: false, manage: false, active: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const response = await fetch("/api/memberships", { cache: "no-store" });
      if (response.status === 401) { await signOutInvalidSession(); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // The kind of school decides the names and which delegations exist (§1.5): the server says it; the console
  // capability is the fallback while an older response is cached.
  const kind: InstitutionKind = data?.institutionKind ?? (access.has("standaloneOwner") ? "STANDALONE" : "GROUP");
  const group = kind === "GROUP";
  const authorityRole: UserRole = data?.authorityRole ?? (group ? "SUPER_ADMIN" : "ADMIN");
  const label = useCallback((role: UserRole) => roleLabelFor({ role, institutionKind: kind }, language), [kind, language]);
  const authority = Boolean(data && (data.isAuthority ?? data.isOwner));
  const campusName = useCallback((id: string | null) => (id ? data?.campuses.find(campus => campus.id === id)?.name : null) ?? t("Every campus"), [data, t]);
  const flagOnly = Boolean(editing && editing.role === authorityRole);
  const preview = membershipPreview(draft.role, draft.purchase, draft.manage, language);
  const changes = editing ? accessChanges(editing, draft, flagOnly, group) : [];

  const openInvite = () => {
    setEditing(null);
    setDraft({ email: "", role: "TEACHER", campusId: data?.campuses[0]?.id ?? "", purchase: false, manage: false, active: true });
    setInviting(true);
  };
  const openEdit = (member: Member) => {
    setInviting(false);
    setDraft({ email: member.email, role: member.role, campusId: member.campusId ?? "", purchase: member.canPurchaseSubscription, manage: member.canManageMemberships, active: member.isActive });
    setEditing(member);
  };
  const close = () => { setEditing(null); setInviting(false); setConfirming(false); };

  // G8: visibility follows the STORED value, so unticking a delegation in this dialog never hides the box that
  // would undo it. Turning one on needs two-step sign-in; turning one off never does.
  const offerManage = mfaReady || Boolean(editing?.canManageMemberships);
  const offerPurchase = group && flagOnly && (mfaReady || Boolean(editing?.canPurchaseSubscription));

  const invite = async () => {
    setBusy(true);
    try {
      await inviteStaff({ email: draft.email.trim(), role: draft.role as InvitableRole, campusId: draft.campusId, canPurchaseSubscription: false, canManageMemberships: draft.manage && mfaReady });
      toast.success(t("Invitation sent to {0}.", [draft.email.trim()]));
      close();
      await load();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The invitation could not be sent. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  const saveAccess = async (reason?: string) => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = flagOnly
        // G7b: an authority-role member keeps their stored role and campus (null for a group admin); only the
        // flags and the active state change.
        ? { userId: editing.id, role: editing.role, campusId: editing.campusId, canPurchaseSubscription: group && draft.purchase, canManageMemberships: draft.manage, isActive: draft.active, expectedVersion: editing.accessVersion, reviewed: true, reason }
        // G7: a purchase flag is never sent true for an invitable role; a stale one is cleared on save.
        : { userId: editing.id, role: draft.role, campusId: draft.campusId, canPurchaseSubscription: false, canManageMemberships: draft.manage, isActive: draft.active, expectedVersion: editing.accessVersion, reviewed: true, reason };
      const response = await fetch("/api/memberships", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error);
      toast.success(changes.includes("revoke") ? t("{0}'s access was revoked.", [editing.fullName]) : t("Access updated. {0} signs in again with the new access.", [editing.fullName]));
      close();
      await load();
    } catch (error) {
      setConfirming(false);
      toast.error(friendlyErrorMessage(error, t("The change could not be saved. Try again.")));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = useCallback(() => {
    if (!data) return;
    const header = ["name", "email", "role", "campus", "status", "owner", "may_invite_staff", "may_pay"];
    const lines = data.members.map(member => [member.fullName, member.email, label(member.role), campusName(member.campusId), member.isActive ? t("Active") : t("Revoked"), member.isInstitutionOwner ? "yes" : "no", member.canManageMemberships ? "yes" : "no", member.canPurchaseSubscription ? "yes" : "no"].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `members-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }, [campusName, data, label, t]);

  // The host's PageHeader "Export members": each new counter value exports once (never on mount).
  const lastExport = useRef(exportRequest);
  useEffect(() => {
    // Pressed while the list is still loading: it runs once the list arrives.
    if (exportRequest === undefined || exportRequest === lastExport.current || !data) return;
    lastExport.current = exportRequest;
    if (data.members.length) exportCsv();
    else toast.info(t("There is nobody to export yet."));
  }, [data, exportCsv, exportRequest, t]);

  const roleOptions = useMemo(() => INVITABLE_ROLES.filter(item => authority || item !== "CAMPUS_ADMIN"), [authority]);
  const editable = (member: Member) => Boolean(data?.canManage) && !member.isInstitutionOwner && member.id !== data?.currentUserId
    && (INVITABLE_ROLES.includes(member.role as InvitableRole) || (authority && member.role === authorityRole));
  const validInvite = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) && Boolean(draft.campusId);
  const validEdit = (flagOnly || Boolean(draft.campusId)) && changes.length > 0;
  const family = draft.role === "PARENT" || draft.role === "STUDENT";

  if (loadFailed && !data) return <div className="sk-panel"><ErrorState title={t("Members could not be loaded.")} description={t("Check your connection and try again.")} onRetry={() => load()} /></div>;
  if (!data) return <SkeletonList rows={4} label={t("Loading members")} />;

  const revoking = changes.includes("revoke");

  return (
    <div className="space-y-4" data-memberships data-kind={kind}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{t(group
          ? "Everyone with an account in your school group. Choose who may invite staff, and which group admins may pay for the subscription."
          : "Everyone with an account at your school. Choose who may invite and remove staff on your campus.")}</p>
        <div className="flex flex-wrap gap-2">
          {exportRequest === undefined && data.members.length ? <Button variant="outline" size="sm" type="button" onClick={exportCsv}><Download aria-hidden="true" />{t("Export members")}</Button> : null}
          {data.canManage ? <Button variant="outline" size="sm" type="button" onClick={openInvite}><UserPlus aria-hidden="true" />{t("Invite someone")}</Button> : null}
        </div>
      </div>
      {!mfaReady && authority ? (
        <Alert tone="warning" icon={ShieldAlert} title={t("Turn on two-step sign-in")} live="off"
          actions={<Link href="/account/security" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Turn on two-step sign-in")}</Link>}>
          {t(group ? "Giving someone member or billing rights needs two-step sign-in on your account. Plain invitations work without it." : "Giving someone member rights needs two-step sign-in on your account. Plain invitations work without it.")}
        </Alert>
      ) : null}
      {!data.canManage ? <Alert tone="neutral" live="off">{t(group ? "Only a group admin can invite people or change access here." : "Only the school admin can invite people or change access here.")}</Alert> : null}

      {data.members.length === 0 ? (
        <div className="sk-panel">
          <EmptyState size="sm" icon={Users} title={t("No members to show")} description={t("People you invite appear here.")}
            action={data.canManage ? <Button type="button" onClick={openInvite}><UserPlus aria-hidden="true" />{t("Invite someone")}</Button> : undefined} />
        </div>
      ) : (
        <ul className="sk-stagger space-y-2" aria-label={t("Everyone")}>
          {data.members.map(member => (
            <li key={member.id} className="sk-panel flex flex-wrap items-center justify-between gap-3 p-4" data-member={member.role}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink-strong"><bdi>{member.fullName}</bdi></p>
                <p className="truncate text-sm text-ink-muted"><bdi dir="ltr">{member.email}</bdi></p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink">
                  <span className="font-medium">{label(member.role)}</span>
                  <span className="text-ink-subtle">· <bdi>{campusName(member.campusId)}</bdi></span>
                  {member.isInstitutionOwner ? <Badge size="sm" variant="secondary">{t("Account owner")}</Badge> : null}
                  {member.canManageMemberships ? <Badge size="sm" variant="info">{t("May invite and remove staff")}</Badge> : null}
                  {group && member.canPurchaseSubscription && !member.isInstitutionOwner ? <Badge size="sm" variant="info">{t("May pay for the SkooleeAI subscription")}</Badge> : null}
                  <Badge size="sm" dot variant={member.isActive ? "success" : "neutral"}>{member.isActive ? t("Active") : t("Revoked")}</Badge>
                </p>
              </div>
              {editable(member) ? <Button variant="outline" size="sm" type="button" onClick={() => openEdit(member)} aria-label={t("Review access for {0}", [member.fullName])}>{t("Review access")}</Button> : null}
            </li>
          ))}
        </ul>
      )}

      {inviting || editing ? (
        <Modal
          title={editing ? t("Review access") : t(group ? "Invite to the school group" : "Invite to the school")}
          subtitle={editing ? <bdi>{editing.fullName}</bdi> : undefined}
          icon={editing ? Users : UserPlus}
          size="sm"
          onClose={close}
          dirty={!busy && (inviting ? Boolean(draft.email.trim()) : changes.length > 0)}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" disabled={busy} onClick={close}>{t("Keep editing")}</Button>
              {editing
                ? <Button type="button" variant={revoking ? "outline" : "default"} className={revoking ? "text-destructive" : undefined} disabled={!validEdit || busy} onClick={() => setConfirming(true)}>{revoking ? t("Revoke access") : t("Save access")}</Button>
                : <Button type="button" loading={busy} disabled={!validInvite || busy} onClick={() => void invite()}>{t("Send invitation")}</Button>}
            </div>
          }
        >
          <form className="space-y-4" noValidate onSubmit={event => { event.preventDefault(); if (editing) { if (validEdit) setConfirming(true); } else if (validInvite) void invite(); }}>
            {inviting ? (
              <FormField name="member-email" label={t("Email")} required>
                <Input type="email" dir="ltr" autoComplete="email" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} />
              </FormField>
            ) : null}
            {flagOnly && editing ? (
              <Alert tone="neutral" live="off" compact>{label(editing.role)} · <bdi>{campusName(editing.campusId)}</bdi>. {t("Their role and campus stay as they are; only what they may manage changes.")}</Alert>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="member-role" label={t("Work role")}>
                  <Select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as UserRole, manage: false })}>
                    {roleOptions.map(item => <option key={item} value={item}>{label(item)}</option>)}
                  </Select>
                </FormField>
                <FormField name="member-campus" label={t("Campus")} required>
                  <Select value={draft.campusId} onChange={event => setDraft({ ...draft, campusId: event.target.value })}>
                    <option value="">{t("Choose campus")}</option>
                    {data.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </Select>
                </FormField>
              </div>
            )}
            {authority && !family && offerManage ? (
              <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
                <Checkbox checked={draft.manage} onChange={event => setDraft({ ...draft, manage: event.target.checked })} />
                <span><span className="block font-medium">{t("May invite and remove staff")}</span><span className="block text-xs text-ink-muted">{t(flagOnly ? "Across every campus in the group." : "On their own campus only.")}</span></span>
              </label>
            ) : null}
            {offerPurchase ? (
              <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
                <Checkbox checked={draft.purchase} onChange={event => setDraft({ ...draft, purchase: event.target.checked })} />
                <span><span className="block font-medium">{t("May pay for the SkooleeAI subscription")}</span><span className="block text-xs text-ink-muted">{t("Only group admins can hold this. They see Billing & plan and can change the plan and payment method.")}</span></span>
              </label>
            ) : null}
            {editing ? (
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <Checkbox checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />
                {t("Active membership (clear to revoke)")}
              </label>
            ) : null}
            {authority && !mfaReady ? <p className="text-xs text-ink-muted">{t("Turning a right on needs two-step sign-in on your account; turning one off does not.")}</p> : null}
            <section aria-label={t("What this person can do")} className="space-y-1.5 rounded-2xl border border-border-subtle bg-surface-subtle p-4 text-sm leading-relaxed text-ink-muted">
              <h3 className="text-sm font-bold text-ink-strong">{t("What this person can do")}</h3>
              {editing ? <p className="font-medium text-status-warning-text">{t("Now")}: {label(editing.role)} · <bdi>{campusName(editing.campusId)}</bdi>. {t("Saving signs them out; they sign in again with the new access.")}</p> : null}
              <ul className="list-inside list-disc space-y-1 text-ink">{preview.tasks.map(task => <li key={task}>{task}</li>)}</ul>
              <p>{preview.management}</p>
              {offerPurchase ? <p>{preview.purchasing}</p> : null}
            </section>
          </form>
        </Modal>
      ) : null}

      {/* §8.1 R3: revoke, permission and delegation changes are confirmed with a typed reason, kept in the audit row. */}
      {editing ? (
        <ConfirmAction
          open={confirming}
          tone={revoking ? "danger" : "warning"}
          title={revoking ? t("Revoke {0}'s access?", [editing.fullName]) : t("Change {0}'s access?", [editing.fullName])}
          description={t("{0} is signed out straight away and signs in again with the new access. You can change this again later.", [editing.fullName])}
          detail={<ul className="list-inside list-disc space-y-1 text-sm text-ink">{changes.map(change => <li key={change}>{t(CHANGE_TEXT[change])}</li>)}</ul>}
          confirmLabel={revoking ? t("Revoke access") : t("Save access")}
          cancelLabel={t("Keep editing")}
          requireReason={{ label: t("Why this change?"), minLength: 10, placeholder: t("For example: moved to the head office team") }}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={(reason?: string) => void saveAccess(reason)}
        />
      ) : null}
    </div>
  );
}
