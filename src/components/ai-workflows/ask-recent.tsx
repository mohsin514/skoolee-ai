"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import type { RunView, StepUiState } from "@/lib/ai-workflows/view";
import { UI, runStatusWords, t, type Lang } from "./run-copy";
import { fillNode, runText } from "./run-links";
import { Num, useWorkflowFormat } from "./workflow-format";
import { StateNode } from "./workflow-marks";

interface JobRow { id: string; title: string | null; status: string; outcome: string | null; version: number; createdAt: string; updatedAt: string }

const NEEDS_YOU = new Set(["WAITING_CONFIRM", "NEEDS_INPUT"]);
type BadgeVariant = NonNullable<BadgeProps["variant"]>;
const TONE: Record<string, BadgeVariant> = { WAITING_CONFIRM: "warning", NEEDS_INPUT: "warning", FAILED: "danger", BLOCKED: "danger", COMPLETED: "neutral" };

/** A run status as the nearest honest step glyph; "saved" only for an executed run. */
function nodeState(row: JobRow): StepUiState {
  switch (row.status) {
    case "WAITING_CONFIRM": return "awaiting_confirm";
    case "NEEDS_INPUT": return "needs_input";
    case "WAITING_HANDOFF": return "handed_off";
    case "RUNNING": case "PLANNING": case "PLAN_REVIEW": return "running";
    case "FAILED": case "BLOCKED": return "failed";
    case "CANCELLED": case "EXPIRED": return "cancelled";
    case "COMPLETED": return row.outcome === "EXECUTED" ? "saved" : row.outcome === "ANSWERED" ? "looked_up" : "skipped";
    default: return "planned";
  }
}

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

/**
 * The actor's own recent requests (up to 20). Requests waiting for the person float to the top.
 * Titles come from the original request in the actor-scoped list response.
 */
export function AskRecent({ language, currentId, refreshKey, onOpen, headingLevel = 3 }: { headingLevel?: 2 | 3; language: Lang; currentId: string | null; refreshKey: string | null; onOpen: (run: RunView) => void }) {
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const format = useWorkflowFormat();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { jobs } = await readJson<{ jobs: JobRow[] }>("/api/ai-workflows", controller.signal);
        const sorted = [...jobs].sort((a, b) => Number(NEEDS_YOU.has(b.status)) - Number(NEEDS_YOU.has(a.status)));
        setRows(sorted); setFailed(false);
      } catch { if (!controller.signal.aborted) setFailed(true); }
    })();
    return () => controller.abort();
  }, [refreshKey, attempt]);

  const open = useCallback(async (id: string) => {
    setOpening(id);
    try { const { run } = await readJson<{ run: RunView }>(`/api/ai-workflows/${id}`); onOpen(run); }
    catch { setFailed(true); }
    finally { setOpening(null); }
  }, [onOpen]);

  const filtered = rows?.filter(row => (row.title ?? "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const searchLabel = language === "ar" ? "ابحث في آخر 20 طلبًا" : language === "ur" ? "آخری 20 درخواستوں میں تلاش کریں" : "Search your latest 20 requests";
  const waiting = rows?.filter(row => NEEDS_YOU.has(row.status)).length ?? 0;

  return (
    <section data-ai-recent aria-labelledby={headingId} className="space-y-3">
      <Heading id={headingId} className="sr-only">
        <History aria-hidden="true" className="size-4 text-ink-muted" />
        {t(UI, "history", language)}
      </Heading>
      <Input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={searchLabel} placeholder={searchLabel} />
      {failed && !rows ? (
        <ErrorState variant="panel" title={runText("recentError", language)} onRetry={() => { setFailed(false); setAttempt(value => value + 1); }} retryLabel={runText("retry", language)} />
      ) : !rows ? (
        <SkeletonList rows={3} label={t(UI, "history", language)} />
      ) : rows.length === 0 ? (
        <EmptyState size="sm" icon={History} title={runText("recentEmpty", language)} description={runText("recentEmptyHint", language)} />
      ) : (
        <>
          {waiting > 0 ? <Alert compact tone="warning" live="off">{fillNode(runText("recentWaiting", language), <Num value={waiting} />)}</Alert> : null}
          {filtered?.length === 0 ? <p role="status" className="py-6 text-center text-sm text-ink-muted">{language === "ar" ? "لا توجد نتائج مطابقة" : language === "ur" ? "کوئی مماثل درخواست نہیں ملی" : "No matching requests. Try another search."}</p> : null}
          <ul className="sk-stagger space-y-1">
            {filtered?.map(row => (
              <li key={row.id}>
                <Button type="button" variant="ghost" data-ai-recent-run={row.id} aria-current={row.id === currentId ? "true" : undefined}
                  loading={opening === row.id} disabled={Boolean(opening)} onClick={() => void open(row.id)}
                  className="sk-row-interactive h-auto min-h-11 w-full justify-start gap-3 rounded-xl px-3 py-2 text-start font-normal">
                  <span className="relative">
                    <StateNode state={nodeState(row)} size="sm" />
                    {NEEDS_YOU.has(row.status) ? <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-status-warning-text ring-2 ring-card" /> : null}
                  </span>
                  <span className="block min-w-0 flex-1 space-y-0.5">
                    <span dir="auto" className="block truncate text-sm font-semibold text-ink-strong">{row.title || runStatusWords(row.status, language)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-muted">
                      <Badge size="sm" variant={TONE[row.status] ?? "neutral"}>{runStatusWords(row.status, language)}</Badge>
                      <time dateTime={row.updatedAt}>{format.relative(row.updatedAt)}</time>
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {failed && rows ? <Alert compact tone="danger">{runText("recentError", language)}</Alert> : null}
    </section>
  );
}
