"use client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { SkeletonList } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { jobMessages } from "@/lib/jobs/messages";
import { useLocale } from "@/components/locale/LocaleProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ExamItem } from "@/components/academic/ExamCycleManager";

type Version = {
  predecessorId: string | null;
  id: string;
  number: number;
  language: string;
  blockers: string[];
  changedSections: string[];
  approvedAt: string | null;
  approvedBy: string | null;
  reviewerName?: string;
  lastReviewerId?: string;
  lastReviewedAt?: string;
  history?: {
    id: string;
    number: number;
    approvedAt: string;
    publishedAt: string | null;
    predecessorId: string | null;
  }[];
  delivery?: { channel: string; status: string }[];
  publishedAt: string | null;
  reviewerNote: string | null;
  snapshot: {
    weightConfig?: {
      quizWeight: number;
      classTestWeight: number;
      midTermWeight: number;
      finalWeight: number;
      passingPercentage: number;
      thresholds?: Record<string, number>;
    };
    overall?: { overallPercentage: number; overallGrade: string } | null;
    marks: { subject: string; obtained: number; total: number }[];
    reportCard: {
      percentage: number;
      grade: string;
      reportLanguage: string;
      remarksEn: string;
      remarksUr: string;
      remarksAr: string;
    };
  };
  priorSnapshot: Version["snapshot"] | null;
};
type Card = {
  id: string;
  student?: { fullName?: string; rollNo?: string };
  review: Version;
};
const copy = {
  en: {
    title: "Report review",
    blocked: "Blocked",
    eligible: "Eligible",
    approved: "Approved",
    changed: "Changed sections",
    approve: "Approve selected versions",
    review: "Complete class review",
    publish: "Publish approved versions",
    send: "Queue delivery",
    generate: "Generate reports",
    prior: "Last approved",
    pending: "Pending version",
    note: "Private reviewer note",
    reason: "Family-facing correction reason",
    inspect: "Review version",
    save: "Save draft",
    preview: "Preview approved release",
    empty: "No reports generated. Lock the exam and generate reports first.",
    loading: "Loading current report versions…",
    retry: "Retry loading reports",
    loadFailed: "Could not load the report versions. Check your connection and try again.",
    emptyTitle: "No report cards yet",
    actionFailed: "Could not complete this action. Reload the reports and try again.",
    language: "Report language",
    remarks: "Remarks",
    filter: "Readiness",
    all: "All",
    success: "Saved. The current versions are shown below.",
    reviewer: "Last reviewer",
    request: "Request correction",
    delivery: "Delivery",
  },
  ar: {
    title: "مراجعة التقارير",
    blocked: "محظور",
    eligible: "جاهز",
    approved: "معتمد",
    changed: "الأقسام المعدلة",
    approve: "اعتماد النسخ المحددة",
    review: "إكمال مراجعة الفصل",
    publish: "نشر النسخ المعتمدة",
    send: "إدراج الإرسال",
    generate: "إنشاء التقارير",
    prior: "آخر نسخة معتمدة",
    pending: "النسخة قيد المراجعة",
    note: "ملاحظة داخلية للمراجع",
    reason: "سبب التصحيح للأسرة",
    inspect: "مراجعة النسخة",
    save: "حفظ المسودة",
    preview: "معاينة النسخة المعتمدة",
    empty: "لا توجد تقارير. أقفل الامتحان ثم أنشئ التقارير.",
    loading: "جار تحميل النسخ الحالية…",
    retry: "إعادة تحميل التقارير",
    loadFailed: "تعذر تحميل نسخ التقارير. تحقق من الاتصال وحاول مرة أخرى.",
    emptyTitle: "لا توجد بطاقات تقارير بعد",
    actionFailed: "تعذر إكمال هذا الإجراء. أعد تحميل التقارير وحاول مرة أخرى.",
    language: "لغة التقرير",
    remarks: "الملاحظات",
    filter: "الجاهزية",
    all: "الكل",
    success: "تم الحفظ. تظهر النسخ الحالية أدناه.",
    reviewer: "آخر مراجع",
    request: "طلب تصحيح",
    delivery: "الإرسال",
  },
  ur: {
    title: "رپورٹ کا جائزہ",
    blocked: "رکاوٹ",
    eligible: "تیار",
    approved: "منظور شدہ",
    changed: "تبدیل شدہ حصے",
    approve: "منتخب نسخے منظور کریں",
    review: "جماعت کا جائزہ مکمل کریں",
    publish: "منظور شدہ نسخے شائع کریں",
    send: "ترسیل قطار میں ڈالیں",
    generate: "رپورٹس بنائیں",
    prior: "آخری منظور شدہ نسخہ",
    pending: "زیر جائزہ نسخہ",
    note: "جائزہ لینے والے کا نجی نوٹ",
    reason: "خاندان کے لیے تصحیح کی وجہ",
    inspect: "نسخہ دیکھیں",
    save: "مسودہ محفوظ کریں",
    preview: "منظور شدہ نسخہ دیکھیں",
    empty: "کوئی رپورٹ نہیں۔ پہلے امتحان لاک کریں اور رپورٹس بنائیں۔",
    loading: "موجودہ نسخے لوڈ ہو رہے ہیں…",
    retry: "رپورٹس دوبارہ لوڈ کریں",
    loadFailed: "رپورٹ کے نسخے لوڈ نہیں ہو سکے۔ کنکشن چیک کر کے دوبارہ کوشش کریں۔",
    emptyTitle: "ابھی کوئی رپورٹ کارڈ نہیں",
    actionFailed: "یہ عمل مکمل نہیں ہو سکا۔ رپورٹس دوبارہ لوڈ کر کے کوشش کریں۔",
    language: "رپورٹ کی زبان",
    remarks: "تبصرے",
    filter: "تیاری",
    all: "سب",
    success: "محفوظ ہو گیا۔ موجودہ نسخے نیچے ہیں۔",
    reviewer: "آخری جائزہ لینے والا",
    request: "تصحیح کی درخواست",
    delivery: "ترسیل",
  },
};
const button =
  "px-3 py-2";
