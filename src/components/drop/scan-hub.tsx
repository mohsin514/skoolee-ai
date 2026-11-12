"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RotateCcw, ScanLine, XCircle } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice-card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SmartUpload } from "@/components/ui/smart-upload";
import { TaskLoading } from "@/components/ui/task-patterns";
import { inspect } from "@/components/marks/mark-scan-panel";
import { Input } from "@/components/ui/input";
import { STUDENT_DOCUMENT_KINDS } from "@/lib/students/document-policy";
import { uploadStudentDocument } from "@/lib/students/document-upload";
import { useConsoleAccess } from "@/components/nav/ViewGate";

/**
 * SKAI-1851: scan anything. Photograph or upload sheets (here, or from a phone) and Skoolee files each one:
 * - a page carrying a printed marks-sheet QR goes into that sheet's open scan, ready for review and import;
 * - other pages become one School AI source (exam paper or quiz, syllabus, or other), read by the usual
 *   extraction and waiting for review. Nothing reaches marks or a paper without the existing review steps.
 */
type Subject = { id: string; name: string; classId: string; className: string; campusId: string };
type Outcome = { tone: "ok" | "error"; text: string; href?: string; link?: string };
type Kind = "paper" | "syllabus" | "other" | "student";
type Pupil = { id: string; fullName: string; rollNo?: string | null };
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "REQUEST_FAILED");
  return (body.data ?? body) as T;
}

