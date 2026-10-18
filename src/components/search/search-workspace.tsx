"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { ArrowLeft, Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-401: search school records within the reader's own scope. The query and every filter live in the URL,
// so Back and refresh restore the same search; an older response can never overwrite a newer one; filters
// are always shown, so "nothing found" is never confused with a restrictive filter or a failed source.

type Ui = ReturnType<typeof useUiText>;
type SearchType = "student" | "class" | "staff" | "application";
type Result = { type: SearchType; id: string; title: string; context: string[]; identifiers: string[]; exact: boolean; archived: boolean; note?: string; href: string };
type Response = { scope: { school: string; campus: string | null; allCampuses: boolean }; allowedTypes: SearchType[]; types: SearchType[]; groups: { type: SearchType; rows: Result[]; total: number }[]; sources: Record<string, "ok" | "failed">; partial: boolean; page: number; pageSize: number };
type Options = { campuses: { id: string; name: string }[]; classes: { id: string; name: string; section: string | null; academicYear: number }[]; years: number[]; allowedTypes: SearchType[] };
const typeLabel = (ui: Ui, type: string) => ({ student: ui("Pupils"), class: ui("Classes"), staff: ui("Staff"), application: ui("Applications") } as Record<string, string>)[type] ?? type;
const statusLabel = (ui: Ui, status: string) => ({ active: ui("Current only"), archived: ui("Archived or closed only"), all: ui("Current and archived") } as Record<string, string>)[status] ?? status;

