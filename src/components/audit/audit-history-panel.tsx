"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, RefreshCw } from "lucide-react";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { AuditHistoryEntry, AuditHistoryPage } from "@/lib/audit-history";
import { AUDIT_CATEGORIES, auditCategory, type AuditCategory } from "@/lib/audit-categories";

/**
 * The school's activity log as a panel (M15): the authority's Settings › Activity tab, the campus detail's
 * "Activity log" (filtered, `lockCampus`) and the campus console's change history. `AuditHistoryModal` wraps
 * this in a dialog. Scope is decided by the server (G12): the group admin sees every campus and may pick one,
 * the standalone school admin sees the school and its campus, campus operators their own campus.
 *
 * Copy is EN UI keys with Arabic and Urdu in role-ux p4-messages (R11); dates and counts use the school's locale
 * package (language, calendar, numbering system and timezone — R7). A host that owns the PageHeader passes
 * `exportRequest` (a counter): the panel then drops its own Export button and exports when the counter changes
 * (§4.4b Settings › Activity: Export).
 */
export const AUDIT_HISTORY_TITLE = "Activity history";
export const AUDIT_HISTORY_HINT = "Consequential changes within your current school and campus authority.";

/** Record types, as the reader sees them (the server's categories). */
const CATEGORY_LABEL: Record<AuditCategory, string> = {
  student: "Students", class: "Classes", subject: "Subjects", invitation: "Invitations", marks: "Marks",
  integrity: "Exam observation reviews", fees: "Fees and payments", exports: "History exports",
};
const ACTION_LABEL: Record<string, string> = { CREATE: "Created", UPDATE: "Updated", DELETE: "Deleted" };
const FIELD_LABEL: Record<string, string> = { version: "Version", reviewVersion: "Reviewed version", status: "Status", decision: "Review decision", isActive: "Active", published: "Published" };
const ERROR_TEXT = {
  failure: "History could not be loaded. Refresh to retrieve the current authorized records.",
  denied: "History access changed. Protected entries have been cleared.",
  stale: "This page changed or expired. Refresh to continue.",
} as const;

