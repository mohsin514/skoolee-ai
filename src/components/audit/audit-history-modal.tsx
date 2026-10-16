"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import type { AuditHistoryEntry, AuditHistoryPage } from "@/lib/audit-history";
import { AUDIT_CATEGORIES, auditCategory, type AuditCategory } from "@/lib/audit-categories";

const en = { title: "Activity history", hint: "Consequential changes within your current school and campus authority.", privacy: "Personal details are minimized. Records outside your campus or retention period are hidden; this is not a complete record of every action.", campus: "Campus", allCampuses: "All authorized campuses", category: "Record type", all: "All records", student: "Students", class: "Classes", subject: "Subjects", invitation: "Invitations", marks: "Marks", integrity: "Exam observation reviews", from: "From date (UTC)", to: "To date (UTC)", refresh: "Refresh history", more: "Load older entries", loading: "Loading history…", empty: "No available entries match these filters.", failure: "History could not be loaded. Refresh to retrieve the current authorized records.", denied: "History access changed. Protected entries have been cleared.", stale: "This page changed or expired. Refresh to continue.", system: "System", details: "Details minimized", actor: "Changed by", record: "Record reference", CREATE: "Created", UPDATE: "Updated", DELETE: "Deleted", version: "Version", reviewVersion: "Review version", status: "Status", decision: "Review decision", isActive: "Active", published: "Published", none: "—", loaded: "entries loaded", export: "Export CSV", exporting: "Preparing export…", exportDenied: "You do not have permission to export activity history.", exportFailed: "The export could not be prepared. Try again.", exported: "Export downloaded. The export itself is recorded in this history.", fees: "Fees and payments", exports: "History exports" };
type Copy = typeof en;
const ar: Copy = { title: "سجل النشاط", hint: "التغييرات المهمة ضمن صلاحياتك الحالية في المدرسة والفرع.", privacy: "تُقلّل التفاصيل الشخصية. تُخفى السجلات خارج فرعك أو مدة الاحتفاظ؛ هذا ليس سجلاً كاملاً لكل إجراء.", campus: "الفرع", allCampuses: "كل الفروع المصرّح بها", category: "نوع السجل", all: "كل السجلات", student: "الطلاب", class: "الصفوف", subject: "المواد", invitation: "الدعوات", marks: "الدرجات", integrity: "مراجعات ملاحظات الاختبار", from: "من تاريخ (UTC)", to: "إلى تاريخ (UTC)", refresh: "تحديث السجل", more: "تحميل سجلات أقدم", loading: "جارٍ تحميل السجل…", empty: "لا توجد سجلات متاحة تطابق المرشحات.", failure: "تعذّر تحميل السجل. حدّث لاسترجاع السجلات المصرّح بها حالياً.", denied: "تغيّرت صلاحية السجل. مُسحت البيانات المحمية.", stale: "تغيّرت هذه الصفحة أو انتهت مدتها. حدّث للمتابعة.", system: "النظام", details: "التفاصيل مختصرة", actor: "أجرى التغيير", record: "مرجع السجل", CREATE: "أُنشئ", UPDATE: "عُدّل", DELETE: "حُذف", version: "الإصدار", reviewVersion: "إصدار المراجعة", status: "الحالة", decision: "قرار المراجعة", isActive: "نشط", published: "منشور", none: "—", loaded: "سجلات محمّلة", export: "تصدير CSV", exporting: "جارٍ تجهيز التصدير…", exportDenied: "ليست لديك صلاحية تصدير سجل النشاط.", exportFailed: "تعذّر تجهيز التصدير. حاول مرة أخرى.", exported: "نُزّل التصدير. يُسجَّل التصدير نفسه في هذا السجل.", fees: "الرسوم والمدفوعات", exports: "تصديرات السجل" };
const ur: Copy = { title: "سرگرمی کی تاریخ", hint: "آپ کے موجودہ اسکول اور کیمپس کے اختیار میں اہم تبدیلیاں۔", privacy: "ذاتی تفصیل محدود ہے۔ دوسرے کیمپس یا مدت سے باہر ریکارڈ پوشیدہ ہیں؛ یہ ہر کارروائی کا مکمل ریکارڈ نہیں۔", campus: "کیمپس", allCampuses: "تمام مجاز کیمپس", category: "ریکارڈ کی قسم", all: "تمام ریکارڈ", student: "طلبہ", class: "جماعتیں", subject: "مضامین", invitation: "دعوتیں", marks: "نمبر", integrity: "امتحانی مشاہدات کے جائزے", from: "اس تاریخ سے (UTC)", to: "اس تاریخ تک (UTC)", refresh: "تاریخ تازہ کریں", more: "پرانے اندراجات لوڈ کریں", loading: "تاریخ لوڈ ہو رہی ہے…", empty: "ان فلٹرز کے مطابق کوئی دستیاب اندراج نہیں۔", failure: "تاریخ لوڈ نہیں ہو سکی۔ موجودہ مجاز ریکارڈ کے لیے تازہ کریں۔", denied: "رسائی بدل گئی ہے۔ محفوظ اندراجات ہٹا دیے گئے ہیں۔", stale: "یہ صفحہ بدل گیا یا اس کی مدت ختم ہوئی۔ آگے بڑھنے کے لیے تازہ کریں۔", system: "نظام", details: "تفصیل محدود ہے", actor: "تبدیلی کرنے والا", record: "ریکارڈ کا حوالہ", CREATE: "بنایا گیا", UPDATE: "تبدیل کیا گیا", DELETE: "حذف کیا گیا", version: "ورژن", reviewVersion: "جائزے کا ورژن", status: "حالت", decision: "جائزے کا فیصلہ", isActive: "فعال", published: "شائع شدہ", none: "—", loaded: "اندراجات لوڈ ہوئے", export: "CSV ایکسپورٹ", exporting: "ایکسپورٹ تیار ہو رہا ہے…", exportDenied: "آپ کو سرگرمی کی تاریخ ایکسپورٹ کرنے کی اجازت نہیں۔", exportFailed: "ایکسپورٹ تیار نہ ہو سکا۔ دوبارہ کوشش کریں۔", exported: "ایکسپورٹ ڈاؤن لوڈ ہو گیا۔ یہ ایکسپورٹ بھی اسی تاریخ میں درج ہوتا ہے۔", fees: "فیس اور ادائیگیاں", exports: "تاریخ کی ایکسپورٹس" };