export function SearchWorkspace({ dashboardHref }: { dashboardHref: string }) {
  const ui = useUiText();
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [input, setInput] = useState(params.get("q") ?? "");
  const [data, setData] = useState<Response | null>(null), [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const sequence = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const state = useMemo(() => ({ q: params.get("q") ?? "", types: (params.get("types") ?? "").split(",").filter(Boolean), status: params.get("status") ?? "active", year: params.get("year") ?? "", cls: params.get("class") ?? "", campus: params.get("campus") ?? "", page: Number(params.get("page") ?? "1") || 1 }), [params]);

  /** Replace one or more URL parameters; a changed filter returns to page one. */
  const update = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) { if (value === null || value === "") next.delete(key); else next.set(key, value); }
    if (!("page" in patch)) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => { void fetch("/api/search?options=1", { cache: "no-store" }).then(r => r.json()).then(json => json.success && setOptions(json.data)).catch(() => undefined); }, []);
  useEffect(() => { const timer = setTimeout(() => { if (input !== state.q) update({ q: input.trim() || null }); }, 300); return () => clearTimeout(timer); }, [input, state.q, update]);
  useEffect(() => {
    const id = ++sequence.current, controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const query = new URLSearchParams(params.toString());
        const response = await fetch(`/api/search?${query}`, { cache: "no-store", signal: controller.signal });
        const json = await response.json().catch(() => ({}));
        if (id !== sequence.current) return; // a newer search has started; this answer is stale
        if (!response.ok || !json.success) throw new Error(json.error || "Search failed.");
        setData(json.data);
      } catch (failure) {
        if (controller.signal.aborted || id !== sequence.current) return;
        setError(failure instanceof TypeError ? ui("The connection failed. Your search is kept; try again.") : ui(failure instanceof Error ? failure.message : "Search failed."));
      } finally { if (id === sequence.current) setLoading(false); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [params, ui]);

  const chips = [
    ...state.types.map(type => ({ key: `type-${type}`, text: typeLabel(ui, type), clear: () => update({ types: state.types.filter(t => t !== type).join(",") || null }) })),
    ...(state.status !== "active" ? [{ key: "status", text: statusLabel(ui, state.status), clear: () => update({ status: null }) }] : []),
    ...(state.year ? [{ key: "year", text: ui("Year {0}", [state.year]), clear: () => update({ year: null }) }] : []),
    ...(state.cls ? [{ key: "class", text: ui("Class {0}", [(() => { const cls = options?.classes.find(c => c.id === state.cls); return cls ? [cls.name, cls.section].filter(Boolean).join(" ") : "…"; })()]), clear: () => update({ class: null }) }] : []),
    ...(state.campus ? [{ key: "campus", text: options?.campuses.find(c => c.id === state.campus)?.name ?? ui("Campus"), clear: () => update({ campus: null }) }] : []),
  ];
  const total = data?.groups.reduce((sum, group) => sum + group.total, 0) ?? 0;
  const single = data?.types.length === 1 ? data.groups[0] : null;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>("[data-search-result]") ?? [])];
    if (!links.length) return;
    event.preventDefault();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[event.key === "ArrowDown" ? Math.min(links.length - 1, index + 1) : Math.max(0, index - 1)]?.focus();
  };

  return <div className="min-h-dvh font-sans text-foreground" onKeyDown={onKeyDown} data-search-page>
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
      <Link href={dashboardHref} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={ui("Back to dashboard")}><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" /><span className="hidden sm:inline">{ui("Back to dashboard")}</span></Link>
      <h1 className="text-base font-semibold">{ui("Search records")}</h1>
    </header>
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-5 md:px-6">
      <p className="text-xs text-ink-muted" data-search-scope>{data ? (data.scope.allCampuses ? ui("Searching {0} · all campuses", [data.scope.school]) : ui("Searching {0} · {1}", [data.scope.school, data.scope.campus ?? ""])) : ui("Searching your school")}</p>
      <FormField name="search-q" label={ui("Search by name, roll number, admission number or reference")}>
        <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" /><Input type="search" value={input} autoFocus autoComplete="off" className="ps-9" onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") update({ q: input.trim() || null }); }} /></div>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-4">
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
      {data?.partial ? <div data-search-partial><Alert tone="warning" compact live="polite" actions={<Button size="sm" variant="ghost" onClick={() => router.refresh()}>{ui("Retry")}</Button>}>{ui("Results are partial: {0} could not be searched just now.", [Object.entries(data.sources).filter(([, state]) => state === "failed").map(([type]) => typeLabel(ui, type)).join(", ")])}</Alert></div> : null}
      {error ? <Alert tone="danger" compact actions={<Button size="sm" variant="secondary" onClick={() => update({ page: String(state.page) })}>{ui("Retry")}</Button>}>{error}</Alert> : null}
      <p className="sr-only" role="status" aria-live="polite">{loading ? ui("Searching…") : data ? ui("{0} results", [total]) : ""}</p>
      {loading && !data ? <SkeletonList rows={4} label={ui("Searching…")} /> : null}
      {data && !total && !error ? <div data-search-empty><EmptyState size="sm" icon={Search} title={state.q ? ui("No matches for “{0}”.", [state.q]) : ui("No records in this scope.")} description={chips.length ? ui("Filters in use: {0}. Remove one to widen the search.", [chips.map(chip => chip.text).join(", ")]) : ui("Try part of the name, or the exact roll number, admission number or application reference.")} action={chips.length ? <Button size="sm" variant="secondary" onClick={() => update({ types: null, status: null, year: null, class: null, campus: null })}>{ui("Clear filters")}</Button> : undefined} /></div> : null}
      <div ref={listRef} className={`space-y-5 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {data?.groups.filter(group => group.total > 0).map(group => <section key={group.type} aria-label={typeLabel(ui, group.type)} data-search-group={group.type}>
          <h2 className="mb-2 flex items-center justify-between text-sm font-bold"><span>{typeLabel(ui, group.type)} <span className="text-ink-muted">({group.total})</span></span>{!single && group.total > group.rows.length ? <Button size="sm" variant="ghost" onClick={() => update({ types: group.type })}>{ui("See all {0}", [group.total])}</Button> : null}</h2>
          <ul className="space-y-1.5">{group.rows.map(row => <li key={`${row.type}-${row.id}-${row.identifiers[0] ?? ""}`}>
            <Link href={row.href} data-search-result={row.id} className="block rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
              <span className="flex flex-wrap items-center gap-2"><bdi className="font-bold">{row.title}</bdi>{row.exact ? <span className="rounded bg-emerald-50 px-1.5 text-2xs font-bold text-emerald-800">{ui("Exact match")}</span> : null}{row.archived ? <span className="rounded bg-muted px-1.5 text-2xs font-bold">{row.type === "application" ? ui("Closed") : ui("Archived")}</span> : null}</span>
              <span className="block text-xs text-ink-muted">{row.context.filter(Boolean).map((part, index) => <span key={index}>{index ? " · " : ""}<bdi>{part}</bdi></span>)}{row.identifiers.length ? <> · {row.identifiers.map((id, index) => <span key={index}>{index ? " · " : ""}<bdi dir="ltr">{id}</bdi></span>)}</> : null}</span>
              {row.note ? <span className="block text-xs text-amber-800">{ui("This identifier belongs to a merged record; it opens the current one.")}</span> : null}
            </Link>
          </li>)}</ul>
        </section>)}
      </div>
      {single && single.total > (data?.pageSize ?? 25) ? <nav className="flex items-center justify-between gap-2" aria-label={ui("Pages")}>
        <Button variant="secondary" size="sm" disabled={state.page <= 1} onClick={() => update({ page: String(state.page - 1) })}>{ui("Previous")}</Button>
        <span className="text-xs" data-search-page-number>{ui("Page {0} of {1}", [state.page, Math.ceil(single.total / (data?.pageSize ?? 25))])}</span>
        <Button variant="secondary" size="sm" disabled={state.page >= Math.ceil(single.total / (data?.pageSize ?? 25))} onClick={() => update({ page: String(state.page + 1) })}>{ui("Next")}</Button>
      </nav> : null}
    </main>
  </div>;
}