export function AuditHistoryPanel({ initialCampusId = "", lockCampus = false, exportRequest }: { initialCampusId?: string; lockCampus?: boolean; exportRequest?: number }) {
  const t = useUiText();
  const format = useLocaleFormat();
  const [filter, setFilter] = useState({ campusId: initialCampusId, tableName: "", from: "", to: "" });
  const [page, setPage] = useState<AuditHistoryPage | null>(null);
  const [rows, setRows] = useState<AuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<keyof typeof ERROR_TEXT | null>(null);
  const request = useRef<AbortController | null>(null);

  // A campus drill-in that changes campus keeps the panel on the new campus.
  useEffect(() => { if (lockCampus) setFilter(value => ({ ...value, campusId: initialCampusId })); }, [initialCampusId, lockCampus]);

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

  const [exportState, setExportState] = useState<"idle" | "busy" | "denied" | "failed">("idle");
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
      setExportState("idle");
      toast.success(t("Export downloaded. The export itself is recorded in this history."));
      void load();
    } catch { setExportState("failed"); }
  }, [filter, load, t]);

  // The host's PageHeader "Export": each new counter value exports once (never on mount).
  const lastExport = useRef(exportRequest);
  useEffect(() => {
    if (exportRequest === undefined || exportRequest === lastExport.current) return;
    lastExport.current = exportRequest;
    void exportCsv();
  }, [exportCsv, exportRequest]);

  const types = Object.keys(AUDIT_CATEGORIES) as AuditCategory[];
  const typeLabel = (type: string) => {
    const category = (type in AUDIT_CATEGORIES ? type : auditCategory(type)) as AuditCategory | null;
    return category && CATEGORY_LABEL[category] ? t(CATEGORY_LABEL[category]) : type.replaceAll("_", " ");
  };
  const showCampus = !lockCampus && Boolean(page?.schoolWide) && (page?.campuses.length ?? 0) > 1;

  return (
    <div className="space-y-4" aria-busy={loading} data-audit-history>
      <p className="text-sm text-ink-muted">{t("Personal details are minimized. Records outside your campus or retention period are hidden; this is not a complete record of every action.")}</p>
      <fieldset disabled={loading} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showCampus && page ? (
          <FormField name="audit-campus" label={t("Campus")}>
            <Select value={filter.campusId} onChange={event => setFilter(value => ({ ...value, campusId: event.target.value }))}>
              <option value="">{t("All authorized campuses")}</option>
              {page.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </Select>
          </FormField>
        ) : null}
        <FormField name="audit-type" label={t("Record type")}>
          <Select value={filter.tableName} onChange={event => setFilter(value => ({ ...value, tableName: event.target.value }))}>
            <option value="">{t("All records")}</option>
            {types.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}
          </Select>
        </FormField>
        <FormField name="audit-from" label={t("From date (UTC)")}><Input type="date" dir="ltr" value={filter.from} onChange={event => setFilter(value => ({ ...value, from: event.target.value }))} /></FormField>
        <FormField name="audit-to" label={t("To date (UTC)")}><Input type="date" dir="ltr" value={filter.to} onChange={event => setFilter(value => ({ ...value, to: event.target.value }))} /></FormField>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw aria-hidden="true" className={loading ? "motion-safe:animate-spin" : ""} />{t("Refresh history")}
        </Button>
        {exportRequest === undefined ? (
          <Button variant="outline" size="sm" loading={exportState === "busy"} disabled={loading || exportState === "busy"} onClick={() => void exportCsv()}>
            {exportState === "busy" ? null : <Download aria-hidden="true" />}{exportState === "busy" ? t("Preparing export…") : t("Export CSV")}
          </Button>
        ) : null}
        <span role="status" className="ms-auto text-sm text-ink-subtle">
          {loading ? t("Loading history…") : exportState === "busy" ? t("Preparing export…") : t("{0} entries loaded", [format.number(rows.length, 0)])}
        </span>
      </div>
      {exportState === "denied" || exportState === "failed" ? <Alert tone="danger" compact live="assertive">{exportState === "denied" ? t("You do not have permission to export activity history.") : t("The export could not be prepared. Try again.")}</Alert> : null}
      {error ? <div className="sk-panel"><ErrorState description={t(ERROR_TEXT[error])} onRetry={() => load()} retryLabel={t("Refresh history")} /></div> : null}
      {loading && rows.length === 0 && !error ? <SkeletonList rows={3} label={t("Loading history…")} /> : null}
      {!loading && !error && rows.length === 0 ? <div className="sk-panel"><EmptyState size="sm" icon={History} title={t("No available entries match these filters.")} /></div> : null}
      <ol className="space-y-3">
        {rows.map(row => (
          <li key={row.id} className="sk-panel space-y-2 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <strong className="text-sm text-ink-strong">{t(ACTION_LABEL[row.action] ?? row.action)} · {typeLabel(row.tableName)}</strong>
              <time dateTime={row.createdAt} className="text-xs text-ink-subtle"><bdi>{format.dateTime(row.createdAt)}</bdi></time>
            </div>
            <p className="text-sm text-ink">{t("Changed by")}: <bdi>{row.actor?.fullName ?? t("System")}</bdi></p>
            <p className="break-all text-xs text-ink-subtle">{t("Record reference")}: <bdi dir="ltr">{row.recordId}</bdi></p>
            {row.changes.length ? (
              <dl className="space-y-1 text-sm">
                {row.changes.map(change => <div key={change.field} className="flex flex-wrap gap-2"><dt>{FIELD_LABEL[change.field] ? t(FIELD_LABEL[change.field]) : change.field}:</dt><dd><bdi>{change.before ?? "—"}</bdi> <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> <bdi>{change.after ?? "—"}</bdi></dd></div>)}
              </dl>
            ) : <p className="text-xs text-ink-subtle">{t("Details minimized")}</p>}
          </li>
        ))}
      </ol>
      {page?.nextCursor ? <Button variant="outline" disabled={loading} onClick={() => void load(page.nextCursor!, true)}>{t("Load older entries")}</Button> : null}
    </div>
  );
}
