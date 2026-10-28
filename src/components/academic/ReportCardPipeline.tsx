"use client";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { SkeletonList } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { CheckCheck, ClipboardCheck, Eye, FileDown, FileText, Send, Upload } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
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
/** EN UI keys (translated through useUiText; AR/UR in src/lib/locale/role-ux/p6-messages.ts, R11). */
const copy = {
  title: "Report review",
  blocked: "Blocked",
  eligible: "Eligible",
  approved: "Approved",
  changed: "Changed sections",
  approve: "Approve selected",
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
  empty: "Marks are locked. Generate report cards to start review.",
  emptyWaiting: "Marks are locked. Report cards appear here once the academic office generates them.",
  reopenedTitle: "Exam reopened",
  reopened: "Marks for this exam were reopened, so report cards wait until it is locked again.",
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
  history: "Approved version history",
  grading: "Grading rules",
  waiting: "Waiting for your principal's approval",
} as const;
type PipelineProps = {
  exam: ExamItem;
  campusId?: string;
  onChanged?: () => void;
  /**
   * `lead` (default): the academic lead approves versions, completes the class review, publishes and queues
   * delivery. `delivery`: the campus office without the academic-lead seat (§3.1 admin report-cards) — the
   * approve/review/publish controls are hidden; it generates PDFs and queues delivery of published reports.
   * The server decides either way (`canReview` = academic lead, `canDeliver` = academic office, G32).
   */
  mode?: "lead" | "delivery";
  /** Emits the spotlight anchor `principal.reports.approve` (§9.4). A page listing several exams passes it to
   *  the first pipeline only, so the anchor stays unique on the rendered page. Default true. */
  tourAnchor?: boolean;
  /**
   * Host-owned header (§4.4 principal "Report cards": **Approve selected** primary, Preview release secondary):
   * `hideApprove` drops this pipeline's own Approve button (the versions stay selectable and carry the spotlight
   * anchor); each new `approveRequest` number approves this pipeline's selected versions; each new
   * `previewRequest` opens the first selected (else first) version side by side with the last approved one.
   * `onSelectionChange` reports how many versions are selected and whether they can be approved now.
   */
  hideApprove?: boolean;
  approveRequest?: number;
  previewRequest?: number;
  onSelectionChange?: (state: ReportSelectionState) => void;
  /**
   * Host-owned delivery (§4.4b admin "Report cards" delivery: **Queue delivery** (ConfirmAction) primary,
   * Generate PDFs secondary): `hideDelivery` drops the office row; a new `deliverRequest` opens the send
   * confirmation (once something is published), a new `generateRequest` builds the PDFs; `onDeliveryState` says
   * whether each is possible now.
   */
  hideDelivery?: boolean;
  deliverRequest?: number;
  generateRequest?: number;
  onDeliveryState?: (state: { examId: string; canGenerate: boolean; canDeliver: boolean }) => void;
};
export type ReportSelectionState = { examId: string; selected: number; canApprove: boolean; reason: string | null };
type Pending = "publish" | "send" | null;
export function ReportCardPipeline(props: PipelineProps) {
  // Reset permissions, selections and private notes before a new scope paints.
  return <ScopedReportCardPipeline key={JSON.stringify([props.exam.id, props.campusId, props.mode ?? "lead"])} {...props} />;
}
function ScopedReportCardPipeline({ exam, campusId, onChanged, mode = "lead", tourAnchor = true, hideApprove = false, approveRequest, previewRequest, onSelectionChange, hideDelivery = false, deliverRequest, generateRequest, onDeliveryState }: PipelineProps) {
  const alive = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  // A 409 from /api/reports means the exam was reopened after this list was opened — a state, not a failure.
  const [reopened, setReopened] = useState(false);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);
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
  const ui = useUiText();
  const [serverCanReview, setCanReview] = useState(false),
    [serverCanDeliver, setCanDeliver] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [filter, setFilter] = useState("all");
  const [active, setActive] = useState<string | null>(null),
    [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [language, setLanguage] = useState("en"),
    [remark, setRemark] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [reviewerFilter, setReviewerFilter] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  // Delivery mode never offers the lead's decisions, whatever the server would allow.
  const canReview = mode === "lead" && serverCanReview;
  const canDeliver = serverCanDeliver || serverCanReview;
  const label = (value: string) => sectionLabel(value, ui);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadFailed(null);
    setCanReview(false);
    setCanDeliver(false);
    setCanEdit(false);
    setSelected([]);
    setActive(null);
    try {
      const q = new URLSearchParams({ examId: exam.id });
      if (campusId) q.set("campusId", campusId);
      const r = await fetch(`/api/reports?${q}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      const d = await r.json();
      if (!alive.current || request.current !== controller || controller.signal.aborted) return;
      if (r.status === 409) {
        setReopened(true);
        setCards([]);
        setMessage("");
        onChangedRef.current?.();
        return;
      }
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "");
      setReopened(false);
      setCards(d.reportCards);
      setCanReview(Boolean(d.canReview));
      setCanDeliver(Boolean(d.canDeliver));
      setCanEdit(Boolean(d.canEdit));
    } catch (e) {
      if (!alive.current || request.current !== controller || controller.signal.aborted) return;
      // Load failure is an inline error with retry (R4), never an empty list and never a toast.
      setLoadFailed(friendlyErrorMessage(e, ui(copy.loadFailed)));
      setCards([]);
      setMessage("");
    } finally {
      if (alive.current && request.current === controller) setLoading(false);
    }
  }, [exam.id, campusId, ui]);
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
      if (r.status === 401 || r.status === 403) { setCards([]); setCanReview(false); setCanDeliver(false); setCanEdit(false); setActive(null); setLoadFailed(typeof d.error === "string" ? d.error : ui(copy.loadFailed)); }
      if (r.status === 409) { await load(); return; }
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "");
      if (d.jobId) {
        // Background work reports through one toast with a link to its progress (R4), not a page jump.
        toast.success(ui("Report job started"), { action: { label: ui("View progress"), onClick: () => window.location.assign(`/jobs?id=${encodeURIComponent(d.jobId)}`) } });
      } else {
        setMessage(ui(copy.success));
      }
      await load();
      if (alive.current) onChanged?.();
    } catch (e) {
      if (alive.current) { setMessage(""); setFailure(label(friendlyErrorMessage(e, ui(copy.actionFailed)))); }
    } finally {
      if (alive.current) { setBusy(false); setPending(null); }
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
      if (r.status === 401 || r.status === 403) { setCards([]); setCanReview(false); setCanDeliver(false); setCanEdit(false); setActive(null); setLoadFailed(typeof d.error === "string" ? d.error : ui(copy.loadFailed)); }
      if (r.status === 409) await load();
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "");
      await load();
      setMessage(ui(copy.success));
    } catch (e) {
      if (alive.current) { setMessage(""); setFailure(label(friendlyErrorMessage(e, ui(copy.actionFailed)))); }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const blocked = cards.filter((c) => c.review.blockers.length).length;
  const approvedCount = cards.filter((c) => c.review.approvedAt).length;
  const allApproved = cards.length > 0 && approvedCount === cards.length;
  const anyPublished = cards.some((c) => c.review.publishedAt);
  const approveBlocked =
    busy ||
    !selected.length ||
    (!reason.trim() && cards.some((c) => selected.includes(c.id) && c.review.predecessorId && !c.review.approvedAt));
  // Host-owned header: report the selection, and run the header's Approve / Preview (each new number once).
  const needsReason = !reason.trim() && cards.some((c) => selected.includes(c.id) && c.review.predecessorId && !c.review.approvedAt);
  const selectionReason = !canReview ? null : !selected.length ? "Tick the report versions to approve first." : needsReason ? "Add the family-facing correction reason first." : null;
  const selectionKey = `${selected.length}:${!approveBlocked}:${selectionReason ?? ""}:${canReview}`;
  useEffect(() => {
    onSelectionChange?.({ examId: exam.id, selected: canReview ? selected.length : 0, canApprove: canReview && !approveBlocked, reason: selectionReason });
    // selectionKey captures every input; the callback identity may change on each host render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);
  const seenRequests = useRef({ approve: approveRequest, preview: previewRequest, deliver: deliverRequest, generate: generateRequest });
  const deliveryKey = `${canDeliver && cards.length > 0}:${canDeliver && anyPublished}:${busy}`;
  useEffect(() => {
    onDeliveryState?.({ examId: exam.id, canGenerate: canDeliver && cards.length > 0 && !busy, canDeliver: canDeliver && anyPublished && !busy });
    // deliveryKey captures every input; the callback identity may change on each host render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryKey]);
  useEffect(() => {
    if (deliverRequest === undefined || seenRequests.current.deliver === deliverRequest) return;
    seenRequests.current.deliver = deliverRequest;
    if (canDeliver && anyPublished && !busy) setPending("send");
    // Only a new number opens the confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverRequest]);
  useEffect(() => {
    if (generateRequest === undefined || seenRequests.current.generate === generateRequest) return;
    seenRequests.current.generate = generateRequest;
    if (canDeliver && !busy) void action("generate");
    // Only a new number builds the PDFs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateRequest]);
  useEffect(() => {
    if (approveRequest === undefined || seenRequests.current.approve === approveRequest) return;
    seenRequests.current.approve = approveRequest;
    if (!canReview || !selected.length) return;
    if (needsReason) { setMessage(""); setFailure(ui("Add the family-facing correction reason first.")); return; }
    if (!approveBlocked) void action("approve");
    // Only a new number runs the approval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveRequest]);
  useEffect(() => {
    if (previewRequest === undefined || seenRequests.current.preview === previewRequest) return;
    seenRequests.current.preview = previewRequest;
    const card = cards.find((c) => selected.includes(c.id)) ?? cards[0];
    if (!card) return;
    setActive(card.id); setLanguage(card.review.language); setNote(card.review.reviewerNote || ""); setRemark(remarkFor(card, card.review.language));
    requestAnimationFrame(() => document.getElementById(`report-inspect-${exam.id}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    // Only a new number opens the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewRequest]);
  const visibleCards = cards
    .filter((c) => !reviewerFilter || c.review.lastReviewerId === reviewerFilter)
    .filter((c) => filter === "all" || (filter === "blocked" ? c.review.blockers.length : !c.review.blockers.length));
  const reviewers = [...new Map(cards.filter((c) => c.review.lastReviewerId).map((c) => [c.review.lastReviewerId!, c.review.reviewerName || c.review.lastReviewerId!])).entries()];
  const remarkFor = (card: Card, lang: string) =>
    lang === "ar" ? card.review.snapshot.reportCard.remarksAr || "" : lang === "ur" ? card.review.snapshot.reportCard.remarksUr || "" : card.review.snapshot.reportCard.remarksEn || "";
  return (
    <section
      dir={locale === "en" ? "ltr" : "rtl"}
      className="min-w-0 space-y-4 [overflow-wrap:anywhere]"
      aria-label={`${ui(copy.title)} · ${exam.title}`}
      data-report-mode={mode}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-base font-bold text-ink-strong sm:text-lg">
          <bdi>{exam.title}</bdi>
        </h3>
        <p className="text-xs text-ink-subtle">
          <bdi>{[exam.class?.name, exam.class?.section].filter(Boolean).join(" ")}</bdi>
        </p>
      </div>
      <div role="status" aria-live="polite" className="empty:hidden space-y-2">
        {message ? <Alert tone="success" compact live="off">{message}</Alert> : null}
        {failure ? <Alert tone="danger" compact live="off">{failure}</Alert> : null}
        {loadFailed ? <span className="sr-only">{loadFailed}</span> : null}
      </div>
      {loading ? (
        <SkeletonList rows={4} label={ui(copy.loading)} />
      ) : loadFailed ? (
        <ErrorState description={loadFailed} onRetry={() => void load()} retryLabel={ui(copy.retry)} />
      ) : reopened ? (
        <EmptyState size="sm" icon={ClipboardCheck} title={ui(copy.reopenedTitle)} description={ui(copy.reopened)} />
      ) : !cards.length ? (
        <EmptyState
          size="sm"
          icon={FileText}
          title={ui(copy.emptyTitle)}
          description={ui(canDeliver ? copy.empty : copy.emptyWaiting)}
          action={canDeliver ? <Button type="button" variant="outline" disabled={busy} onClick={() => void action("generate")}><FileDown aria-hidden="true" />{ui(copy.generate)}</Button> : undefined}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 tabular-nums">
            <Badge variant="danger" dot>{ui(copy.blocked)}: <bdi>{blocked}</bdi></Badge>
            <Badge variant="info" dot>{ui(copy.eligible)}: <bdi>{cards.length - blocked}</bdi></Badge>
            <Badge variant="success" dot>{ui(copy.approved)}: <bdi>{approvedCount}</bdi></Badge>
            {mode === "delivery" && !allApproved ? <Badge variant="neutral">{ui(copy.waiting)}</Badge> : null}
          </div>
          {canReview && cards.some((c) => c.review.predecessorId) && (
            <FormField name="correctionReason" label={ui(copy.reason)} showCount>
              <Textarea
                className="block w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </FormField>
          )}
          {canReview && !hideApprove ? (
            <div className="flex flex-wrap gap-2">
              {/* One decisive action per pipeline: approve the selected versions. */}
              <Button type="button" data-tour={tourAnchor ? "principal.reports.approve" : undefined} disabled={approveBlocked} onClick={() => void action("approve")}>
                <CheckCheck aria-hidden="true" />{ui(copy.approve)}
              </Button>
              <Button type="button" variant="outline" disabled={busy || !allApproved} onClick={() => void action("review")}>
                <ClipboardCheck aria-hidden="true" />{ui(copy.review)}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField name={`readiness-${exam.id}`} label={ui(copy.filter)}>
              <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">{ui(copy.all)}</option>
                <option value="blocked">{ui(copy.blocked)}</option>
                <option value="eligible">{ui(copy.eligible)}</option>
              </Select>
            </FormField>
            <FormField name={`reviewer-${exam.id}`} label={ui(copy.reviewer)}>
              <Select value={reviewerFilter} onChange={(e) => setReviewerFilter(e.target.value)}>
                <option value="">{ui(copy.all)}</option>
                {reviewers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            </FormField>
          </div>
          {canReview && hideApprove ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !allApproved} onClick={() => void action("review")}>
                <ClipboardCheck aria-hidden="true" />{ui(copy.review)}
              </Button>
            </div>
          ) : null}
          {/* With a host-owned Approve, the spotlight anchor marks the versions the principal ticks to approve. */}
          <ul className="space-y-3" data-tour={hideApprove && canReview && tourAnchor ? "principal.reports.approve" : undefined}>
            {visibleCards.map((c) => (
              <li key={c.id} className="space-y-2 rounded-2xl border border-border-subtle bg-card p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {canReview && (
                    <Checkbox
                      aria-label={`${ui(copy.approve)}: ${c.student?.fullName ?? ""} v${c.review.number}`}
                      disabled={busy || !!c.review.blockers.length || !!c.review.publishedAt}
                      checked={selected.includes(c.id)}
                      onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))}
                    />
                  )}
                  <strong className="text-ink-strong"><bdi>{c.student?.fullName}</bdi></strong>
                  <bdi className="text-xs text-ink-subtle">v{c.review.number}</bdi>
                  <Badge size="sm" variant={c.review.blockers.length ? "danger" : c.review.approvedAt ? "success" : "info"}>
                    {ui(c.review.blockers.length ? copy.blocked : c.review.approvedAt ? copy.approved : copy.eligible)}
                  </Badge>
                </div>
                {c.review.changedSections.length ? (
                  <p className="text-sm text-ink-muted">{ui(copy.changed)}: {c.review.changedSections.map(label).join(", ")}</p>
                ) : null}
                {c.review.blockers.map((b) => <p key={b} className="text-sm text-status-error-text">{label(b)}</p>)}
                {!!c.review.delivery?.length && (
                  <p className="text-sm text-ink-muted">
                    {ui(copy.delivery)}: {c.review.delivery.map((d) => `${label(d.channel)}: ${label(d.status)}`).join(" · ")}
                  </p>
                )}
                {c.review.reviewerName && (
                  <p className="text-xs text-ink-subtle">
                    {ui(copy.reviewer)}: <bdi>{c.review.reviewerName || c.review.approvedBy}</bdi>
                    {c.review.lastReviewedAt ? <> · <bdi className="tabular-nums">{c.review.lastReviewedAt.slice(0, 10)}</bdi></> : null}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setActive(c.id); setLanguage(c.review.language); setNote(c.review.reviewerNote || ""); setRemark(remarkFor(c, c.review.language)); }}>
                    <Eye aria-hidden="true" />{ui(copy.inspect)} <bdi>v{c.review.number}</bdi>
                  </Button>
                  {c.review.approvedAt && (
                    <a className={buttonVariants({ variant: "ghost", size: "sm" })} target="_blank" rel="noopener" href={`/api/reports/download?reportCardId=${encodeURIComponent(c.id)}&versionId=${encodeURIComponent(c.review.id)}&redirect=1`}>
                      <FileText aria-hidden="true" />{ui(copy.preview)}
                    </a>
                  )}
                </div>
                {!!c.review.history?.length && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-ink">{ui(copy.history)}</summary>
                    <ul className="mt-2 space-y-1">
                      {c.review.history.map((v) => (
                        <li key={v.id}>
                          <a className="sk-link text-primary" href={`/api/reports/download?reportCardId=${encodeURIComponent(c.id)}&versionId=${encodeURIComponent(v.id)}&redirect=1`} target="_blank" rel="noopener">
                            <bdi>v{v.number}</bdi> · {v.publishedAt ? label("Published") : ui(copy.approved)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {current && (
            <div id={`report-inspect-${exam.id}`} className="scroll-mt-4 space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4" role="region" aria-label={`${ui(copy.inspect)} v${current.review.number}`}>
              <h4 className="font-semibold text-ink-strong">
                <bdi>{current.student?.fullName}</bdi> · <bdi>v{current.review.number}</bdi>
              </h4>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { title: copy.prior, snapshot: current.review.priorSnapshot },
                  { title: copy.pending, snapshot: current.review.snapshot },
                ].map(({ title, snapshot }) => (
                  <div key={title} className="min-w-0 space-y-1 text-sm">
                    <h5 className="font-semibold text-ink-strong">{ui(title)}</h5>
                    {snapshot ? (
                      <>
                        <p><bdi>{snapshot.reportCard.percentage}% · {snapshot.reportCard.grade}</bdi></p>
                        {snapshot.overall && <p><bdi>{snapshot.overall.overallPercentage}% · {snapshot.overall.overallGrade}</bdi></p>}
                        <ul>
                          {snapshot.marks.map((m) => (
                            <li key={m.subject}><bdi>{m.subject}</bdi>: <bdi>{m.obtained}/{m.total}</bdi></li>
                          ))}
                        </ul>
                        {snapshot.weightConfig && (
                          <details>
                            <summary className="cursor-pointer font-medium text-ink">{ui(copy.grading)}</summary>
                            <dl className="text-sm">
                              {snapshot.weightConfig.thresholds &&
                                Object.entries(snapshot.weightConfig.thresholds).map(([grade, threshold]) => (
                                  <div key={grade} className="flex gap-2"><dt><bdi>{grade.toUpperCase()}</bdi></dt><dd><bdi>{threshold}%</bdi></dd></div>
                                ))}
                              {Object.entries(snapshot.weightConfig)
                                .filter(([, v]) => typeof v === "number")
                                .map(([key, value]) => (
                                  <div key={key} className="flex gap-2"><dt>{label(key.replace(/([A-Z])/g, " $1"))}</dt><dd><bdi>{String(value)}</bdi></dd></div>
                                ))}
                            </dl>
                          </details>
                        )}
                        <p dir="auto" className="whitespace-pre-wrap">{snapshot.reportCard.remarksEn}</p>
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
                  <FormField name={`report-language-${current.id}`} label={ui(copy.language)}>
                    <Select value={language} onChange={(e) => { const l = e.target.value; setLanguage(l); setRemark(remarkFor(current, l)); }}>
                      <option value="en">English</option>
                      <option value="ar">العربية</option>
                      <option value="ur">اردو</option>
                    </Select>
                  </FormField>
                  <FormField name={`report-remarks-${current.id}`} label={ui(copy.remarks)}>
                    <Textarea className="block w-full" dir={language === "en" ? "ltr" : "rtl"} value={remark} onChange={(e) => setRemark(e.target.value)} />
                  </FormField>
                  {canReview && (
                    <FormField name={`reviewer-note-${current.id}`} label={ui(copy.note)}>
                      <Textarea className="block w-full" value={note} onChange={(e) => setNote(e.target.value)} />
                    </FormField>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>{ui(copy.save)}</Button>
                    {canReview && (
                      <Button type="button" variant="outline" disabled={busy || !note.trim()} onClick={() => void save(true)}>{ui(copy.request)}</Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {(canReview || canDeliver) && !hideDelivery ? (
            <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
              {/* Generating PDFs and queueing delivery are office work (G32: canManageAcademics). */}
              <Button type="button" variant="outline" disabled={busy} onClick={() => void action("generate")}>
                <FileDown aria-hidden="true" />{ui(copy.generate)}
              </Button>
              {canReview ? (
                <Button type="button" variant="outline" disabled={busy || !allApproved} onClick={() => setPending("publish")}>
                  <Upload aria-hidden="true" />{ui(copy.publish)}
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={busy || !anyPublished} onClick={() => setPending("send")}>
                <Send aria-hidden="true" />{ui(copy.send)}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {/* F16: publishing and sending to families are confirmed with their consequence (R3). */}
      <ConfirmAction
        open={pending === "publish"}
        title={ui("Publish report cards?")}
        description={ui("Families and students see the approved versions as soon as they are published. A later correction creates a new version with a reason families can read.")}
        confirmLabel={ui("Publish")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={busy}
        onConfirm={() => action("publish")}
        onCancel={() => setPending(null)}
      />
      <ConfirmAction
        open={pending === "send"}
        title={ui("Send report cards to families?")}
        description={ui("Each guardian with a contact on file receives the published report card by their usual channel. Messages already sent are not repeated. This cannot be undone.")}
        confirmLabel={ui("Send")}
        cancelLabel={ui("Keep editing")}
        tone="primary"
        busy={busy}
        onConfirm={() => action("send")}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}

/** Server and snapshot labels (blockers, channels, statuses, weight names) are EN UI keys too. */
function sectionLabel(value: string, ui: (source: string, values?: unknown[]) => string): string {
  if (value.includes("; ")) return value.split("; ").map((part) => sectionLabel(part, ui)).join("; ");
  if (value.startsWith("Missing marks:")) return `${ui("Missing marks:")} ${value.slice(14).trim()}`;
  if (value.startsWith("Missing ") && value.endsWith(" remarks")) return `${ui("Missing remarks:")} ${value.slice(8, -8)}`;
  return ui(value.trim());
}
