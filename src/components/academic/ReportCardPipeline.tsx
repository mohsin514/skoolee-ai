"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  FilePlus2,
  CheckCircle2,
  Send,
  Upload,
  AlertTriangle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import type { ExamItem } from "@/components/academic/ExamCycleManager";

interface ReportCard {
  id: string;
  status?: string;
  grade?: string | null;
  percentage?: number | null;
  rank?: number | null;
  isSent?: boolean;
  deliveryStatus?: string | null;
  student?: { fullName?: string; rollNo?: string } | null;
}

const STEPS = [
  { key: "generate", label: "Generate", icon: FilePlus2 },
  { key: "review", label: "Review", icon: CheckCircle2 },
  { key: "publish", label: "Publish All", icon: Upload },
  { key: "send", label: "Send All via WhatsApp", icon: Send },
] as const;

export function ReportCardPipeline({
  exam,
  campusId,
  onChanged,
}: {
  exam: ExamItem;
  campusId?: string;
  onChanged?: () => void;
}) {
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const isLocked = exam.isLocked || exam.status === "LOCKED";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isLocked) {
        setReportCards([]);
        setAnalytics(null);
        return;
      }
      const sp = new URLSearchParams({ examId: exam.id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/reports?${sp.toString()}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error || "Failed to load report cards");
      setReportCards(res.reportCards || []);
      setAnalytics(res.analytics || null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load report cards");
    } finally {
      setLoading(false);
    }
  }, [exam.id, campusId, isLocked]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action: string) => {
    setBusy(action);
    try {
      const sp = new URLSearchParams();
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/reports?${sp.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      toast.success(
        action === "generate"
          ? `Generated ${data.generated ?? reportCards.length} report cards`
          : action === "publish"
          ? "All report cards published"
          : action === "send"
          ? `Sent ${data.sent ?? 0} report cards`
          : "Report cards reviewed"
      );
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const canGenerate = isLocked;
  const canReview = reportCards.length > 0 && exam.status === "LOCKED";
  const canPublish = exam.status === "PRINCIPAL_REVIEWED";
  const canSend = exam.status === "PUBLISHED";

  const downloadPdf = async (reportCardId: string) => {
    setBusy(`pdf-${reportCardId}`);
    try {
      const res = await fetch(`/api/reports/download?reportCardId=${reportCardId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "PDF unavailable");
      window.open(data.pdfUrl, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Failed to load PDF");
    } finally {
      setBusy(null);
    }
  };

  const gateFor = (step: string) => {
    if (step === "generate") return canGenerate;
    if (step === "review") return canReview;
    if (step === "publish") return canPublish;
    if (step === "send") return canSend;
    return false;
  };

  const stepState = (step: string): "done" | "active" | "todo" => {
    if (step === "generate") return reportCards.length > 0 ? "done" : isLocked ? "active" : "todo";
    if (step === "review")
      return exam.status === "PRINCIPAL_REVIEWED" || exam.status === "PUBLISHED"
        ? "done"
        : canReview
        ? "active"
        : "todo";
    if (step === "publish")
      return exam.status === "PUBLISHED" ? "done" : canPublish ? "active" : "todo";
    if (step === "send") return canSend ? "active" : exam.status === "PUBLISHED" ? "active" : "todo";
    return "todo";
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-skeleton-in">
        <div className="h-16 w-full rounded-3xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        <div className="h-64 w-full rounded-3xl bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Pipeline */}
      <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-black text-[#1d1b20]">Pipeline</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const enabled = gateFor(s.key);
            const state = stepState(s.key);
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] px-3 py-2.5">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      state === "done"
                        ? "bg-emerald-500 text-white"
                        : state === "active"
                        ? "bg-[#8127cf] text-white"
                        : "bg-[#f3f4f9] text-[#4d4354]/40"
                    )}
                  >
                    {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className="text-[11px] font-bold text-[#1d1b20]">{s.label}</span>
                </div>
                {i < STEPS.length - 1 ? (
                  <div className="hidden h-0.5 w-4 bg-[#cfc2d6]/30 md:block" />
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STEPS.map((s) => {
            const enabled = gateFor(s.key);
            return (
              <BrandButton
                key={s.key}
                variant={
                  s.key === "send"
                    ? "soft"
                    : s.key === "publish"
                    ? "gradient"
                    : "dark"
                }
                icon={busy === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <s.icon className="h-4 w-4" />}
                disabled={!enabled || busy !== null}
                onClick={() => runAction(s.key)}
              >
                {s.label}
              </BrandButton>
            );
          })}
        </div>
        {!isLocked ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Lock the exam (from the Marks tab / card) before generating report cards.
          </div>
        ) : null}
      </div>

      {/* Analytics summary */}
      {analytics ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Class Avg", value: `${Math.round(analytics.classAverage || 0)}%` },
            { label: "Passed", value: analytics.passCount ?? 0 },
            { label: "Failed", value: analytics.failCount ?? 0 },
            { label: "Students", value: analytics.totalStudents ?? reportCards.length },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40">
                {s.label}
              </p>
              <p className="mt-1 text-xl font-black text-[#1d1b20]">{s.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Per-student list */}
      <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-black text-[#1d1b20]">
          Students ({reportCards.length})
        </p>
        {reportCards.length === 0 ? (
          <div className="py-10 text-center">
            <FilePlus2 className="mx-auto mb-3 h-10 w-10 text-[#4d4354]/20" />
            <p className="text-sm font-bold text-[#4d4354]/40">No report cards yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {reportCards.map((rc) => {
              const status = rc.status || "DRAFT";
              const sent = rc.isSent || rc.deliveryStatus === "SENT";
              const published = status === "PUBLISHED" || status === "SENT";
              return (
                <div
                  key={rc.id}
                  className="rounded-2xl border border-[#cfc2d6]/15 bg-[#fbf0fe]/30 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#1d1b20]">
                        {rc.student?.fullName || "Student"}
                      </p>
                      <p className="text-[10px] font-semibold text-[#4d4354]/40">
                        Roll {rc.student?.rollNo || "—"}
                      </p>
                    </div>
                    <span className="text-lg font-black text-[#8127cf]">{rc.grade || "—"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge done={reportCards.length > 0} label="Generated" />
                    <Badge done={published} label="Published" />
                    <Badge done={sent} label="Sent" />
                  </div>
                  {rc.percentage != null ? (
                    <p className="mt-2 text-[11px] font-bold text-[#4d4354]/60">
                      {Math.round(rc.percentage)}%
                      {rc.rank != null ? ` · Rank #${rc.rank}` : ""}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => downloadPdf(rc.id)}
                    disabled={busy !== null}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#8127cf]/20 bg-white py-1.5 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#fbf0fe] disabled:opacity-50 cursor-pointer"
                  >
                    {busy === `pdf-${rc.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    Download PDF
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider",
        done ? "bg-emerald-50 text-emerald-600" : "bg-[#f3f4f9] text-[#4d4354]/40"
      )}
    >
      <CheckCircle2 className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
