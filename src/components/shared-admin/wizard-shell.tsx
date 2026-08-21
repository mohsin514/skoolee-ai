"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, X, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
export function WizardShell({
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
}: {
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
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Freeze the page behind the dialog, so scrolling past the end of the body
  // does not quietly scroll the dashboard underneath it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Long steps left the user scrolled halfway down when they moved on.
  useEffect(() => {
    document.getElementById(`${titleId}-body`)?.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, titleId]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Focus management, matching ModalFrame. Without it the caret stays on
  // whatever opened the wizard, so screen readers never enter it and Tab walks
  // the dashboard behind the backdrop.
  // Hand focus back to whatever opened the wizard, once, when it closes.
  // Kept apart from the trap below, which re-runs on every step and would
  // otherwise bounce focus out to the opener between steps.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

    const items = focusables();
    const firstField = items.find((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
    (firstField ?? items[0] ?? dialog).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
    // Re-runs per step: each step swaps in a different set of fields, and focus
    // should land on the new step's first input rather than stay behind.
  }, [mounted, step]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/50 p-4 backdrop-blur-md sm:p-6 animate-backdrop-enter"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.28)] animate-modal-enter"
      >
        {/* ── Pinned header ── */}
        <div className="relative shrink-0 overflow-hidden border-b border-[#cfc2d6]/20 bg-gradient-to-br from-[#faf7fc] via-white to-[#f3eeff] px-6 pt-5 pb-4 sm:px-7">
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-bl from-[#8127cf]/12 to-transparent blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/25">
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                  {eyebrow} · Step {step + 1} of {steps.length}
                </p>
                <h3 id={titleId} className="truncate text-2xl font-black tracking-tight text-[#1f1a23]">
                  {current.label}
                </h3>
                <p className="mt-0.5 text-xs font-semibold leading-snug text-ink-muted">{current.blurb}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="group/x flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-ink-subtle transition-all hover:bg-rose-50 hover:text-rose-500 active:scale-95"
            >
              <X className="h-5 w-5 transition-transform duration-300 group-hover/x:rotate-90" />
            </button>
          </div>

          {/* Step rail. Completed steps carry a tick and stay clickable so you
              can jump back to fix something without losing your place. */}
          <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
            {steps.map((s, i) => {
              const StepIcon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.label}
                  type="button"
                  disabled={!done && !active}
                  aria-current={active ? "step" : undefined}
                  onClick={() => { if (done) onStepChange(i); }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition-all duration-200",
                    active && "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/25",
                    done && "cursor-pointer bg-[#8127cf]/10 text-[#8127cf] hover:bg-[#8127cf]/20 active:scale-95",
                    !done && !active && "cursor-not-allowed bg-white/70 text-ink-subtle",
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3.5} /> : <StepIcon className="h-3 w-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
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
        <div id={`${titleId}-body`} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#fdfcfe] px-6 py-6 sm:px-7">
          {children}
        </div>

        {/* ── Pinned footer ── */}
        <div className="shrink-0 border-t border-[#cfc2d6]/15 bg-white px-6 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={step === 0 ? onClose : onBack}
              disabled={submitting}
              className="flex h-12 cursor-pointer items-center gap-1.5 rounded-2xl border border-[#cfc2d6]/25 bg-white px-5 text-sm font-bold text-ink transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {step === 0 ? "Cancel" : (<><ArrowLeft className="h-4 w-4" />Back</>)}
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 text-sm font-bold text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{submittingLabel}</>
                ) : (
                  <>{submitIcon ?? <Check className="h-4 w-4" />}{submitLabel}</>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 text-sm font-bold text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/30 active:scale-[0.98]"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
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
    <section className="rounded-[24px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(31,26,35,0.08)] transition-shadow duration-300 hover:shadow-[0_6px_20px_-8px_rgba(129,39,207,0.20)]">
      <div className="mb-4 flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
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
  const errorId = useId();

  // The message used to sit next to the control without being attached to it:
  // no aria-invalid, nothing pointing at the text, and no colour on the field
  // itself. A screen reader tabbing into the input announced a normal, valid
  // field. Cloning the child wires all of that up for every wizard at once.
  const control =
    error && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          "aria-invalid": true,
          "aria-describedby": errorId,
          className: cn(
            (children.props as { className?: string }).className,
            "!border-rose-400 focus:!border-rose-500"
          ),
        })
      : children;

  return (
    <div className="space-y-1.5">
      <Label className="block pl-1 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </Label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="pl-1 text-xs font-semibold text-rose-500">
          {error}
        </p>
      ) : null}
      {hint && !error ? <p className="pl-1 text-xs font-medium text-ink-muted">{hint}</p> : null}
    </div>
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
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#8127cf]/20 bg-gradient-to-br from-white via-white to-[#f3eeff] p-5 shadow-[0_4px_16px_-4px_rgba(129,39,207,0.18)]">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/25">
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
    <div className="rounded-[24px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(31,26,35,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f3eeff] text-[#8127cf]">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-xl bg-[#fbf0fe] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white active:scale-95"
        >
          Edit
        </button>
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
