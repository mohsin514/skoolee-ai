"use client";
import { boundedInteger, patchListQuery } from "@/lib/lists/query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { checkedJson, readRequest, requestFailure, resourceState, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { FileText, GraduationCap, School, Search, UserRound, X, type LucideIcon } from "lucide-react";
import { DeskPill, DeskRowIcon, DeskStats, StatTile, deskRow } from "@/components/ui/desk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";

// SKO-401: search school records within the reader's own scope. The query and every filter live in the URL,
// so Back and refresh restore the same search; an older response can never overwrite a newer one; filters
// are always shown, so "nothing found" is never confused with a restrictive filter or a failed source.

type Ui = ReturnType<typeof useUiText>;
type SearchType = "student" | "class" | "staff" | "application";
type Result = { type: SearchType; id: string; title: string; context: string[]; identifiers: string[]; exact: boolean; archived: boolean; note?: string; href: string };
type Response = { scope: { school: string; campus: string | null; allCampuses: boolean }; allowedTypes: SearchType[]; types: SearchType[]; groups: { type: SearchType; rows: Result[]; total: number }[]; sources: Record<string, "ok" | "failed">; partial: boolean; page: number; pageSize: number };
type Options = { campuses: { id: string; name: string }[]; classes: { id: string; name: string; section: string | null; academicYear: number }[]; years: number[]; allowedTypes: SearchType[] };
const typeLabel = (ui: Ui, type: string) => ({ student: ui("Pupils"), class: ui("Classes"), staff: ui("Staff"), application: ui("Applications") } as Record<string, string>)[type] ?? type;
const TYPE_ICON: Record<SearchType, LucideIcon> = { student: GraduationCap, class: School, staff: UserRound, application: FileText };
const statusLabel = (ui: Ui, status: string) => ({ active: ui("Current only"), archived: ui("Archived or closed only"), all: ui("Current and archived") } as Record<string, string>)[status] ?? status;

/**
 * Framed by `src/app/search/layout.tsx` (RoleFrame supplies the role's nav, header and `<main>`), so this renders
 * content only: one PageHeader, no page chrome and no "Back to dashboard" link (the sidebar is the way back).
 * `dashboardHref` is accepted for one release and ignored.
 */