export function AuditHistoryModal({ onClose, initialCampusId = "" }: { onClose: () => void; initialCampusId?: string }) {
  const { language } = useLocale();
  const t = language === "ar" ? ar : language === "ur" ? ur : en;
  const [filter, setFilter] = useState({ campusId: initialCampusId, tableName: "", from: "", to: "" });
  const [page, setPage] = useState<AuditHistoryPage | null>(null);
  const [rows, setRows] = useState<AuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"failure" | "denied" | "stale" | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor?: string, append = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ limit: "25" });
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/audit-log?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { if ([401, 403].includes(response.status)) { setRows([]); setPage(null); setError("denied"); } else setError(response.status === 409 ? "stale" : "failure"); return; }
      const result: AuditHistoryPage = await response.json();
      if (controller.signal.aborted) return;
      setPage(result);
      setRows(previous => append ? [...previous, ...result.data.filter(row => !previous.some(old => old.id === row.id))] : result.data);
    } catch { if (!controller.signal.aborted) setError("failure"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [filter]);
  useEffect(() => { setRows([]); void load(); return () => request.current?.abort(); }, [load]);
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "denied" | "failed">("idle");
  // One key per export attempt: a retry after a lost response reuses it, so the server records one receipt.
  const exportKey = useRef<string | null>(null);
  const exportCsv = useCallback(async () => {
    setExportState("busy");
    exportKey.current ??= crypto.randomUUID();
    const params = new URLSearchParams({ requestKey: exportKey.current });
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
    try {
      const response = await fetch(`/api/audit-log/export?${params}`, { cache: "no-store" });
      if (!response.ok) { setExportState([401, 403].includes(response.status) ? "denied" : "failed"); return; }
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "activity-history.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
      exportKey.current = null;
      setExportState("done");
      void load();
    } catch { setExportState("failed"); }
  }, [filter, load]);
  const types = Object.keys(AUDIT_CATEGORIES) as AuditCategory[];
  const typeLabel = (type: string) => { const category = (type in AUDIT_CATEGORIES ? type : auditCategory(type)) as AuditCategory | null; return category ? t[category] : type.replaceAll("_", " "); };
  return <Modal title={t.title} subtitle={t.hint} icon={History} size="lg" onClose={onClose}>
    <div dir={language === "en" ? "ltr" : "rtl"} className="space-y-4" aria-busy={loading}>
      <p className="text-sm text-ink-subtle">{t.privacy}</p>
      <fieldset disabled={loading} className="grid gap-3 sm:grid-cols-2">
        {page?.schoolWide && <FormField name="audit-campus" label={t.campus}><Select value={filter.campusId} onChange={event => setFilter(value => ({ ...value, campusId: event.target.value }))}><option value="">{t.allCampuses}</option>{page.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></FormField>}
        <FormField name="audit-type" label={t.category}><Select value={filter.tableName} onChange={event => setFilter(value => ({ ...value, tableName: event.target.value }))}><option value="">{t.all}</option>{types.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}</Select></FormField>
        <FormField name="audit-from" label={t.from}><Input type="date" value={filter.from} onChange={event => setFilter(value => ({ ...value, from: event.target.value }))} /></FormField>
        <FormField name="audit-to" label={t.to}><Input type="date" value={filter.to} onChange={event => setFilter(value => ({ ...value, to: event.target.value }))} /></FormField>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw aria-hidden="true" className={loading ? "animate-spin" : ""} />{t.refresh}</Button><Button variant="outline" disabled={loading || exportState === "busy"} onClick={() => void exportCsv()}><Download aria-hidden="true" />{exportState === "busy" ? t.exporting : t.export}</Button><span role="status" className="text-sm text-ink-subtle">{loading ? t.loading : `${new Intl.NumberFormat(language).format(rows.length)} ${t.loaded}`}</span></div>
      {exportState === "denied" || exportState === "failed" ? <p role="alert" className="sk-panel border-status-error-border p-3 text-sm text-status-error-text">{exportState === "denied" ? t.exportDenied : t.exportFailed}</p> : exportState === "done" ? <p role="status" className="text-sm text-ink-subtle">{t.exported}</p> : null}
      {error && <p role="alert" className="sk-panel border-status-error-border p-3 text-sm text-status-error-text">{t[error]}</p>}
      {!loading && !error && rows.length === 0 && <p className="sk-panel p-5 text-sm">{t.empty}</p>}
      <ol className="space-y-3">{rows.map(row => <li key={row.id} className="sk-panel space-y-2 p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{t[row.action]} · {typeLabel(row.tableName)}</strong><time dateTime={row.createdAt} className="text-xs text-ink-subtle">{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</time></div><p className="text-sm">{t.actor}: <bdi>{row.actor?.fullName ?? t.system}</bdi></p><p className="break-all text-xs text-ink-subtle">{t.record}: <bdi>{row.recordId}</bdi></p>{row.changes.length ? <dl className="space-y-1 text-sm">{row.changes.map(change => <div key={change.field} className="flex flex-wrap gap-2"><dt>{t[change.field as "version"] ?? change.field}:</dt><dd><bdi>{change.before ?? t.none}</bdi> → <bdi>{change.after ?? t.none}</bdi></dd></div>)}</dl> : <p className="text-xs text-ink-subtle">{t.details}</p>}</li>)}</ol>
      {page?.nextCursor && <Button variant="outline" disabled={loading} onClick={() => void load(page.nextCursor!, true)}>{t.more}</Button>}
    </div>
  </Modal>;
}
