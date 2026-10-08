"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Locale = "en" | "ar" | "ur";
type Student = { id: string; fullName: string; rollNo: string; campus: { name: string }; class: { name: string; section: string | null } };
type Permissions = {
  learningRecords: boolean;
  attendance: boolean;
  finances: boolean;
  communication: boolean;
  pickup: boolean;
  consents: { medicalTreatment: boolean; fieldTrips: boolean; mediaPublication: boolean; offsiteTravel: boolean };
};
type Relationship = {
  id: string; fullName: string; email: string; phone: string | null; relationship: string; status: string;
  validFrom: string; validUntil: string | null; verifiedAt: string | null; invitationExpiresAt: string | null;
  permissions: Permissions; events: Array<{ id: string; action: string; reason: string; createdAt: string; actorName: string }>;
};
type ReviewItem = { id: string; contactName: string | null; email: string | null; phone: string | null; legacyRelationship: string | null; reason: string; createdAt: string };
type FormValues = { fullName: string; email: string; phone: string; relationship: string; permissions: Permissions; effectiveFrom: string; validUntil: string; status: string; reason: string };
type PendingPreview = { relationshipId: string; previewId: string; permissions: Permissions; status: string; effectiveAt: string; validUntil: string | null; guardianName: string };

const emptyPermissions: Permissions = {
  learningRecords: false, attendance: false, finances: false, communication: false, pickup: false,
  consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false },
};
const localDateTime = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const emptyForm = (): FormValues => ({ fullName: "", email: "", phone: "", relationship: "mother", permissions: structuredClone(emptyPermissions), effectiveFrom: localDateTime(), validUntil: "", status: "", reason: "" });

