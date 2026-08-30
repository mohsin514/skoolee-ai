"use client";

/**
 * The standard wrapper for a labelled, validated input.
 *
 * Before this, every form drew its own label-and-error markup, and the errors
 * that did exist were plain red `<p>` tags sitting near an input with nothing
 * connecting the two. Visually that reads fine; to a screen reader the input is
 * simply "Email, edit text" with no hint that anything is wrong, and the
 * message is stranded text somewhere after it.
 *
 * `FormField` owns that wiring so no call site has to remember it: the label
 * points at the control, the message carries a stable id, and the control is
 * described by it. Pairing this with the `field()` binder from
 * `useValidatedForm` means an input gets correct semantics by default rather
 * than by diligence.
 */

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FormFieldProps {
  /** Must match the schema key so `field(name)` and the label agree. */
  name: string;
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** Renders the control. Receives the ids it must carry. */
  children: React.ReactNode;
}

export function FormField({
  name,
  label,
  error,
  hint,
  required,
  className,
  children,
}: FormFieldProps) {
  const fieldId = `field-${name}`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Label htmlFor={fieldId}>
          {label}
          {required ? (
            // aria-hidden because the requirement is already conveyed to
            // assistive tech by `aria-required` on the control itself; without
            // this the label is read as "Email star".
            <span aria-hidden="true" className="ml-0.5 text-red-500">
              *
            </span>
          ) : null}
        </Label>
      ) : null}

      {children}

      {error ? (
        <p
          id={errorId}
          // `role="alert"` so the message is announced when it appears after a
          // blur or a failed submit, rather than only on next focus.
          role="alert"
          className="flex items-start gap-1 text-[11px] font-bold text-red-600"
        >
          <AlertCircle aria-hidden="true" className="mt-px h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[11px] font-medium text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A standalone message, for errors that belong to a group of controls rather
 * than one input — a radio set, a date range, a whole step.
 */
export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1 text-[11px] font-bold text-red-600"
    >
      <AlertCircle aria-hidden="true" className="mt-px h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The summary shown at the top of a long form after a blocked submit.
 *
 * On a form that scrolls, focusing the first bad input is not always enough —
 * the user asked to submit and needs to know why nothing happened. Each entry
 * is a button that moves focus to its field.
 */
export function FormErrorSummary({
  errors,
  onFocusField,
  className,
}: {
  errors: Record<string, string | undefined>;
  onFocusField?: (field: string) => void;
  className?: string;
}) {
  const entries = Object.entries(errors).filter(([, message]) => Boolean(message)) as [
    string,
    string,
  ][];
  if (!entries.length) return null;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-red-200 bg-red-50/80 px-3.5 py-3 text-red-900",
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-black">
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
        {entries.length === 1
          ? "There is 1 problem with this form"
          : `There are ${entries.length} problems with this form`}
      </p>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {entries.map(([field, message]) => (
          <li key={field}>
            <button
              type="button"
              onClick={() => onFocusField?.(field)}
              className="text-left text-[11px] font-bold underline decoration-red-300 underline-offset-2 hover:decoration-red-600"
            >
              {message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
