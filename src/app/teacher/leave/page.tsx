"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { CalendarDays, CheckCircle2, Clock, History, Plane, Plus, X } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { BrandButton } from "@/components/role-dashboard";
import { SkeletonList } from "@/components/ui/skeleton";
import { ModalActions, ModalFrame } from "@/components/teacher/teacher-components";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";

const STATUS_BADGES: Record<string, NonNullable<BadgeProps["variant"]>> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

/** "PENDING" reads as a database value; "Pending" reads as a status. */
function statusLabel(status?: string) {
  if (!status) return "Pending";
  const lower = status.toLowerCase().replaceAll("_", " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

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
  // A failed load used to toast and then render the empty page — "no
  // balances, no requests" — which reads as fact rather than as an outage.
  const [loadFailed, setLoadFailed] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());

  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch("/api/leave?mode=my");
      const json = await res.json();
      if (json.success) {
        setRequests(json.data.requests || []);
        setBalances(json.data.balances || []);
        setTypes(json.data.types || []);
        setAcademicYear(json.data.academicYear);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
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
      toast.error("Choose a leave type before submitting.");
      return;
    }
    if (!applyForm.fromDate || !applyForm.toDate) {
      toast.error("Pick both a from and a to date before submitting.");
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
      toast.success("Leave request submitted for approval.");
      setShowApply(false);
      setApplyForm({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your leave request. Please try again.");
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
      toast.success("Leave request withdrawn.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not withdraw the request. Please try again.");
    } finally {
      setCancelling(null);
    }
  };

  const totalRemaining = balances.reduce((s, b) => s + b.remaining, 0);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  /* The single question this page exists to answer — "when am I next off?" —
     was buried in a reverse-chronological list where an approved request from
     March sat above one starting next Monday. */
  const nextLeave = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return requests
      .filter((r) => ["APPROVED", "PENDING"].includes(r.status) && new Date(r.toDate) >= startOfToday)
      .sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime())[0] || null;
  }, [requests]);

  const statuses = useMemo(
    () => [...new Set(requests.map((r) => r.status).filter(Boolean))],
    [requests],
  );
  const visibleRequests = useMemo(
    () => (statusFilter ? requests.filter((r) => r.status === statusFilter) : requests),
    [requests, statusFilter],
  );

  return (
    <TeacherPage
      tone="leave"
      icon={Plane}
      eyebrow="Time Off"
      title="My Leave"
      summary={`Academic year ${academicYear} · ${daysLabel(totalRemaining)} remaining across ${balances.length} leave type${balances.length === 1 ? "" : "s"}`}
      actions={
        types.length === 0 ? (
          // A disabled button fires no pointer or focus events, so the reason
          // sits on a focusable wrapper where hover, focus and long-press reach it.
          <Tooltip content={loadFailed ? "Your leave types could not be loaded. Try again below." : "No leave types have been configured for your campus yet"}>
            <span tabIndex={0} className="inline-flex rounded-2xl">
              <BrandButton
                variant="dark"
                icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setShowApply(true)}
                disabled
              >
                Apply for Leave
              </BrandButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip content="Submit a new leave request">
            <BrandButton
              variant="dark"
              icon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => setShowApply(true)}
            >
              Apply for Leave
            </BrandButton>
          </Tooltip>
        )
      }
    >
      <div className="space-y-3">
      {loading ? (
        <SkeletonList rows={4} label="Loading leave requests" />
      ) : loadFailed ? (
        <div className="sk-panel">
          <ErrorState
            title="Couldn't load your leave"
            description="Your balances and requests could not be loaded. Check your connection and try again. No request has been changed."
            onRetry={load}
          />
        </div>
      ) : (
        <>
          {nextLeave ? (
            <Alert
              tone={nextLeave.status === "APPROVED" ? "success" : "warning"}
              icon={CalendarDays}
              live="off"
              title={nextLeave.status === "APPROVED" ? "Your next leave" : "Awaiting approval"}
              className="sk-enter"
            >
              <p className="text-sm font-semibold text-ink-strong">
                {nextLeave.leaveType?.name || "Leave"} · {formatDate(nextLeave.fromDate)}
                {nextLeave.fromDate !== nextLeave.toDate ? <> <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span><span className="sr-only">to</span> {formatDate(nextLeave.toDate)}</> : ""}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                {daysLabel(nextLeave.days)}
                {(() => {
                  const startOfToday = new Date();
                  startOfToday.setHours(0, 0, 0, 0);
                  const days = Math.round(
                    (new Date(nextLeave.fromDate).setHours(0, 0, 0, 0) - startOfToday.getTime()) / 86400000,
                  );
                  if (days > 1) return ` · in ${days} days`;
                  if (days === 1) return " · tomorrow";
                  if (days === 0) return " · today";
                  return " · in progress";
                })()}
              </p>
            </Alert>
          ) : null}

          <div className="sk-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => {
              const pct = b.allocated > 0 ? Math.min(100, Math.round((b.approved / b.allocated) * 100)) : 0;
              return (
                <div key={b.leaveTypeId} className="sk-panel min-w-0 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="min-w-0 truncate text-sm font-semibold text-ink-strong">{b.name}</h2>
                    <Badge size="sm" dot data-numeric variant={b.remaining > 0 ? "success" : "danger"} className="shrink-0">
                      {daysLabel(b.remaining)} left
                    </Badge>
                  </div>
                  <Progress className="mt-4" value={pct} label={`${b.name}: approved leave out of the allocation`} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums text-ink-subtle">
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
              <Alert
                tone={types.length === 0 ? "warning" : "info"}
                live="off"
                className="sm:col-span-2 lg:col-span-3"
                title={types.length === 0 ? "Leave isn't set up yet" : "No leave allocations yet"}
              >
                {types.length === 0
                  ? "Your campus admin has not set up any leave types yet, so leave cannot be requested here for now."
                  : "No leave allocations have been set for your role yet — your requests will still be submitted for approval."}
              </Alert>
            ) : null}
          </div>

          <div className="sk-panel p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink-strong">
                <Plane aria-hidden="true" className="h-4 w-4 text-primary" /> Request History
              </h2>
              <div role="group" aria-label="Filter requests by status" className="flex flex-wrap items-center gap-1.5">
                {statuses.length > 1 ? (
                  ["", ...statuses].map((st) => (
                    <Button variant="choice" size="sm"
                      key={st || "all"}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      aria-pressed={statusFilter === st}
                    >
                      {st ? statusLabel(st) : "All"}
                      {st === "PENDING" && pendingCount > 0 ? (
                        <span className="ms-1 tabular-nums opacity-70">{pendingCount}</span>
                      ) : null}
                    </Button>
                  ))
                ) : (
                  <Badge variant={pendingCount > 0 ? "warning" : "neutral"} size="sm" dot data-numeric>
                    {pendingCount} pending
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {requests.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={History}
                  title="No leave requests yet"
                  description="Apply for leave and the request appears here, with its status as your approver reviews it."
                  className="rounded-2xl bg-surface-subtle"
                  action={types.length > 0 ? (
                    <Button variant="secondary" size="sm" type="button" onClick={() => setShowApply(true)}>
                      <Plus aria-hidden="true" /> Apply for Leave
                    </Button>
                  ) : undefined}
                />
              ) : visibleRequests.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={History}
                  title={`No ${statusLabel(statusFilter).toLowerCase()} requests`}
                  description="None of your requests have this status."
                  className="rounded-2xl bg-surface-subtle"
                  action={
                    <Button variant="secondary" size="sm" type="button" onClick={() => setStatusFilter("")}>
                      <X aria-hidden="true" /> Show all
                    </Button>
                  }
                />
              ) : (
                visibleRequests.map((r) => {
                  const Icon = STATUS_ICONS[r.status] || Clock;
                  return (
                    <div key={r.id} className="sk-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                      <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-strong">
                          {r.leaveType?.name || "Leave"} · <span className="tabular-nums">{daysLabel(r.days)}</span>
                        </p>
                        <p className="mt-0.5 break-words text-xs text-ink-muted">
                          {formatDate(r.fromDate)} <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span><span className="sr-only">to</span> {formatDate(r.toDate)}
                          {r.reason ? ` · ${r.reason}` : ""}
                        </p>
                        {r.status === "REJECTED" && r.reviewNote ? (
                          <p className="mt-1 break-words text-xs font-medium text-rose-700">Reviewer note: {r.reviewNote}</p>
                        ) : null}
                      </div>
                      <Badge variant={STATUS_BADGES[r.status] || STATUS_BADGES.PENDING} dot className="shrink-0">
                        {statusLabel(r.status)}
                      </Badge>
                      {r.status === "PENDING" ? (
                        <Tooltip content="Withdraw this leave request">
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            loading={cancelling === r.id}
                            /* Cancelling withdraws the request outright; there
                               is no undo, only re-applying and queueing behind
                               everyone else. It used to fire on one click. */
                            onClick={() => setConfirmCancel(r)}
                          >
                            {cancelling === r.id ? null : <X aria-hidden="true" />}
                            Cancel
                          </Button>
                        </Tooltip>
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
              busyLabel="Submitting…"
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
            <FormField
              name="leaveTypeId"
              id="teacher-leave-type"
              label="Leave type"
              required
              hint="Each option shows the days you have left, or the default allowance when no balance has been set for you."
            >
              <SystemSelect
                value={applyForm.leaveTypeId}
                onChange={(e) => setApplyForm((p) => ({ ...p, leaveTypeId: e.target.value }))}
                className={"w-full"}
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
              </SystemSelect>
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="fromDate" id="teacher-leave-from" label="From date" required>
                <SystemInput
                  type="date"
                  value={applyForm.fromDate}
                  onChange={(e) => setApplyForm((p) => ({ ...p, fromDate: e.target.value }))}
                  className={"w-full"}
                />
              </FormField>
              <FormField
                name="toDate"
                id="teacher-leave-to"
                label="To date"
                required
                hint="Both dates count as leave days."
                error={datesReversed ? "The end date falls before the start date." : undefined}
              >
                <SystemInput
                  type="date"
                  value={applyForm.toDate}
                  /* The picker itself now refuses a date before the start, so
                     the reversed range is prevented rather than reported. */
                  min={applyForm.fromDate || undefined}
                  onChange={(e) => setApplyForm((p) => ({ ...p, toDate: e.target.value }))}
                  className={"w-full"}
                />
              </FormField>
            </div>

            {!datesReversed && computedDays ? (
              <div className="space-y-2">
                <Alert tone="brand" icon={CalendarDays} compact live="polite">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold tabular-nums text-ink-strong">{daysLabel(computedDays * 10)} requested</span>
                    {remainingDays !== null ? (
                      <span className="text-xs tabular-nums text-ink-muted">
                        {daysLabel(selectedBalance.remaining)} available
                      </span>
                    ) : null}
                  </span>
                </Alert>
                {/* Requesting more than the balance is the approver's call, not
                    a hard block — but the teacher should know before they send
                    it, not after it comes back rejected. */}
                {overBalance ? (
                  <Alert tone="warning" compact>
                    That is {daysLabel((computedDays - (remainingDays as number)) * 10)} more than your
                    remaining balance — it can still be submitted, but may be declined.
                  </Alert>
                ) : null}
              </div>
            ) : null}

            <FormField name="reason" id="teacher-leave-reason" label="Reason" optional>
              <SystemTextarea
                value={applyForm.reason}
                onChange={(e) => setApplyForm((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder="Brief reason for the leave"
                className={"w-full"}
              />
            </FormField>
            <Button variant="ghost" type="submit" className="hidden" tabIndex={-1} aria-hidden />
          </form>
        </ModalFrame>
      ) : null}

      <ConfirmAction
        open={Boolean(confirmCancel)}
        tone="danger"
        title="Withdraw this leave request?"
        description="The request is removed from your approver's queue. You can apply again, but it goes to the back of the queue."
        detail={
          confirmCancel ? (
            <span>
              {confirmCancel.leaveType?.name || "Leave"} · {daysLabel(confirmCancel.days)} ·{" "}
              {formatDate(confirmCancel.fromDate)}
              {confirmCancel.fromDate !== confirmCancel.toDate ? ` → ${formatDate(confirmCancel.toDate)}` : ""}
            </span>
          ) : null
        }
        confirmLabel="Withdraw request"
        busy={cancelling === confirmCancel?.id}
        onConfirm={() => {
          const id = confirmCancel?.id;
          setConfirmCancel(null);
          if (id) cancelRequest(id);
        }}
        onCancel={() => setConfirmCancel(null)}
      />
    </TeacherPage>
  );
}
