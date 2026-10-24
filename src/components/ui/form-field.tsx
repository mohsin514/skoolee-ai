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
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Label } from "./label";
import { InfoTip } from "./tooltip";

interface FormFieldProps {
  /** Must match the schema key so `field(name)` and the label agree. */
  name: string;
  /** Explicit control ID. Takes precedence over IDs on the child. */
  id?: string;
  /** Stable, unique form/dialog prefix when field names are reused concurrently. */
  idScope?: string;
  label?: React.ReactNode;
  error?: string;
  /** Guidance shown under the control (format, example, consequence). */
  hint?: React.ReactNode;
  /**
   * What the field is for, shown between the label and the control so it is
   * read before typing. Prefer this to a placeholder for anything important:
   * placeholders vanish on the first keystroke.
   */
  description?: React.ReactNode;
  /** Extra background behind an (i) beside the label, for detail most people skip. */
  tooltip?: React.ReactNode;
  required?: boolean;
  /** Marks the field "(optional)" — use on forms where most fields are required. */
  optional?: boolean;
  /** Shows "used / max" under a controlled text control that has a maxLength. */
  showCount?: boolean;
  className?: string;
  /** Renders the control. Receives the ids it must carry. */
  children: React.ReactNode;
}

// A companion control (e.g. a phone country-code picker beside the number) is
// skipped, so the label, hint and errors land on the field's main control.
const controlSelector = ":is(input:not([type=hidden]),textarea,select,[role=combobox]):not([data-field-companion])";
type ControlProps = React.InputHTMLAttributes<HTMLInputElement> & { "data-form-field-control"?: string };

/**
 * Compound controls render a decorative surface and put the real control inside
 * it. Cloning the resolved field `id` onto such a wrapper emitted the id on the
 * wrapper *and* on the nested control in the server HTML — two elements sharing
 * an id until the layout effect moved it, which strict locators resolve to
 * "2 elements". The wrapper is skipped: the nested control keeps the caller's id
 * (or receives it from the layout effect below), and the label still points at it.
 */
const COMPOUND_CONTROLS = new Set(["InputGroup"]);
function isCompoundControl(control: React.ReactElement<ControlProps> | null) {
  const type = control?.type as { displayName?: string } | string | undefined;
  return typeof type !== "string" && type?.displayName !== undefined && COMPOUND_CONTROLS.has(type.displayName);
}

function describedBy(caller: string | undefined, hintId?: string, errorId?: string, previousId?: string) {
  // A scoped field() binder may still name this field's unscoped error/hint.
  const references = (caller?.split(/\s+/) ?? []).map(reference => {
    if (previousId && hintId && reference === `${previousId}-hint`) return hintId;
    if (previousId && errorId && reference === `${previousId}-error`) return errorId;
    return reference;
  });
  return [...new Set([...references, hintId, errorId].filter(Boolean).flatMap(value => value!.split(/\s+/)))].join(" ") || undefined;
}

export function FormField({
  name,
  id,
  idScope,
  label,
  error,
  hint,
  description,
  tooltip,
  required,
  optional,
  showCount,
  className,
  children,
}: FormFieldProps) {
  const tr = useUiText();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const labelRef = React.useRef<HTMLLabelElement>(null);
  const control = React.isValidElement<ControlProps>(children) ? children : null;
  const compound = isCompoundControl(control);
  const fieldId = id ?? (idScope ? `field-${idScope}-${name}` : control?.props.id ?? `field-${name}`);
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const descriptionId = `${fieldId}-description`;
  // The description is read before the hint: it says what the field is for.
  const guidanceId = [description ? descriptionId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const maxLength = control?.props.maxLength;
  const currentValue = control?.props.value;
  const count = showCount && typeof maxLength === "number" && typeof currentValue === "string" ? currentValue.length : null;
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
      setAttribute(input, "aria-describedby", describedBy(input.getAttribute("aria-describedby") ?? undefined, guidanceId, error ? errorId : undefined, control?.props.id ?? `field-${name}`) ?? null);
    }
    return () => { restore.reverse().forEach(undo => undo()); };
  });

  return (
    <div ref={containerRef} data-form-field={name} className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <div className="mb-1 flex min-w-0 items-center gap-1">
          <Label ref={labelRef} htmlFor={fieldId}>
            {label}
            {required ? (
              // aria-hidden because the requirement is already conveyed to
              // assistive tech by `aria-required` on the control itself; without
              // this the label is read as "Email star".
              <span aria-hidden="true" className="ms-0.5 text-destructive">
                *
              </span>
            ) : null}
            {optional && !required ? (
              <span className="ms-1.5 text-xs font-normal text-ink-subtle">({tr("optional")})</span>
            ) : null}
          </Label>
          {tooltip ? <InfoTip content={tooltip} className="-my-1" /> : null}
        </div>
      ) : null}
      {description ? (
        <p id={descriptionId} className="-mt-1 mb-1 text-[0.8125rem] leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}

      {control ? React.cloneElement(control, {
        "data-form-field-control": "",
        // A compound wrapper owns a nested control; leaving the id off the
        // wrapper keeps the server HTML free of duplicate ids.
        ...(compound ? null : { id: fieldId }),
        "aria-invalid": error ? true : control.props["aria-invalid"],
        "aria-required": required || control.props["aria-required"],
        "aria-describedby": describedBy(control.props["aria-describedby"], guidanceId, error ? errorId : undefined, control.props.id ?? `field-${name}`),
      }) : children}

      {error ? (
        <p
          id={errorId}
          // `role="alert"` so the message is announced when it appears after a
          // blur or a failed submit, rather than only on next focus.
          role="alert"
          className="sk-field-message flex items-start gap-1.5 text-[0.8125rem] font-medium leading-snug text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint || count !== null ? (
        <div className="flex items-start justify-between gap-3">
          {hint ? (
            <p id={hintId} className="text-[0.8125rem] leading-relaxed text-ink-subtle">
              {hint}
            </p>
          ) : <span />}
          {count !== null ? (
            <span data-numeric aria-live="polite" className={cn("shrink-0 text-xs text-ink-subtle", count >= (maxLength as number) && "font-semibold text-status-warning-text")}>
              {count}/{maxLength as number}
            </span>
          ) : null}
        </div>
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
      className="sk-field-message flex items-start gap-1.5 text-[0.8125rem] font-medium leading-snug text-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
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
  const tr = useUiText();
  const entries = Object.entries(errors).filter(([, message]) => Boolean(message)) as [
    string,
    string,
  ][];
  if (!entries.length) return null;

  return (
    <div
      role="alert"
      className={cn(
        "sk-field-message rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-status-error-text shadow-xs",
        className
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertCircle aria-hidden="true" className="size-4" />
        {entries.length === 1
          ? tr("There is 1 problem with this form")
          : tr("There are {0} problems with this form", [entries.length])}
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