export function ScanHub() {
  const ui = useUiText(), { language } = useLocale(), reviewable = useConsoleAccess().has("planMarkScan");
  const [subjects, setSubjects] = useState<Subject[]>([]), [subjectId, setSubjectId] = useState("");
  const [busy, setBusy] = useState(""), [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [rest, setRest] = useState<File[]>([]), [kind, setKind] = useState<Kind>("paper");
  // SKAI-1890: filing pages as a student document is offered only to staff who can read the roster.
  const [canStudents, setCanStudents] = useState(false), [query, setQuery] = useState(""), [pupils, setPupils] = useState<Pupil[]>([]);
  const [pupilId, setPupilId] = useState(""), [docKind, setDocKind] = useState<string>("OTHER");
  useEffect(() => { void fetch("/api/students?fields=picker&limit=1", { cache: "no-store" }).then(r => setCanStudents(r.ok)).catch(() => setCanStudents(false)); }, []);
  useEffect(() => {
    if (kind !== "student" || query.trim().length < 2) { setPupils([]); return; }
    const timer = setTimeout(() => void json<Pupil[]>(`/api/students?fields=picker&limit=20&search=${encodeURIComponent(query.trim())}`).then(list => { setPupils(list); setPupilId(list.length === 1 ? list[0].id : ""); }).catch(() => setPupils([])), 300);
    return () => clearTimeout(timer);
  }, [kind, query]);

  useEffect(() => {
    void json<{ capabilities?: { subjects?: Subject[] } }>("/api/school-ai/workspace").then(data => {
      const list = data.capabilities?.subjects ?? [];
      setSubjects(list); if (list.length === 1) setSubjectId(list[0].id);
    }).catch(() => setSubjects([]));
  }, []);

  /** Sort the pages: marks-sheet pages go to their scan at once; everything else waits for "What is this?". */
  const take = async (files: File[]) => {
    setOutcomes([]); setBusy(ui("Reading the pages…"));
    const others: File[] = [], done: Outcome[] = [], batches = new Map<string, { id: string; examId: string }>();
    for (const file of files) {
      const info = file.type.startsWith("image/") ? await inspect(file).catch(() => null) : null;
      if (!info?.qr) { others.push(file); continue; }
      const page = info.qr.split(":")[2] ?? "?";
      try {
        const reference = info.qr.split(":")[1];
        if (!batches.has(reference)) batches.set(reference, await json("/api/marks-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", qr: info.qr }) }));
        const batch = batches.get(reference)!;
        const result = await json<{ status: string }>(`/api/marks-scan/${batch.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "page", qr: info.qr, image: info.image, contentType: info.contentType, sharpness: info.quality.sharpness, contrast: info.quality.contrast }) });
        done.push(result.status === "RETAKE"
          ? { tone: "error", text: ui("Marks sheet page {0} is too blurred or faint. Retake it.", [page]) }
          : reviewable ? { tone: "ok", text: ui("Marks sheet page {0} added to its scan.", [page]), href: `/teacher/marks?examId=${encodeURIComponent(batch.examId)}&scan=1`, link: ui("Review marks") }
          : { tone: "ok", text: ui("Marks sheet page {0} added to its scan. Reviewing scanned marks is not part of your school's plan.", [page]) });
      } catch (error) { done.push({ tone: "error", text: `${ui("Marks sheet page {0}", [page])}: ${ui(error instanceof Error ? error.message : "The change was not saved.")}` }); }
    }
    setOutcomes(done); setRest(others); setBusy("");
  };

  /** Join photographed pages into one PDF, then save it as a School AI source for extraction and review. */
  const createSource = async () => {
    const subject = subjects.find(item => item.id === subjectId);
    setBusy(ui("Creating it in Skoolee…"));
    try {
      let file = rest[0];
      if (rest.length > 1) {
        if (rest.some(item => !["image/jpeg", "image/png"].includes(item.type))) throw new Error(ui("Choose one PDF, or several JPEG or PNG page photos."));
        const pages = new FormData(); pages.set("documentKind", kind === "student" ? "other" : kind);
        if (subject) { pages.set("subjectId", subject.id); pages.set("classId", subject.classId); pages.set("campusId", subject.campusId); }
        rest.forEach(item => pages.append("pages", item));
        const response = await fetch("/api/school-ai/scan", { method: "POST", body: pages });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "");
        file = new File([await response.blob()], `scanned-${kind}-${rest.length}-pages.pdf`, { type: "application/pdf" });
      }
      if (kind === "student") {
        const pupil = pupils.find(item => item.id === pupilId);
        await uploadStudentDocument({ studentId: pupilId, kind: docKind, file });
        setOutcomes(current => [...current, { tone: "ok", text: ui("Saved to the documents of {0}.", [pupil?.fullName ?? ""]) }]);
        setRest([]); return;
      }
      const form = new FormData();
      form.set("file", file); form.set("documentKind", kind); form.set("language", language); form.set("origin", "camera");
      if (subject) { form.set("subjectId", subject.id); form.set("classId", subject.classId); form.set("campusId", subject.campusId); }
      const { record } = await json<{ record: { id: string } }>("/api/school-ai/intake", { method: "POST", body: form });
      setOutcomes(current => [...current, { tone: "ok", text: kind === "paper" ? ui("Saved as an exam paper source. Skoolee is reading it; review the questions, then create the paper in Exam Studio.") : ui("Saved as a source. Skoolee is reading it; review the text before it is used."), href: `/ai#source-${record.id}`, link: ui("Review source") }]);
      setRest([]);
    } catch (error) { setOutcomes(current => [...current, { tone: "error", text: error instanceof Error && error.message ? ui(error.message) : ui("It could not be saved. Try again.") }]); }
    finally { setBusy(""); }
  };

  const needsSubject = (kind === "paper" || kind === "syllabus") && subjects.length > 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Scan sheets" description="Photograph or upload any school paper. Printed Skoolee marks sheets are matched by their QR; papers, quizzes and syllabi are read and saved for your review." icon={ScanLine} />
      {busy ? <TaskLoading label={busy} /> : !rest.length && <SmartUpload accept={ACCEPT} multiple maxFiles={20} label={ui("Scan sheets")} hint={ui("Up to 20 pages. Photos of one paper are joined into one PDF.")} onFiles={files => void take(files)} />}

      {outcomes.length > 0 && <ul className="space-y-2" aria-live="polite">{outcomes.map((row, index) => (
        <li key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-subtle p-3 text-sm">
          {row.tone === "ok" ? <CheckCircle2 aria-hidden="true" className="size-4 text-status-success-text" /> : <XCircle aria-hidden="true" className="size-4 text-status-error-text" />}
          <span className="min-w-0 flex-1">{row.text}</span>
          {row.href && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={row.href}>{row.link}</Link>}
        </li>))}</ul>}

      {rest.length > 0 && !busy && (
        <section className="space-y-4 rounded-2xl border border-border p-4" aria-labelledby="scan-kind">
          <h2 id="scan-kind" className="text-base font-semibold text-ink">{ui("What are these {0} pages?", [rest.length])}</h2>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ChoiceCard shape="radio" selected={kind === "paper"} onSelect={() => setKind("paper")} option={{ value: "paper", label: ui("Exam paper or quiz"), detail: ui("Questions are read so you can build a paper.") }} />
            <ChoiceCard shape="radio" selected={kind === "syllabus"} onSelect={() => setKind("syllabus")} option={{ value: "syllabus", label: ui("Syllabus"), detail: ui("Topics and outcomes for the subject.") }} />
            <ChoiceCard shape="radio" selected={kind === "other"} onSelect={() => setKind("other")} option={{ value: "other", label: ui("Something else"), detail: ui("Kept as a source for later use.") }} />
            {canStudents && <ChoiceCard shape="radio" selected={kind === "student"} onSelect={() => setKind("student")} option={{ value: "student", label: ui("Student document"), detail: ui("A certificate or form saved to a pupil's record.") }} />}
          </div>
          {needsSubject && <Select aria-label={ui("Subject and class")} value={subjectId} onChange={event => setSubjectId(event.target.value)}>
            <option value="">{ui("Choose a subject and class")}</option>
            {subjects.map(item => <option key={item.id} value={item.id}>{item.name} · {item.className}</option>)}
          </Select>}
          <div className="flex flex-wrap gap-2">
          {kind === "student" && <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label={ui("Search pupils by name or roll number")} placeholder={ui("Search pupils by name or roll number")} value={query} onChange={event => setQuery(event.target.value)} />
            <Select aria-label={ui("Pupil")} value={pupilId} onChange={event => setPupilId(event.target.value)}>
              <option value="">{pupils.length ? ui("Choose a pupil") : ui("Type at least two letters")}</option>
              {pupils.map(item => <option key={item.id} value={item.id}>{item.fullName}{item.rollNo ? ` · ${item.rollNo}` : ""}</option>)}
            </Select>
            <Select aria-label={ui("Document type")} value={docKind} onChange={event => setDocKind(event.target.value)}>
              {STUDENT_DOCUMENT_KINDS.map(item => <option key={item} value={item}>{ui(({ BIRTH_CERTIFICATE: "Birth certificate", TRANSFER_CERTIFICATE: "Transfer certificate", PHOTO: "Photo", OTHER: "Other" } as Record<string, string>)[item] ?? item)}</option>)}
            </Select>
          </div>}
            <Button type="button" disabled={(needsSubject && !subjectId) || (kind === "student" && !pupilId)} onClick={() => void createSource()}><CheckCircle2 aria-hidden="true" />{ui("Create in Skoolee")}</Button>
            <Button type="button" variant="ghost" onClick={() => setRest([])}><RotateCcw aria-hidden="true" />{ui("Start over")}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
