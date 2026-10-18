"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-413: the officer reviews live checks and pending changes, then publishes
// an exact version. Families see nothing from this session until version 1,
// and only the published version afterwards.

type Issue = { scheduleId: string | null; paper: string; kind: string; message: string };
type Change = { scheduleId: string; paper: string; kind: string; before?: string; after?: string };
type Status = {
  session: { id: string; title: string };
  papers: { scheduleId: string; candidates: number; seated: number }[];
  issues: Issue[]; blocked: boolean;
  latest: { id: string; version: number; publishedAt: string } | null;
  pendingChanges: Change[]; seatingChanged: boolean;
  history: { id: string; version: number; reason: string | null; publishedAt: string; publishedBy: string; changeCount: number; affected: { classes: number; students: number; staff: number } | null }[];
};
const CHANGE_LABEL: Record<string, string> = { ADDED: "Added", REMOVED: "Removed", MOVED: "Moved", ROOMS_CHANGED: "Rooms changed", INVIGILATORS_CHANGED: "Invigilators changed" };

export function DatesheetPublication({ sessionId }: { sessionId: string }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const [blockedBy, setBlockedBy] = useState<Issue[] | null>(null), [result, setResult] = useState<{ version: number; affected: { classes: number; students: number; staff: number }; recipients: number } | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    setError("");
    const response = await fetch(`/api/academic/datesheet-publication?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (ticket !== request.current) return;
    if (!response?.ok || !json?.success) { setError(ui(json?.error || "Publication checks could not be loaded.")); return; }
    setStatus(json.data); setBlockedBy(null);
  }, [sessionId, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const publish = async () => {
    if (!status) return;
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/academic/datesheet-publication", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, expectedVersion: status.latest?.version ?? 0, reason: reason || null }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        if (Array.isArray(json.issues)) setBlockedBy(json.issues);
        toast.error(ui(json.error || "The datesheet was not published."));
        return;
      }
      setResult(json.data); setReason("");
      toast.success(ui("Version {0} published.", [json.data.version]));
      await load();
    } catch { toast.error(ui("The connection failed. Reload before publishing again.")); }
    finally { setBusy(false); }
  };

  if (error) return <section className="sk-panel p-5" role="alert" data-datesheet-publication>{error} <Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button></section>;
  if (!status) return <section className="sk-panel p-5" role="status" data-datesheet-publication>{ui("Checking the datesheet…")}</section>;
  const issues = blockedBy ?? status.issues;
  const next = (status.latest?.version ?? 0) + 1;
  const nothingNew = Boolean(status.latest) && !status.pendingChanges.length && !status.seatingChanged;
  const candidates = status.papers.reduce((n, p) => n + p.candidates, 0), seated = status.papers.reduce((n, p) => n + p.seated, 0);
  const canPublish = !issues.length && !nothingNew && (!status.latest || reason.trim().length >= 8);

  return <section className="sk-panel space-y-4 p-5" aria-labelledby="publication-title" data-datesheet-publication data-latest-version={status.latest?.version ?? 0}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="publication-title" className="flex items-center gap-2 text-base font-bold"><Send className="size-4 text-primary" aria-hidden />{ui("Publish datesheet and seating")}</h3>
        <p className="text-xs text-ink-muted" data-publication-state>{status.latest
          ? ui("Version {0} published {1}. Families see this version until a new one is published.", [status.latest.version, dateTime(status.latest.publishedAt)])
          : ui("Not published yet. Families and students see nothing from this session until version 1 is published.")}</p>
      </div>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>{ui("Recheck")}</Button>
    </div>

    {issues.length
      ? <div data-publication-issues><Alert tone="danger" live="assertive" title={ui("Publication is blocked by {0} problem(s).", [issues.length])}>
          <ul className="list-disc space-y-0.5 ps-5">{issues.map((issue, index) => <li key={`${issue.scheduleId}-${issue.kind}-${index}`} data-issue={issue.kind}>{issue.paper ? <><bdi className="font-semibold">{issue.paper}</bdi>: </> : null}{ui(issue.message)}</li>)}</ul>
        </Alert></div>
      : <div data-publication-ready><Alert tone="success" live="off" compact>{ui("All checks pass: {0} papers, {1} of {2} candidates seated.", [status.papers.length, seated, candidates])}</Alert></div>}

    {status.latest ? <div className="space-y-2" data-pending-changes>
      <h4 className="text-sm font-bold">{ui("Changes since version {0}", [status.latest.version])}</h4>
      {status.pendingChanges.length ? <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-xs">
        <caption className="sr-only">{ui("Changes since the published version")}</caption>
        <thead><tr className="text-ink-subtle">{["Paper", "Change", "Before", "After"].map(h => <th key={h} scope="col" className="px-2 py-1 text-start">{ui(h)}</th>)}</tr></thead>
        <tbody>{status.pendingChanges.map((change, index) => <tr key={`${change.scheduleId}-${change.kind}-${index}`} className="border-t border-border" data-change={change.kind}>
          <th scope="row" className="px-2 py-1 text-start font-semibold"><bdi>{change.paper}</bdi></th><td className="px-2">{ui(CHANGE_LABEL[change.kind] ?? change.kind)}</td><td className="px-2"><bdi>{change.before ?? "—"}</bdi></td><td className="px-2"><bdi>{change.after ?? "—"}</bdi></td>
        </tr>)}</tbody>
      </table></div> : <p className="text-xs text-ink-muted">{status.seatingChanged ? ui("Only seating changed since the published version.") : ui("Nothing has changed since the published version.")}</p>}
      <FormField name="publication-reason" label={ui("What changed and why")}><Textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder={ui("Shown in the version history; affected families and invigilators are told once.")} /></FormField>
    </div> : null}

    <div className="flex flex-wrap items-center gap-3">
      <Button loading={busy} disabled={busy || !canPublish} onClick={() => void publish()}>{busy ? ui("Publishing…") : ui("Publish version {0}", [next])}</Button>
      {nothingNew ? <span className="text-xs text-ink-muted">{ui("Make a change before publishing a new version.")}</span> : null}
    </div>
    {result ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" data-publication-result>{ui("Version {0} published for {1} classes: {2} students and {3} staff are affected; {4} people are told once.", [result.version, result.affected.classes, result.affected.students, result.affected.staff, result.recipients])}</p> : null}

    {status.history.length ? <details className="text-xs" data-publication-history><summary className="cursor-pointer font-bold">{ui("Version history")}</summary>
      <ol className="mt-2 space-y-1">{status.history.map(entry => <li key={entry.id}>{ui("Version {0}", [entry.version])} · {dateTime(entry.publishedAt)} · <bdi>{entry.publishedBy}</bdi>{entry.changeCount ? ` · ${ui("{0} change(s)", [entry.changeCount])}` : ""}{entry.reason ? <> · <bdi>{entry.reason}</bdi></> : null}</li>)}</ol>
    </details> : null}
  </section>;
}
