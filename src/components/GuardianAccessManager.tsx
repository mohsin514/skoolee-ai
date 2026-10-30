"use client";

import { useCallback, useEffect, useMemo, useId, useRef, useState, type FormEvent } from "react";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import Link from "next/link";
import { ModalSurface } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { SkeletonCards } from "@/components/ui/skeleton";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useLocaleFormat } from "@/components/locale/LocaleProvider";
import { MoreHorizontal, Users } from "lucide-react";

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
    child: "Child", choose: "Choose a child", add: "Add guardian", name: "Guardian name", email: "Verified account email", phone: "Contact phone", relationship: "Relationship", effective: "Effective from", until: "Access ends (optional)", reason: "Reason for this change", review: "Review access", apply: "Apply reviewed change", cancel: "Cancel", current: "Current guardians", none: "No guardian relationship is recorded for this child.", pending: "Invitation pending", active: "Active", suspended: "Suspended", revoked: "Revoked", draft: "Draft", edit: "Change access", suspend: "Suspend", resume: "Reactivate", revoke: "Revoke access", history: "Access history", reviews: "Legacy contacts for review", contactOnly: "Contact details do not verify a guardian. No access was activated.", resolve: "Mark reviewed", reviewedReason: "Staff reviewed the legacy contact; no account relationship was created.", previewTitle: "Review effective access", previewHelp: "These rights apply only to this child and begin at the shown time.", granted: "Allowed", denied: "Not allowed", learning: "Learning records and published reports", attendanceAccess: "Attendance", finance: "Fee statements and receipts", communication: "School messages", pickup: "Pickup authorization", consentTitle: "Consent actions", medicalTreatment: "Medical treatment", fieldTrips: "Field trips", mediaPublication: "Photo and media publication", offsiteTravel: "Offsite travel", linkMessage: "Access stays pending until the guardian signs in with this exact email and accepts.", copyLink: "Copy invitation page", copied: "Invitation page copied", saveError: "Could not save guardian access", loadError: "Could not load guardian access", loading: "Loading guardian access…", close: "Close preview", send: "Create invitation", requiredReason: "Enter a reason of at least five characters.", statusLabel: "Status", accepted: "Invitation accepted", pendingAccept: "Pending identity verification", previewStale: "Access changed. Review the current permissions again.", guardianRelation: "Guardian relationship", samePhone: "A matching phone number does not connect family records.", success: "Guardian access updated.", retry: "Try again", more: "More actions for {0}", noHistory: "No changes recorded yet.", noStudents: "Enrol a student first; guardians are linked to a child.", noStudentsTitle: "No students yet", openStudents: "Open the student list", noneTitle: "No guardians yet", events: { INVITED: "Invited", ACCEPTED: "Invitation accepted", PERMISSIONS_CHANGED: "Access changed", SUSPENDED: "Access suspended", REVOKED: "Access revoked", CHANGE_PREVIEWED: "Change reviewed", ACTIVATED: "Access reactivated" }, relationships: { mother: "Mother", father: "Father", "step-parent": "Step-parent", grandparent: "Grandparent", "legal guardian": "Legal guardian", aunt: "Aunt", uncle: "Uncle", sibling: "Sibling", other: "Other" },
  },
  ar: {
    child: "الطفل", choose: "اختر طفلاً", add: "إضافة ولي أمر", name: "اسم ولي الأمر", email: "بريد الحساب المؤكد", phone: "هاتف التواصل", relationship: "صلة القرابة", effective: "تبدأ الصلاحية", until: "انتهاء الصلاحية (اختياري)", reason: "سبب هذا التغيير", review: "مراجعة الصلاحيات", apply: "تطبيق التغيير المُراجع", cancel: "إلغاء", current: "أولياء الأمور الحاليون", none: "لا توجد علاقة ولي أمر مسجلة لهذا الطفل.", pending: "الدعوة بانتظار القبول", active: "نشط", suspended: "موقوف مؤقتاً", revoked: "ملغى", draft: "مسودة", edit: "تغيير الصلاحيات", suspend: "إيقاف مؤقت", resume: "إعادة التفعيل", revoke: "إلغاء الوصول", history: "سجل الوصول", reviews: "جهات اتصال قديمة للمراجعة", contactOnly: "بيانات الاتصال لا تثبت صلة القرابة. لم يتم تفعيل أي وصول.", resolve: "تحديد كمراجَع", reviewedReason: "راجع الموظف جهة الاتصال القديمة ولم ينشئ علاقة حساب.", previewTitle: "مراجعة الصلاحيات الفعلية", previewHelp: "تسري هذه الصلاحيات على هذا الطفل فقط وتبدأ في الوقت الموضح.", granted: "مسموح", denied: "غير مسموح", learning: "السجلات التعليمية والتقارير المنشورة", attendanceAccess: "الحضور", finance: "كشوف الرسوم والإيصالات", communication: "رسائل المدرسة", pickup: "تفويض الاستلام", consentTitle: "إجراءات الموافقة", medicalTreatment: "العلاج الطبي", fieldTrips: "الرحلات المدرسية", mediaPublication: "نشر الصور والوسائط", offsiteTravel: "التنقل خارج المدرسة", linkMessage: "يبقى الوصول معلّقاً حتى يسجّل ولي الأمر الدخول بهذا البريد نفسه ويقبل الدعوة.", copyLink: "نسخ صفحة الدعوة", copied: "تم نسخ صفحة الدعوة", saveError: "تعذر حفظ صلاحيات ولي الأمر", loadError: "تعذر تحميل صلاحيات ولي الأمر", loading: "جارٍ تحميل الصلاحيات…", close: "إغلاق المراجعة", send: "إنشاء الدعوة", requiredReason: "أدخل سبباً لا يقل عن خمسة أحرف.", statusLabel: "الحالة", accepted: "تم قبول الدعوة", pendingAccept: "بانتظار التحقق من الهوية", previewStale: "تغير الوصول. راجع الصلاحيات الحالية مرة أخرى.", guardianRelation: "صلة ولي الأمر", samePhone: "تطابق رقم الهاتف لا يربط سجلات العائلة.", success: "تم تحديث صلاحيات ولي الأمر.", retry: "إعادة المحاولة", more: "إجراءات أخرى لـ {0}", noHistory: "لا توجد تغييرات مسجّلة بعد.", noStudents: "سجّل طالبًا أولًا؛ يرتبط أولياء الأمور بطفل.", noStudentsTitle: "لا يوجد طلاب بعد", openStudents: "فتح قائمة الطلاب", noneTitle: "لا يوجد أولياء أمور بعد", events: { INVITED: "تمت الدعوة", ACCEPTED: "تم قبول الدعوة", PERMISSIONS_CHANGED: "تم تغيير الصلاحيات", SUSPENDED: "تم إيقاف الوصول مؤقتًا", REVOKED: "تم إلغاء الوصول", CHANGE_PREVIEWED: "تمت مراجعة التغيير", ACTIVATED: "أُعيد تفعيل الوصول" }, relationships: { mother: "الأم", father: "الأب", "step-parent": "زوج الأم أو الأب", grandparent: "الجد أو الجدة", "legal guardian": "الوصي القانوني", aunt: "العمة أو الخالة", uncle: "العم أو الخال", sibling: "الأخ أو الأخت", other: "أخرى" },
  },
  ur: {
    child: "بچہ", choose: "بچہ منتخب کریں", add: "سرپرست شامل کریں", name: "سرپرست کا نام", email: "تصدیق شدہ اکاؤنٹ ای میل", phone: "رابطہ فون", relationship: "رشتہ", effective: "رسائی شروع ہوگی", until: "رسائی ختم ہوگی (اختیاری)", reason: "اس تبدیلی کی وجہ", review: "رسائی کا جائزہ", apply: "جائزہ شدہ تبدیلی لاگو کریں", cancel: "منسوخ کریں", current: "موجودہ سرپرست", none: "اس بچے کے لیے کوئی سرپرست ریکارڈ نہیں۔", pending: "دعوت قبول ہونے کی منتظر", active: "فعال", suspended: "عارضی طور پر معطل", revoked: "منسوخ", draft: "مسودہ", edit: "رسائی تبدیل کریں", suspend: "معطل کریں", resume: "دوبارہ فعال کریں", revoke: "رسائی منسوخ کریں", history: "رسائی کی تاریخ", reviews: "جائزے کے لیے پرانے رابطے", contactOnly: "رابطے کی معلومات سرپرست کی تصدیق نہیں کرتیں۔ رسائی فعال نہیں کی گئی۔", resolve: "جائزہ شدہ نشان لگائیں", reviewedReason: "عملے نے پرانا رابطہ دیکھا؛ اکاؤنٹ کا تعلق نہیں بنایا۔", previewTitle: "مؤثر رسائی کا جائزہ", previewHelp: "یہ اجازتیں صرف اسی بچے پر لاگو ہوں گی اور دکھائے گئے وقت سے شروع ہوں گی۔", granted: "اجازت ہے", denied: "اجازت نہیں", learning: "تعلیمی ریکارڈ اور شائع شدہ رپورٹس", attendanceAccess: "حاضری", finance: "فیس اسٹیٹمنٹ اور رسیدیں", communication: "اسکول کے پیغامات", pickup: "بچے کو لے جانے کی اجازت", consentTitle: "رضامندی کے اقدامات", medicalTreatment: "طبی علاج", fieldTrips: "تعلیمی دورے", mediaPublication: "تصاویر اور میڈیا کی اشاعت", offsiteTravel: "اسکول سے باہر سفر", linkMessage: "رسائی اس وقت تک زیرِ التوا رہے گی جب تک سرپرست اسی ای میل سے سائن اِن کر کے دعوت قبول نہ کرے۔", copyLink: "دعوت کا صفحہ نقل کریں", copied: "دعوت کا صفحہ نقل ہوگیا", saveError: "سرپرست کی رسائی محفوظ نہیں ہو سکی", loadError: "سرپرست کی رسائی لوڈ نہیں ہو سکی", loading: "سرپرست کی رسائی لوڈ ہو رہی ہے…", close: "جائزہ بند کریں", send: "دعوت بنائیں", requiredReason: "کم از کم پانچ حروف پر مشتمل وجہ درج کریں۔", statusLabel: "حالت", accepted: "دعوت قبول ہوگئی", pendingAccept: "شناخت کی تصدیق زیرِ التوا", previewStale: "رسائی بدل گئی ہے۔ موجودہ اجازتوں کا دوبارہ جائزہ لیں۔", guardianRelation: "سرپرست کا رشتہ", samePhone: "ایک جیسا فون نمبر خاندانی ریکارڈز کو نہیں جوڑتا۔", success: "سرپرست کی رسائی اپ ڈیٹ ہوگئی۔", retry: "دوبارہ کوشش کریں", more: "{0} کے مزید اقدامات", noHistory: "ابھی تک کوئی تبدیلی درج نہیں۔", noStudents: "پہلے کسی طالب علم کا اندراج کریں؛ سرپرست کسی بچے سے جوڑے جاتے ہیں۔", noStudentsTitle: "ابھی کوئی طالب علم نہیں", openStudents: "طلبہ کی فہرست کھولیں", noneTitle: "ابھی کوئی سرپرست نہیں", events: { INVITED: "دعوت بھیجی گئی", ACCEPTED: "دعوت قبول ہوگئی", PERMISSIONS_CHANGED: "رسائی تبدیل ہوئی", SUSPENDED: "رسائی عارضی طور پر معطل", REVOKED: "رسائی منسوخ", CHANGE_PREVIEWED: "تبدیلی کا جائزہ لیا گیا", ACTIVATED: "رسائی دوبارہ فعال" }, relationships: { mother: "والدہ", father: "والد", "step-parent": "سوتیلا والد یا والدہ", grandparent: "دادا، دادی، نانا یا نانی", "legal guardian": "قانونی سرپرست", aunt: "پھوپھی یا خالہ", uncle: "چچا یا ماموں", sibling: "بہن یا بھائی", other: "دیگر" },
  },
} as const;

