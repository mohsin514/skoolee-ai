"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-418: Today. One next action, then a short list. Times are the school's (its timezone is named), the
// day switch moves in school days, and a closed day shows upcoming work calmly instead of an attendance
// warning. States come from each source: a card links to its workflow and nothing here marks it done.
// The last good view is kept on this device and, when a refresh fails, shown with its refresh time; it
// never claims a submission it did not see.

type Ui = ReturnType<typeof useUiText>;
type Lesson = { id: string; startTime: string; endTime: string; kind: string; subject: string | null; teacher: string | null; room: string | null };
type Work = { id: string; title: string; state: string; dueAt: string; extended: boolean; overdue: boolean; canSubmit: boolean; draftSavedAt: string | null; href: string };
type Today = {
  day: string; today: string; timezone: string; clock: string | null; schoolDay: boolean; closure: { kind: "HOLIDAY" | "WEEKEND"; name: string | null } | null;
  cycle: { label: string } | null; timetableVersion: number | null; lessons: Lesson[]; current: Lesson | null; next: Lesson | null;
  examLock: boolean; activeExam: { title: string; href: string } | null;
  nextAction: { kind: string; title: string; href: string; dueAt?: string } | null;
  work: Work[]; upcomingExams: { id: string; title: string; startsAt: string; href: string }[]; returned: { id: string; title: string; returnedAt: string; href: string }[]; refreshedAt: string;
};
const KEY = "skoolee.student.today";
const store = { get: () => { try { return window.localStorage.getItem(KEY); } catch { return null; } }, set: (v: string) => { try { window.localStorage.setItem(KEY, v); } catch { /* no storage: still works online */ } } };
const shift = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const stateLabel = (ui: Ui, state: string) => ({ OPEN: ui("Not started"), DRAFT: ui("Draft saved"), REOPENED: ui("Revision open"), SUBMITTED: ui("Submitted"), RETURNED: ui("Feedback returned"), CLOSED: ui("Closed") } as Record<string, string>)[state] ?? state;
const actionLabel = (ui: Ui, kind: string) => ({ RESUME_EXAM: ui("Resume your exam"), CONTINUE_DRAFT: ui("Continue your saved draft"), OVERDUE: ui("Past due — still accepted"), DUE_TODAY: ui("Due today"), NEXT_DUE: ui("Next due") } as Record<string, string>)[kind] ?? kind;

