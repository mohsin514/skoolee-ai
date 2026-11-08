import { WeekStrip } from "@/components/onboarding/WeekStrip";
import type { PlateProps } from "../types";

/**
 * Cover plate for the academic step: the session as a large figure, its year,
 * dates and time zone as meta, then the working week as a cover ribbon.
 * Decorative (the cover is aria-hidden); values are shown left-to-right.
 */
/** "2026-04-01" → "1 Apr 2026"; fixed locale + UTC so server and client agree. */
function plateDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export function AcademicPlate({ t, language, data }: PlateProps) {
  const closed = data.weekends;
  const open = 7 - new Set(closed).size;
  const dates = data.sessionStart
    ? `${plateDate(data.sessionStart)} → ${data.sessionEnd ? plateDate(data.sessionEnd) : "…"}`
    : null;
  return (
    <div className="sk-plate" data-layer="academic">
      <div className="grid gap-2 min-w-0">
        <p className="sk-plate-figure truncate"><bdi dir="ltr">{data.sessionLabel || data.academicYear || "—"}</bdi></p>
        <p className="sk-plate-meta">
          {data.academicYear && <span>{t.academicYear} <bdi dir="ltr" data-numeric>{data.academicYear}</bdi></span>}
          <span>{dates ? <bdi dir="ltr" data-numeric>{dates}</bdi> : t.startsToday}</span>
          {data.timezone && <span><bdi dir="ltr">{data.timezone}</bdi></span>}
        </p>
      </div>
      <div className="grid gap-2">
        <WeekStrip variant="cover" closed={closed} language={language} />
        <p className="sk-plate-meta">{t.workingDays(open)}</p>
      </div>
    </div>
  );
}
