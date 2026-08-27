"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Panel, StepEmpty } from "@/components/academic/exams/shared";
import type { ExamItem } from "@/components/academic/ExamCycleManager";

/**
 * Turning a marked exam into report cards families can read (§81).
 *
 * The panel this replaces listed four buttons — Generate, Review, Publish,
 * Send — and disabled all four until the exam was locked, then told the reader
 * to "lock the exam (from the Marks tab / card)". There is no lock control on
 * the Marks tab, so the one instruction on the screen pointed at a button that
 * does not exist, and the whole panel was a dead end.
 *
 * Two things are fixed here:
 *
 *  1. Locking happens HERE, because locking is what produces report cards.
 *     The lock endpoint calls generateReportCardsForLockedExam, so "generate"
 *     was never a separate first step — it was the second half of locking,
 *     presented as though the user had forgotten to do it.
 *
 *  2. Every step says why it cannot run yet, in the same numbers the server
 *     will check. A step that is blocked because 40 of 80 marks are missing
 *     says so, rather than rendering grey and leaving the reader to guess.
 */

interface ReportCard {
  id: string;
  status?: string;
  grade?: string | null;
  percentage?: number | null;
  rank?: number | null;
  isSent?: boolean;
  pdfUrl?: string | null;
  remarksEn?: string | null;
  remarksUr?: string | null;
  remarksApproved?: boolean;
  deliveryStatus?: string | null;
  student?: { fullName?: string; rollNo?: string } | null;
}

type StepKey = "lock" | "review" | "pdf" | "publish" | "send";
type StepState = "done" | "ready" | "blocked";