const copy = {
  en: {
    child: "Child", choose: "Choose a child", add: "Add guardian", name: "Guardian name", email: "Verified account email", phone: "Contact phone", relationship: "Relationship", effective: "Effective from", until: "Access ends (optional)", reason: "Reason for this change", review: "Review access", apply: "Apply reviewed change", cancel: "Cancel", current: "Current guardians", none: "No guardian relationship is recorded for this child.", pending: "Invitation pending", active: "Active", suspended: "Suspended", revoked: "Revoked", draft: "Draft", edit: "Change access", suspend: "Suspend", resume: "Reactivate", revoke: "Revoke access", history: "Access history", reviews: "Legacy contacts for review", contactOnly: "Contact details do not verify a guardian. No access was activated.", resolve: "Mark reviewed", reviewedReason: "Staff reviewed the legacy contact; no account relationship was created.", previewTitle: "Review effective access", previewHelp: "These rights apply only to this child and begin at the shown time.", granted: "Allowed", denied: "Not allowed", learning: "Learning records and published reports", attendanceAccess: "Attendance", finance: "Fee statements and receipts", communication: "School messages", pickup: "Pickup authorization", consentTitle: "Consent actions", medicalTreatment: "Medical treatment", fieldTrips: "Field trips", mediaPublication: "Photo and media publication", offsiteTravel: "Offsite travel", linkMessage: "Access stays pending until the guardian signs in with this exact email and accepts.", copyLink: "Copy invitation page", copied: "Invitation page copied", saveError: "Could not save guardian access", loadError: "Could not load guardian access", loading: "Loading guardian access…", close: "Close preview", send: "Create invitation", requiredReason: "Enter a reason of at least five characters.", statusLabel: "Status", accepted: "Invitation accepted", pendingAccept: "Pending identity verification", previewStale: "Access changed. Review the current permissions again.", guardianRelation: "Guardian relationship", samePhone: "A matching phone number does not connect family records.", success: "Guardian access updated.", relationships: { mother: "Mother", father: "Father", "step-parent": "Step-parent", grandparent: "Grandparent", "legal guardian": "Legal guardian", aunt: "Aunt", uncle: "Uncle", sibling: "Sibling", other: "Other" },
  },
  ar: {
    child: "الطفل", choose: "اختر طفلاً", add: "إضافة ولي أمر", name: "اسم ولي الأمر", email: "بريد الحساب المؤكد", phone: "هاتف التواصل", relationship: "صلة القرابة", effective: "تبدأ الصلاحية", until: "انتهاء الصلاحية (اختياري)", reason: "سبب هذا التغيير", review: "مراجعة الصلاحيات", apply: "تطبيق التغيير المُراجع", cancel: "إلغاء", current: "أولياء الأمور الحاليون", none: "لا توجد علاقة ولي أمر مسجلة لهذا الطفل.", pending: "الدعوة بانتظار القبول", active: "نشط", suspended: "موقوف مؤقتاً", revoked: "ملغى", draft: "مسودة", edit: "تغيير الصلاحيات", suspend: "إيقاف مؤقت", resume: "إعادة التفعيل", revoke: "إلغاء الوصول", history: "سجل الوصول", reviews: "جهات اتصال قديمة للمراجعة", contactOnly: "بيانات الاتصال لا تثبت صلة القرابة. لم يتم تفعيل أي وصول.", resolve: "تحديد كمراجَع", reviewedReason: "راجع الموظف جهة الاتصال القديمة ولم ينشئ علاقة حساب.", previewTitle: "مراجعة الصلاحيات الفعلية", previewHelp: "تسري هذه الصلاحيات على هذا الطفل فقط وتبدأ في الوقت الموضح.", granted: "مسموح", denied: "غير مسموح", learning: "السجلات التعليمية والتقارير المنشورة", attendanceAccess: "الحضور", finance: "كشوف الرسوم والإيصالات", communication: "رسائل المدرسة", pickup: "تفويض الاستلام", consentTitle: "إجراءات الموافقة", medicalTreatment: "العلاج الطبي", fieldTrips: "الرحلات المدرسية", mediaPublication: "نشر الصور والوسائط", offsiteTravel: "التنقل خارج المدرسة", linkMessage: "يبقى الوصول معلّقاً حتى يسجّل ولي الأمر الدخول بهذا البريد نفسه ويقبل الدعوة.", copyLink: "نسخ صفحة الدعوة", copied: "تم نسخ صفحة الدعوة", saveError: "تعذر حفظ صلاحيات ولي الأمر", loadError: "تعذر تحميل صلاحيات ولي الأمر", loading: "جارٍ تحميل الصلاحيات…", close: "إغلاق المراجعة", send: "إنشاء الدعوة", requiredReason: "أدخل سبباً لا يقل عن خمسة أحرف.", statusLabel: "الحالة", accepted: "تم قبول الدعوة", pendingAccept: "بانتظار التحقق من الهوية", previewStale: "تغير الوصول. راجع الصلاحيات الحالية مرة أخرى.", guardianRelation: "صلة ولي الأمر", samePhone: "تطابق رقم الهاتف لا يربط سجلات العائلة.", success: "تم تحديث صلاحيات ولي الأمر.", relationships: { mother: "الأم", father: "الأب", "step-parent": "زوج الأم أو الأب", grandparent: "الجد أو الجدة", "legal guardian": "الوصي القانوني", aunt: "العمة أو الخالة", uncle: "العم أو الخال", sibling: "الأخ أو الأخت", other: "أخرى" },
  },
  ur: {
    child: "بچہ", choose: "بچہ منتخب کریں", add: "سرپرست شامل کریں", name: "سرپرست کا نام", email: "تصدیق شدہ اکاؤنٹ ای میل", phone: "رابطہ فون", relationship: "رشتہ", effective: "رسائی شروع ہوگی", until: "رسائی ختم ہوگی (اختیاری)", reason: "اس تبدیلی کی وجہ", review: "رسائی کا جائزہ", apply: "جائزہ شدہ تبدیلی لاگو کریں", cancel: "منسوخ کریں", current: "موجودہ سرپرست", none: "اس بچے کے لیے کوئی سرپرست ریکارڈ نہیں۔", pending: "دعوت قبول ہونے کی منتظر", active: "فعال", suspended: "عارضی طور پر معطل", revoked: "منسوخ", draft: "مسودہ", edit: "رسائی تبدیل کریں", suspend: "معطل کریں", resume: "دوبارہ فعال کریں", revoke: "رسائی منسوخ کریں", history: "رسائی کی تاریخ", reviews: "جائزے کے لیے پرانے رابطے", contactOnly: "رابطے کی معلومات سرپرست کی تصدیق نہیں کرتیں۔ رسائی فعال نہیں کی گئی۔", resolve: "جائزہ شدہ نشان لگائیں", reviewedReason: "عملے نے پرانا رابطہ دیکھا؛ اکاؤنٹ کا تعلق نہیں بنایا۔", previewTitle: "مؤثر رسائی کا جائزہ", previewHelp: "یہ اجازتیں صرف اسی بچے پر لاگو ہوں گی اور دکھائے گئے وقت سے شروع ہوں گی۔", granted: "اجازت ہے", denied: "اجازت نہیں", learning: "تعلیمی ریکارڈ اور شائع شدہ رپورٹس", attendanceAccess: "حاضری", finance: "فیس اسٹیٹمنٹ اور رسیدیں", communication: "اسکول کے پیغامات", pickup: "بچے کو لے جانے کی اجازت", consentTitle: "رضامندی کے اقدامات", medicalTreatment: "طبی علاج", fieldTrips: "تعلیمی دورے", mediaPublication: "تصاویر اور میڈیا کی اشاعت", offsiteTravel: "اسکول سے باہر سفر", linkMessage: "رسائی اس وقت تک زیرِ التوا رہے گی جب تک سرپرست اسی ای میل سے سائن اِن کر کے دعوت قبول نہ کرے۔", copyLink: "دعوت کا صفحہ نقل کریں", copied: "دعوت کا صفحہ نقل ہوگیا", saveError: "سرپرست کی رسائی محفوظ نہیں ہو سکی", loadError: "سرپرست کی رسائی لوڈ نہیں ہو سکی", loading: "سرپرست کی رسائی لوڈ ہو رہی ہے…", close: "جائزہ بند کریں", send: "دعوت بنائیں", requiredReason: "کم از کم پانچ حروف پر مشتمل وجہ درج کریں۔", statusLabel: "حالت", accepted: "دعوت قبول ہوگئی", pendingAccept: "شناخت کی تصدیق زیرِ التوا", previewStale: "رسائی بدل گئی ہے۔ موجودہ اجازتوں کا دوبارہ جائزہ لیں۔", guardianRelation: "سرپرست کا رشتہ", samePhone: "ایک جیسا فون نمبر خاندانی ریکارڈز کو نہیں جوڑتا۔", success: "سرپرست کی رسائی اپ ڈیٹ ہوگئی۔", relationships: { mother: "والدہ", father: "والد", "step-parent": "سوتیلا والد یا والدہ", grandparent: "دادا، دادی، نانا یا نانی", "legal guardian": "قانونی سرپرست", aunt: "پھوپھی یا خالہ", uncle: "چچا یا ماموں", sibling: "بہن یا بھائی", other: "دیگر" },
  },
} as const;

