import { CalendarDays, CalendarRange, Clock, Info, RefreshCw, Sparkles, Tag } from "lucide-react";
import { FieldGroup } from "@/components/auth/FieldGroup";
import { WeekStrip } from "@/components/onboarding/WeekStrip";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select as SystemSelect } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { fill } from "../../copy";
import { FieldError, InputField } from "../fields";
import { sessionLabelFor, timezoneOptions, weekdayName } from "../helpers";
import type { AcademicStepProps } from "../types";

/* ═══ STEP: Academic defaults ═══ */
export function AcademicStep({
  t, local, language, headingRef, folio, notices, busy, back, school, setSchool, errors, setAcademicYear, toggleWorkingDay, thisYear,
  offDays, workingDays, listSeparator, onContinue,
}: AcademicStepProps) {
  const s = school;
  return (
    <StepCard
      headingRef={headingRef}
      folio={folio}
      title={t.academicTitle}
      intro={t.academicIntro}
      notices={notices}
      dock={(
        <StepDock
          back={back}
          primary={(
            <Button onClick={onContinue} disabled={busy} loading={busy} className="sk-nudge-trigger gap-2">
              {t.continue} <ForwardArrow />
            </Button>
          )}
        />
      )}
    >
      <div className="grid gap-6 @min-[46rem]:grid-cols-2">
        <FieldGroup level={2} id="grp-session" icon={Sparkles} title={t.currentSession}>
          <div className="grid gap-3 @min-[20rem]:grid-cols-2">
            <InputField field="academicYear" error={errors.academicYear && t.errors[errors.academicYear]} label={t.academicYear} value={s.academicYear} onChange={setAcademicYear} placeholder={String(thisYear)} icon={CalendarDays} inputMode="numeric" required />
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="field-sessionLabel" className="sk-field-label">{t.sessionName} <span className="text-destructive" aria-hidden="true">*</span></Label>
              <InputGroup>
                <Tag data-field-affix="start" className="h-4 w-4" />
                <Input id="field-sessionLabel" aria-required aria-invalid={!!errors.sessionLabel} aria-describedby={errors.sessionLabel ? "field-sessionLabel-error" : undefined} value={s.sessionLabel} onChange={(e) => setSchool({ sessionLabel: e.target.value })} placeholder={sessionLabelFor(thisYear)} className="w-full" />
                <Tooltip content={t.resetSessionName} describe={false}>
                  <FieldAction data-field-affix="end" type="button" aria-label={t.resetSessionName} onClick={() => setSchool({ sessionLabel: sessionLabelFor(Number(s.academicYear) || thisYear) })}>
                    <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
                  </FieldAction>
                </Tooltip>
              </InputGroup>
              {errors.sessionLabel && <FieldError id="field-sessionLabel-error" live={false}>{t.errors[errors.sessionLabel]}</FieldError>}
            </div>
          </div>
          <p className="flex gap-1.5 px-1 text-xs leading-relaxed text-ink-subtle">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{fill(t.sessionHint, sessionLabelFor(Number(s.academicYear) || thisYear), Number(s.academicYear) || thisYear)}</span>
          </p>
          <div className="grid gap-3 @min-[20rem]:grid-cols-2">
            <InputField field="sessionStart" label={t.sessionStarts} type="date" icon={CalendarDays} value={s.sessionStart} placeholder="" onChange={(val) => setSchool({ sessionStart: val })} hint={local.sessionStartHint} />
            <InputField field="sessionEnd" error={errors.sessionEnd && t.errors[errors.sessionEnd]} label={t.sessionEnds} type="date" icon={CalendarDays} value={s.sessionEnd} placeholder="" onChange={(val) => setSchool({ sessionEnd: val })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-timezone" className="sk-field-label">{t.timezone}</Label>
            <InputGroup className="min-w-0">
              <Clock data-field-affix="start" className="h-4 w-4" />
              <SystemSelect id="field-timezone" dir="ltr" value={s.timezone} onChange={(e) => setSchool({ timezone: e.target.value })} className="w-full" aria-describedby="timezone-hint">
                {timezoneOptions().map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </SystemSelect>
            </InputGroup>
            <p id="timezone-hint" className="text-xs leading-relaxed text-ink-subtle">{t.timezoneHint}</p>
          </div>
        </FieldGroup>
        <FieldGroup level={2} asGroup={false} id="working-week-title" icon={CalendarRange} title={t.workingWeek}>
          <p id="working-week-hint" className="px-1 text-sm leading-relaxed text-ink-muted">{t.workingWeekHint}</p>
          <WeekStrip
            variant="paper"
            language={language}
            group={{ id: "field-weekends", labelledBy: "working-week-title", describedBy: "working-week-hint" }}
            closed={s.weekends}
            onToggle={toggleWorkingDay}
            labelFor={(day, closed) => `${weekdayName(day, language, "long")} — ${closed ? t.dayClosed : t.dayWorking}`}
          />
          <div className="space-y-2 rounded-3xl border border-border-subtle bg-surface-subtle p-5">
            <p className="text-sm font-semibold tabular-nums text-primary">{t.workingDays(workingDays.length)}</p>
            <p className="text-sm text-ink"><span className="font-semibold text-ink-strong">{t.open}:</span> {workingDays.map((day) => weekdayName(day, language, "short")).join(listSeparator) || "—"}</p>
            <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">{t.closed}:</span> {offDays.map((day) => weekdayName(day, language, "long")).join(listSeparator) || t.noWeekend}</p>
            <p className="border-t border-border-subtle pt-2 text-xs leading-relaxed text-ink-subtle">{t.appliedTo}</p>
          </div>
        </FieldGroup>
      </div>
    </StepCard>
  );
}