export function SearchWorkspace(_props: { dashboardHref?: string } = {}) {
  const ui = useUiText();
  const { language } = useLocale();
  const pathname = usePathname(), params = useSearchParams();
  const [input, setInput] = useState(params.get("q") ?? "");
  const [data, setData] = useState<Response | null>(null), [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<RequestFailure | null>(null);
  // Permission answers use the same classified response contract as other workspaces.
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);
  const inputDirty = useRef(false);
  const lastQuery = useRef(params.get("q") ?? "");
  const listRef = useRef<HTMLDivElement>(null);
  const state = useMemo(() => ({ q: params.get("q") ?? "", types: (params.get("types") ?? "").split(",").filter(Boolean), status: params.get("status") ?? "active", year: params.get("year") ?? "", cls: params.get("class") ?? "", campus: params.get("campus") ?? "", sort: ["name", "name-desc"].includes(params.get("sort") ?? "") ? params.get("sort")! : "default", page: boundedInteger(params.get("page"), 1, 100_000) }), [params]);

  /** Replace one or more URL parameters; a changed filter returns to page one. */
  const update = useCallback((patch: Record<string, string | null>) => {
    const next = patchListQuery(params.toString(), patch);
    if (next.toString() !== params.toString()) window.history.pushState(null, "", `${pathname}?${next.toString()}${window.location.hash}`);
  }, [params, pathname]);

  useEffect(() => { void fetch("/api/search?options=1", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(json => json?.success && setOptions(json.data)).catch(() => undefined); }, []);
  useEffect(() => {
    if (lastQuery.current !== state.q) {
      lastQuery.current = state.q;
      inputDirty.current = false;
      setInput(state.q);
    }
  }, [state.q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputDirty.current && input.trim() !== state.q) {
        inputDirty.current = false;
        update({ q: input.trim() || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, state.q, update]);
  useEffect(() => {
    const id = ++sequence.current, controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    const timer = setTimeout(async () => {
      setLoading(true); setError(null); setData(null);
      try {
        const query = new URLSearchParams(params.toString());
        query.set("lang", language); // role names and statuses in the reader's language
        const response = await readRequest(`/api/search?${query}`, controller.signal);
        const json = await checkedJson(response);
        if (id !== sequence.current) return; // a newer search has started; this answer is stale
        if (!response.ok || !json.success) throw new Error(json.error || "Search failed.");

        setData(json.data);
      } catch (failure) {
        if (id !== sequence.current || (controller.signal.aborted && !timedOut)) return;
        setData(null); setError(requestFailure(timedOut ? new DOMException("Request timed out", "TimeoutError") : failure));
      } finally { clearTimeout(timeout); if (id === sequence.current) setLoading(false); }
    }, 0);
    return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [params, ui, language, attempt]);

  const chips = [
    ...state.types.map(type => ({ key: `type-${type}`, text: typeLabel(ui, type), clear: () => update({ types: state.types.filter(t => t !== type).join(",") || null }) })),
    ...(state.status !== "active" ? [{ key: "status", text: statusLabel(ui, state.status), clear: () => update({ status: null }) }] : []),
    ...(state.year ? [{ key: "year", text: ui("Year {0}", [state.year]), clear: () => update({ year: null }) }] : []),
    ...(state.cls ? [{ key: "class", text: ui("Class {0}", [(() => { const cls = options?.classes.find(c => c.id === state.cls); return cls ? [cls.name, cls.section].filter(Boolean).join(" ") : "…"; })()]), clear: () => update({ class: null }) }] : []),
    ...(state.campus ? [{ key: "campus", text: options?.campuses.find(c => c.id === state.campus)?.name ?? ui("Campus"), clear: () => update({ campus: null }) }] : []),
  ];
  const total = data?.groups.reduce((sum, group) => sum + group.total, 0) ?? 0;
  const resultState = resourceState({ loading, failure: error, count: total, filtered: Boolean(state.q || chips.length) });
  const single = data?.types.length === 1 ? data.groups[0] : null;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>("[data-search-result]") ?? [])];
    if (!links.length) return;
    event.preventDefault();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[event.key === "ArrowDown" ? Math.min(links.length - 1, index + 1) : Math.max(0, index - 1)]?.focus();
  };

  const header = <PageHeader
    title="Search records"
    description="Find a pupil, class, staff member or application in your own school and open it in your workspace."
    icon={Search}
  />;

  return <div className="mx-auto w-full max-w-4xl space-y-4 font-sans text-foreground" onKeyDown={onKeyDown} data-search-page data-resource-state={resultState}>
      {header}
      <p className="text-xs text-ink-muted" data-search-scope>{data ? (data.scope.allCampuses ? ui("Searching {0} · all campuses", [data.scope.school]) : ui("Searching {0} · {1}", [data.scope.school, data.scope.campus ?? ""])) : ui("Searching your school")}</p>
      <FormField name="search-q" label={ui("Search by name, roll number, admission number or reference")}>
        <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" /><Input type="search" value={input} autoFocus autoComplete="off" className="ps-9" onChange={event => { inputDirty.current = true; setInput(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") update({ q: input.trim() || null }); }} /></div>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField name="search-sort" label={ui("Sort by")}><Select value={state.sort} onChange={event => update({ sort: event.target.value === "default" ? null : event.target.value })}><option value="default">{ui("Default")}</option><option value="name">{ui("Name")} ↑</option><option value="name-desc">{ui("Name")} ↓</option></Select></FormField>
        <FormField name="search-type" label={ui("Record type")}><Select value={state.types.length === 1 ? state.types[0] : ""} onChange={event => update({ types: event.target.value || null })}><option value="">{ui("All types")}</option>{(options?.allowedTypes ?? data?.allowedTypes ?? []).map(type => <option key={type} value={type}>{typeLabel(ui, type)}</option>)}</Select></FormField>
        <FormField name="search-status" label={ui("Status")}><Select value={state.status} onChange={event => update({ status: event.target.value === "active" ? null : event.target.value })}><option value="active">{statusLabel(ui, "active")}</option><option value="archived">{statusLabel(ui, "archived")}</option><option value="all">{statusLabel(ui, "all")}</option></Select></FormField>
        <FormField name="search-year" label={ui("Academic year")}><Select value={state.year} onChange={event => update({ year: event.target.value || null })}><option value="">{ui("Any year")}</option>{(options?.years ?? []).map(year => <option key={year} value={year}>{year}</option>)}</Select></FormField>
        <FormField name="search-class" label={ui("Class (pupils)")}><Select value={state.cls} onChange={event => update({ class: event.target.value || null })}><option value="">{ui("Any class")}</option>{(options?.classes ?? []).map(cls => <option key={cls.id} value={cls.id}>{[cls.name, cls.section].filter(Boolean).join(" ")} · {cls.academicYear}</option>)}</Select></FormField>
        {options?.campuses.length ? <FormField name="search-campus" label={ui("Campus")}><Select value={state.campus} onChange={event => update({ campus: event.target.value || null })}><option value="">{ui("All campuses")}</option>{options.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></FormField> : null}
      </div>
      <p className="text-2xs text-ink-muted">{ui("Every filter must match. Record types are alternatives. Exact roll numbers, admission numbers and references are listed first.")}</p>
      {chips.length ? <div className="flex flex-wrap items-center gap-2" aria-label={ui("Active filters")} data-search-chips>
        {chips.map(chip => <Button key={chip.key} size="sm" variant="secondary" onClick={chip.clear} aria-label={ui("Remove filter {0}", [chip.text])}><bdi>{chip.text}</bdi><X className="size-3" aria-hidden="true" /></Button>)}
        <Button size="sm" variant="ghost" onClick={() => update({ types: null, status: null, year: null, class: null, campus: null })} data-search-clear>{ui("Clear filters")}</Button>
      </div> : null}
      {!loading && !error && data?.partial ? <div data-search-partial><Alert tone="warning" compact live="polite" actions={<Button size="sm" variant="ghost" onClick={() => setAttempt(n => n + 1)}>{ui("Retry")}</Button>}>{ui("Results are partial: {0} could not be searched just now.", [Object.entries(data.sources).filter(([, state]) => state === "failed").map(([type]) => typeLabel(ui, type)).join(", ")])}</Alert></div> : null}
      {/* Load failure (R4): inline, with a retry that really runs the search again; earlier results stay visible. */}

      {!loading && error ? <ErrorState error={error} onRetry={() => setAttempt(n => n + 1)} /> : null}
      <p className="sr-only" role="status" aria-live="polite">{loading ? ui("Searching…") : data ? ui("{0} results", [total]) : ""}</p>
      {loading && !data ? <SkeletonList rows={4} label={ui("Searching…")} /> : null}
      {!loading && data && !total && !error ? <div data-search-empty><EmptyState size="sm" icon={Search} title={state.q ? ui("No matches for “{0}”.", [state.q]) : ui("No records in this scope.")} description={chips.length ? ui("Filters in use: {0}. Remove one to widen the search.", [chips.map(chip => chip.text).join(", ")]) : ui("Try part of the name, or the exact roll number, admission number or application reference.")} action={chips.length ? <Button size="sm" variant="secondary" onClick={() => update({ types: null, status: null, year: null, class: null, campus: null })}>{ui("Clear filters")}</Button> : undefined} /></div> : null}
      {/* SKAI-1277: one tile per record type with matches; a tile narrows the search to that type and back. */}
      {data && total > 0 && (state.types.length === 1 || data.groups.filter(group => group.total > 0).length > 1) ? <DeskStats data-search-stats>{data.groups.filter(group => group.total > 0).map((group, index) => <StatTile key={group.type} index={index} icon={TYPE_ICON[group.type]} tone={state.types.length === 1 && state.types[0] === group.type ? "brand" : "neutral"} value={group.total} label={typeLabel(ui, group.type)} selected={state.types.length === 1 && state.types[0] === group.type} onSelect={() => update({ types: state.types.length === 1 && state.types[0] === group.type ? null : group.type })} />)}</DeskStats> : null}
      <div ref={listRef} className={`space-y-5 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {data?.groups.filter(group => group.total > 0).map(group => <section key={group.type} aria-label={typeLabel(ui, group.type)} data-search-group={group.type}>
          <h2 className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold"><span>{typeLabel(ui, group.type)} <span className="text-ink-muted">({group.total})</span></span>{!single && group.total > group.rows.length ? <Button size="sm" variant="ghost" onClick={() => update({ types: group.type })}>{ui("See all {0}", [group.total])}</Button> : null}</h2>
          <ul className="space-y-1.5">{group.rows.map(row => <li key={`${row.type}-${row.id}-${row.identifiers[0] ?? ""}`}>
            <Link href={row.href} data-search-result={row.id} data-tone={row.archived ? "muted" : row.exact ? "success" : undefined} className={`${deskRow} flex items-start gap-3 text-sm`}>
              <DeskRowIcon icon={TYPE_ICON[row.type] ?? Search} />
              <span className="block min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-center gap-2"><bdi className="min-w-0 font-bold text-ink-strong [overflow-wrap:anywhere]">{row.title}</bdi>{row.exact ? <DeskPill tone="success">{ui("Exact match")}</DeskPill> : null}{row.archived ? <DeskPill tone="neutral">{row.type === "application" ? ui("Closed") : ui("Archived")}</DeskPill> : null}</span>
              <span className="block text-xs text-ink-muted [overflow-wrap:anywhere]">{row.context.filter(Boolean).map((part, index) => <span key={index}>{index ? " · " : ""}<bdi>{part}</bdi></span>)}{row.identifiers.length ? <> · {row.identifiers.map((id, index) => <span key={index}>{index ? " · " : ""}<bdi dir="ltr">{id}</bdi></span>)}</> : null}</span>
              {row.note ? <span className="block text-xs text-status-warning-text">{ui("This identifier belongs to a merged record; it opens the current one.")}</span> : null}
              </span>
            </Link>
          </li>)}</ul>
        </section>)}
      </div>
      {single && single.total > (data?.pageSize ?? 25) ? <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={ui("Pages")}>
        <Button variant="secondary" size="sm" disabled={loading || (data?.page ?? state.page) <= 1} onClick={() => update({ page: String((data?.page ?? state.page) - 1) })}>{ui("Previous")}</Button>
        <span className="text-xs" data-search-page-number>{ui("Page {0} of {1}", [data?.page ?? state.page, Math.ceil(single.total / (data?.pageSize ?? 25))])}</span>
        <Button variant="secondary" size="sm" disabled={loading || (data?.page ?? state.page) >= Math.ceil(single.total / (data?.pageSize ?? 25))} onClick={() => update({ page: String((data?.page ?? state.page) + 1) })}>{ui("Next")}</Button>
      </nav> : null}
  </div>;
}