type PipelineProps = {
  exam: ExamItem;
  campusId?: string;
  onChanged?: () => void;
};
export function ReportCardPipeline(props: PipelineProps) {
  // Reset permissions, selections and private notes before a new scope paints.
  return <ScopedReportCardPipeline key={JSON.stringify([props.exam.id, props.campusId])} {...props} />;
}
function ScopedReportCardPipeline({ exam, campusId, onChanged }: PipelineProps) {
  const alive = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current?.abort(); };
  }, []);
  const [cards, setCards] = useState<Card[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const locale = useLocale().language;
  const [canReview, setCanReview] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [filter, setFilter] = useState("all");
  const [active, setActive] = useState<string | null>(null),
    [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [language, setLanguage] = useState("en"),
    [remark, setRemark] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [reviewerFilter, setReviewerFilter] = useState("");
  const t = copy[locale];
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadFailed(false);
    setCanReview(false);
    setCanEdit(false);
    setSelected([]);
    setActive(null);
    try {
      const q = new URLSearchParams({ examId: exam.id });
      if (campusId) q.set("campusId", campusId);
      const r = await fetch(`/api/reports?${q}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      const d = await r.json();
      if (!alive.current || request.current !== controller || controller.signal.aborted) return;
      if (!r.ok) throw new Error(d.error);
      setCards(d.reportCards);
      setCanReview(d.canReview);
      setCanEdit(d.canEdit);
    } catch (e) {
      if (!alive.current || request.current !== controller || controller.signal.aborted) return;
      setLoadFailed(true);
      setCards([]);
      void e; setMessage("");
    } finally {
      if (alive.current && request.current === controller) setLoading(false);
    }
  }, [exam.id, campusId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(action: string) {
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      const r = await fetch(
        `/api/reports${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId: exam.id,
            action,
            versions: cards
              .filter((c) => selected.includes(c.id))
              .map((c) => ({ reportCardId: c.id, versionId: c.review.id })),
            reviewerNote: note,
            correctionReason: reason,
          }),
        },
      );
      const d = await r.json();
      if (!alive.current) return;
      if (r.status === 401 || r.status === 403) { setCards([]); setCanReview(false); setCanEdit(false); setActive(null); setLoadFailed(true); }
      if (r.status === 409) await load();
      if (!r.ok)
        throw new Error(
          typeof d.error === "string" ? d.error : "action_failed",
        );
      if (d.jobId) { window.location.assign(`/jobs?id=${d.jobId}`); return; }
      setMessage(t.success);
      await load();
      if (alive.current) onChanged?.();
    } catch (e) {
      if (alive.current) { void e; setMessage(""); setFailure(t.actionFailed); }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const current = cards.find((c) => c.id === active);
  async function save(requestCorrection = false) {
    if (!current) return;
    setBusy(true);
    setFailure("");
    try {
      const key =
        language === "ar"
          ? "remarksAr"
          : language === "ur"
            ? "remarksUr"
            : "remarksEn";
      const r = await fetch(`/api/reports/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(requestCorrection
            ? { requestCorrection: true, versionId: current.review.id }
            : { [key]: remark, reportLanguage: language }),
          reviewerNote: note,
        }),
      });
      const d = await r.json();
      if (!alive.current) return;
      if (r.status === 401 || r.status === 403) { setCards([]); setCanReview(false); setCanEdit(false); setActive(null); setLoadFailed(true); }
      if (r.status === 409) await load();
      if (!r.ok) throw new Error(d.error);
      await load();
      setMessage(t.success);
    } catch (e) {
      if (alive.current) { void e; setMessage(""); setFailure(t.actionFailed); }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const blocked = cards.filter((c) => c.review.blockers.length).length;
  return (
    <section
      dir={locale === "en" ? "ltr" : "rtl"}
      className="space-y-4 min-w-0 [overflow-wrap:anywhere]"
      aria-label={t.title}
    >
      <a className="sk-link text-sm font-medium text-primary" href="/jobs">{jobMessages[locale].title}</a>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink-strong sm:text-lg">
          {t.title} · {exam.title}
        </h3>
        <p className="text-xs text-ink-subtle">
          {exam.class?.name} {exam.class?.section}
        </p>
      </div>
      <div role="status" aria-live="polite">
        {message ? <Alert tone="success" compact live="off">{sectionLabel(message, locale)}</Alert> : null}
      </div>
      {failure ? <Alert tone="danger" compact>{failure}</Alert> : null}
      {loading ? (
        <SkeletonList rows={4} label={t.loading} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 tabular-nums">
            <Badge variant="danger" dot>{t.blocked}: {blocked}</Badge>
            <Badge variant="info" dot>{t.eligible}: {cards.length - blocked}</Badge>
            <Badge variant="success" dot>{t.approved}: {cards.filter((c) => c.review.approvedAt).length}</Badge>
          </div>
          {loadFailed ? <ErrorState description={t.loadFailed} onRetry={() => void load()} retryLabel={t.retry} /> : !cards.length && <EmptyState size="sm" icon={FileText} title={t.emptyTitle} description={t.empty} />}
          {canReview && cards.some((c) => c.review.predecessorId) && (
            <FormField name="correctionReason" label={t.reason} showCount>
              <Textarea
                className="block w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </FormField>
          )}
          <div className="flex flex-wrap gap-2">
            {canReview && (
              <>
                <Button variant="outline"
                  className="px-3 py-2"
                  disabled={busy}
                  onClick={() => action("generate")}
                >
                  {t.generate}
                </Button>
                <Button variant="outline"
                  className="px-3 py-2"
                  disabled={
                    busy ||
                    !selected.length ||
                    (!reason.trim() &&
                      cards.some(
                        (c) =>
                          selected.includes(c.id) &&
                          c.review.predecessorId &&
                          !c.review.approvedAt,
                      ))
                  }
                  onClick={() => action("approve")}
                >
                  {t.approve}
                </Button>
                <Button variant="outline"
                  className="px-3 py-2"
                  disabled={
                    busy ||
                    !cards.length ||
                    cards.some((c) => !c.review.approvedAt)
                  }
                  onClick={() => action("review")}
                >
                  {t.review}
                </Button>
              </>
            )}
          </div>
          <label className="block text-sm">
            {t.filter}
            <Select
              className="block"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{t.all}</option>
              <option value="blocked">{t.blocked}</option>
              <option value="eligible">{t.eligible}</option>
            </Select>
          </label>
          <label className="block text-sm">
            {t.reviewer}
            <Select
              className="block"
              value={reviewerFilter}
              onChange={(e) => setReviewerFilter(e.target.value)}
            >
              <option value="">{t.all}</option>
              {[
                ...new Map(
                  cards
                    .filter((c) => c.review.lastReviewerId)
                    .map((c) => [
                      c.review.lastReviewerId!,
                      c.review.reviewerName || c.review.lastReviewerId!,
                    ]),
                ).entries(),
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <ul className="space-y-3">
            {cards
              .filter(
                (c) =>
                  !reviewerFilter || c.review.lastReviewerId === reviewerFilter,
              )
              .filter(
                (c) =>
                  filter === "all" ||
                  (filter === "blocked"
                    ? c.review.blockers.length
                    : !c.review.blockers.length),
              )
              .map((c) => (
                <li key={c.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center flex-wrap gap-2">
                    {canReview && (
                      <Checkbox
                        aria-label={`${t.approve}: ${c.student?.fullName} v${c.review.number}`}

                        disabled={
                          busy ||
                          !!c.review.blockers.length ||
                          !!c.review.publishedAt
                        }
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.id]
                              : selected.filter((id) => id !== c.id),
                          )
                        }
                      />
                    )}
                    <strong>{c.student?.fullName}</strong>
                    <bdi>v{c.review.number}</bdi>
                    <span>
                      {c.review.blockers.length
                        ? t.blocked
                        : c.review.approvedAt
                          ? t.approved
                          : t.eligible}
                    </span>
                  </div>
                  <p className="text-sm">
                    {t.changed}:{" "}
                    {c.review.changedSections
                      .map((label) => sectionLabel(label, locale))
                      .join(", ")}
                  </p>
                  {c.review.blockers.map((b) => (
                    <p key={b} className="text-sm">
                      {sectionLabel(b, locale)}
                    </p>
                  ))}
                  {!!c.review.delivery?.length && (
                    <p className="text-sm">
                      {t.delivery}:{" "}
                      {c.review.delivery
                        .map((d) => `${sectionLabel(d.channel, locale)}: ${sectionLabel(d.status, locale)}`)
                        .join(" · ")}
                    </p>
                  )}
                  {c.review.reviewerName && (
                    <p className="text-xs">
                      {t.reviewer}:{" "}
                      {c.review.reviewerName || c.review.approvedBy} ·{" "}
                      {c.review.lastReviewedAt}
                    </p>
                  )}
                  <Button variant="outline"
                    className="px-3 py-2"
                    onClick={() => {
                      setActive(c.id);
                      setLanguage(c.review.language);
                      setNote(c.review.reviewerNote || "");
                      setRemark(
                        c.review.language === "ar"
                          ? c.review.snapshot.reportCard.remarksAr || ""
                          : c.review.language === "ur"
                            ? c.review.snapshot.reportCard.remarksUr || ""
                            : c.review.snapshot.reportCard.remarksEn || "",
                      );
                    }}
                  >
                    {t.inspect} <bdi>v{c.review.number}</bdi>
                  </Button>
                  {!!c.review.history?.length && (
                    <details>
                      <summary>
                        {locale === "ar"
                          ? "سجل النسخ المعتمدة"
                          : locale === "ur"
                            ? "منظور شدہ نسخوں کی تاریخ"
                            : "Approved version history"}
                      </summary>
                      <ul>
                        {c.review.history.map((v) => (
                          <li key={v.id}>
                            <a
                              className="underline"
                              href={`/api/reports/download?reportCardId=${c.id}&versionId=${v.id}&redirect=1`}
                              target="_blank"
                              rel="noopener"
                            >
                              <bdi>v{v.number}</bdi> ·{" "}
                              {v.publishedAt ? sectionLabel("Published", locale) : t.approved}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {c.review.approvedAt && (
                    <a
                      className={button}
                      target="_blank"
                      rel="noopener"
                      href={`/api/reports/download?reportCardId=${c.id}&versionId=${c.review.id}&redirect=1`}
                    >
                      {t.preview}
                    </a>
                  )}
                </li>
              ))}
          </ul>
          {current && (
            <div
              className="rounded-xl border p-4 space-y-3"
              role="region"
              aria-label={`${t.inspect} v${current.review.number}`}
            >
              <h4 className="font-semibold">
                {current.student?.fullName} ·{" "}
                <bdi>v{current.review.number}</bdi>
              </h4>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { title: t.prior, snapshot: current.review.priorSnapshot },
                  { title: t.pending, snapshot: current.review.snapshot },
                ].map(({ title, snapshot }) => (
                  <div key={title}>
                    <h5 className="font-semibold">{title}</h5>
                    {snapshot ? (
                      <>
                        <p>
                          <bdi>
                            {snapshot.reportCard.percentage}% ·{" "}
                            {snapshot.reportCard.grade}
                          </bdi>
                        </p>
                        {snapshot.overall && (
                          <p>
                            <bdi>
                              {snapshot.overall.overallPercentage}% ·{" "}
                              {snapshot.overall.overallGrade}
                            </bdi>
                          </p>
                        )}
                        <ul>
                          {snapshot.marks.map((m) => (
                            <li key={m.subject}>
                              {m.subject}:{" "}
                              <bdi>
                                {m.obtained}/{m.total}
                              </bdi>
                            </li>
                          ))}
                        </ul>
                        {snapshot.weightConfig && (
                          <details>
                            <summary>
                              {locale === "ar"
                                ? "قواعد التقييم"
                                : locale === "ur"
                                  ? "گریڈنگ کے اصول"
                                  : "Grading rules"}
                            </summary>
                            <dl className="text-sm">
                              {snapshot.weightConfig.thresholds &&
                                Object.entries(
                                  snapshot.weightConfig.thresholds,
                                ).map(([grade, threshold]) => (
                                  <div key={grade}>
                                    <dt>
                                      <bdi>{grade.toUpperCase()}</bdi>
                                    </dt>
                                    <dd>
                                      <bdi>{threshold}%</bdi>
                                    </dd>
                                  </div>
                                ))}
                              {Object.entries(snapshot.weightConfig)
                                .filter(([, v]) => typeof v === "number")
                                .map(([key, value]) => (
                                  <div key={key}>
                                    <dt>{sectionLabel(key.replace(/([A-Z])/g, " $1"), locale)}</dt>
                                    <dd>
                                      <bdi>{String(value)}</bdi>
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                          </details>
                        )}
                        <p dir="auto" className="whitespace-pre-wrap">
                          {snapshot.reportCard.remarksEn}
                        </p>
                        <p dir="rtl">{snapshot.reportCard.remarksAr}</p>
                        <p dir="rtl">{snapshot.reportCard.remarksUr}</p>
                      </>
                    ) : (
                      <p>—</p>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <>
                  <label className="block">
                    {t.language}
                    <Select
                      className="block"
                      value={language}
                      onChange={(e) => {
                        const l = e.target.value;
                        setLanguage(l);
                        setRemark(
                          l === "ar"
                            ? current.review.snapshot.reportCard.remarksAr || ""
                            : l === "ur"
                              ? current.review.snapshot.reportCard.remarksUr ||
                                ""
                              : current.review.snapshot.reportCard.remarksEn ||
                                "",
                        );
                      }}
                    >
                      <option value="en">English</option>
                      <option value="ar">العربية</option>
                      <option value="ur">اردو</option>
                    </Select>
                  </label>
                  <label className="block">
                    {t.remarks}
                    <Textarea
                      className="block w-full"
                      dir={language === "en" ? "ltr" : "rtl"}
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                    />
                  </label>
                  {canReview && (
                    <label className="block">
                      {t.note}
                      <Textarea
                        className="block w-full"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                  )}
                  <Button variant="outline"
                    className="px-3 py-2"
                    disabled={busy}
                    onClick={() => save()}
                  >
                    {t.save}
                  </Button>
                  {canReview && (
                    <Button variant="outline"
                      className="px-3 py-2"
                      disabled={busy || !note.trim()}
                      onClick={() => save(true)}
                    >
                      {t.request}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {canReview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline"
                  className="px-3 py-2"
                  disabled={
                    busy ||
                    !cards.length ||
                    cards.some((c) => !c.review.approvedAt)
                  }
                  onClick={() => action("publish")}
                >
                  {t.publish}
                </Button>
                <Button variant="outline"
                  className="px-3 py-2"
                  disabled={busy || !cards.some((c) => c.review.publishedAt)}
                  onClick={() => action("send")}
                >
                  {t.send}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function sectionLabel(value: string, language: keyof typeof copy): string {
  if (language === "en") return value;
  const labels: Record<string, [string, string]> = {
    Published: ["منشور", "شائع شدہ"],
    EMAIL: ["البريد الإلكتروني", "ای میل"],
    WHATSAPP: ["واتساب", "واٹس ایپ"],
    SENT: ["تم الإرسال", "بھیج دیا گیا"],
    PENDING: ["قيد الانتظار", "زیر انتظار"],
    FAILED: ["فشل الإرسال", "ترسیل ناکام"],
    "quiz Weight": ["وزن الاختبارات القصيرة", "مختصر امتحان کا وزن"],
    "class Test Weight": ["وزن اختبار الفصل", "جماعتی امتحان کا وزن"],
    "mid Term Weight": ["وزن امتحان منتصف الفصل", "وسط مدتی امتحان کا وزن"],
    "final Weight": ["وزن الامتحان النهائي", "آخری امتحان کا وزن"],
    "This report changed during review. Reload and review the new version.": ["تغير التقرير أثناء المراجعة. أعد التحميل وراجع النسخة الجديدة.", "جائزے کے دوران رپورٹ بدل گئی۔ دوبارہ لوڈ کرکے نئے نسخے کا جائزہ لیں۔"],
    "Select an eligible version to approve.": ["حدد نسخة جاهزة للاعتماد.", "منظوری کے لیے تیار نسخہ منتخب کریں۔"],
    "Enter a family-facing correction reason before approving.": ["أدخل سبب التصحيح للأسرة قبل الاعتماد.", "منظوری سے پہلے خاندان کے لیے تصحیح کی وجہ لکھیں۔"],
    "Enter a family-facing correction reason.": ["أدخل سبب التصحيح للأسرة.", "خاندان کے لیے تصحیح کی وجہ لکھیں۔"],
    "The correction reason changed. Request a new review before approving.": ["تغير سبب التصحيح. اطلب مراجعة جديدة قبل الاعتماد.", "تصحیح کی وجہ بدل گئی۔ منظوری سے پہلے نیا جائزہ طلب کریں۔"],
    "The correction reason changed after approval. Review a new version.": ["تغير سبب التصحيح بعد الاعتماد. راجع نسخة جديدة.", "منظوری کے بعد تصحیح کی وجہ بدل گئی۔ نئے نسخے کا جائزہ لیں۔"],
    "Every report needs approval of its current version.": ["تحتاج النسخة الحالية لكل تقرير إلى اعتماد.", "ہر رپورٹ کے موجودہ نسخے کی منظوری ضروری ہے۔"],
    "Principal review is required before publishing.": ["مراجعة المدير مطلوبة قبل النشر.", "اشاعت سے پہلے پرنسپل کا جائزہ ضروری ہے۔"],
    "Generate reports first.": ["أنشئ التقارير أولاً.", "پہلے رپورٹس بنائیں۔"],
    "Failed to load reports": ["تعذر تحميل التقارير", "رپورٹس لوڈ نہیں ہو سکیں"],
    "Action failed": ["تعذر إكمال الإجراء", "کارروائی ناکام ہوئی"],
    "Save failed": ["تعذر الحفظ", "محفوظ نہیں ہو سکا"],
    Marks: ["الدرجات", "نمبر"],
    "Grading rules and weighted results": [
      "قواعد التقييم والنتائج الموزونة",
      "گریڈنگ کے اصول اور وزنی نتائج",
    ],
    Remarks: ["الملاحظات", "تبصرے"],
    Language: ["اللغة", "زبان"],
    "Document identity or attendance": [
      "بيانات التقرير أو الحضور",
      "رپورٹ کی شناخت یا حاضری",
    ],
    "Exam must be locked": ["يجب إقفال الامتحان", "امتحان لاک ہونا ضروری ہے"],
  };
  if (value.includes("; ")) return value.split("; ").map((part) => sectionLabel(part, language)).join("؛ ");
  if (labels[value]) return labels[value][language === "ar" ? 0 : 1];
  if (value.startsWith("Missing marks:"))
    return `${language === "ar" ? "درجات مفقودة:" : "نامکمل نمبر:"} ${value.slice(14)}`;
  if (value.startsWith("Missing ") && value.endsWith(" remarks"))
    return `${language === "ar" ? "ملاحظات مفقودة:" : "تبصرے درکار:"} ${value.slice(8, -8)}`;
  return value;
}
