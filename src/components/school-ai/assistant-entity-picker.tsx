"use client";
import { useEffect, useState } from "react";
import { Check, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import type { Language } from "@/lib/locale/package";
import type { AssistantFocus } from "@/lib/school-ai/assistant-focus";
import { catalogOperationsForFocus, type AssistantCatalog, type AssistantCatalogQuery, type AssistantCatalogSelection } from "@/lib/school-ai/assistant-catalog";
import { workspaceRequest } from "./workspace-client";
import { assistantCatalogCopy } from "./assistant-catalog-copy";
import { riskCopy } from "./school-operations-risk-copy";

export function AssistantEntityPicker({ language, campusId, focus, value, onChange, disabled }: { language: Language; campusId?: string | null; focus: AssistantFocus; value?: AssistantCatalogSelection; onChange: (value?: AssistantCatalogSelection) => void; disabled?: boolean }) {
  const operations = catalogOperationsForFocus[focus.domain] ?? [], c = assistantCatalogCopy(language), risks = riskCopy(language);
  const [query, setQuery] = useState<AssistantCatalogQuery>(value?.query ?? { operation: operations[0] }), [catalog, setCatalog] = useState<AssistantCatalog | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [reload, setReload] = useState(0), [search, setSearch] = useState(""), [limit, setLimit] = useState(30);
  useEffect(() => { if (value && JSON.stringify(value.query) !== JSON.stringify(query)) setQuery(value.query); }, [value, query]);
  useEffect(() => {
    if (!query.operation) return; const abort = new AbortController(); setLoading(true); setError(""); setCatalog(null);
    const params = new URLSearchParams({ domain: focus.domain, query: JSON.stringify(query) }); if (campusId) params.set("campusId", campusId);
    void workspaceRequest<AssistantCatalog>(`/api/school-ai/assistant/catalog?${params}`, { signal: abort.signal }).then(data => { if (!abort.signal.aborted) setCatalog(data); }).catch(() => { if (!abort.signal.aborted) setError(c.failed); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
    // Keep the request independent of translated labels and selection edits.
  }, [query, campusId, focus.domain, reload]);
  const updateQuery = (next: AssistantCatalogQuery) => { onChange(undefined); setQuery(next); setSearch(""); setLimit(30); };
  const choose = (kind: AssistantCatalogSelection["selected"][number]["kind"], id: string, checked: boolean) => { if (!catalog) return; const prior = value?.snapshot === catalog.snapshot ? value.selected : []; const selected = checked ? [...prior, { kind, id }] : prior.filter(row => row.kind !== kind || row.id !== id); if (selected.length > 200) { setError(c.limit); return; } onChange({ query, snapshot: catalog.snapshot, selected }); };
  const rows = catalog?.entities.filter(row => row.kind !== "enrollment" && row.label.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language))) ?? [], groups = [...new Set(rows.map(row => row.kind))];
  const scopedClasses = catalog?.entities.filter(row => row.kind === "class") ?? [], scopes = catalog?.entities.filter(row => row.kind === "riskScope") ?? [];
  const needsClass = ["attendance.record_register", "students.promote_enrollment", "fees.generate_invoices", "exams.create_session_plan", "timetable.create_draft"].includes(query.operation), needsDate = ["attendance.record_register", "timetable.assign_substitutes", "operations.record_risk_decision"].includes(query.operation);
  const stale = Boolean(value && catalog && value.snapshot !== catalog.snapshot);
  return <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5" aria-label={c.title} aria-busy={loading}>
    <div className="flex items-start gap-3"><Database aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /><div className="min-w-0"><h3 className="font-semibold">{c.title}</h3><p className="mt-1 text-sm text-ink-muted">{c.hint}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><FormField name="assistant-workflow" label={c.operation}><Select value={query.operation} disabled={disabled} onChange={event => updateQuery({ operation: event.target.value as AssistantCatalogQuery["operation"], ...(event.target.value === "operations.record_risk_decision" ? { indicator: "ATTENDANCE_GAPS" as const } : {}) })}>{operations.map(op => <option key={op} value={op}>{c.operations[op]}</option>)}</Select></FormField>
    {needsClass && <FormField name="assistant-class" label={c.class}><Select disabled={disabled || loading} value={query.classId ?? ""} onChange={event => updateQuery({ ...query, classId: event.target.value || undefined })}><option value="">{c.choose}</option>{scopedClasses.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</Select></FormField>}
    {needsDate && <FormField name="assistant-date" label={c.date}><Input type="date" disabled={disabled} value={query.date ?? ""} onChange={event => updateQuery({ ...query, date: event.target.value || undefined })} /></FormField>}
    {query.operation === "operations.record_risk_decision" && <><FormField name="assistant-indicator" label={c.indicator}><Select disabled={disabled} value={query.indicator ?? "ATTENDANCE_GAPS"} onChange={event => updateQuery({ ...query, indicator: event.target.value as AssistantCatalogQuery["indicator"], scopeId: undefined })}>{(["ATTENDANCE_GAPS", "UNCOVERED_LESSONS", "UNRELEASED_RESULTS"] as const).map(indicator => <option key={indicator} value={indicator}>{risks[indicator]}</option>)}</Select></FormField><FormField name="assistant-scope" label={c.scope}><Select disabled={disabled || loading} value={query.scopeId ?? ""} onChange={event => updateQuery({ ...query, scopeId: event.target.value || undefined })}><option value="">{c.choose}</option>{scopes.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</Select></FormField></>}
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || loading} onClick={() => { onChange(undefined); setReload(n => n + 1); }}><RefreshCw aria-hidden="true" />{c.refresh}</Button><Button variant="ghost" disabled={disabled || !value} onClick={() => onChange(undefined)}>{c.clear}</Button>{catalog && <Button variant="ghost" disabled={disabled || loading} onClick={() => onChange({ query, snapshot: catalog.snapshot, selected: [] })}>{c.none}</Button>}</div>
    {(error || stale) && <p role="alert" className="text-sm text-destructive">{error || c.stale}</p>}
    {catalog?.truncated && <p className="text-sm text-ink-muted">{c.truncated}</p>}
    {!!catalog?.entities.length && <FormField name="assistant-search" label={c.search}><Input value={search} disabled={disabled} onChange={event => { setSearch(event.target.value); setLimit(30); }} /></FormField>}
    {catalog && <p role="status" className="flex items-center gap-2 text-sm font-medium"><Check aria-hidden="true" className="size-4 text-primary" />{c.selected}: {value?.selected.length ?? 0}{query.classId || query.scopeId ? " + 1" : ""}</p>}
    <div className="max-h-80 space-y-4 overflow-y-auto overscroll-contain rounded-xl">{groups.map(kind => <fieldset key={kind} className="space-y-2"><legend className="mb-2 text-sm font-semibold">{c.kinds[kind]}</legend>{rows.filter(row => row.kind === kind).slice(0, limit).map(row => { const implicit = kind === "class" && query.classId === row.id || kind === "riskScope" && query.scopeId === row.id; return <label key={row.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm transition-colors hover:border-primary/40"><Checkbox disabled={disabled || loading || Boolean(implicit) || Boolean(row.facts.ambiguous)} checked={Boolean(implicit) || Boolean(!stale && value?.selected.some(item => item.kind === kind && item.id === row.id))} onChange={event => choose(kind, row.id, event.target.checked)} /><span className="min-w-0 break-words">{row.label}{row.facts.ambiguous && <span className="mt-1 block text-xs text-ink-muted">{c.ambiguous}</span>}</span></label>; })}</fieldset>)}</div>
    {rows.some(row => rows.filter(item => item.kind === row.kind).length > limit) && <Button variant="ghost" onClick={() => setLimit(n => n + 30)}>{c.more}</Button>}
    {catalog && !rows.length && <p className="text-sm text-ink-muted">{c.empty}</p>}
  </section>;
}
