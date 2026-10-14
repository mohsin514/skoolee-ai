"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { examCopy } from "./exam-copy";

type Exam = { id: string; title: string; startsAt: string; endsAt: string; status: string; _count?: { attempts: number } };
type RecordSummary = { id: string; kind: string; title: string; status: string };
export function ExamWorkspace({ locale, records, student = false, canCreate = true }: { locale: AssessmentLocale; records?: RecordSummary[]; student?: boolean; canCreate?: boolean }) {
  const t = examCopy(locale);
  const [exams, setExams] = useState<Exam[]>([]);
  const [availableRecords, setAvailableRecords] = useState<RecordSummary[]>(records ?? []);
  const [allowedCreate, setAllowedCreate] = useState(Boolean(records) && canCreate);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paperId, setPaperId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [roster, setRoster] = useState<Array<{ id: string; fullName: string; rollNo: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/school-ai/exams", { cache: "no-store" }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setExams(payload.exams);
      if (!student && !records) {
        const papersResponse = await fetch("/api/school-ai/workspace?kind=PAPER&status=APPROVED&limit=100", { cache: "no-store" });
        const papers = await papersResponse.json();
        if (!papersResponse.ok) throw new Error(typeof papers.error === "string" ? papers.error : t.failure);
        setAvailableRecords(papers.records); setAllowedCreate(Boolean(papers.capabilities?.canCreate));
      } else if (records) { setAvailableRecords(records); setAllowedCreate(canCreate); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setLoading(false); }
  }, [t.failure, student, records, canCreate]);
  useEffect(() => { void refresh(); }, [refresh]);
  const loadRoster = async () => {
    if (!paperId) { setError(t.selectPaper); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/school-ai/exams?paperId=${encodeURIComponent(paperId)}`); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setRoster(payload.students); setSelected([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected.length) { setError(t.missingStudents); return; }
    setBusy(true); setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/school-ai/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paperId, title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), studentIds: selected, mode: "STANDARD", idempotencyKey: requestId.current }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setPaperId(""); setTitle(""); setRoster([]); setSelected([]); requestId.current = null; await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  return <section dir={locale === "en" ? "ltr" : "rtl"} className="space-y-5"><header className="space-y-2"><h2 className="text-xl font-bold">{t.title}</h2><p className="text-sm text-ink-subtle">{t.intro}</p></header><div className="sk-panel space-y-2 p-4 text-sm"><p>{t.browserNotice}</p>{!student && <p className="text-ink-subtle">{t.unavailable}</p>}</div>{error && <p role="alert" className="sk-panel p-4 text-status-error-text">{error}</p>}
    {!student && canCreate && allowedCreate && <form onSubmit={create} className="sk-panel space-y-4 p-5"><fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><FormField name="assign-paper" label={t.paper}><Select required value={paperId} onChange={(event) => { setPaperId(event.target.value); setRoster([]); setSelected([]); requestId.current = null; }}><option value="">{t.choose}</option>{availableRecords.filter((record) => record.kind === "PAPER" && record.status === "APPROVED").map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</Select></FormField><FormField name="assign-title" label={t.name}><Input required maxLength={240} value={title} onChange={(event) => { setTitle(event.target.value); requestId.current = null; }} /></FormField><FormField name="assign-start" label={t.starts}><Input type="datetime-local" required value={startsAt} onChange={(event) => { setStartsAt(event.target.value); requestId.current = null; }} /></FormField><FormField name="assign-end" label={t.ends}><Input type="datetime-local" required value={endsAt} onChange={(event) => { setEndsAt(event.target.value); requestId.current = null; }} /></FormField></div><Button variant="outline" disabled={!paperId} onClick={loadRoster}>{t.roster}</Button>{roster.length > 0 && <fieldset className="space-y-2"><legend className="mb-2 font-semibold">{t.students}</legend><label className="flex min-h-11 items-center gap-3"><Checkbox checked={selected.length === roster.length} onChange={(event) => { setSelected(event.target.checked ? roster.map((student) => student.id) : []); requestId.current = null; }} />{t.selectAll}</label><div className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">{roster.map((student) => <label key={student.id} className="flex min-h-11 items-center gap-3"><Checkbox checked={selected.includes(student.id)} onChange={(event) => { setSelected((previous) => event.target.checked ? [...previous, student.id] : previous.filter((id) => id !== student.id)); requestId.current = null; }} /><span>{student.fullName} · {student.rollNo}</span></label>)}</div></fieldset>}<Button type="submit" disabled={!selected.length}>{t.assign}</Button></fieldset></form>}
    <div className="flex justify-end"><Button variant="outline" disabled={loading || busy} onClick={refresh}>{t.refresh}</Button></div>{loading ? <Skeleton className="h-40 w-full" /> : exams.length ? <div className="grid gap-4 md:grid-cols-2">{exams.map((exam) => <article key={exam.id} className="sk-panel space-y-3 p-5"><h3 className="font-bold">{exam.title}</h3><p className="text-sm text-ink-subtle">{new Date(exam.startsAt).toLocaleString(locale)} – {new Date(exam.endsAt).toLocaleString(locale)}</p>{exam._count && <p className="text-sm">{t.count}: {exam._count.attempts}</p>}<Link className={buttonVariants({ variant: "outline" })} href={`/ai/exams/${exam.id}`}>{student ? t.open : t.review}</Link></article>)}</div> : <p className="sk-panel p-6 text-center text-ink-subtle">{t.empty}</p>}
  </section>;
}
