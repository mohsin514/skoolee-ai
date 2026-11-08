"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, History, Plane, Plus, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskStats, StatTile, deskRow, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { checkedJson, readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { SkeletonList } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { isApiOk, readApiError } from "@/lib/api/envelope-client";

/**
 * My leave — the member of staff's own leave: balances, the next time off, and request history,
 * with "Apply for leave" and a confirmed "Withdraw". It is the same panel in every console that has
 * it (teacher `/teacher/leave`; principal, accountant, receptionist and librarian `?view=my-leave`,
 * reached from the account menu), so nobody meets the approver's leave screen on their own leave
 * (M74). It only calls `/api/leave?mode=my`, which every staff role may use.
 *
 * Dates and day counts are formatted by the locale package (F23), never a fixed `en-PK` locale.
 */

type Ui = ReturnType<typeof useUiText>;

type LeaveType = { id: string; name: string; defaultDays?: number | null };
type Balance = { leaveTypeId: string; name: string; allocated: number; approved: number; pending: number; remaining: number };
type LeaveRequest = {
  id: string;
  status: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string | null;
  reviewNote?: string | null;
  leaveType?: { name?: string | null } | null;
};

const STATUS_TONES: Record<string, DeskTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REJECTED: X,
  CANCELLED: X,
};

/** "PENDING" reads as a database value; "Pending" reads as a status. */
function statusLabel(ui: Ui, status?: string) {
  const labels: Record<string, string> = { PENDING: ui("Pending"), APPROVED: ui("Approved"), REJECTED: ui("Declined"), CANCELLED: ui("Withdrawn") };
  return labels[status ?? "PENDING"] ?? ui("Pending");
}

/** Leave is stored in tenths of a day. */
function daysLabel(ui: Ui, number: (value: number, digits?: number) => string, tenths: number) {
  const days = tenths / 10;
  return days === 1 ? ui("{0} day", [number(days)]) : ui("{0} days", [number(days)]);
}

const EMPTY_FORM = { leaveTypeId: "", fromDate: "", toDate: "", reason: "" };

/**
 * `()` — the contract every console mounts (§10.11). Optional, for a host page whose PageHeader carries
 * "Apply for leave" as its primary (the teacher's My leave): `hideApply` drops the panel's own button,
 * `applyRequest` (a counter the host bumps) opens the form, and `onApplyState` reports whether applying is
 * possible yet and, when not, why (so the header action is disabled with that reason, never a dead button).
 */
