"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { TeachingLineView } from "@/lib/school-ai/teaching-progress-service";
import type { TimetableSlot } from "@/components/teacher/today-schedule";
import { Isolated } from "./space-state";

/**
 * SKO-500: "Where did you reach?" on Today. For each class and subject taught so far today (at most
 * four), the next untaught outcome with one button that moves the Teaching Line by exactly one,
 * dated today. Everything else (backdating, moving back, jumps) stays on the Syllabus Map.
 */
const MAX_LESSONS = 4;
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

type Lesson = { key: string; subjectId: string; classId: string; label: string };

export function TeachingLinePrompt({ slots }: { slots: readonly TimetableSlot[] }) {
  const { language } = useLocale();
  const t = studioHomeCopy(language);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const lessons = useMemo<Lesson[]>(() => {
    const now = new Date(); const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const seen = new Map<string, Lesson>();
    for (const slot of [...slots].sort((a, b) => minutes(b.startTime) - minutes(a.startTime))) {
      if (!slot.subject || minutes(slot.startTime) > nowMinutes) continue;
      const key = `${slot.subject.id}:${slot.classId}`;
      if (!seen.has(key)) seen.set(key, { key, subjectId: slot.subject.id, classId: slot.classId, label: `${slot.subject.name} · ${slot.className}${slot.classSection ? ` ${slot.classSection}` : ""}` });
    }
    return [...seen.values()].slice(0, MAX_LESSONS);
  }, [slots]);
  const [lines, setLines] = useState<Record<string, TeachingLineView | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    const entries = await Promise.all(lessons.map(async lesson => {
      const response = await fetch(`/api/school-ai/teaching-progress?subjectId=${encodeURIComponent(lesson.subjectId)}&classId=${encodeURIComponent(lesson.classId)}`, { cache: "no-store" }).catch(() => null);
      const payload = response?.ok ? await response.json().catch(() => null) : null;
      return [lesson.key, (payload?.line as TeachingLineView | undefined) ?? null] as const;
    }));
    setLines(Object.fromEntries(entries));
  }, [lessons]);
  useEffect(() => { if (lessons.length) void load(); }, [lessons, load]);

  const markNext = async (lesson: Lesson, view: TeachingLineView, outcome: { id: string; title: string }) => {
    setBusy(lesson.key); setNotice(null);
    const response = await fetch("/api/school-ai/teaching-progress/line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ curriculumId: view.curriculum!.id, curriculumVersion: view.curriculum!.version, subjectId: lesson.subjectId, classId: lesson.classId, upToOutcomeId: outcome.id, taughtOn: localToday() }) }).catch(() => null);
    setBusy(null);
    setNotice(response?.ok ? { tone: "success", text: fillStudioCopy(t.reachDone, [outcome.title]) } : { tone: "danger", text: t.reachFailed });
    await load();
  };

  const rows = lessons.map(lesson => ({ lesson, view: lines[lesson.key] })).filter(row => row.view && row.view.canMove);
  if (!rows.length) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" aria-labelledby="teaching-line-prompt-title" data-teaching-line-prompt>
    <header className="space-y-1">
      <h2 id="teaching-line-prompt-title" className="flex items-center gap-2 text-lg font-bold"><BookOpenCheck aria-hidden="true" className="size-5 text-primary" />{t.reachTitle}</h2>
      <p className="text-sm text-ink-muted">{t.reachIntro}</p>
    </header>
    {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    <ul className="grid gap-2 md:grid-cols-2">
      {rows.map(({ lesson, view }) => {
        const flat = view!.units.flatMap(unit => unit.outcomes);
        const next = flat.find(outcome => !outcome.taught);
        return <li key={lesson.key} className="space-y-2 rounded-xl border border-border-subtle bg-surface-subtle p-3">
          <p className="font-semibold"><Isolated>{lesson.label}</Isolated></p>
          {!view!.curriculum ? <p className="text-sm text-ink-muted">{t.reachNoSyllabus}</p>
            : !next ? <p className="text-sm text-ink-muted">{t.reachAllTaught}</p>
            : <>
              <p className="text-sm">{fillStudioCopy(t.reachNext, [next.title])}</p>
              {view!.lastTaughtOn ? <p className="text-xs text-ink-subtle">{fillStudioCopy(t.reachLast, [date(view!.lastTaughtOn)])}</p> : null}
            </>}
          <div className="flex flex-wrap gap-2">
            {view!.curriculum && next ? <Button type="button" size="sm" loading={busy === lesson.key} disabled={Boolean(busy)} onClick={() => void markNext(lesson, view!, next)}><Check aria-hidden="true" />{t.reachTaught}</Button> : null}
            <Link href="/ai/studio#space=brief" className={buttonVariants({ size: "sm", variant: "ghost" })}>{t.reachOpenMap}</Link>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