export function StudentToday() {
  const ui = useUiText();
  const { dateTime, date } = useLocaleFormat();
  const [day, setDay] = useState<string | null>(null);
  const [examUrl, setExamUrl] = useState<string | null>(null);
  const [data, setData] = useState<Today | null>(null), [stale, setStale] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const load = useCallback(async (requested: string | null) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/student/today${requested ? `?day=${requested}` : ""}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      // The exam boundary answers for Today while an attempt runs: offer only the way back into it.
      if (response.status === 409 && json.code === "EXAM_SESSION_ACTIVE" && typeof json.examUrl === "string") { setExamUrl(json.examUrl); setData(null); setStale(false); return; }
      if (!response.ok || !json.success) throw new Error(json.error || "Today could not be refreshed.");
      setExamUrl(null);
      setData(json.data); setStale(false);
      if (!requested) store.set(JSON.stringify(json.data));
    } catch (failure) {
      const saved = !requested ? store.get() : null;
      if (saved) { try { setData(JSON.parse(saved)); setStale(true); } catch { /* ignore a corrupt copy */ } }
      setError(ui(failure instanceof Error ? failure.message : "Today could not be refreshed."));
    } finally { setLoading(false); }
  }, [ui]);
  useEffect(() => { void load(day); }, [load, day]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(day); }; window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh); return () => { window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); }; }, [load, day]);

  const isToday = data ? data.day === data.today : true;
  return <section className="sk-panel space-y-4 p-5" aria-labelledby="today-heading" data-student-today data-day={data?.day ?? ""} data-school-day={data ? String(data.schoolDay) : ""}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="today-heading" className="text-lg font-black">{isToday ? ui("Today") : <bdi>{data ? date(data.day) : ""}</bdi>}</h2>
        {data ? <p className="text-xs text-ink-muted" data-today-context>{data.clock ? <>{ui("School time")}{" "}<bdi>{data.clock}</bdi> · </> : null}<bdi>{data.timezone}</bdi>{data.cycle ? <> · {ui("Academic year")}{" "}<bdi>{data.cycle.label}</bdi></> : null}</p> : null}
      </div>
      <nav className="flex items-center gap-1" aria-label={ui("Choose a day")}>
        <Button size="sm" variant="outline" disabled={!data || loading} onClick={() => data && setDay(shift(data.day, -1))} data-day-prev>{ui("Previous day")}</Button>
        {!isToday ? <Button size="sm" variant="secondary" onClick={() => setDay(null)} data-day-today>{ui("Today")}</Button> : null}
        <Button size="sm" variant="outline" disabled={!data || loading} onClick={() => data && setDay(shift(data.day, 1))} data-day-next>{ui("Next day")}</Button>
      </nav>
    </header>
    {error ? <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" data-today-error>{stale && data ? ui("We could not refresh Today. Showing the view from {0}.", [dateTime(data.refreshedAt)]) : error} <button type="button" className="font-semibold underline" onClick={() => void load(day)}>{ui("Try again")}</button></p> : null}
    {examUrl ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4" data-next-action="RESUME_EXAM">
      <p className="text-[11px] font-black uppercase tracking-wider text-rose-800">{actionLabel(ui, "RESUME_EXAM")}</p>
      <p className="mt-1 text-sm text-rose-900">{ui("Your exam is in progress. Other work and help are hidden until you finish it.")}</p>
      <Link href={examUrl} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#8127cf] px-4 text-sm font-bold text-white" data-next-action-link>{ui("Resume exam")}</Link>
    </div> : null}
    {!data && !examUrl && loading ? <p className="text-sm text-ink-muted" aria-busy="true">{ui("Loading Today…")}</p> : null}
    {data ? <>
      {data.nextAction ? <div className={cn("rounded-2xl border p-4", data.examLock ? "border-rose-200 bg-rose-50" : "border-[#8127cf]/20 bg-[#fbf0fe]")} data-next-action={data.nextAction.kind}>
        <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">{actionLabel(ui, data.nextAction.kind)}</p>
        <p className="mt-1 text-base font-black [overflow-wrap:anywhere]" dir="auto">{data.nextAction.title}</p>
        {data.nextAction.dueAt ? <p className="text-xs text-ink-muted">{ui("Due (school time)")}{" "}<bdi>{dateTime(data.nextAction.dueAt)}</bdi></p> : null}
        <Link href={data.nextAction.href} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#8127cf] px-4 text-sm font-bold text-white" data-next-action-link>{data.nextAction.kind === "RESUME_EXAM" ? ui("Resume exam") : ui("Open")}</Link>
        {data.examLock ? <p className="mt-2 text-xs text-rose-800">{ui("Your exam is in progress. Other work and help are hidden until you finish it.")}</p> : null}
      </div> : <p className="rounded-2xl border border-dashed p-4 text-sm text-ink-muted" data-next-action="NONE">{data.returned.length ? ui("No new work is due. Review feedback when you are ready.") : ui("No work is due. Enjoy the day.")}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="today-lessons" data-today-lessons={data.lessons.length}>
          <h3 id="today-lessons" className="text-sm font-black">{ui("Lessons")}{data.timetableVersion ? <span className="ms-2 text-[10px] font-semibold text-ink-muted">{ui("Timetable version {0}", [String(data.timetableVersion)])}</span> : null}</h3>
          {!data.schoolDay ? <p className="mt-2 text-sm text-ink-muted" data-today-closed={data.closure?.kind}>{data.closure?.kind === "HOLIDAY" ? <>{ui("No school:")}{" "}<bdi>{data.closure.name}</bdi></> : ui("No school today. Upcoming work is below.")}</p>
            : data.lessons.length === 0 ? <p className="mt-2 text-sm text-ink-muted">{ui("No lessons are published for this day.")}</p>
            : <ol className="mt-2 space-y-1">{data.lessons.map(lesson => <li key={lesson.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-sm", data.current?.id === lesson.id && "bg-emerald-50", data.next?.id === lesson.id && "bg-[#f3f4f9]")} data-lesson={lesson.id} data-lesson-now={data.current?.id === lesson.id ? "current" : data.next?.id === lesson.id ? "next" : undefined}>
                <span className="w-24 tabular-nums text-ink-muted"><bdi>{lesson.startTime}–{lesson.endTime}</bdi></span>
                <span className="font-bold" dir="auto">{lesson.kind === "CLASS" ? lesson.subject ?? ui("Free period") : ui("Break")}</span>
                {lesson.room ? <span className="text-xs text-ink-muted">{ui("Room")}{" "}<bdi>{lesson.room}</bdi></span> : null}
                {data.current?.id === lesson.id ? <span className="text-[10px] font-black uppercase text-emerald-700">{ui("Now")}</span> : data.next?.id === lesson.id ? <span className="text-[10px] font-black uppercase text-[#8127cf]">{ui("Next")}</span> : null}
              </li>)}</ol>}
        </section>
        {!data.examLock ? <section aria-labelledby="today-work" data-today-work={data.work.length}>
          <h3 id="today-work" className="text-sm font-black">{ui("Work")}</h3>
          {data.work.length === 0 ? <p className="mt-2 text-sm text-ink-muted">{ui("Nothing open.")}</p> : <ul className="mt-2 space-y-1">{data.work.slice(0, 6).map(item => <li key={item.id} data-work={item.id} data-work-state={item.state}>
            <Link href={item.href} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[#f3f4f9]">
              <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]" dir="auto">{item.title}</span>
              <span className="text-xs text-ink-muted">{stateLabel(ui, item.state)} · <bdi>{dateTime(item.dueAt)}</bdi>{item.extended ? <> · {ui("Extended for you")}</> : null}</span>
              {item.overdue ? <span className="text-[10px] font-black uppercase text-rose-700">{item.canSubmit ? ui("Past due") : ui("Closed for submission")}</span> : null}
            </Link>
          </li>)}</ul>}
          {data.upcomingExams.length ? <><h4 className="mt-3 text-xs font-black uppercase text-ink-muted">{ui("Upcoming exams")}</h4><ul className="space-y-1">{data.upcomingExams.map(exam => <li key={exam.id} className="text-sm" data-upcoming-exam={exam.id}><span dir="auto">{exam.title}</span> · <bdi>{dateTime(exam.startsAt)}</bdi></li>)}</ul></> : null}
          {data.returned.length ? <><h4 className="mt-3 text-xs font-black uppercase text-ink-muted">{ui("Feedback to read")}</h4><ul className="space-y-1">{data.returned.map(item => <li key={item.id} data-returned={item.id}><Link href={item.href} className="text-sm underline" dir="auto">{item.title}</Link></li>)}</ul></> : null}
        </section> : null}
      </div>
      <p className="text-[10px] text-ink-muted" data-today-refreshed>{ui("Updated")}{" "}<bdi>{dateTime(data.refreshedAt)}</bdi>{stale ? <> · {ui("offline copy")}</> : null}</p>
    </> : null}
  </section>;
}