export function ReportCardsPanel({
  exam,
  campusId,
  onChanged,
}: {
  exam: ExamItem;
  campusId?: string;
  onChanged?: () => void;
}) {
  const [cards, setCards] = useState<ReportCard[]>([]);
  const [progress, setProgress] = useState<{ entered: number; expected: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /** Unsaved remark text, keyed by report card id. */
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const isLocked = exam.isLocked || exam.status === "LOCKED";
  const reviewed = exam.status === "PRINCIPAL_REVIEWED";
  const published = exam.status === "PUBLISHED";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ examId: exam.id });
      if (campusId) sp.set("campusId", campusId);

      // Marks progress is fetched even before the exam locks: it is the whole
      // reason the first step is blocked, so it has to be on screen from the
      // start rather than appearing only once it stops mattering.
      const [reportRes, marksRes] = await Promise.all([
        isLocked
          ? fetch(`/api/reports?${sp}`).then((r) => r.json())
          : Promise.resolve({ success: true, reportCards: [] }),
        fetch(`/api/marks?examId=${exam.id}`).then((r) => r.json()),
      ]);

      setCards(reportRes?.reportCards ?? []);

      if (marksRes?.success) {
        const students: unknown[] = marksRes.students ?? [];
        const subjects: { id: string }[] = marksRes.subjects ?? [];
        const subjectIds = new Set(subjects.map((s) => s.id));
        const pairs = new Set(
          (marksRes.marks ?? [])
            .filter((m: { subjectId: string }) => subjectIds.has(m.subjectId))
            .map((m: { studentId: string; subjectId: string }) => `${m.studentId}:${m.subjectId}`),
        );
        setProgress({ entered: pairs.size, expected: students.length * subjects.length });
      }
    } catch {
      toast.error("Could not load report cards");
    } finally {
      setLoading(false);
    }
  }, [exam.id, campusId, isLocked]);

  useEffect(() => {
    load();
  }, [load]);

  const marksComplete = !!progress && progress.expected > 0 && progress.entered >= progress.expected;
  const missing = progress ? Math.max(0, progress.expected - progress.entered) : 0;

  const run = async (action: string, label: string) => {
    setBusy(action);
    try {
      const sp = new URLSearchParams();
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/reports?${sp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${label} failed`);
      toast.success(label);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  /** Locking is its own endpoint, and it is what creates the report cards. */
  const lockExam = async () => {
    setBusy("lock");
    try {
      const res = await fetch(`/api/exams/${exam.id}/lock`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not lock the exam");
      toast.success(
        data.reportCardsGenerated
          ? `Marks locked — ${data.reportCardsGenerated} report cards created`
          : "Marks locked",
      );
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not lock the exam");
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async (card: ReportCard) => {
    setBusy(`pdf-${card.id}`);
    try {
      const res = await fetch(`/api/reports/download?reportCardId=${card.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "PDF not available yet");
      window.open(data.pdfUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF not available yet");
    } finally {
      setBusy(null);
    }
  };

  const remarkOf = (c: ReportCard) => remarks[c.id] ?? c.remarksEn ?? "";

  /** Write a remark without approving it, so a draft can be left mid-thought. */
  const saveRemark = async (card: ReportCard) => {
    const text = (remarks[card.id] ?? "").trim();
    if (text === (card.remarksEn ?? "").trim()) return;
    setBusy(`remark-${card.id}`);
    try {
      const res = await fetch(`/api/reports/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the remark");
      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, remarksEn: text, remarksApproved: false } : c,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the remark");
    } finally {
      setBusy(null);
    }
  };

  const approveOne = async (card: ReportCard, silent = false) => {
    const text = (remarks[card.id] ?? card.remarksEn ?? "").trim();
    if (!text) {
      if (!silent) toast.error("Write a remark before approving it");
      return false;
    }
    if (!silent) setBusy(`approve-${card.id}`);
    try {
      const res = await fetch(`/api/reports/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: text, approve: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not approve");
      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, remarksEn: text, remarksApproved: true } : c,
        ),
      );
      if (!silent) toast.success("Remark approved");
      return true;
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Could not approve");
      return false;
    } finally {
      if (!silent) setBusy(null);
    }
  };

  /** Approve every card that already carries a remark, one request each. */
  const approveAll = async () => {
    const pending = cards.filter(
      (c) => !c.remarksApproved && (remarks[c.id] ?? c.remarksEn ?? "").trim(),
    );
    if (pending.length === 0) {
      toast.error("None of the outstanding cards have a remark written yet");
      return;
    }
    setBusy("approve-all");
    let ok = 0;
    for (const card of pending) {
      if (await approveOne(card, true)) ok += 1;
    }
    setBusy(null);
    toast.success(`Approved ${ok} remark${ok === 1 ? "" : "s"}`);
    onChanged?.();
  };

  /** Cards the review step will reject: no remark, or one not yet approved. */
  const needingRemarks = useMemo(
    () =>
      cards.filter(
        (c) => !c.remarksApproved || (!c.remarksEn?.trim() && !c.remarksUr?.trim()),
      ).length,
    [cards],
  );

  const steps = useMemo((): {
    key: StepKey;
    label: string;
    icon: typeof Lock;
    blurb: string;
    state: StepState;
    reason: string;
    cta: string;
    onRun: () => void;
  }[] => {
    const pdfsMissing = cards.filter((c) => !c.pdfUrl).length;

    return [
      {
        key: "lock",
        label: "Lock the marks",
        icon: Lock,
        blurb: "Freezes every mark and creates one report card per pupil.",
        state: isLocked ? "done" : marksComplete ? "ready" : "blocked",
        reason: !progress
          ? "Checking how many marks are in…"
          : progress.expected === 0
          ? "This class has no students or no subjects yet."
          : marksComplete
          ? `All ${progress.expected} marks are in.`
          : `${missing} of ${progress.expected} marks still to enter — finish them on the Enter marks tab.`,
        cta: "Lock marks",
        onRun: lockExam,
      },
      {
        key: "review",
        label: "Review",
        icon: ShieldCheck,
        blurb: "The principal signs the results off before families see them.",
        // The server refuses to review while any card lacks an approved
        // remark, so the step has to test the same thing. Reporting "ready"
        // and then failing on click is the defect this panel was rebuilt for.
        state:
          reviewed || published
            ? "done"
            : isLocked && needingRemarks === 0 && cards.length > 0
            ? "ready"
            : "blocked",
        reason: !isLocked
          ? "Lock the marks first — there is nothing to review yet."
          : needingRemarks > 0
          ? `${needingRemarks} report card${needingRemarks === 1 ? "" : "s"} still need an approved remark — write and approve them below.`
          : "Every remark is approved. Ready for sign-off.",
        cta: "Mark reviewed",
        onRun: () => run("review", "Results reviewed"),
      },
      {
        // Publishing refuses while any card lacks a PDF, and building them one
        // row at a time is not a workflow — so the bulk build is its own step.
        key: "pdf",
        label: "Build the PDFs",
        icon: FileText,
        blurb: "Renders every report card to a PDF, ready to publish and send.",
        state:
          isLocked && cards.length > 0 && pdfsMissing === 0
            ? "done"
            : reviewed || (isLocked && needingRemarks === 0)
            ? "ready"
            : "blocked",
        reason: !isLocked
          ? "Lock the marks first."
          : pdfsMissing === 0 && cards.length > 0
          ? `All ${cards.length} PDFs are built.`
          : `${pdfsMissing} of ${cards.length} report cards have no PDF yet.`,
        cta: "Build PDFs",
        onRun: () => run("pdf", "Report card PDFs built"),
      },
      {
        key: "publish",
        label: "Publish",
        icon: Upload,
        blurb: "Makes the report cards visible to parents and students.",
        state: published ? "done" : reviewed && pdfsMissing === 0 ? "ready" : "blocked",
        reason: published
          ? "Published."
          : !reviewed
          ? "Needs the principal's review first."
          : pdfsMissing > 0
          ? `${pdfsMissing} report card${pdfsMissing === 1 ? " has" : "s have"} no PDF yet — run the step above.`
          : "Reviewed, PDFs built, ready to publish.",
        cta: "Publish all",
        onRun: () => run("publish", "Report cards published"),
      },
      {
        key: "send",
        label: "Send to families",
        icon: Send,
        blurb: "Delivers each report card over WhatsApp.",
        state: cards.length > 0 && cards.every((c) => c.isSent) ? "done" : published ? "ready" : "blocked",
        reason: published
          ? `${cards.filter((c) => c.isSent).length} of ${cards.length} already sent.`
          : "Publish the report cards before sending them out.",
        cta: "Send all",
        onRun: () => run("send", "Report cards sent"),
      },
    ];
  }, [isLocked, reviewed, published, marksComplete, missing, progress, cards, needingRemarks]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-56 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
        <div className="h-40 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title="From marks to report cards"
        subtitle="Four steps, in order. Each one says what is holding it up."
        icon={FileText}
      >
        <ol className="space-y-2.5">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const running = busy === step.key;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-[18px] border px-4 py-3 transition-colors",
                  step.state === "done"
                    ? "border-emerald-200/70 bg-emerald-50/50"
                    : step.state === "ready"
                    ? "border-[#8127cf]/30 bg-[#faf5ff]"
                    : "border-[#cfc2d6]/25 bg-[#faf7fc]",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white",
                    step.state === "done"
                      ? "bg-emerald-500"
                      : step.state === "ready"
                      ? "bg-[#8127cf]"
                      : "bg-[#d9d2de] text-[#6f6579]",
                  )}
                >
                  {step.state === "done" ? (
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  ) : (
                    <Icon className="h-4.5 w-4.5" />
                  )}
                </span>

                <div className="min-w-[12rem] flex-1">
                  <p className="text-[13px] font-black tracking-tight text-[#1f1a23]">
                    <span className="mr-1.5 text-ink-subtle tabular-nums">{i + 1}.</span>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-snug text-ink-muted">
                    {step.blurb}
                  </p>
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1 text-[11px] font-bold leading-snug",
                      step.state === "blocked" ? "text-amber-700" : "text-ink-subtle",
                    )}
                  >
                    {step.state === "blocked" ? (
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                    ) : null}
                    {step.reason}
                  </p>
                </div>

                {step.state === "done" ? (
                  <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    Done
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={step.state !== "ready" || !!busy}
                    onClick={step.onRun}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[11px] font-black uppercase tracking-wider transition-all",
                      step.state === "ready"
                        ? "bg-[#8127cf] text-white hover:bg-[#6f1fb5] active:scale-95 cursor-pointer"
                        : "cursor-not-allowed bg-[#e8e0ec] text-ink-subtle",
                    )}
                  >
                    {running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    {step.cta}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel
        title={`Report cards (${cards.length})`}
        subtitle={
          isLocked
            ? "One per pupil. Open any of them to check before publishing."
            : "They appear here the moment the marks are locked."
        }
        icon={FileText}
        actions={
          isLocked ? (
            <>
              {needingRemarks > 0 && !published ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={approveAll}
                  title="Approve every remark that has been written"
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-[#8127cf] px-3 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-[#6f1fb5] disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer"
                >
                  {busy === "approve-all" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve all ({needingRemarks})
                </button>
              ) : null}
              <button
                type="button"
                disabled={!!busy}
                onClick={() => run("generate", "Report cards rebuilt")}
                title="Rebuild every report card from the marks as they stand now"
                className="flex h-9 items-center gap-1.5 rounded-xl border border-[#cfc2d6]/30 bg-white px-3 text-[11px] font-black uppercase tracking-wider text-[#1f1a23] transition-colors hover:border-[#8127cf]/40 hover:text-[#8127cf] disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer"
              >
                {busy === "generate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Rebuild
              </button>
            </>
          ) : null
        }
        bodyClassName={cards.length ? "p-0" : undefined}
      >
        {cards.length === 0 ? (
          <StepEmpty
            icon={FileText}
            title={isLocked ? "No report cards yet" : "Nothing to show until the marks are locked"}
            body={
              isLocked
                ? "The exam is locked but no cards were built. Use Rebuild to create them from the marks on file."
                : "Locking the marks creates one report card per pupil automatically — that is step 1 above."
            }
          />
        ) : (
          <div className="max-h-[22rem] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-[#faf7fc]">
                <tr className="border-b border-[#cfc2d6]/20">
                  {["Pupil", "%", "Grade", "Remark for the report card", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-ink-subtle"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[#cfc2d6]/10 transition-colors last:border-0 hover:bg-[#faf5ff]"
                  >
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-bold text-[#1f1a23]">
                        {c.student?.fullName ?? "—"}
                      </p>
                      <p className="text-[10px] font-semibold text-ink-subtle">
                        {c.student?.rollNo ?? "—"}
                        {c.rank != null ? ` · rank ${c.rank}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-black tabular-nums text-[#8127cf]">
                      {c.percentage != null ? `${Math.round(c.percentage)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-black text-[#1f1a23]">
                      {c.grade ?? "—"}
                    </td>
                    <td className="px-2 py-2 min-w-[16rem]">
                      <input
                        type="text"
                        defaultValue={remarkOf(c)}
                        disabled={published || c.isSent}
                        placeholder="e.g. Steady progress — keep it up."
                        onChange={(e) =>
                          setRemarks((r) => ({ ...r, [c.id]: e.target.value }))
                        }
                        onBlur={() => saveRemark(c)}
                        className={cn(
                          "h-9 w-full rounded-lg border px-2.5 text-[12px] font-semibold text-[#1f1a23] outline-none transition-colors focus:border-[#8127cf]/50 focus:ring-4 focus:ring-[#8127cf]/12 disabled:bg-[#f6f2fa] disabled:text-ink-subtle",
                          c.remarksApproved
                            ? "border-emerald-200 bg-emerald-50/40"
                            : "border-[#cfc2d6]/30 bg-white",
                        )}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {c.remarksApproved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {c.isSent ? "Sent" : "Approved"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!!busy || published}
                          onClick={() => approveOne(c)}
                          title="Approve this remark so the results can be reviewed"
                          className="inline-flex h-7 items-center gap-1 rounded-full bg-[#8127cf]/10 px-2.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#8127cf]/20 disabled:opacity-50 enabled:cursor-pointer"
                        >
                          {busy === `approve-${c.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Approve
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busy === `pdf-${c.id}`}
                        onClick={() => downloadPdf(c)}
                        title="Open this report card as a PDF"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#cfc2d6]/30 px-2.5 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:border-[#8127cf]/40 hover:text-[#8127cf] disabled:opacity-50 enabled:cursor-pointer"
                      >
                        {busy === `pdf-${c.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
