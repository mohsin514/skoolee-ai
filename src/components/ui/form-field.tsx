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
  /** Explicit control ID. Takes precedence over IDs on the child. */
  id?: string;
  /** Stable, unique form/dialog prefix when field names are reused concurrently. */
  idScope?: string;
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** Renders the control. Receives the ids it must carry. */
  children: React.ReactNode;
}

const controlSelector = "input:not([type=hidden]),textarea,select,[role=combobox]";
type ControlProps = React.InputHTMLAttributes<HTMLInputElement> & { "data-form-field-control"?: string };

function describedBy(caller: string | undefined, hintId?: string, errorId?: string, previousId?: string) {
  // A scoped field() binder may still name this field's unscoped error/hint.
  const references = (caller?.split(/\s+/) ?? []).map(reference => {
    if (previousId && hintId && reference === `${previousId}-hint`) return hintId;
    if (previousId && errorId && reference === `${previousId}-error`) return errorId;
    return reference;
  });
  return [...new Set([...references, hintId, errorId].filter(Boolean))].join(" ") || undefined;
}

export function FormField({
  name,
  id,
  idScope,
  label,
  error,
  hint,
  required,
  className,
  children,
}: FormFieldProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const labelRef = React.useRef<HTMLLabelElement>(null);
  const control = React.isValidElement<ControlProps>(children) ? children : null;
  const fieldId = id ?? (idScope ? `field-${idScope}-${name}` : control?.props.id ?? `field-${name}`);
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  // Compound InputGroup/Urdu controls need the label and errors on the actual
  // input, not on their decorative wrapper. Resolve that shared contract here.
  React.useLayoutEffect(() => {
    const input = containerRef.current?.querySelector<HTMLElement>(controlSelector);
    if (!input) return;
    const resolvedId = id || idScope || control?.props.id ? fieldId : input.id || fieldId;
    if (labelRef.current) labelRef.current.htmlFor = resolvedId;
    const restore: (() => void)[] = [];
    const setAttribute = (element: HTMLElement, attribute: string, value: string | null) => {
      const original = element.getAttribute(attribute);
      if (value === original) return;
      if (value === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, value);
      restore.push(() => {
        // A caller may have updated this attribute during React's next commit.
        if (element.getAttribute(attribute) !== value) return;
        if (original === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, original);
      });
    };
    const wrapper = containerRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(fieldId)}"]`);
    if (wrapper && wrapper !== input) setAttribute(wrapper, "id", null);
    setAttribute(input, "id", resolvedId);
    // Input/Select/DatePicker forward the cloned props to the native control.
    // InputGroup/UrduInput need the same wiring on their nested control instead.
    if (!input.hasAttribute("data-form-field-control")) {
      if (error) setAttribute(input, "aria-invalid", "true");
      if (required) setAttribute(input, "aria-required", "true");
      setAttribute(input, "aria-describedby", describedBy(input.getAttribute("aria-describedby") ?? undefined, hint ? hintId : undefined, error ? errorId : undefined, control?.props.id ?? `field-${name}`) ?? null);
    }
    return () => { restore.reverse().forEach(undo => undo()); };
  });

  return (
    <div ref={containerRef} data-form-field={name} className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Label ref={labelRef} htmlFor={fieldId} className="mb-1">
          {label}
          {required ? (
            // aria-hidden because the requirement is already conveyed to
            // assistive tech by `aria-required` on the control itself; without
            // this the label is read as "Email star".
            <span aria-hidden="true" className="ms-0.5 text-destructive">
              *
            </span>
          ) : null}
        </Label>
      ) : null}

      {control ? React.cloneElement(control, {
        "data-form-field-control": "",
        id: fieldId,
        "aria-invalid": error ? true : control.props["aria-invalid"],
        "aria-required": required || control.props["aria-required"],
        "aria-describedby": describedBy(control.props["aria-describedby"], hint ? hintId : undefined, error ? errorId : undefined, control.props.id ?? `field-${name}`),
      }) : children}

      {error ? (
        <p
          id={errorId}
          // `role="alert"` so the message is announced when it appears after a
          // blur or a failed submit, rather than only on next focus.
          role="alert"
          className="flex items-start gap-1 text-sm font-semibold text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm font-medium text-ink-subtle">
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
      className="flex items-start gap-1 text-sm font-semibold text-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
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
        "rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-status-error-text",
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-bold">
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
              onClick={(event) => {
                if (onFocusField) { onFocusField(field); return; }
                const scope = event.currentTarget.closest("form, [role=dialog], [role=alertdialog], dialog") ?? document;
                const wrapper = scope.querySelector(`[data-form-field="${CSS.escape(field)}"]`);
                const input = wrapper?.querySelector<HTMLElement>(controlSelector)
                  ?? scope.querySelector<HTMLElement>(`[id="${CSS.escape(`field-${field}`)}"]`);
                input?.focus();
              }}
              className="min-h-6 text-start text-sm font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current"
            >
              {message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
