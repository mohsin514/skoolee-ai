"use client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import Link from "next/link";
import { inviteStaff } from "@/app/actions/invite";
import { INVITABLE_ROLES, membershipPreview, type InvitableRole } from "@/lib/membership-access";
import { roleLabel, type UserRole } from "@/lib/roles";
import { signOutInvalidSession } from "@/lib/auth/invalid-session";

type Member = { id: string; fullName: string; email: string; role: UserRole; campusId: string; isActive: boolean; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean; accessVersion: number };
type Data = { members: Member[]; campuses: { id: string; name: string }[]; school: { name: string; registrationKind: string }; canManage: boolean; isOwner: boolean; currentUserId: string };
const copy = {
  en: { workspace: "Workspace", switch: "Switch institution securely", language: "Language", title: "Institution memberships", scope: "Each membership has its own institution and campus. Switching requires sign-in to the chosen institution; matching emails never grant access.", loading: "Loading your scope…", loadError: "Unable to load memberships", invite: "Invite to institution", change: "Review membership change", email: "Email", role: "Work role", campus: "Campus scope", chooseCampus: "Choose campus", active: "Active membership (clear to revoke)", purchase: "Delegate subscription purchasing", manage: "Delegate membership management", saveDraft: "Save draft", restore: "Restore this tab’s draft", preview: "Access preview", current: "Current", sessions: "Previous sessions will stop immediately.", choose: "Choose campus", workspaceLabel: "Workspace", noSetup: "No institution setup is required.", save: "Saving…", confirmChange: "Confirm reviewed change", send: "Send reviewed invitation", back: "Back to edit", reviewChange: "Review change", reviewInvite: "Review invitation", currentMembers: "Current memberships", noMembers: "No memberships in this scope. Contact your institution administrator.", owner: "Institution owner", member: "Member", activeLabel: "Active", revoked: "Revoked", reviewAccess: "Review access", openSubscription: "Open subscription purchasing workspace", askOwner: "Ask your institution owner to invite people or change membership access.", draftSaved: "Invitation draft saved on this tab for 30 minutes. Review access before sending.", restored: "Draft restored. Review the current role and scope before sending.", noDraft: "No current invitation draft is available in this scope.", updated: "Membership updated. Previous sessions are invalid. The member must sign in again.", sent: "Invitation sent for the reviewed role and campus.", unableChange: "Unable to change membership", tryAgain: "Please try again" },
  ar: { workspace: "مساحة العمل", switch: "تبديل المؤسسة بأمان", language: "اللغة", title: "عضويات المؤسسة", scope: "لكل عضوية مؤسسة وفرع خاصان بها. يتطلب التبديل تسجيل الدخول إلى المؤسسة المختارة؛ تطابق البريد الإلكتروني لا يمنح صلاحية.", loading: "جارٍ تحميل نطاقك…", loadError: "تعذر تحميل العضويات", invite: "دعوة إلى المؤسسة", change: "مراجعة تغيير العضوية", email: "البريد الإلكتروني", role: "الدور الوظيفي", campus: "نطاق الفرع", chooseCampus: "اختر الفرع", active: "عضوية نشطة (أزل التحديد للإلغاء)", purchase: "تفويض شراء الاشتراك", manage: "تفويض إدارة العضويات", saveDraft: "حفظ المسودة", restore: "استعادة مسودة علامة التبويب", preview: "معاينة الصلاحيات", current: "الحالي", sessions: "ستتوقف الجلسات السابقة فوراً.", choose: "اختر الفرع", workspaceLabel: "مساحة العمل", noSetup: "لا يلزم إعداد المؤسسة.", save: "جارٍ الحفظ…", confirmChange: "تأكيد التغيير بعد المراجعة", send: "إرسال الدعوة بعد المراجعة", back: "العودة للتعديل", reviewChange: "مراجعة التغيير", reviewInvite: "مراجعة الدعوة", currentMembers: "العضويات الحالية", noMembers: "لا توجد عضويات في هذا النطاق. تواصل مع مسؤول المؤسسة.", owner: "مالك المؤسسة", member: "عضو", activeLabel: "نشط", revoked: "ملغى", reviewAccess: "مراجعة الصلاحيات", openSubscription: "فتح مساحة شراء الاشتراك", askOwner: "اطلب من مالك المؤسسة دعوة الأشخاص أو تغيير صلاحيات العضوية.", draftSaved: "حُفظت مسودة الدعوة في علامة التبويب لمدة ٣٠ دقيقة. راجع الصلاحيات قبل الإرسال.", restored: "استُعيدت المسودة. راجع الدور والنطاق الحاليين قبل الإرسال.", noDraft: "لا توجد مسودة دعوة حالية في هذا النطاق.", updated: "تم تحديث العضوية. انتهت صلاحية الجلسات السابقة ويجب على العضو تسجيل الدخول مجدداً.", sent: "أُرسلت الدعوة للدور والفرع اللذين تمت مراجعتهما.", unableChange: "تعذر تغيير العضوية", tryAgain: "حاول مجدداً" },
  ur: { workspace: "ورک اسپیس", switch: "ادارہ محفوظ طریقے سے تبدیل کریں", language: "زبان", title: "ادارے کی رکنیتیں", scope: "ہر رکنیت کا اپنا ادارہ اور کیمپس ہوتا ہے۔ تبدیلی کے لیے منتخب ادارے میں سائن اِن ضروری ہے؛ ایک جیسے ای میل پتے رسائی نہیں دیتے۔", loading: "آپ کا دائرہ لوڈ ہو رہا ہے…", loadError: "رکنیتیں لوڈ نہیں ہو سکیں", invite: "ادارے میں دعوت دیں", change: "رکنیت کی تبدیلی کا جائزہ", email: "ای میل", role: "کام کا کردار", campus: "کیمپس کا دائرہ", chooseCampus: "کیمپس منتخب کریں", active: "فعال رکنیت (منسوخ کرنے کے لیے نشان ہٹائیں)", purchase: "سبسکرپشن خریدنے کی اجازت دیں", manage: "رکنیتیں سنبھالنے کی اجازت دیں", saveDraft: "مسودہ محفوظ کریں", restore: "اس ٹیب کا مسودہ بحال کریں", preview: "رسائی کا پیش منظر", current: "موجودہ", sessions: "پچھلے سیشن فوراً ختم ہو جائیں گے۔", choose: "کیمپس منتخب کریں", workspaceLabel: "ورک اسپیس", noSetup: "ادارے کی ترتیب درکار نہیں۔", save: "محفوظ ہو رہا ہے…", confirmChange: "جائزہ شدہ تبدیلی کی تصدیق", send: "جائزہ شدہ دعوت بھیجیں", back: "ترمیم پر واپس جائیں", reviewChange: "تبدیلی کا جائزہ", reviewInvite: "دعوت کا جائزہ", currentMembers: "موجودہ رکنیتیں", noMembers: "اس دائرے میں رکنیتیں نہیں۔ ادارے کے منتظم سے رابطہ کریں۔", owner: "ادارے کا مالک", member: "رکن", activeLabel: "فعال", revoked: "منسوخ", reviewAccess: "رسائی کا جائزہ", openSubscription: "سبسکرپشن خریدنے کا ورک اسپیس کھولیں", askOwner: "لوگوں کو دعوت دینے یا رکنیت کی رسائی بدلنے کے لیے ادارے کے مالک سے کہیں۔", draftSaved: "دعوت کا مسودہ اس ٹیب میں ۳۰ منٹ کے لیے محفوظ ہو گیا۔ بھیجنے سے پہلے رسائی دیکھیں۔", restored: "مسودہ بحال ہو گیا۔ بھیجنے سے پہلے موجودہ کردار اور دائرہ دیکھیں۔", noDraft: "اس دائرے میں دعوت کا کوئی موجودہ مسودہ نہیں۔", updated: "رکنیت اپ ڈیٹ ہو گئی۔ پچھلے سیشن ختم ہو گئے؛ رکن کو دوبارہ سائن اِن کرنا ہوگا۔", sent: "جائزہ شدہ کردار اور کیمپس کی دعوت بھیج دی گئی۔", unableChange: "رکنیت تبدیل نہیں ہو سکی", tryAgain: "دوبارہ کوشش کریں" },
} as const;
export default function MembershipsPage() {
  const [language, setLanguage] = useState<keyof typeof copy>("en");
  const t = copy[language];
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
    if (!response.ok) throw new Error(result.error || t.loadError);
    setData(result); setCampusId(result.campuses[0]?.id || "");
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  function saveDraft() {
    if (!data) return;
    sessionStorage.setItem(`membership-invite:${data.currentUserId}`, JSON.stringify({ email, role, campusId, purchase, manage, expiresAt: Date.now() + 30 * 60 * 1000 }));
    setMessage(t.draftSaved);
  }
  function restoreDraft() {
    if (!data) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem(`membership-invite:${data.currentUserId}`) || "null");
      if (!draft || draft.expiresAt < Date.now() || !INVITABLE_ROLES.includes(draft.role) || !data.campuses.some(campus => campus.id === draft.campusId)) throw new Error();
      setEmail(draft.email); setRole(draft.role); setCampusId(draft.campusId); setPurchase(data.isOwner && draft.purchase); setManage(data.isOwner && draft.manage); setEditing(null); setReview(false); setMessage(t.restored);
    } catch { setMessage(t.noDraft); }
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
        setMessage(t.updated);
      } else {
        await inviteStaff({ email, role, campusId, canPurchaseSubscription: purchase, canManageMemberships: manage });
        setMessage(t.sent);
      }
      if (data) sessionStorage.removeItem(`membership-invite:${data.currentUserId}`);
      setReview(false); setEditing(null); setEmail(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : t.tryAgain); }
    finally { setBusy(false); }
  }
  return <main dir={language === "en" ? "ltr" : "rtl"} lang={language} className="mx-auto max-w-5xl space-y-6 p-4 text-ink sm:p-8">
    <nav className="flex flex-wrap gap-4"><Link href="/dashboard">{t.workspace}</Link><Button variant="ghost" className="min-h-11" onClick={switchInstitution}>{t.switch}</Button></nav>
    <label className="flex min-h-11 w-fit items-center gap-2">{t.language}<Select aria-label={t.language} value={language} onChange={event => setLanguage(event.target.value as keyof typeof copy)} className="min-h-11"><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></label>
    <h1 className="text-3xl font-bold">{t.title}</h1>
    <p>{t.scope}</p>
    <p role="status" aria-live="polite">{message || (!data ? t.loading : `${data.school.name} · ${data.school.registrationKind}`)}</p>
    {data?.canManage && <form className="space-y-4 sk-panel p-5" onSubmit={event => { event.preventDefault(); setReview(true); }}>
      <h2 className="text-xl font-semibold">{editing ? t.change : t.invite}</h2>
      <fieldset disabled={busy || review} className="grid gap-4 sm:grid-cols-2">
        <label>{t.email}<Input className="block min-h-11 w-full" type="email" dir="ltr" required value={email} disabled={!!editing} onChange={event => setEmail(event.target.value)} /></label>
        <label>{t.role}<Select className="block min-h-11 w-full" value={role} onChange={event => { setRole(event.target.value as InvitableRole); setPurchase(false); setManage(false); }}>{INVITABLE_ROLES.filter(item => data.isOwner || item !== "CAMPUS_ADMIN").map(item => <option key={item} value={item}>{label(item)}</option>)}</Select></label>
        <label>{t.campus}<Select className="block min-h-11 w-full" required value={campusId} onChange={event => setCampusId(event.target.value)}><option value="">{t.chooseCampus}</option>{data.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></label>
        {editing && <label className="min-h-11"><Checkbox  checked={active} onChange={event => setActive(event.target.checked)} /> {t.active}</label>}
        {data.isOwner && !["STUDENT", "PARENT"].includes(role) && <><label className="min-h-11"><Checkbox  checked={purchase} onChange={event => setPurchase(event.target.checked)} /> {t.purchase}</label><label className="min-h-11"><Checkbox  checked={manage} onChange={event => setManage(event.target.checked)} /> {t.manage}</label></>}
      </fieldset>
      {!editing && !review && <div className="flex flex-wrap gap-4"><Button variant="ghost" className="min-h-11" type="button" onClick={saveDraft}>{t.saveDraft}</Button><Button variant="ghost" className="min-h-11" type="button" onClick={restoreDraft}>{t.restore}</Button></div>}
      <section aria-label={t.preview} className="space-y-2 rounded-lg bg-slate-50 p-4">
        <h3 className="font-bold">{label(role)} · {data.campuses.find(campus => campus.id === campusId)?.name || t.choose}</h3>
        {editing && <p>{t.current}: {label(editing.role)} · {data.campuses.find(campus => campus.id === editing.campusId)?.name}. {t.sessions}</p>}
        <ul className="list-inside list-disc">{preview.tasks.map(task => <li key={task}>{task}</li>)}</ul>
        <p>{preview.ownership}</p><p>{preview.purchasing}</p><p>{preview.management}</p><p>{preview.rank}</p><p>{t.workspaceLabel}: <bdi>{preview.landing}</bdi>. {t.noSetup}</p>
      </section>
      {review ? <div className="flex flex-wrap gap-3"><Button variant="default" className="min-h-11 px-4" type="button" disabled={busy} onClick={submit}>{busy ? t.save : editing ? t.confirmChange : t.send}</Button><Button variant="ghost" className="min-h-11" type="button" disabled={busy} onClick={() => setReview(false)}>{t.back}</Button></div> : <Button variant="default" className="min-h-11 px-4">{editing ? t.reviewChange : t.reviewInvite}</Button>}
    </form>}
    <section className="space-y-3" aria-label={t.currentMembers}><h2 className="text-xl font-semibold">{t.currentMembers}</h2>{data?.members.length === 0 && <p>{t.noMembers}</p>}{data?.members.map(member => <article key={member.id} className="flex flex-wrap items-center justify-between gap-3 sk-panel p-4"><div><h3 className="font-bold">{member.fullName}</h3><p><bdi>{member.email}</bdi></p><p>{label(member.role)} · {member.isInstitutionOwner ? t.owner : t.member} · {member.isActive ? t.activeLabel : t.revoked}</p></div>{data.canManage && !member.isInstitutionOwner && member.id !== data.currentUserId && INVITABLE_ROLES.includes(member.role as InvitableRole) && <Button variant="ghost" className="min-h-11" onClick={() => { setEditing(member); setEmail(member.email); setRole(member.role as InvitableRole); setCampusId(member.campusId); setPurchase(member.canPurchaseSubscription); setManage(member.canManageMemberships); setActive(member.isActive); setReview(false); window.scrollTo({ top: 0 }); }}>{t.reviewAccess}</Button>}</article>)}</section>
    {data?.members.some(member => member.id === data.currentUserId && (member.isInstitutionOwner || member.canPurchaseSubscription)) && <Link className="block min-h-11 underline" href="/subscription">{t.openSubscription}</Link>}
    {!data?.canManage && data && <p>{t.askOwner}</p>}
  </main>;
}
