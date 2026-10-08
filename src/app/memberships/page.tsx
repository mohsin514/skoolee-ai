"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { inviteStaff } from "@/app/actions/invite";
import { INVITABLE_ROLES, membershipPreview, type InvitableRole } from "@/lib/membership-access";
import { roleLabel, type UserRole } from "@/lib/roles";
import { signOutInvalidSession } from "@/lib/auth/invalid-session";

type Member = { id: string; fullName: string; email: string; role: UserRole; campusId: string; isActive: boolean; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean; accessVersion: number };
type Data = { members: Member[]; campuses: { id: string; name: string }[]; school: { name: string; registrationKind: string }; canManage: boolean; isOwner: boolean; currentUserId: string };
export default function MembershipsPage() {
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const label = (role: UserRole) => roleLabel(role, language);
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("TEACHER");
  const [campusId, setCampusId] = useState("");
  const [purchase, setPurchase] = useState(false);
  const [manage, setManage] = useState(false);
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<Member | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const preview = membershipPreview(role, purchase, manage, language);
  async function load() {
    const response = await fetch("/api/memberships");
    if (response.status === 401) return signOutInvalidSession();
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load memberships");
    setData(result); setCampusId(result.campuses[0]?.id || "");
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  function saveDraft() {
    if (!data) return;
    sessionStorage.setItem(`membership-invite:${data.currentUserId}`, JSON.stringify({ email, role, campusId, purchase, manage, expiresAt: Date.now() + 30 * 60 * 1000 }));
    setMessage("Invitation draft saved on this tab for 30 minutes. Review access before sending.");
  }
  function restoreDraft() {
    if (!data) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem(`membership-invite:${data.currentUserId}`) || "null");
      if (!draft || draft.expiresAt < Date.now() || !INVITABLE_ROLES.includes(draft.role) || !data.campuses.some(campus => campus.id === draft.campusId)) throw new Error();
      setEmail(draft.email); setRole(draft.role); setCampusId(draft.campusId); setPurchase(data.isOwner && draft.purchase); setManage(data.isOwner && draft.manage); setEditing(null); setReview(false); setMessage("Draft restored. Review the current role and scope before sending.");
    } catch { setMessage("No current invitation draft is available in this scope."); }
  }
  async function switchInstitution() {
    if (data) sessionStorage.removeItem(`membership-invite:${data.currentUserId}`);
    await signOutInvalidSession();
  }
  async function submit() {
    setBusy(true); setMessage("");
    try {
      if (editing) {
        const response = await fetch("/api/memberships", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: editing.id, role, campusId, canPurchaseSubscription: purchase, canManageMemberships: manage, isActive: active, expectedVersion: editing.accessVersion, reviewed: true }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to change membership");
        setMessage("Membership updated. Previous sessions are invalid. The member must sign in again.");
      } else {
        await inviteStaff({ email, role, campusId, canPurchaseSubscription: purchase, canManageMemberships: manage });
        setMessage("Invitation sent for the reviewed role and campus.");
      }
      if (data) sessionStorage.removeItem(`membership-invite:${data.currentUserId}`);
      setReview(false); setEditing(null); setEmail(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again"); }
    finally { setBusy(false); }
  }
  return <main dir={language === "ar" ? "rtl" : "ltr"} lang={language} className="mx-auto max-w-5xl space-y-6 p-4 text-ink sm:p-8">
    <nav className="flex flex-wrap gap-4"><Link href="/dashboard">Workspace</Link><button onClick={switchInstitution}>Switch institution securely</button></nav>
    <button onClick={() => setLanguage(language === "en" ? "ar" : "en")}>{language === "en" ? "العربية" : "English"}</button>
    <h1 className="text-3xl font-bold">{language === "ar" ? "عضويات المؤسسة" : "Institution memberships"}</h1>
    <p>Each membership has its own institution and campus. Switching requires sign-in to the chosen institution; matching emails never grant access.</p>
    <p role="status" aria-live="polite">{message || (!data ? "Loading your scope…" : `${data.school.name} · ${data.school.registrationKind}`)}</p>
    {data?.canManage && <form className="space-y-4 rounded-xl border p-5" onSubmit={event => { event.preventDefault(); setReview(true); }}>
      <h2 className="text-xl font-semibold">{editing ? "Review membership change" : "Invite to institution"}</h2>
      <fieldset disabled={busy || review} className="grid gap-4 sm:grid-cols-2">
        <label>Email<input className="block w-full rounded border p-2" type="email" dir="ltr" required value={email} disabled={!!editing} onChange={event => setEmail(event.target.value)} /></label>
        <label>Work role<select className="block w-full rounded border p-2" value={role} onChange={event => { setRole(event.target.value as InvitableRole); setPurchase(false); setManage(false); }}>{INVITABLE_ROLES.filter(item => data.isOwner || item !== "CAMPUS_ADMIN").map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label>Campus scope<select className="block w-full rounded border p-2" required value={campusId} onChange={event => setCampusId(event.target.value)}><option value="">Choose campus</option>{data.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
        {editing && <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active membership (clear to revoke)</label>}
        {data.isOwner && !["STUDENT", "PARENT"].includes(role) && <><label><input type="checkbox" checked={purchase} onChange={event => setPurchase(event.target.checked)} /> Delegate subscription purchasing</label><label><input type="checkbox" checked={manage} onChange={event => setManage(event.target.checked)} /> Delegate membership management</label></>}
      </fieldset>
      {!editing && !review && <div className="flex flex-wrap gap-4"><button type="button" onClick={saveDraft}>Save draft</button><button type="button" onClick={restoreDraft}>Restore this tab’s draft</button></div>}
      <section aria-label="Access preview" className="space-y-2 rounded-lg bg-slate-50 p-4">
        <h3 className="font-bold">{label(role)} · {data.campuses.find(campus => campus.id === campusId)?.name || "Choose campus"}</h3>
        {editing && <p>Current: {label(editing.role)} · {data.campuses.find(campus => campus.id === editing.campusId)?.name}. Previous sessions will stop immediately.</p>}
        <ul className="list-inside list-disc">{preview.tasks.map(task => <li key={task}>{task}</li>)}</ul>
        <p>{preview.ownership}</p><p>{preview.purchasing}</p><p>{preview.management}</p><p>{preview.rank}</p><p>Workspace: <bdi>{preview.landing}</bdi>. No institution setup is required.</p>
      </section>
      {review ? <div className="flex flex-wrap gap-3"><button className="rounded bg-purple-700 p-3 text-white" type="button" disabled={busy} onClick={submit}>{busy ? "Saving…" : editing ? "Confirm reviewed change" : "Send reviewed invitation"}</button><button type="button" disabled={busy} onClick={() => setReview(false)}>Back to edit</button></div> : <button className="rounded bg-purple-700 p-3 text-white">Review {editing ? "change" : "invitation"}</button>}
    </form>}
    <section className="space-y-3" aria-label="Current memberships"><h2 className="text-xl font-semibold">Memberships in this scope</h2>{data?.members.length === 0 && <p>No memberships in this scope. Contact your institution administrator.</p>}{data?.members.map(member => <article key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-bold">{member.fullName}</h3><p><bdi>{member.email}</bdi></p><p>{label(member.role)} · {member.isInstitutionOwner ? "Institution owner" : "Member"} · {member.isActive ? "Active" : "Revoked"}</p></div>{data.canManage && !member.isInstitutionOwner && member.id !== data.currentUserId && INVITABLE_ROLES.includes(member.role as InvitableRole) && <button onClick={() => { setEditing(member); setEmail(member.email); setRole(member.role as InvitableRole); setCampusId(member.campusId); setPurchase(member.canPurchaseSubscription); setManage(member.canManageMemberships); setActive(member.isActive); setReview(false); window.scrollTo({ top: 0 }); }}>Review access</button>}</article>)}</section>
    {data?.members.some(member => member.id === data.currentUserId && (member.isInstitutionOwner || member.canPurchaseSubscription)) && <Link className="block underline" href="/subscription">Open subscription purchasing workspace</Link>}
    {!data?.canManage && data && <p>Ask your institution owner to invite people or change membership access.</p>}
  </main>;
}
