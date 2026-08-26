"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Loader2, Plane, Plus, X } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { BrandButton } from "@/components/role-dashboard";
import { SkeletonList } from "@/components/ui/skeleton";
import { ModalActions, ModalFrame } from "@/components/teacher/teacher-components";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  CANCELLED: "bg-[#f3f4f9] text-ink-muted border-[#cfc2d6]/20",
};

const STATUS_ICONS: Record<string, any> = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REJECTED: X,
  CANCELLED: X,
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function daysLabel(tenths: number) {
  const d = tenths / 10;
  return Number.isInteger(d) ? `${d} day${d === 1 ? "" : "s"}` : `${d} days`;
}

export default function LeavePage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());

  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leave?mode=my");
      const json = await res.json();
      if (json.success) {
        setRequests(json.data.requests || []);
        setBalances(json.data.balances || []);
        setTypes(json.data.types || []);
        setAcademicYear(json.data.academicYear);
      } else {
        toast.error(json.error || "Could not load leave data");
      }
    } catch {
      toast.error("Could not load leave data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* A backwards range used to return null, which rendered as nothing at all:
     the day count simply vanished and Submit stayed live, so the teacher found
     out from a server error. Both facts are surfaced now. */
  const datesReversed = Boolean(
    applyForm.fromDate && applyForm.toDate && new Date(applyForm.toDate) < new Date(applyForm.fromDate),
  );

  const computedDays = (() => {
    if (!applyForm.fromDate || !applyForm.toDate || datesReversed) return null;
    const start = new Date(applyForm.fromDate);
    const end = new Date(applyForm.toDate);
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  })();

  const selectedBalance = balances.find((b: any) => b.leaveTypeId === applyForm.leaveTypeId);
  const remainingDays = selectedBalance ? selectedBalance.remaining / 10 : null;
  const overBalance = Boolean(computedDays && remainingDays !== null && computedDays > remainingDays);

  const applyBlockedReason = !applyForm.leaveTypeId
    ? "Choose a leave type."
    : !applyForm.fromDate || !applyForm.toDate
      ? "Pick both a from and a to date."
      : datesReversed
        ? "The end date is before the start date."
        : null;

  const applyLeave = async () => {
    if (!applyForm.leaveTypeId) {
      toast.error("Select a leave type");
      return;
    }
    if (!applyForm.fromDate || !applyForm.toDate) {
      toast.error("Select from and to dates");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: applyForm.leaveTypeId,
          fromDate: applyForm.fromDate,
          toDate: applyForm.toDate,
          reason: applyForm.reason,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not apply for leave");
      toast.success("Leave request submitted");
      setShowApply(false);
      setApplyForm({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply for leave");
    } finally {
      setApplying(false);
    }
  };

  const cancelRequest = async (id: string) => {
    setCancelling(id);
    try {
      const res = await fetch("/api/leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not cancel request");
      toast.success("Request cancelled");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel request");
    } finally {
      setCancelling(null);
    }
  };

  const totalAllocated = balances.reduce((s, b) => s + b.allocated, 0);
  const totalRemaining = balances.reduce((s, b) => s + b.remaining, 0);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <TeacherPage
      tone="leave"
      icon={Plane}
      eyebrow="Time Off"
      title="My Leave"
      summary={`Academic year ${academicYear} · ${daysLabel(totalRemaining)} remaining across ${balances.length} leave type${balances.length === 1 ? "" : "s"}`}
      actions={
        <BrandButton
          variant="dark"
          className="min-h-10"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowApply(true)}
          disabled={types.length === 0}
          title={types.length === 0 ? "No leave types have been configured for your campus yet" : "Submit a new leave request"}
        >
          Apply for Leave
        </BrandButton>
      }
    >
      <div className="space-y-3">
      {loading ? (
        <SkeletonList rows={4} label="Loading leave requests" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => {
              const pct = b.allocated > 0 ? Math.min(100, Math.round((b.approved / b.allocated) * 100)) : 0;
              return (
                <div key={b.leaveTypeId} className="sk-rise rounded-[28px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.08),0_12px_32px_-12px_rgba(129,39,207,0.16)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-[#1f1a23]">{b.name}</p>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${b.remaining > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-600"}`}>
                      {daysLabel(b.remaining)} left
                    </span>
                  </div>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#fbf0fe]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#55208b]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-ink-muted">
                    <span>{daysLabel(b.allocated)} allocated</span>
                    <span>{daysLabel(b.approved)} approved{b.pending > 0 ? ` · ${daysLabel(b.pending)} pending` : ""}</span>
                  </div>
                </div>
              );
            })}
            {balances.length === 0 ? (
              /* Two different situations used to share one message, which
                 contradicted the UI: with no leave *types* configured at all
                 the Apply button is disabled, yet the text promised requests
                 would still be submitted. Only the second case can apply. */
              <div className="rounded-[28px] border border-[#cfc2d6]/25 bg-white p-6 sm:col-span-2 lg:col-span-3">
                <p className="text-sm font-bold text-ink-muted">
                  {types.length === 0
                    ? "Your campus admin has not set up any leave types yet, so leave cannot be requested here for now."
                    : "No leave allocations have been set for your role yet — your requests will still be submitted for approval."}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.08),0_12px_32px_-12px_rgba(129,39,207,0.16)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-[#1f1a23]">
                <Plane className="h-4 w-4 text-[#8127cf]" /> Request History
              </h3>
              <span className="rounded-full border border-[#cfc2d6]/20 bg-[#fbf0fe]/60 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-muted">
                {pendingCount} pending
              </span>
            </div>

            <div className="space-y-3">
              {requests.length === 0 ? (
                <p className="rounded-2xl bg-[#fbf0fe]/40 px-5 py-8 text-center text-sm font-bold text-ink-subtle">
                  No leave requests yet — apply for leave and it will appear here.
                </p>
              ) : (
                requests.map((r) => {
                  const Icon = STATUS_ICONS[r.status] || Clock;
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-[#cfc2d6]/25 bg-white p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-[#1f1a23]">
                          {r.leaveType?.name || "Leave"} · {daysLabel(r.days)}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                          {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                          {r.reason ? ` · ${r.reason}` : ""}
                        </p>
                        {r.status === "REJECTED" && r.reviewNote ? (
                          <p className="mt-1 text-[11px] font-semibold text-rose-500">Reviewer note: {r.reviewNote}</p>
                        ) : null}
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider ${STATUS_STYLES[r.status] || STATUS_STYLES.PENDING}`}>
                        {r.status}
                      </span>
                      {r.status === "PENDING" ? (
                        <BrandButton
                          variant="soft"
                          icon={<X className="w-4 h-4" />}
                          disabled={cancelling === r.id}
                          onClick={() => cancelRequest(r.id)}
                          className="h-9"
                        >
                          {cancelling === r.id ? "..." : "Cancel"}
                        </BrandButton>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
      </div>

      {showApply ? (
        <ModalFrame
          title="Apply for Leave"
          eyebrow="Leave Management"
          onClose={() => setShowApply(false)}
          dirty={Boolean(applyForm.fromDate || applyForm.toDate || applyForm.reason.trim())}
          dirtyMessage="Discard this leave request?"
          footer={
            <ModalActions
              busy={applying}
              busyLabel="Submitting..."
              actionLabel="Submit Request"
              onClose={() => setShowApply(false)}
              onSave={applyLeave}
              blockedReason={applyBlockedReason}
            />
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (!applyBlockedReason && !applying) applyLeave(); }}
          >
            <label className="block">
              <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Leave Type</span>
              <select
                value={applyForm.leaveTypeId}
                onChange={(e) => setApplyForm((p) => ({ ...p, leaveTypeId: e.target.value }))}
                className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 focus:border-[#8127cf]/40 focus:bg-white"
              >
                <option value="">Select leave type</option>
                {types.map((t) => {
                  const b = balances.find((x: any) => x.leaveTypeId === t.id);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} ({b ? `${daysLabel(b.remaining)} left` : `${daysLabel(t.defaultDays || 0)} default`})
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">From Date</span>
                <input
                  type="date"
                  value={applyForm.fromDate}
                  onChange={(e) => setApplyForm((p) => ({ ...p, fromDate: e.target.value }))}
                  className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 focus:border-[#8127cf]/40 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">To Date</span>
                <input
                  type="date"
                  value={applyForm.toDate}
                  /* The picker itself now refuses a date before the start, so
                     the reversed range is prevented rather than reported. */
                  min={applyForm.fromDate || undefined}
                  onChange={(e) => setApplyForm((p) => ({ ...p, toDate: e.target.value }))}
                  className={`h-14 w-full rounded-2xl border bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 focus:bg-white ${
                    datesReversed ? "border-rose-300 focus:border-rose-400" : "border-[#cfc2d6]/20 focus:border-[#8127cf]/40"
                  }`}
                />
              </label>
            </div>

            {datesReversed ? (
              <p className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> The end date falls before the start date.
              </p>
            ) : computedDays ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3 text-xs font-bold text-[#8127cf]">
                  <CalendarDays className="h-4 w-4" /> {daysLabel(computedDays * 10)} requested
                  {remainingDays !== null ? (
                    <span className="ml-auto font-semibold text-ink-muted">
                      {daysLabel(selectedBalance.remaining)} available
                    </span>
                  ) : null}
                </p>
                {/* Requesting more than the balance is the approver's call, not
                    a hard block — but the teacher should know before they send
                    it, not after it comes back rejected. */}
                {overBalance ? (
                  <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    That is {daysLabel((computedDays - (remainingDays as number)) * 10)} more than your
                    remaining balance — it can still be submitted, but may be declined.
                  </p>
                ) : null}
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Reason (optional)</span>
              <textarea
                value={applyForm.reason}
                onChange={(e) => setApplyForm((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder="Brief reason for the leave"
                className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 py-3 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 focus:border-[#8127cf]/40 focus:bg-white placeholder:text-ink-subtle"
              />
            </label>
            <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
          </form>
        </ModalFrame>
      ) : null}
    </TeacherPage>
  );
}
