"use client";

import { Button as SystemButton } from "@/components/ui/button";
import React, { useEffect, useId } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, X, type LucideIcon } from "lucide-react";
import { FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { ModalSurface, useModalSurface } from "@/components/ui/modal";

export interface WizardStep {
  label: string;
  icon: LucideIcon;
  /** One plain sentence: what this step is for. */
  blurb: string;
}

/**
 * The shell shared by every multi-step admin dialog — student admission, the
 * teacher invite and the staff invite.
 *
 * These were three hand-maintained copies of the same layout that had drifted
 * apart (different progress bars, different chip styles, different footers).
 * One shell means a change to the flow lands in all three at once.
 */
interface WizardShellProps {
  dirty?: boolean;
  eyebrow: string;
  icon: LucideIcon;
  steps: WizardStep[];
  step: number;
  /** Called when the user clicks a completed step chip. */
  onStepChange: (step: number) => void;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  submitting: boolean;
  submittingLabel?: string;
  children: React.ReactNode;
}

export function WizardShell(props: WizardShellProps) {
  /**
   * The shell keeps its own header — a step rail and a progress bar are not
   * something the standard `Modal` header models — but the portal, the layer,
   * the scroll lock, the focus trap and Escape all come from `ModalSurface`.
   * They were ~70 lines of hand-rolled duplicate here, including a focus trap
   * that had been copy-pasted from ModalFrame and then diverged.
   */
  return (
    <ModalSurface onClose={props.onClose} size="md" dirty={props.dirty} dismissible={!props.submitting}>
      <WizardChrome {...props} />
    </ModalSurface>
  );
}

function WizardChrome({
  eyebrow,
  icon: Icon,
  steps,
  step,
  onStepChange,
  onClose,
  onBack,
  onNext,
  onSubmit,
  submitLabel,
  submitIcon,
  submitting,
  submittingLabel = "Working…",
  children,
}: WizardShellProps) {
  const { requestClose, dragHandleProps, titleId } = useModalSurface();
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  // Long steps left the user scrolled halfway down when they moved on.
  useEffect(() => {
    document.getElementById(`${titleId}-body`)?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step, titleId]);

  return (
      <>
        <div id={`${titleId}-body`} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* Header scrolls with the fields so 200% text cannot consume the entry viewport. */}
        <div
          {...dragHandleProps}
          className="relative shrink-0 touch-none overflow-hidden border-b border-[#cfc2d6]/20 bg-gradient-to-br from-[#faf7fc] via-white to-[#f3eeff] px-4 pb-4 pt-5 sm:touch-auto sm:px-7"
        >
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-bl from-[#8127cf]/12 to-transparent blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="hidden h-12 w-12 shrink-0 items-center sm:flex justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/25">
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                  {eyebrow} · Step {step + 1} of {steps.length}
                </p>
                <h3 id={titleId} className="break-words text-xl sm:text-2xl font-black tracking-tight text-[#1f1a23]">
                  {current.label}
                </h3>
                <p className="mt-0.5 text-xs font-semibold leading-snug text-ink-muted">{current.blurb}</p>
              </div>
            </div>
            <SystemButton variant="ghost"
              type="button"
              onClick={requestClose}
              disabled={submitting}
              aria-label="Close"
              className="group/x flex shrink-0 items-center justify-center"
            >
              <X className="h-5 w-5 transition-transform duration-300 group-hover/x:rotate-90" />
            </SystemButton>
          </div>

          {/* Step rail. Completed steps carry a tick and stay clickable so you
              can jump back to fix something without losing your place. */}
          <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
            {steps.map((s, i) => {
              const StepIcon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <SystemButton variant="ghost"
                  key={s.label}
                  type="button"
                  disabled={submitting || (!done && !active)}
                  aria-current={active ? "step" : undefined}
                  onClick={() => { if (done) onStepChange(i); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 justify-start",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-surface-selected text-primary",
                    !done && !active && "text-ink-subtle",
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3.5} /> : <StepIcon className="h-3 w-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </SystemButton>
              );
            })}
          </div>

          <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] via-[#9c48ea] to-[#b876f0] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* ── Scrolling body ── */}
        <fieldset disabled={submitting} className="m-0 min-w-0 border-0 bg-[#fdfcfe] px-4 py-6 sm:px-7">
          {children}
        </fieldset>

        </div>
        {/* ── Pinned footer ── */}
        <div className="shrink-0 border-t border-[#cfc2d6]/15 bg-white px-6 py-4 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SystemButton variant="outline"
              type="button"
              onClick={step === 0 ? requestClose : onBack}
              disabled={submitting}
              className="flex h-12 items-center gap-1.5 px-5 justify-start"
            >
              {step === 0 ? "Cancel" : (<><ArrowLeft className="h-4 w-4" />Back</>)}
            </SystemButton>

            {isLast ? (
              <SystemButton variant="default"
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex h-12 items-center gap-2 px-6 justify-start"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{submittingLabel}</>
                ) : (
                  <>{submitIcon ?? <Check className="h-4 w-4" />}{submitLabel}</>
                )}
              </SystemButton>
            ) : (
              <SystemButton variant="default"
                type="button"
                onClick={onNext}
                disabled={submitting}
                className="flex h-12 items-center gap-2 px-6 justify-start"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </SystemButton>
            )}
          </div>
        </div>
      </>
  );
}

