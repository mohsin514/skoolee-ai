"use client";

import { useId, useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocale } from "@/components/locale/LocaleProvider";
import { timetableScopeCopy } from "@/lib/timetable/editor-copy";
export { timetableScopeCopy } from "@/lib/timetable/editor-copy";
import { TIMETABLE_TERMS, scopeTimetables, type TimetableScopeIdentity } from "@/lib/timetable/view-scope";


export function useTimetableScope<T extends TimetableScopeIdentity>(timetables: T[], classes: Array<{ academicYear: number }>, campusId?: string) {
  const [selection, setSelection] = useState<{ campusId?: string; year: number; term: string } | null>(null);
  const years = useMemo(() => [...new Set([...timetables.map(item => item.academicYear), ...classes.map(item => item.academicYear)])].sort((a, b) => b - a), [timetables, classes]);
  const year = selection && selection.campusId === campusId && years.includes(selection.year) ? selection.year : years[0] ?? new Date().getFullYear();
  const terms = [...new Set<string>([...TIMETABLE_TERMS, ...timetables.filter(item => item.academicYear === year).map(item => item.term)])];
  const existingTerms = terms.filter(term => timetables.some(item => item.academicYear === year && item.term === term));
  const term = selection && selection.campusId === campusId && selection.year === year ? selection.term : existingTerms[0] || "ANNUAL";
  const exact = useMemo(() => scopeTimetables(timetables, year, term), [timetables, year, term]);
  const resources = useMemo(() => scopeTimetables(timetables, year, term, true), [timetables, year, term]);
  return { year, term, years, terms, exact, resources, setYear: (value: number) => { const existing = timetables.filter(item => item.academicYear === value); const nextTerm = existing.some(item => item.term === term) ? term : [...TIMETABLE_TERMS, ...existing.map(item => item.term)].find(candidate => existing.some(item => item.term === candidate)) || "ANNUAL"; setSelection({ campusId, year: value, term: nextTerm }); }, setTerm: (value: string) => setSelection({ campusId, year, term: value }) };
}

export function TimetableScopeControls({ year, term, years, terms, disabled, onYear, onTerm }: { year: number; term: string; years: number[]; terms: string[]; disabled?: boolean; onYear: (year: number) => void; onTerm: (term: string) => void }) {
  const { language } = useLocale(), c = timetableScopeCopy(language), id = useId();
  return <section className="sk-panel min-w-0 space-y-3 p-4" aria-label={c.term}>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2"><FormField name={`${id}-year`} label={c.year}><Select value={year} disabled={disabled || !years.length} onChange={event => onYear(Number(event.target.value))}>{years.map(value => <option key={value} value={value}>{new Intl.NumberFormat(language, { useGrouping: false }).format(value)}</option>)}</Select></FormField><FormField name={`${id}-term`} label={c.term}><Select value={term} disabled={disabled} onChange={event => onTerm(event.target.value)}>{terms.map(value => <option key={value} value={value}>{TIMETABLE_TERMS.includes(value as typeof TIMETABLE_TERMS[number]) ? c[value as typeof TIMETABLE_TERMS[number]] : value}</option>)}</Select></FormField></div>
    <p className="text-xs leading-relaxed text-ink-muted">{c.scopeHint}</p>
  </section>;
}
