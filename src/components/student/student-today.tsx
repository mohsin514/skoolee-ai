"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { BookOpenCheck, ChevronRight, Clock3, MonitorCheck, NotebookPen, PartyPopper, type LucideIcon } from "lucide-react";
import { DeskPill, DeskRowIcon, RelativeTime, deskRow, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";

// SKO-418: Today. One next action, then a short list. Times are the school's (its timezone is named), the
// day switch moves in school days, and a closed day shows upcoming work calmly instead of an attendance
// warning. States come from each source: a card links to its workflow and nothing here marks it done.
// The last good view stays in this mounted, identity-scoped page and, on network failure, shows its refresh time; it
// never claims a submission it did not see.

type Ui = ReturnType<typeof useUiText>;
type Lesson = { id: string; startTime: string; endTime: string; kind: string; subject: string | null; teacher: string | null; room: string | null; cover?: boolean };
type Work = { id: string; title: string; state: string; dueAt: string; extended: boolean; overdue: boolean; canSubmit: boolean; draftSavedAt: string | null; href: string };
type Today = {
  day: string; today: string; timezone: string; clock: string | null; schoolDay: boolean; closure: { kind: "HOLIDAY" | "WEEKEND"; name: string | null } | null;
  cycle: { label: string } | null; timetableVersion: number | null; lessons: Lesson[]; current: Lesson | null; next: Lesson | null;
  examLock: boolean; activeExam: { title: string; href: string } | null;
  nextAction: { kind: string; title: string; href: string; dueAt?: string } | null;
  work: Work[]; upcomingExams: { id: string; title: string; startsAt: string; href: string }[]; returned: { id: string; title: string; returnedAt: string; href: string }[]; refreshedAt: string;
  catchUp?: { id: string; subject: string; lessonDate: string; title: string; instructions: string | null; dueDate: string | null; done: boolean }[];
};
const KEY = "skoolee.student.today";

const shift = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const stateLabel = (ui: Ui, state: string) => ({ OPEN: ui("Not started"), DRAFT: ui("Draft saved"), REOPENED: ui("Revision open"), SUBMITTED: ui("Submitted"), RETURNED: ui("Feedback returned"), CLOSED: ui("Closed") } as Record<string, string>)[state] ?? state;
const actionLabel = (ui: Ui, kind: string) => ({ RESUME_EXAM: ui("Resume your exam"), CONTINUE_DRAFT: ui("Continue your saved draft"), OVERDUE: ui("Past due — still accepted"), DUE_TODAY: ui("Due today"), NEXT_DUE: ui("Next due") } as Record<string, string>)[kind] ?? kind;

const stateTone = (item: Work): DeskTone => item.overdue ? (item.canSubmit ? "danger" : "neutral") : ({ DRAFT: "warning", REOPENED: "warning", SUBMITTED: "info", RETURNED: "success", CLOSED: "neutral" } as Record<string, DeskTone>)[item.state] ?? "brand";
const actionIcon = (kind: string): LucideIcon => ({ RESUME_EXAM: MonitorCheck, CONTINUE_DRAFT: NotebookPen, OVERDUE: Clock3 } as Record<string, LucideIcon>)[kind] ?? BookOpenCheck;

/** What the Today screen's one primary action should do ("Continue: {next action}"). */
export type StudentNextAction = { label: string; href: string } | null;

/**
 * `onNextAction` reports the learner's single next step so the page can make it the PageHeader's
 * primary action (§4.4 student · Today); it reports null when nothing is due.
 */
export function StudentToday({ onNextAction }: { onNextAction?: (action: StudentNextAction) => void } = {}) {
  const ui = useUiText();
  const { dateTime, date } = useLocaleFormat();
  const [day, setDay] = useState<string | null>(null);
  const [examUrl, setExamUrl] = useState<string | null>(null);
  const [data, setData] = useState<Today | null>(null), [stale, setStale] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const cachedToday = useRef<Today | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    // Older versions stored a shared-device copy without an identity. Never read it.
    try { window.localStorage.removeItem(KEY); } catch { /* Storage can be unavailable. */ }
  }, []);
  const load = useCallback(async (requested: string | null) => {
    const version = ++requestVersion.current;
    let mayUseCache = true;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/student/today${requested ? `?day=${requested}` : ""}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (version !== requestVersion.current) return;
      if (response.status === 409 && json.code === "EXAM_SESSION_ACTIVE" && typeof json.examUrl === "string") {
        cachedToday.current = null; setExamUrl(json.examUrl); setData(null); setStale(false); return;
      }
      mayUseCache = response.status >= 500;
      if (!response.ok || !json.success) throw new Error(json.error || "Today could not be refreshed.");
      setExamUrl(null); setData(json.data); setStale(false);
      if (!requested) cachedToday.current = json.data;
    } catch (failure) {
      if (version !== requestVersion.current) return;
      if (!mayUseCache) cachedToday.current = null;
      const saved = !requested && mayUseCache ? cachedToday.current : null;
      setData(saved); setStale(Boolean(saved)); setExamUrl(null);
      setError(ui(failure instanceof Error ? failure.message : "Today could not be refreshed."));
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [ui]);
  useEffect(() => { void load(day); return () => { requestVersion.current++; }; }, [load, day]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(day); }; window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh); return () => { window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); }; }, [load, day]);

  useEffect(() => () => onNextAction?.(null), [onNextAction]);

  const isToday = data ? data.day === data.today : true;
  useEffect(() => {
    if (!onNextAction) return;
    if (examUrl) { onNextAction({ label: ui("Resume exam"), href: examUrl }); return; }
    const next = data?.nextAction;
    onNextAction(next ? { label: ui("Continue: {0}", [next.title]), href: next.href } : null);
  }, [onNextAction, examUrl, data, ui]);
  return <section className="sk-panel space-y-4 p-5" aria-labelledby="today-heading" data-student-today data-day={data?.day ?? ""} data-school-day={data ? String(data.schoolDay) : ""}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {/* The page title already says "Today": the panel names the day it shows (and marks today), so the two never
            repeat each other and the day switch always says where it is. */}
        <h2 id="today-heading" className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink-strong">
          {data ? <bdi>{date(data.day)}</bdi> : ui("Today")}
          {data && isToday ? <span className="sk-choice-tag" data-tone="info">{ui("Today")}</span> : null}
        </h2>
        {data ? <p className="text-xs text-ink-muted" data-today-context>{data.clock ? <>{ui("School time")}{" "}<bdi>{data.clock}</bdi> · </> : null}<bdi>{data.timezone}</bdi>{data.cycle ? <> · {ui("Academic year")}{" "}<bdi>{data.cycle.label}</bdi></> : null}</p> : null}
      </div>
      <nav className="flex min-w-0 max-w-full flex-wrap items-center gap-1" aria-label={ui("Choose a day")}>
        <Button size="sm" variant="outline" disabled={!data || loading} onClick={() => data && setDay(shift(data.day, -1))} data-day-prev>{ui("Previous day")}</Button>
        {!isToday ? <Button size="sm" variant="secondary" onClick={() => setDay(null)} data-day-today>{ui("Today")}</Button> : null}
        <Button size="sm" variant="outline" disabled={!data || loading} onClick={() => data && setDay(shift(data.day, 1))} data-day-next>{ui("Next day")}</Button>
      </nav>
    </header>
    {error ? <Alert tone="warning" compact live="polite" data-today-error actions={<Button size="sm" variant="outline" type="button" onClick={() => void load(day)}>{ui("Try again")}</Button>}>{stale && data ? ui("We could not refresh Today. Showing the view from {0}.", [dateTime(data.refreshedAt)]) : error}</Alert> : null}

    {/* The learner's next step, always at the top. The tour anchor (student.today.next) is present in every state,
        loading included, so a tour step never waits for data (§9.4). */}
    <div data-tour="student.today.next">
      {!data && !examUrl && loading ? <div aria-busy="true"><p className="sr-only">{ui("Loading Today…")}</p><SkeletonList /></div> : null}
      {examUrl ? <div data-next-action="RESUME_EXAM"><Alert tone="danger" icon={MonitorCheck} live="off" title={actionLabel(ui, "RESUME_EXAM")} actions={<Link href={examUrl} className={buttonVariants({ variant: "outline", size: "sm" })} data-next-action-link>{ui("Resume exam")}</Link>}>
      {ui("Your exam is in progress. Other work and help are hidden until you finish it.")}
    </Alert></div> : null}
      {data && !examUrl ? (
        data.nextAction ? <div data-tone={data.examLock ? "danger" : data.nextAction.kind === "OVERDUE" ? "warning" : "brand"} className={cn(deskRow, "flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap")} data-next-action={data.nextAction.kind}>
        <DeskRowIcon icon={actionIcon(data.nextAction.kind)} />
        <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-primary">{actionLabel(ui, data.nextAction.kind)}</p>
        <p className="mt-1 text-base font-bold text-ink-strong [overflow-wrap:anywhere]" dir="auto">{data.nextAction.title}</p>
        {data.nextAction.dueAt ? <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted"><span>{ui("Due (school time)")}{" "}<bdi>{dateTime(data.nextAction.dueAt)}</bdi></span><RelativeTime iso={data.nextAction.dueAt} full={dateTime(data.nextAction.dueAt)} className="font-semibold text-ink" /></p> : null}
        {data.examLock ? <p className="mt-2 text-xs text-status-error-text">{ui("Your exam is in progress. Other work and help are hidden until you finish it.")}</p> : null}
        </div>
        <div className="order-last basis-full ps-12 sm:order-none sm:basis-auto sm:ps-0"><Link href={data.nextAction.href} className={buttonVariants({ variant: "outline", size: "sm" })} data-next-action-link>{data.nextAction.kind === "RESUME_EXAM" ? ui("Resume exam") : ui("Open")}</Link></div>
      </div> : <div className="sk-panel" data-next-action="NONE"><EmptyState size="sm" icon={PartyPopper} title={data.returned.length ? ui("No new work is due. Review feedback when you are ready.") : ui("No work is due. Enjoy the day.")} /></div>
      ) : null}
    </div>
    {/* Exam Studio's delivery side (addendum 2026-10-22): the learner's upcoming online exams stay prominent on
        Today, each one tap away, with the way into "My online exams". */}
    {data && !data.examLock && data.upcomingExams.length ? <section aria-labelledby="today-online-exams" className="rounded-2xl border border-primary/20 bg-brand-50 p-4" data-tour="student.today.flagship-exams" data-today-online-exams>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="today-online-exams" className="flex items-center gap-2 text-sm font-bold text-ink-strong"><MonitorCheck aria-hidden="true" className="size-4 text-primary" />{ui("My online exams")}</h3>
        <Link href="/ai/exams" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sk-nudge-trigger gap-1 text-primary")}>{ui("See all")}<ChevronRight aria-hidden="true" className="sk-nudge size-4 rtl:rotate-180" /></Link>
      </div>
      <ul className="mt-2 space-y-1">{data.upcomingExams.map(exam => <li key={exam.id} data-upcoming-exam={exam.id}>
        <Link href={exam.href} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-card">
          <span className="min-w-0 flex-1 font-semibold text-ink-strong [overflow-wrap:anywhere]" dir="auto">{exam.title}</span>
          <span className="text-xs text-ink-muted">{ui("Opens")} <bdi>{dateTime(exam.startsAt)}</bdi></span>
        </Link>
      </li>)}</ul>
    </section> : null}
    {data ? <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="today-lessons" data-today-lessons={data.lessons.length}>
          <h3 id="today-lessons" className="text-sm font-bold text-ink-strong">{ui("Lessons")}{data.timetableVersion ? <span className="ms-2 text-2xs font-semibold text-ink-muted">{ui("Timetable version {0}", [String(data.timetableVersion)])}</span> : null}</h3>
          {!data.schoolDay ? <p className="mt-2 text-sm text-ink-muted" data-today-closed={data.closure?.kind}>{data.closure?.kind === "HOLIDAY" ? <>{ui("No school:")}{" "}<bdi>{data.closure.name}</bdi></> : ui("No school today. Upcoming work is below.")}</p>
            : data.lessons.length === 0 ? <p className="mt-2 text-sm text-ink-muted">{ui("No lessons are published for this day.")}</p>
            : <ol className="mt-2 space-y-1.5">{data.lessons.map(lesson => <li key={lesson.id} data-tone={data.current?.id === lesson.id ? "success" : data.next?.id === lesson.id ? "info" : lesson.kind === "CLASS" ? undefined : "muted"} className={cn(deskRow, "flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm")} data-lesson={lesson.id} data-lesson-now={data.current?.id === lesson.id ? "current" : data.next?.id === lesson.id ? "next" : undefined}>
                <span className="w-24 shrink-0 tabular-nums text-ink-muted"><bdi>{lesson.startTime}–{lesson.endTime}</bdi></span>
                <span className="font-bold" dir="auto">{lesson.kind === "CLASS" ? lesson.subject ?? ui("Free period") : ui("Break")}</span>
                {lesson.room ? <span className="text-xs text-ink-muted">{ui("Room")}{" "}<bdi>{lesson.room}</bdi></span> : null}
                {lesson.cover ? <DeskPill tone="warning" data-lesson-cover>{ui("Cover teacher:")}{" "}<bdi>{lesson.teacher}</bdi></DeskPill> : null}
                {data.current?.id === lesson.id ? <DeskPill tone="success" className="ms-auto">{ui("Now")}</DeskPill> : data.next?.id === lesson.id ? <DeskPill tone="info" className="ms-auto">{ui("Next")}</DeskPill> : null}
              </li>)}</ol>}
        </section>
        {!data.examLock ? <section aria-labelledby="today-work" data-today-work={data.work.length}>
          <h3 id="today-work" className="text-sm font-bold text-ink-strong">{ui("Work")}</h3>
          {data.work.length === 0 ? <p className="mt-2 text-sm text-ink-muted">{ui("Nothing open.")}</p> : <ul className="mt-2 space-y-2">{data.work.slice(0, 6).map(item => <li key={item.id} data-work={item.id} data-work-state={item.state}>
            <Link href={item.href} data-tone={stateTone(item)} className={cn(deskRow, "flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm")}>
              <span className="min-w-0 basis-full font-bold text-ink-strong [overflow-wrap:anywhere] sm:flex-1" dir="auto">{item.title}</span>
              <DeskPill tone={stateTone(item)}>{item.overdue ? (item.canSubmit ? ui("Past due") : ui("Closed for submission")) : stateLabel(ui, item.state)}</DeskPill>
              <span className="text-xs text-ink-muted">{item.overdue ? <>{stateLabel(ui, item.state)} · </> : null}<RelativeTime iso={item.dueAt} full={dateTime(item.dueAt)} />{item.extended ? <> · {ui("Extended for you")}</> : null}</span>
            </Link>
          </li>)}</ul>}
          {data.catchUp?.length ? <><h4 className="mt-3 text-xs font-semibold text-ink-muted">{ui("Catch-up from missed lessons")}</h4><ul className="space-y-1">{data.catchUp.map(item => <li key={item.id} className="text-sm" data-catch-up={item.id} data-catch-up-done={item.done ? "true" : "false"}><span className={cn("font-bold", item.done && "line-through opacity-70")} dir="auto">{item.title}</span> · <span dir="auto">{item.subject}</span>{item.dueDate ? <> · {ui("Due")} <bdi>{date(item.dueDate)}</bdi></> : null}{item.done ? <> · <span className="text-xs font-semibold text-status-success-text">{ui("Done")}</span></> : null}{item.instructions ? <p className="text-xs text-ink-muted" dir="auto">{item.instructions}</p> : null}</li>)}</ul></> : null}
          {data.returned.length ? <><h4 className="mt-3 text-xs font-semibold text-ink-muted">{ui("Feedback to read")}</h4><ul className="space-y-1">{data.returned.map(item => <li key={item.id} data-returned={item.id}><Link href={item.href} className="text-sm underline" dir="auto">{item.title}</Link></li>)}</ul></> : null}
        </section> : null}
      </div>
      <p className="text-2xs text-ink-muted" data-today-refreshed>{ui("Updated")}{" "}<bdi>{dateTime(data.refreshedAt)}</bdi>{stale ? <> · {ui("offline copy")}</> : null}</p>
    </> : null}
  </section>;
}