/**
 * One titled block of fields — icon tile, black title, one-line explanation.
 * Same anatomy as the academics cards, so the wizards and the dashboard read
 * as the same product.
 */
export function FormSection({
  icon: Icon,
  title,
  hint,
  tone = "violet",
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  tone?: "violet" | "emerald" | "amber" | "sky";
  children: React.ReactNode;
}) {
  const tones = {
    violet: "bg-[#f3eeff] text-[#8127cf]",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
  } as const;
  return (
    <section className="sk-panel p-3 sm:p-5 transition-shadow duration-300 hover:shadow-[0_6px_20px_-8px_rgba(129,39,207,0.20)]">
      <div className="mb-4 flex items-start gap-3">
        <span className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:flex", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
          {hint ? <p className="mt-0.5 text-[11px] font-semibold leading-snug text-ink-muted">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Label, control, then error or hint — the one field layout for all wizards. */
export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const scope = useId();
  return (
    <FormField name={`wizard-${scope}`} label={label} required={required} error={error} hint={hint}>
      {children}
    </FormField>
  );
}

/** The summary card that opens every wizard's review step. */
export function ReviewHero({
  icon: Icon,
  eyebrow,
  title,
  meta,
}: {
  icon: LucideIcon;
  dirty?: boolean;
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#8127cf]/20 bg-gradient-to-br from-white via-white to-[#f3eeff] p-5 shadow-[0_4px_16px_-4px_rgba(129,39,207,0.18)]">
      <div className="flex items-start gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center sm:flex justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/25">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">{eyebrow}</p>
          <h3 className="truncate text-lg font-black tracking-tight text-[#1f1a23]">{title}</h3>
          <p className="mt-0.5 truncate text-xs font-semibold text-ink-muted">{meta}</p>
        </div>
      </div>
    </div>
  );
}

/** A review block with an Edit button that jumps back to the owning step. */
export function ReviewSection({
  title,
  icon: Icon,
  onEdit,
  children,
}: {
  title: string;
  icon: LucideIcon;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="sk-panel p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:flex bg-[#f3eeff] text-[#8127cf]">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="break-words text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
        </div>
        <SystemButton variant="default"
          type="button"
          onClick={onEdit}
          className="px-3 py-1.5"
        >
          Edit
        </SystemButton>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[#f3f4f9] pt-3">{children}</div>
    </div>
  );
}

/** One reviewed value. A blank required field is called out, not dashed over. */
export function ReviewRow({
  label,
  value,
  required,
  dir,
}: {
  label: string;
  value: string;
  required?: boolean;
  dir?: "rtl" | "ltr";
}) {
  if (!value && !required) return null;
  const missing = required && !value;
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={cn("truncate text-sm font-bold", missing ? "text-rose-500" : "text-[#1f1a23]")} dir={dir}>
        {value || (required ? "Required — not set" : "—")}
      </p>
    </div>
  );
}
