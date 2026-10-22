"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BookOpenCheck, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { cn } from "@/lib/utils";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSyllabusCopy } from "@/lib/school-ai/exam-studio-copy-syllabus";
import type { TeachingLineView } from "@/lib/school-ai/teaching-progress-service";
import { Isolated, SpaceStateRegion, type SpaceState } from "./space-state";

/**
 * SKO-500: the Syllabus Map with the Teaching Line.
 *
 * Units run top to bottom in syllabus order, outcomes inside them. The Teaching Line sits after the
 * furthest taught outcome. The teacher moves it three ways, all equivalent: drag the handle, focus
 * it and use the arrow keys (Home and End jump to the ends), or press "Taught up to here" on an
 * outcome. Nothing is saved until Save, which records the date (today by default, earlier allowed).
 * The line never shrinks or grows the approved syllabus: it writes dated progress beside it.
 */
type Flat = { id: string; title: string; page: string; unit: string; taught: boolean; taughtOn: string | null };

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export function SyllabusMap({ language, subjectId, classId, subjectLabel, onChanged }: { language: Language; subjectId: string; classId: string; subjectLabel: string; onChanged?: () => void }) {
  const t = studioSyllabusCopy(language);
  const number = useCallback((value: number) => new Intl.NumberFormat(language).format(value), [language]);
  const date = useCallback((value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)), [language]);
  const [state, setState] = useState<SpaceState<TeachingLineView>>({ kind: "loading" });
  const [pending, setPending] = useState<number | null>(null);
  const [taughtOn, setTaughtOn] = useState(localToday);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState(false);
  // The handle re-mounts at its new position, so a keyboard move hands focus to the new handle.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    listRef.current?.querySelector<HTMLElement>("[data-teaching-line]")?.focus();
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/school-ai/teaching-progress?subjectId=${encodeURIComponent(subjectId)}&classId=${encodeURIComponent(classId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) { setState({ kind: "permission", required: "AUTHOR_ITEM" }); return; }
      if (!response.ok) { setState({ kind: "error", reason: typeof payload.error === "string" ? payload.error : t.failed, retry: () => void load() }); return; }
      setState({ kind: "ready", data: payload.line });
      setPending(null);
    } catch { setState({ kind: "error", reason: t.failed, retry: () => void load() }); }
  }, [subjectId, classId, t.failed]);
  useEffect(() => { void load(); }, [load]);

  const view = state.kind === "ready" ? state.data : null;
  const flat = useMemo<Flat[]>(() => view ? view.units.flatMap(unit => unit.outcomes.map(outcome => ({ ...outcome, unit: unit.unit }))) : [], [view]);
  // Index of the last outcome above the line; -1 is "before anything".
  const savedIndex = useMemo(() => view?.linePosition ? flat.findIndex(row => row.id === view.linePosition) : -1, [view, flat]);
  const index = pending ?? savedIndex;
  const forward = flat.slice(0, index + 1).filter(row => !row.taught).length;
  const back = flat.slice(index + 1).filter(row => row.taught && row.taughtOn).length;
  const unitsCrossed = new Set(flat.slice(0, index + 1).filter(row => !row.taught).map(row => row.unit)).size;
  const dirty = pending !== null && pending !== savedIndex;

  const move = (next: number) => { if (!view?.canMove) return; setPending(Math.max(-1, Math.min(flat.length - 1, next))); setNotice(null); };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // The list runs top to bottom in every language, so Down/Up are the natural keys; Right/Left
    // follow the reading direction (Right is "further" in English, Left is "further" in Arabic and Urdu).
    const further = language === "en" ? "ArrowRight" : "ArrowLeft", back = language === "en" ? "ArrowLeft" : "ArrowRight";
    const keys: Record<string, number | "home" | "end"> = { ArrowDown: 1, ArrowUp: -1, [further]: 1, [back]: -1, Home: "home", End: "end", PageDown: 5, PageUp: -5 };
    const step = keys[event.key];
    if (step === undefined) return;
    event.preventDefault();
    refocus.current = true;
    move(step === "home" ? -1 : step === "end" ? flat.length - 1 : index + step);
  };
  // Dragging reads the outcome row under the pointer; the line goes after it.
  const onPointerMove = (event: PointerEvent<HTMLOListElement>) => {
    if (!dragging || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>("[data-outcome-index]")];
    let target = -1;
    for (const row of rows) { const box = row.getBoundingClientRect(); if (event.clientY >= box.top + box.height / 2) target = Number(row.dataset.outcomeIndex); }
    move(target);
  };

  const save = async () => {
    if (!view?.curriculum || pending === null) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/school-ai/teaching-progress/line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, classId, curriculumId: view.curriculum.id, curriculumVersion: view.curriculum.version, upToOutcomeId: pending >= 0 ? flat[pending].id : null, taughtOn }) });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409 && payload.code === "TEACHING_LINE_STALE") { setNotice({ tone: "info", text: t.stale }); await load(); return; }
      if (!response.ok) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed }); return; }
      const next: TeachingLineView = payload.line;
      setState({ kind: "ready", data: next }); setPending(null);
      const at = next.linePosition ? flat.find(row => row.id === next.linePosition)?.title ?? "" : "";
      setNotice({ tone: "success", text: at ? fillStudioCopy(t.saved, [at]) : t.savedStart });
      onChanged?.();
    } catch { setNotice({ tone: "danger", text: t.failed }); }
    finally { setBusy(false); }
  };

  if (state.kind !== "ready") return <SpaceStateRegion state={state} language={language}>{() => null}</SpaceStateRegion>;
  if (!view!.curriculum) return <TaskFeedback kind="empty" title={t.noCurriculum}><p>{fillStudioCopy(t.noCurriculumHint, [subjectLabel])}</p></TaskFeedback>;
  const lineData = view!;
  const position = index >= 0 ? flat[index] : null;

  return <section className="sk-panel space-y-4 p-4 sm:p-5" aria-labelledby="syllabus-map-title" data-syllabus-map>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 id="syllabus-map-title" className="flex items-center gap-2 text-lg font-bold"><BookOpenCheck aria-hidden="true" className="size-5 text-primary" />{t.mapTitle}</h3>
        <p className="text-sm text-ink-muted">{t.mapIntro}</p>
        <p className="text-xs text-ink-subtle"><Isolated>{lineData.curriculum!.title}</Isolated>{lineData.curriculum!.sharedFromClassId ? <> · {t.shared}</> : null}</p>
      </div>
      <div className="w-full max-w-56 space-y-1 text-sm">
        <Progress value={lineData.taughtCount} max={Math.max(1, lineData.totalCount)} label={fillStudioCopy(t.progress, [number(lineData.taughtCount), number(lineData.totalCount)])} tone="brand" size="sm" />
        <p className="text-xs text-ink-muted">{fillStudioCopy(t.progress, [number(lineData.taughtCount), number(lineData.totalCount)])}</p>
        {lineData.lastTaughtOn ? <p className="text-xs text-ink-subtle">{fillStudioCopy(t.lastTaught, [date(lineData.lastTaughtOn)])}</p> : lineData.taughtCount === 0 ? <p className="text-xs text-ink-subtle">{t.nothingTaught}</p> : null}
      </div>
    </header>
    {!lineData.canMove && <Alert tone="info" compact>{t.readOnly}</Alert>}
    {notice && <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert>}

    <ol ref={listRef} className={cn("relative space-y-1", dragging && "touch-none select-none")} onPointerMove={onPointerMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onPointerLeave={() => setDragging(false)}>
      {index < 0 && <LineHandle label={t.lineLabel} hint={t.lineHint} position={t.start} canMove={lineData.canMove} index={index} max={flat.length - 1} onKey={onKey} onDragStart={() => setDragging(true)} />}
      {flat.map((row, rowIndex) => {
        const above = rowIndex <= index;
        const newUnit = rowIndex === 0 || flat[rowIndex - 1].unit !== row.unit;
        return <li key={row.id} className="list-none">
          {newUnit && <p className="mb-1 mt-3 text-xs font-semibold text-ink-subtle first:mt-0"><Isolated>{row.unit || t.unit}</Isolated></p>}
          <div data-outcome-index={rowIndex} data-taught={above || undefined} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors", above ? "border-primary/30 bg-brand-50" : "border-border-subtle bg-surface")}>
            <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", above ? "bg-primary" : "bg-border-subtle")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium"><Isolated>{row.title}</Isolated></p>
              <p className="text-2xs text-ink-subtle">{row.page ? fillStudioCopy(t.page, [row.page]) : null}{row.page ? " · " : ""}{row.taught && row.taughtOn && rowIndex <= savedIndex ? fillStudioCopy(t.taughtOn, [date(row.taughtOn)]) : above ? t.taughtUndated : t.notYet}</p>
            </div>
            {lineData.canMove && rowIndex !== index && <Button type="button" size="sm" variant="ghost" onClick={() => move(rowIndex)} aria-label={`${t.upToHere}: ${row.title}`}>{t.upToHere}</Button>}
          </div>
          {rowIndex === index && <LineHandle label={t.lineLabel} hint={t.lineHint} position={row.title} canMove={lineData.canMove} index={index} max={flat.length - 1} onKey={onKey} onDragStart={() => setDragging(true)} />}
        </li>;
      })}
    </ol>

    {dirty && <div className="sk-panel space-y-3 border-primary/30 p-4" data-line-pending>
      <p className="text-sm font-semibold">{index > savedIndex ? fillStudioCopy(t.pendingForward, [number(forward)]) : back ? fillStudioCopy(t.pendingBack, [number(back)]) : t.pendingNone}</p>
      {index > savedIndex && unitsCrossed > 1 && <p className="text-xs text-status-warning-text">{t.jumpNote}</p>}
      {index > savedIndex && <label className="grid max-w-56 gap-1 text-sm font-semibold">{t.dateLabel}<Input type="date" value={taughtOn} max={localToday()} onChange={event => setTaughtOn(event.target.value)} /><span className="text-2xs font-normal text-ink-subtle">{t.dateHint}</span></label>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" loading={busy} disabled={busy || !taughtOn} onClick={() => void save()}>{t.save}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setPending(null); setNotice(null); }}>{t.cancel}</Button>
      </div>
      {position && <p className="sr-only" aria-live="polite">{t.lineLabel}: {position.title}</p>}
    </div>}
  </section>;
}

function LineHandle({ label, hint, position, canMove, index, max, onKey, onDragStart }: { label: string; hint: string; position: string; canMove: boolean; index: number; max: number; onKey: (event: KeyboardEvent<HTMLDivElement>) => void; onDragStart: () => void }) {
  return <div
    role="slider"
    tabIndex={canMove ? 0 : -1}
    aria-label={label}
    aria-description={hint}
    aria-valuemin={-1}
    aria-valuemax={max}
    aria-valuenow={index}
    aria-valuetext={position}
    aria-readonly={!canMove || undefined}
    onKeyDown={onKey}
    onPointerDown={event => { if (!canMove) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); onDragStart(); }}
    className={cn("my-1 flex touch-none select-none items-center gap-2 rounded-full", canMove ? "cursor-grab" : "cursor-default")}
    data-teaching-line
  >
    <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-primary" />
    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground"><GripHorizontal aria-hidden="true" className="size-3" />{label}</span>
    <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-primary" />
  </div>;
}