export function MyLeavePanel({ hideApply = false, applyRequest, onApplyState }: { hideApply?: boolean; applyRequest?: number; onApplyState?: (state: { ready: boolean; reason: string | null }) => void } = {}) {
  const ui = useUiText();
  const { date, number } = useLocaleFormat();
  const days = useCallback((tenths: number) => daysLabel(ui, number, tenths), [ui, number]);

  const [loading, setLoading] = useState(true);
  // A failed load used to toast and then render the empty page — "no balances, no requests" —
  // which reads as fact rather than as an outage.
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [academicYear, setAcademicYear] = useState<number | null>(null);

  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState(EMPTY_FORM);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<LeaveRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setLoadFailed(null);
    try {
      const json = await checkedJson(await readRequest("/api/leave?mode=my"));
      if (version !== sequence.current) return;
      setRequests(json.data.requests || []); setBalances(json.data.balances || []); setTypes(json.data.types || []); setAcademicYear(json.data.academicYear ?? null);
    } catch (failure) { if (version === sequence.current) { setRequests([]); setBalances([]); setTypes([]); setLoadFailed(requestFailure(failure)); } }
    finally { if (version === sequence.current) setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    return () => { sequence.current++; };
  }, [load]);

  /* A backwards range is prevented by the picker and stated in the form, never discovered from a
     server error. */
  const datesReversed = Boolean(
    applyForm.fromDate && applyForm.toDate && new Date(applyForm.toDate) < new Date(applyForm.fromDate),
  );

  const computedDays = (() => {
    if (!applyForm.fromDate || !applyForm.toDate || datesReversed) return null;
    const start = new Date(applyForm.fromDate);
    const end = new Date(applyForm.toDate);
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  })();

  const selectedBalance = balances.find((b) => b.leaveTypeId === applyForm.leaveTypeId);
  const remainingDays = selectedBalance ? selectedBalance.remaining / 10 : null;
  const overBalance = Boolean(computedDays && remainingDays !== null && computedDays > remainingDays);

  const applyBlockedReason = !applyForm.leaveTypeId
    ? ui("Choose a leave type.")
    : !applyForm.fromDate || !applyForm.toDate
      ? ui("Pick both a from and a to date.")
      : datesReversed
        ? ui("The end date is before the start date.")
        : null;

  const openApply = () => {
    setApplyError(null);
    setShowApply(true);
  };

  // Host-owned "Apply for leave": only a change of the counter after mount opens the form.
  const handledApply = useRef(applyRequest);
  useEffect(() => {
    if (applyRequest === undefined || applyRequest === handledApply.current) return;
    handledApply.current = applyRequest;
    if (types.length > 0) { setApplyError(null); setShowApply(true); }
  }, [applyRequest, types.length]);
  const applyReason = loading ? "Loading your leave types…" : loadFailed ? "Your leave types could not be loaded. Try again below." : types.length === 0 ? "No leave types have been set up for your campus yet." : null;
  useEffect(() => { onApplyState?.({ ready: applyReason === null, reason: applyReason }); }, [applyReason, onApplyState]);

  const applyLeave = async () => {
    if (applyBlockedReason) return;
    setApplying(true);
    setApplyError(null);
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !isApiOk(json)) {
        // A refused request is a form problem the member of staff can fix: it stays in the dialog.
        setApplyError(ui(readApiError(json, "Could not send your leave request. Please try again.")));
        return;
      }
      toast.success(ui("Leave request sent for approval."));
      setShowApply(false);
      setApplyForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error(error, { description: ui("Your request was not sent. The form is still filled in.") });
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !isApiOk(json)) throw new Error(readApiError(json, ui("Could not withdraw the request. Please try again.")));
      toast.success(ui("Leave request withdrawn."));
      await load();
    } catch (error) {
      toast.error(error);
    } finally {
      setCancelling(null);
    }
  };

  const totalRemaining = balances.reduce((s, b) => s + b.remaining, 0);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  /* The single question this page exists to answer — "when am I next off?" — leads. */
  const nextLeave = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return requests
      .filter((r) => ["APPROVED", "PENDING"].includes(r.status) && new Date(r.toDate) >= startOfToday)
      .sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime())[0] || null;
  }, [requests]);

  const statuses = useMemo(() => [...new Set(requests.map((r) => r.status).filter(Boolean))], [requests]);
  // Pending requests lead: they are the ones still waiting on the approver (or on a withdrawal).
  const visibleRequests = useMemo(
    () => urgencyFirst(statusFilter ? requests.filter((r) => r.status === statusFilter) : requests, (r) => (r.status === "PENDING" ? 0 : 1)),
    [requests, statusFilter],
  );

  const range = (r: Pick<LeaveRequest, "fromDate" | "toDate">) => (
    <>
      <bdi>{date(r.fromDate)}</bdi>
      {r.fromDate.slice(0, 10) !== r.toDate.slice(0, 10) ? (
        <> <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span><span className="sr-only">{ui("to")}</span> <bdi>{date(r.toDate)}</bdi></>
      ) : null}
    </>
  );

  const whenLabel = (r: LeaveRequest) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const until = Math.round((new Date(r.fromDate).setHours(0, 0, 0, 0) - startOfToday.getTime()) / 86400000);
    if (until > 1) return ui("in {0} days", [number(until)]);
    if (until === 1) return ui("tomorrow");
    if (until === 0) return ui("today");
    return ui("in progress");
  };

  const applyButton = types.length === 0 ? (
    // A blocked action stays focusable so its reason can be read on hover, focus or long-press.
    <Tooltip content={loadFailed ? ui("Your leave types could not be loaded. Try again below.") : ui("No leave types have been set up for your campus yet.")}>
      <Button type="button" aria-disabled className="w-full cursor-not-allowed opacity-60 sm:w-auto">
        <Plus aria-hidden="true" /> {ui("Apply for leave")}
      </Button>
    </Tooltip>
  ) : (
    <Button type="button" onClick={openApply} className="w-full sm:w-auto" data-apply-leave>
      <Plus aria-hidden="true" /> {ui("Apply for leave")}
    </Button>
  );

  return (
    <div className="space-y-3" data-my-leave>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          {academicYear !== null && !loading && !loadFailed
            ? ui("Academic year {0} · {1} left across your leave types. Your approver decides each request.", [String(academicYear), days(totalRemaining)])
            : ui("Your balances, your next time off and every request you have made.")}
        </p>
        {loading || hideApply ? null : applyButton}
      </div>

      {loading ? (
        <SkeletonList rows={4} label={ui("Loading your leave")} />
      ) : loadFailed ? (
        <div className="sk-panel">
          <ErrorState error={loadFailed}
            title={ui("Couldn't load your leave")}
            description={ui("Your balances and requests could not be loaded. Check your connection and try again. No request has been changed.")}
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
              title={nextLeave.status === "APPROVED" ? ui("Your next leave") : ui("Awaiting approval")}
            >
              <p className="text-sm font-semibold text-ink-strong">
                <bdi>{nextLeave.leaveType?.name || ui("Leave")}</bdi> · {range(nextLeave)}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                {days(nextLeave.days)} · {whenLabel(nextLeave)}
              </p>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => {
              const pct = b.allocated > 0 ? Math.min(100, Math.round((b.approved / b.allocated) * 100)) : 0;
              return (
                <div key={b.leaveTypeId} className="sk-panel min-w-0 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="min-w-0 truncate text-sm font-semibold text-ink-strong"><bdi>{b.name}</bdi></h2>
                    <Badge size="sm" dot data-numeric variant={b.remaining > 0 ? "success" : "danger"} className="shrink-0">
                      {ui("{0} left", [days(b.remaining)])}
                    </Badge>
                  </div>
                  <Progress className="mt-3" value={pct} label={ui("{0}: approved leave out of the allocation", [b.name])} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums text-ink-subtle">
                    <span>{ui("{0} allocated", [days(b.allocated)])}</span>
                    <span>
                      {ui("{0} approved", [days(b.approved)])}
                      {b.pending > 0 ? ` · ${ui("{0} pending", [days(b.pending)])}` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            {balances.length === 0 ? (
              <Alert
                tone={types.length === 0 ? "warning" : "info"}
                live="off"
                className="sm:col-span-2 lg:col-span-3"
                title={types.length === 0 ? ui("Leave isn't set up yet") : ui("No leave allocations yet")}
              >
                {types.length === 0
                  ? ui("Your campus admin has not set up any leave types yet, so leave cannot be requested here for now.")
                  : ui("No leave allocations have been set for your role yet — your requests will still be sent for approval.")}
              </Alert>
            ) : null}
          </div>

          <section className="sk-panel p-4 sm:p-5" aria-labelledby="my-leave-history">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="my-leave-history" className="flex items-center gap-2 text-base font-bold tracking-tight text-ink-strong">
                <Plane aria-hidden="true" className="size-4 text-primary" /> {ui("Request history")}
              </h2>
              {statuses.length > 1 ? null : (
                <Badge variant={pendingCount > 0 ? "warning" : "neutral"} size="sm" dot data-numeric>
                  {ui("{0} pending", [number(pendingCount)])}
                </Badge>
              )}
            </div>
            {statuses.length > 1 ? (
              <div className="mb-4 space-y-2">
                <DeskStats role="group" aria-label={ui("Filter requests by status")}>
                  {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].filter((st) => statuses.includes(st)).map((st, index) => (
                    <StatTile
                      key={st}
                      index={index}
                      icon={STATUS_ICONS[st] || Clock}
                      tone={STATUS_TONES[st]}
                      value={<bdi className="tabular-nums">{number(requests.filter((r) => r.status === st).length)}</bdi>}
                      label={statusLabel(ui, st)}
                      selected={statusFilter === st}
                      onSelect={() => setStatusFilter(statusFilter === st ? "" : st)}
                    />
                  ))}
                </DeskStats>
                <DeskFilterStatus shown={visibleRequests.length} total={requests.length} onClear={() => setStatusFilter("")} />
              </div>
            ) : null}

            <div className="space-y-3">
              {requests.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={History}
                  title={ui("No leave requests yet")}
                  description={ui("Apply for leave and the request appears here, with its status as your approver reviews it.")}
                  action={types.length > 0 ? (
                    <Button size="sm" type="button" onClick={openApply}>
                      <Plus aria-hidden="true" /> {ui("Apply for leave")}
                    </Button>
                  ) : undefined}
                />
              ) : visibleRequests.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={History}
                  title={ui("No requests with this status")}
                  description={ui("None of your requests have this status.")}
                  action={
                    <Button variant="secondary" size="sm" type="button" onClick={() => setStatusFilter("")}>
                      <X aria-hidden="true" /> {ui("Show all")}
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-3">{visibleRequests.map((r) => {
                  const Icon = STATUS_ICONS[r.status] || Clock;
                  return (
                    <li key={r.id} className={`${deskRow} flex flex-wrap items-center gap-x-4 gap-y-3`} data-tone={STATUS_TONES[r.status] || "warning"} data-leave-request={r.id}>
                      <DeskRowIcon icon={Icon} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-strong">
                          <bdi>{r.leaveType?.name || ui("Leave")}</bdi> · <span className="tabular-nums">{days(r.days)}</span>
                        </p>
                        <p className="mt-0.5 break-words text-xs text-ink-muted">
                          {range(r)}
                          {r.reason ? <> · <span dir="auto">{r.reason}</span></> : null}
                        </p>
                        {r.status === "REJECTED" && r.reviewNote ? (
                          <p className="mt-1 break-words text-xs font-medium text-status-error-text">{ui("Reviewer note: {0}", [r.reviewNote])}</p>
                        ) : null}
                      </div>
                      <DeskPill tone={STATUS_TONES[r.status] || "warning"} className="shrink-0">
                        {statusLabel(ui, r.status)}
                      </DeskPill>
                      {r.status === "PENDING" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          loading={cancelling === r.id}
                          onClick={() => setConfirmCancel(r)}
                        >
                          {cancelling === r.id ? null : <X aria-hidden="true" />}
                          {ui("Withdraw")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}</ul>
              )}
            </div>
          </section>
        </>
      )}

      {showApply ? (
        <Modal
          icon={Plane}
          title={ui("Apply for leave")}
          eyebrow={ui("My leave")}
          size="sm"
          onClose={() => setShowApply(false)}
          dirty={Boolean(applyForm.fromDate || applyForm.toDate || applyForm.reason.trim())}
          dirtyMessage={ui("Discard this leave request?")}
          footer={
            <ModalActions
              busy={applying}
              busyLabel={ui("Sending…")}
              actionLabel={ui("Send request")}
              onCancel={() => setShowApply(false)}
              onAction={() => void applyLeave()}
              blockedReason={applyBlockedReason}
            />
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (!applyBlockedReason && !applying) void applyLeave(); }}
          >
            {applyError ? <Alert tone="danger" compact live="polite">{applyError}</Alert> : null}
            <FormField
              name="leaveTypeId"
              id="my-leave-type"
              label={ui("Leave type")}
              required
              hint={ui("Each option shows the days you have left, or the default allowance when no balance has been set for you.")}
            >
              <Select
                value={applyForm.leaveTypeId}
                onChange={(e) => setApplyForm((p) => ({ ...p, leaveTypeId: e.target.value }))}
                className="w-full"
              >
                <option value="">{ui("Select leave type")}</option>
                {types.map((type) => {
                  const b = balances.find((x) => x.leaveTypeId === type.id);
                  return (
                    <option key={type.id} value={type.id}>
                      {type.name} ({b ? ui("{0} left", [days(b.remaining)]) : ui("{0} by default", [days((type.defaultDays || 0) * 10)])})
                    </option>
                  );
                })}
              </Select>
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="fromDate" id="my-leave-from" label={ui("From date")} required>
                <Input
                  type="date"
                  value={applyForm.fromDate}
                  onChange={(e) => setApplyForm((p) => ({ ...p, fromDate: e.target.value }))}
                  className="w-full"
                />
              </FormField>
              <FormField
                name="toDate"
                id="my-leave-to"
                label={ui("To date")}
                required
                hint={ui("Both dates count as leave days.")}
                error={datesReversed ? ui("The end date falls before the start date.") : undefined}
              >
                <Input
                  type="date"
                  value={applyForm.toDate}
                  min={applyForm.fromDate || undefined}
                  onChange={(e) => setApplyForm((p) => ({ ...p, toDate: e.target.value }))}
                  className="w-full"
                />
              </FormField>
            </div>

            {!datesReversed && computedDays ? (
              <div className="space-y-2">
                <Alert tone="brand" icon={CalendarDays} compact live="polite">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold tabular-nums text-ink-strong">{ui("{0} requested", [days(computedDays * 10)])}</span>
                    {selectedBalance ? (
                      <span className="text-xs tabular-nums text-ink-muted">{ui("{0} available", [days(selectedBalance.remaining)])}</span>
                    ) : null}
                  </span>
                </Alert>
                {/* Requesting more than the balance is the approver's call, not a hard block. */}
                {overBalance && remainingDays !== null ? (
                  <Alert tone="warning" compact>
                    {ui("That is {0} more than your remaining balance — it can still be sent, but may be declined.", [days((computedDays - remainingDays) * 10)])}
                  </Alert>
                ) : null}
              </div>
            ) : null}

            <FormField name="reason" id="my-leave-reason" label={ui("Reason")} optional>
              <Textarea
                value={applyForm.reason}
                onChange={(e) => setApplyForm((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder={ui("Brief reason for the leave")}
                className="w-full"
              />
            </FormField>
            <Button variant="ghost" type="submit" className="hidden" tabIndex={-1} aria-hidden />
          </form>
        </Modal>
      ) : null}

      <ConfirmAction
        open={Boolean(confirmCancel)}
        tone="danger"
        title={ui("Withdraw this leave request?")}
        description={ui("The request leaves your approver's queue and cannot be restored. You can apply again, but it joins the back of the queue.")}
        detail={
          confirmCancel ? (
            <span>
              <bdi>{confirmCancel.leaveType?.name || ui("Leave")}</bdi> · {days(confirmCancel.days)} · {range(confirmCancel)}
            </span>
          ) : null
        }
        confirmLabel={ui("Withdraw request")}
        cancelLabel={ui("Keep request")}
        busy={cancelling === confirmCancel?.id}
        onConfirm={() => {
          const id = confirmCancel?.id;
          setConfirmCancel(null);
          if (id) void cancelRequest(id);
        }}
        onCancel={() => setConfirmCancel(null)}
      />
    </div>
  );
}