type LabelKey = Exclude<keyof typeof copy.en, "relationships" | "events">;
const simplePermissions: Array<[keyof Omit<Permissions, "consents">, LabelKey]> = [
  ["learningRecords", "learning"], ["attendance", "attendanceAccess"], ["finances", "finance"], ["communication", "communication"], ["pickup", "pickup"],
];
const consentPermissions: Array<[keyof Permissions["consents"], LabelKey]> = [
  ["medicalTreatment", "medicalTreatment"], ["fieldTrips", "fieldTrips"], ["mediaPublication", "mediaPublication"], ["offsiteTravel", "offsiteTravel"],
];

/**
 * Guardians & access (admin `?view=guardians`, M34). `initialStudentId` opens on one child (the student
 * profile's "Guardians" action); `addRequest` is bumped by the view's PageHeader primary "Add guardian",
 * which starts a new guardian in the editor below — the manager then renders no second Add button.
 */
export function GuardianAccessManager({ students, locale, initialStudentId, addRequest }: { students: Student[]; locale: Locale; initialStudentId?: string; addRequest?: number }) {
  const t = copy[locale];
  const formScope = useId();
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState(
    initialStudentId && students.some((item) => item.id === initialStudentId) ? initialStudentId : students[0]?.id ?? "",
  );
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PendingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  // R4: a load failure is an inline ErrorState with retry; a failed action is a toast and the form is kept;
  // `error` is only the inline validation / preview message.
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const { dateTime } = useLocaleFormat();
  const [invitationUrl, setInvitationUrl] = useState("");
  const student = students.find((item) => item.id === studentId);

  const refresh = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians?review=1`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "");
      setRelationships(json.relationships);
      setReviewQueue(json.reviewQueue);
      setLoadFailed(false);
    } catch { setLoadFailed(true); }
    finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const beginNew = () => { setEditingId(null); setForm(emptyForm()); setPreview(null); setError(""); };

  // The PageHeader primary: start a new guardian for the chosen child and bring the editor into view.
  useEffect(() => {
    if (!addRequest) return;
    beginNew();
    const editor = document.getElementById("guardian-editor");
    editor?.scrollIntoView({ behavior: "smooth", block: "start" });
    nameFieldRef.current?.focus({ preventScroll: true });
  }, [addRequest]);
  const beginEdit = (relation: Relationship, status = "") => {
    setEditingId(relation.id);
    setForm({ fullName: relation.fullName, email: relation.email, phone: relation.phone || "", relationship: relation.relationship, permissions: structuredClone(relation.permissions), effectiveFrom: localDateTime(), validUntil: relation.validUntil ? localDateTime(new Date(relation.validUntil)) : "", status, reason: "" });
    setPreview(null); setError("");
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
    event.preventDefault(); setBusy(true); setError(""); setInvitationUrl("");
    if (form.reason.trim().length < 5) { setError(t.requiredReason); setBusy(false); return; }
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", ...(editingId ? { relationshipId: editingId } : {}), fullName: form.fullName, email: form.email, phone: form.phone || null, relationship: form.relationship, permissions: form.permissions, effectiveFrom: dateToIso(form.effectiveFrom), validUntil: dateToIso(form.validUntil) || null, status: status || form.status || undefined, reason: form.reason }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t.saveError);
      setPreview({ relationshipId: json.relationshipId, previewId: json.previewId, permissions: json.effectiveAccess, status: status || form.status || (editingId ? relationships.find((item) => item.id === editingId)?.status || "ACTIVE" : "INVITED"), effectiveAt: json.impact.effectiveFrom, validUntil: json.impact.validUntil, guardianName: json.impact.guardian });
    } catch (cause) { toast.error(friendlyErrorMessage(cause, t.saveError)); }
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
      toast.success(json.status === "INVITED" ? t.linkMessage : t.success);
      setPreview(null); setEditingId(null); setForm(emptyForm()); await refresh();
    } catch (cause) { setError(friendlyErrorMessage(cause, t.saveError)); }
    finally { setBusy(false); }
  };

  const resolveReview = async (reviewId: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/guardians`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve-review", reviewId, reason: t.reviewedReason }) });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "");
      await refresh();
    } catch (cause) { toast.error(friendlyErrorMessage(cause, t.saveError)); }
    finally { setBusy(false); }
  };

  // SKO-491: while the review actions stick to the bottom, reserve their height as scroll padding so a field
  // reached by keyboard is scrolled clear of them, at any text size.
  const actionBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = actionBarRef.current, html = document.documentElement;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const previous = html.style.scrollPaddingBottom;
    const sync = () => { html.style.scrollPaddingBottom = getComputedStyle(bar).position === "sticky" ? `${Math.ceil(bar.getBoundingClientRect().height) + 16}px` : previous; };
    const observer = new ResizeObserver(sync); observer.observe(bar); observer.observe(html); sync();
    return () => { observer.disconnect(); html.style.scrollPaddingBottom = previous; };
  }, [studentId]);

  const selected = useMemo(() => students.find((item) => item.id === studentId), [students, studentId]);
  const statusBadge = (status: string) => {
    const [label, variant] = status === "ACTIVE" ? [t.active, "success"] as const : status === "SUSPENDED" ? [t.suspended, "warning"] as const : status === "REVOKED" ? [t.revoked, "neutral"] as const : [t.pending, "info"] as const;
    return <Badge variant={variant} className="shrink-0">{label}</Badge>;
  };
  const eventLabel = (action: string) => (t.events as Record<string, string>)[action] ?? action.charAt(0) + action.slice(1).toLowerCase().replaceAll("_", " ");
  const permissionLabel = (allowed: boolean) => <span className={allowed ? "font-semibold text-status-success-text" : "font-semibold text-ink-muted"}>{allowed ? t.granted : t.denied}</span>;



  return <div className="space-y-5">
    <section className="sk-panel p-4 sm:p-5">
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-ink-strong">{t.child}</span>
        <Select id="guardian-child" value={studentId} onChange={(event) => { setStudentId(event.target.value); setPreview(null); setEditingId(null); setForm(emptyForm()); }} className="w-full px-3">
          <option value="">{t.choose}</option>
          {students.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.rollNo} · {item.campus.name}</option>)}
        </Select>
      </label>
      {selected ? <p className="mt-3 text-xs text-ink-muted">{[selected.class.name, selected.class.section, selected.campus.name].filter(Boolean).join(" · ")}</p> : null}
    </section>

    {studentId ? <>
      <section className="space-y-3" aria-labelledby="guardian-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="guardian-list-title" className="text-lg font-bold text-ink-strong">{t.current}</h2>
          {addRequest === undefined ? <Button variant="outline" type="button" onClick={beginNew}>{t.add}</Button> : null}
        </div>
        {loading && !loadFailed ? <SkeletonCards count={2} className="grid-cols-1 lg:grid-cols-2" cardClassName="min-h-40" label={t.loading} /> : null}
        {loadFailed && !loading ? <div className="sk-panel"><ErrorState title={t.loadError} onRetry={() => refresh()} retryLabel={t.retry} /></div> : null}
        {!loading && !loadFailed && relationships.filter((item) => item.status !== "DRAFT").length === 0 ? (
          <div className="sk-panel"><EmptyState size="sm" icon={Users} title={t.noneTitle} description={t.none} /></div>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2" hidden={loading || loadFailed}>
          {relationships.filter((item) => item.status !== "DRAFT").map((relation) => <article key={relation.id} className="sk-panel min-w-0 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-bold text-ink-strong"><bdi>{relation.fullName}</bdi></h3>
                <p dir="ltr" className="mt-1 truncate text-start text-sm text-ink-muted">{relation.email}</p>
                <p className="mt-1 text-xs text-ink-muted">{t.relationships[relation.relationship as keyof typeof t.relationships] || relation.relationship}</p>
              </div>
              {statusBadge(relation.status)}
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {simplePermissions.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-2"><dt className="text-ink-muted">{t[label]}</dt><dd>{permissionLabel(relation.permissions[key])}</dd></div>)}
            </dl>
            {/* §4.5.2–3: one inline action; Suspend / Reactivate / Revoke sit in the row overflow and each still goes
                through the reviewed change (reason + preview) before anything applies. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="outline" type="button" disabled={busy} onClick={() => beginEdit(relation)}>{t.edit}</Button>
              {relation.status === "ACTIVE" || relation.status === "SUSPENDED" ? (
                <Menu
                  label={t.more.replace("{0}", relation.fullName)}
                  align="end"
                  trigger={<IconButton label={t.more.replace("{0}", relation.fullName)} disabled={busy}><MoreHorizontal aria-hidden="true" /></IconButton>}
                  items={relation.status === "ACTIVE"
                    ? [
                      { id: "suspend", label: t.suspend, onSelect: () => beginEdit(relation, "SUSPENDED") },
                      { id: "revoke", label: t.revoke, tone: "danger", onSelect: () => beginEdit(relation, "REVOKED") },
                    ]
                    : [
                      { id: "resume", label: t.resume, onSelect: () => beginEdit(relation, "ACTIVE") },
                      { id: "revoke", label: t.revoke, tone: "danger", onSelect: () => beginEdit(relation, "REVOKED") },
                    ]}
                />
              ) : null}
            </div>
            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">{t.history}</summary>
              <ol className="mt-3 space-y-2 text-xs text-ink-muted">
                {relation.events.length ? relation.events.map((event) => <li key={event.id} className="border-s border-border ps-3"><span className="font-semibold text-ink-strong">{eventLabel(event.action)}</span> · <bdi>{event.reason}</bdi><br /><span>{dateTime(event.createdAt)}</span> · <bdi>{event.actorName}</bdi></li>) : <li>{t.noHistory}</li>}
              </ol>
            </details>
          </article>)}
        </div>
      </section>

      <section id="guardian-editor" className="sk-panel min-w-0 scroll-mt-4 p-3 sm:p-5">
        <h2 className="text-lg font-bold text-ink-strong">{editingId ? t.edit : t.add}</h2>
        <form onSubmit={(event) => void requestPreview(event)} className="mt-4 min-w-0 space-y-5 [&_:is(input,select,textarea)]:scroll-mb-40">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{t.name}</span><Input ref={nameFieldRef} required minLength={2} maxLength={120} readOnly={Boolean(editingId)} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="w-full min-w-0 px-3" /></label>
            <FormField name="guardian-email" idScope={formScope} label={t.email} hint={t.samePhone}><Input required type="email" maxLength={254} readOnly={Boolean(editingId)} dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full min-w-0 px-3" /></FormField>
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{t.phone}</span><Input type="tel" readOnly={Boolean(editingId)} dir="ltr" maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="w-full min-w-0 px-3" /></label>
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{t.guardianRelation}</span><Select disabled={Boolean(editingId)} value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} className="w-full min-w-0 px-3">{Object.entries(t.relationships).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{t.effective}</span><Input required type="datetime-local" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} className="w-full min-w-0 px-3" /></label>
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{t.until}</span><Input type="datetime-local" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} className="w-full min-w-0 px-3" /></label>
          </div>

          <fieldset className="min-w-0 space-y-3">
            <legend className="text-base font-bold text-ink-strong">{t.review}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {simplePermissions.map(([key, label]) => <label key={key} className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border border-border p-2.5 text-sm sm:gap-3 sm:p-3"><Checkbox checked={form.permissions[key]} onChange={(event) => updatePermission(key, event.target.checked)}  /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t[label]}</span></label>)}
            </div>
          </fieldset>
          <fieldset className="min-w-0 space-y-3">
            <legend className="text-base font-bold text-ink-strong">{t.consentTitle}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {consentPermissions.map(([key, label]) => <label key={key} className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border border-border p-2.5 text-sm sm:gap-3 sm:p-3"><Checkbox checked={form.permissions.consents[key]} onChange={(event) => updatePermission(`consents.${key}`, event.target.checked)}  /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t[label]}</span></label>)}
            </div>
          </fieldset>
          <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{t.reason}</span><Textarea required minLength={5} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="w-full min-w-0 p-3" /></label>
          <div ref={actionBarRef} className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <Button variant="default" ref={reviewButtonRef} type="submit" disabled={busy || !studentId} className="min-h-11 flex-1 sm:flex-none">{busy ? t.loading : t.review}</Button>
            <Button variant="outline" type="button" disabled={busy} onClick={() => { beginNew(); setForm(emptyForm()); }} className="min-h-11">{t.cancel}</Button>
          </div>
        </form>
      </section>

      {preview ? <ModalSurface onClose={() => setPreview(null)} returnFocusRef={reviewButtonRef} labelledBy="guardian-preview-title" describedBy="guardian-preview-help" size="sm" disableBackdropClose dismissible={!busy}>
        <div className="min-h-0 overflow-y-auto p-5" dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
          <h2 id="guardian-preview-title" className="text-xl font-bold text-ink-strong">{t.previewTitle}</h2>
          <p id="guardian-preview-help" className="mt-2 text-sm text-ink-muted">{t.previewHelp}</p>
          {error ? <TaskFeedback kind="error" title={error} /> : null}
          <p className="mt-3 text-sm font-semibold"><bdi>{selected?.fullName}</bdi> · <bdi>{preview.guardianName}</bdi></p>
          <p className="mt-1 text-xs text-ink-muted">{dateTime(preview.effectiveAt)}{preview.validUntil ? ` – ${dateTime(preview.validUntil)}` : ""}</p>
          <dl className="mt-4 space-y-2">
            {simplePermissions.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3"><dt className="text-sm">{t[label]}</dt><dd>{permissionLabel(preview.permissions[key])}</dd></div>)}
            {consentPermissions.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3"><dt className="text-sm">{t[label]}</dt><dd>{permissionLabel(preview.permissions.consents[key])}</dd></div>)}
          </dl>
          {preview.status === "INVITED" ? <p className="mt-4 rounded-xl bg-status-brand-surface p-3 text-sm leading-6 text-status-brand-text">{t.linkMessage}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="default" type="button" disabled={busy} onClick={() => void applyPreview()} className="min-h-11 flex-1">{busy ? t.loading : preview.status === "INVITED" ? t.send : t.apply}</Button>
            <Button variant="outline" type="button" disabled={busy} onClick={() => setPreview(null)} className="min-h-11">{t.close}</Button>
          </div>
        </div>
      </ModalSurface> : null}

      {reviewQueue.length ? <section className="space-y-3 rounded-2xl border border-status-warning-border bg-status-warning-surface p-4 sm:p-5">
        <h2 className="text-lg font-bold text-ink-strong">{t.reviews}</h2>
        <p className="text-sm text-status-warning-text">{t.contactOnly}</p>
        <ul className="space-y-2">{reviewQueue.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warning-border bg-card p-3">
          <span className="min-w-0"><strong className="block truncate text-sm">{item.contactName || item.legacyRelationship || "—"}</strong><span dir="ltr" className="block truncate text-xs text-ink-muted">{item.email || item.phone || "—"}</span></span>
          <Button variant="outline" type="button" disabled={busy} onClick={() => void resolveReview(item.id)} >{t.resolve}</Button>
        </li>)}</ul>
      </section> : null}
      {invitationUrl ? <Alert tone="success" actions={<Button variant="outline" type="button" onClick={() => { void navigator.clipboard.writeText(invitationUrl).then(() => toast.success(t.copied), () => toast.error(t.saveError)); }}>{t.copyLink}</Button>}>{t.linkMessage}</Alert> : null}
    </> : null}
    {error && !preview ? <Alert tone="danger" live="assertive">{error}</Alert> : null}
    {/* A useful next step instead of a dead end: students are enrolled from the student list. */}
    {!students.length ? <div className="sk-panel"><EmptyState size="sm" icon={Users} title={t.noStudentsTitle} description={t.noStudents} action={<Link href="/admin?view=students" className={buttonVariants({ variant: "outline" })}>{t.openStudents}</Link>} /></div> : null}
  </div>;
}