type LabelKey = Exclude<keyof typeof copy.en, "relationships">;
const simplePermissions: Array<[keyof Omit<Permissions, "consents">, LabelKey]> = [
  ["learningRecords", "learning"], ["attendance", "attendanceAccess"], ["finances", "finance"], ["communication", "communication"], ["pickup", "pickup"],
];
const consentPermissions: Array<[keyof Permissions["consents"], LabelKey]> = [
  ["medicalTreatment", "medicalTreatment"], ["fieldTrips", "fieldTrips"], ["mediaPublication", "mediaPublication"], ["offsiteTravel", "offsiteTravel"],
];

export function GuardianAccessManager({ students, locale }: { students: Student[]; locale: Locale }) {
  const t = copy[locale];
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PendingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const student = students.find((item) => item.id === studentId);

  const refresh = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians?review=1`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t.loadError);
      setRelationships(json.relationships);
      setReviewQueue(json.reviewQueue);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.loadError); }
    finally { setLoading(false); }
  }, [studentId, t.loadError]);

  useEffect(() => { void refresh(); }, [refresh]);

  const beginNew = () => { setEditingId(null); setForm(emptyForm()); setPreview(null); setNotice(""); };
  const beginEdit = (relation: Relationship, status = "") => {
    setEditingId(relation.id);
    setForm({ fullName: relation.fullName, email: relation.email, phone: relation.phone || "", relationship: relation.relationship, permissions: structuredClone(relation.permissions), effectiveFrom: localDateTime(), validUntil: relation.validUntil ? localDateTime(new Date(relation.validUntil)) : "", status, reason: "" });
    setPreview(null); setNotice("");
    document.getElementById("guardian-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const dateToIso = (value: string) => value ? new Date(value).toISOString() : undefined;
  const updatePermission = (key: string, checked: boolean) => setForm((current) => {
    if (key.startsWith("consents.")) {
      const consent = key.slice("consents.".length) as keyof Permissions["consents"];
      return { ...current, permissions: { ...current.permissions, consents: { ...current.permissions.consents, [consent]: checked } } };
    }
    return { ...current, permissions: { ...current.permissions, [key]: checked } };
  });

  const requestPreview = async (event: FormEvent, status = "") => {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setInvitationUrl("");
    if (form.reason.trim().length < 5) { setError(t.requiredReason); setBusy(false); return; }
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", ...(editingId ? { relationshipId: editingId } : {}), fullName: form.fullName, email: form.email, phone: form.phone || null, relationship: form.relationship, permissions: form.permissions, effectiveFrom: dateToIso(form.effectiveFrom), validUntil: dateToIso(form.validUntil) || null, status: status || form.status || undefined, reason: form.reason }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t.saveError);
      setPreview({ relationshipId: json.relationshipId, previewId: json.previewId, permissions: json.effectiveAccess, status: status || form.status || (editingId ? relationships.find((item) => item.id === editingId)?.status || "ACTIVE" : "INVITED"), effectiveAt: json.impact.effectiveFrom, validUntil: json.impact.validUntil, guardianName: json.impact.guardian });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.saveError); }
    finally { setBusy(false); }
  };

  const applyPreview = async () => {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", relationshipId: preview.relationshipId, previewId: preview.previewId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t.previewStale);
      setInvitationUrl(json.invitationUrl || "");
      setNotice(json.status === "INVITED" ? t.linkMessage : t.success);
      setPreview(null); setEditingId(null); setForm(emptyForm()); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.saveError); }
    finally { setBusy(false); }
  };

  const resolveReview = async (reviewId: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve-review", reviewId, reason: t.reviewedReason }) });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t.saveError);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.saveError); }
    finally { setBusy(false); }
  };

  const selected = useMemo(() => students.find((item) => item.id === studentId), [students, studentId]);
  const permissionLabel = (allowed: boolean) => <span className={allowed ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>{allowed ? t.granted : t.denied}</span>;

  useEffect(() => {
    if (!preview) return;
    const dialog = previewDialogRef.current;
    if (!dialog) return;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPreview(null); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [preview]);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#ded5e2] bg-white p-4 shadow-sm sm:p-5">
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-[#1d1b20]">{t.child}</span>
        <select value={studentId} onChange={(event) => { setStudentId(event.target.value); setPreview(null); setEditingId(null); setForm(emptyForm()); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]">
          <option value="">{t.choose}</option>
          {students.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.rollNo} · {item.campus.name}</option>)}
        </select>
      </label>
      {selected ? <p className="mt-3 text-xs text-ink-muted">{[selected.class.name, selected.class.section, selected.campus.name].filter(Boolean).join(" · ")}</p> : null}
    </section>

    {studentId ? <>
      <section className="space-y-3" aria-labelledby="guardian-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="guardian-list-title" className="text-lg font-bold text-[#1d1b20]">{t.current}</h2>
          <button type="button" onClick={beginNew} className="min-h-11 rounded-xl bg-[#8127cf] px-4 text-sm font-semibold text-white hover:bg-[#6b1eae] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf] focus-visible:ring-offset-2">{t.add}</button>
        </div>
        {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-ink-muted">{t.loading}</p> : null}
        {!loading && relationships.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-ink-muted">{t.none}</p> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {relationships.filter((item) => item.status !== "DRAFT").map((relation) => <article key={relation.id} className="min-w-0 rounded-2xl border border-[#ded5e2] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-bold text-[#1d1b20]">{relation.fullName}</h3>
                <p dir="ltr" className="mt-1 truncate text-sm text-ink-muted">{relation.email}</p>
                <p className="mt-1 text-xs text-ink-muted">{t.relationships[relation.relationship as keyof typeof t.relationships] || relation.relationship}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{relation.status === "ACTIVE" ? t.active : relation.status === "SUSPENDED" ? t.suspended : relation.status === "REVOKED" ? t.revoked : t.pending}</span>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {simplePermissions.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-2"><dt className="text-ink-muted">{t[label]}</dt><dd>{permissionLabel(relation.permissions[key])}</dd></div>)}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => beginEdit(relation)} className="min-h-10 rounded-lg border border-[#cfc2d6] px-3 text-sm font-semibold text-[#5e277f] focus-visible:ring-2 focus-visible:ring-[#8127cf]">{t.edit}</button>
              {relation.status === "ACTIVE" ? <>
                <button type="button" disabled={busy} onClick={() => beginEdit(relation, "SUSPENDED")} className="min-h-10 rounded-lg border border-amber-300 px-3 text-sm font-semibold text-amber-800 focus-visible:ring-2 focus-visible:ring-amber-600">{t.suspend}</button>
                <button type="button" disabled={busy} onClick={() => beginEdit(relation, "REVOKED")} className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600">{t.revoke}</button>
              </> : relation.status === "SUSPENDED" ? <button type="button" disabled={busy} onClick={() => beginEdit(relation, "ACTIVE")} className="min-h-10 rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600">{t.resume}</button> : null}
            </div>
            <details className="mt-4 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-[#5e277f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]">{t.history}</summary>
              <ol className="mt-3 space-y-2 text-xs text-ink-muted">
                {relation.events.length ? relation.events.map((event) => <li key={event.id} className="border-s border-slate-200 ps-3"><span className="font-semibold text-[#1d1b20]">{event.action}</span> · {event.reason}<br /><span dir="ltr">{new Date(event.createdAt).toLocaleString(locale)}</span> · {event.actorName}</li>) : <li>{t.none}</li>}
              </ol>
            </details>
          </article>)}
        </div>
      </section>

      <section id="guardian-editor" className="scroll-mt-4 rounded-2xl border border-[#ded5e2] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold text-[#1d1b20]">{editingId ? t.edit : t.add}</h2>
        <form onSubmit={(event) => void requestPreview(event)} className="mt-4 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.name}</span><input required minLength={2} maxLength={120} readOnly={Boolean(editingId)} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm read-only:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.email}</span><input required type="email" maxLength={254} readOnly={Boolean(editingId)} dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm read-only:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]" /><span className="block text-xs text-ink-muted">{t.samePhone}</span></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.phone}</span><input type="tel" readOnly={Boolean(editingId)} dir="ltr" maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm read-only:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.guardianRelation}</span><select disabled={Boolean(editingId)} value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]">{Object.entries(t.relationships).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.effective}</span><input required type="datetime-local" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.until}</span><input type="datetime-local" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]" /></label>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-[#1d1b20]">{t.review}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {simplePermissions.map(([key, label]) => <label key={key} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={form.permissions[key]} onChange={(event) => updatePermission(key, event.target.checked)} className="h-4 w-4 rounded border-slate-400 accent-[#8127cf] focus-visible:ring-2 focus-visible:ring-[#8127cf]" /><span>{t[label]}</span></label>)}
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-[#1d1b20]">{t.consentTitle}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {consentPermissions.map(([key, label]) => <label key={key} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={form.permissions.consents[key]} onChange={(event) => updatePermission(`consents.${key}`, event.target.checked)} className="h-4 w-4 rounded border-slate-400 accent-[#8127cf] focus-visible:ring-2 focus-visible:ring-[#8127cf]" /><span>{t[label]}</span></label>)}
            </div>
          </fieldset>
          <label className="block space-y-1.5"><span className="text-sm font-semibold">{t.reason}</span><textarea required minLength={5} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]" /></label>
          <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <button type="submit" disabled={busy || !studentId} className="min-h-11 flex-1 rounded-xl bg-[#8127cf] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf] focus-visible:ring-offset-2">{busy ? t.loading : t.review}</button>
            <button type="button" disabled={busy} onClick={() => { beginNew(); setForm(emptyForm()); }} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold">{t.cancel}</button>
          </div>
        </form>
      </section>

      {preview ? <section role="dialog" aria-modal="true" aria-labelledby="guardian-preview-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
        <div ref={previewDialogRef} tabIndex={-1} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
          <h2 id="guardian-preview-title" className="text-xl font-bold text-[#1d1b20]">{t.previewTitle}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t.previewHelp}</p>
          <p className="mt-3 text-sm font-semibold">{selected?.fullName} · {preview.guardianName}</p>
          <p dir="ltr" className="mt-1 text-xs text-ink-muted">{new Date(preview.effectiveAt).toLocaleString(locale)}{preview.validUntil ? ` — ${new Date(preview.validUntil).toLocaleString(locale)}` : ""}</p>
          <dl className="mt-4 space-y-2">
            {simplePermissions.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><dt className="text-sm">{t[label]}</dt><dd>{permissionLabel(preview.permissions[key])}</dd></div>)}
            {consentPermissions.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><dt className="text-sm">{t[label]}</dt><dd>{permissionLabel(preview.permissions.consents[key])}</dd></div>)}
          </dl>
          {preview.status === "INVITED" ? <p className="mt-4 rounded-xl bg-violet-50 p-3 text-sm leading-6 text-violet-900">{t.linkMessage}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void applyPreview()} className="min-h-11 flex-1 rounded-xl bg-[#8127cf] px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#8127cf] focus-visible:ring-offset-2">{busy ? t.loading : preview.status === "INVITED" ? t.send : t.apply}</button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[#8127cf]">{t.close}</button>
          </div>
        </div>
      </section> : null}

      {reviewQueue.length ? <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#1d1b20]">{t.reviews}</h2>
        <p className="text-sm text-amber-950">{t.contactOnly}</p>
        <ul className="space-y-2">{reviewQueue.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3">
          <span className="min-w-0"><strong className="block truncate text-sm">{item.contactName || item.legacyRelationship || "—"}</strong><span dir="ltr" className="block truncate text-xs text-ink-muted">{item.email || item.phone || "—"}</span></span>
          <button type="button" disabled={busy} onClick={() => void resolveReview(item.id)} className="min-h-10 rounded-lg border border-amber-400 px-3 text-sm font-semibold text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-700">{t.resolve}</button>
        </li>)}</ul>
      </section> : null}
      {invitationUrl ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><span className="flex-1">{t.linkMessage}</span><button type="button" onClick={() => { void navigator.clipboard.writeText(invitationUrl); setNotice(t.copied); }} className="min-h-10 rounded-lg border border-emerald-400 px-3 font-semibold">{t.copyLink}</button></div> : null}
    </> : null}
    {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
    {!students.length ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{t.none}</p> : null}
  </div>;
}
