"use client";

/**
 * The one form hook.
 *
 * The product had eighty-odd forms and five of them validated anything. The
 * other seventy-five posted whatever was in state and let the API — or, more
 * often, Postgres — be the first thing with an opinion, which is why a blank
 * required field surfaced as a red toast reading "Request failed" with no
 * indication of *which* field.
 *
 * The shape here deliberately mirrors what those forms already do
 * (`const [form, setForm] = useState(...)`, an `update(field, value)` helper,
 * an `errors` object) so adopting it is a substitution rather than a rewrite.
 * What it adds is the part every one of them got wrong or skipped:
 *
 *   • Errors appear on blur and on submit, never on the first keystroke. A
 *     field that turns red while you are still typing your email is noise.
 *   • A field that is already showing an error re-validates as you fix it, so
 *     the message clears the moment it stops being true.
 *   • Submit validates everything, focuses the first invalid field, and
 *     announces the failure — a form whose error is scrolled off-screen reads
 *     as a dead button.
 *   • Server-side field errors merge into the same `errors` map, so a
 *     uniqueness violation from the API marks the input rather than only
 *     raising a toast.
 *
 * `zod`'s `input` type is the state type: everything a text input holds is a
 * string, and the schema is what turns "40" into 40.
 *
 * No `useCallback`/`useMemo` here on purpose. This project compiles with the
 * React Compiler, which memoises automatically; hand-written memoisation that
 * it cannot prove safe makes it skip the component entirely. Reading state
 * straight from the closure is also what removes the usual "stale values"
 * trap — the handlers are rebuilt each render, so they always see current
 * state without a ref being written during render to work around it.
 */

import { useState, useRef } from "react";
import type { z } from "zod";
import { fieldErrorsOfZod } from "@/lib/validators/client";

export type FieldErrors<T> = Partial<Record<keyof T & string, string>>;

interface UseValidatedFormOptions<S extends z.ZodType> {
  schema: S;
  initialValues: z.input<S> & Record<string, unknown>;
  /** Receives the parsed, sanitised output — not the raw state. */
  onSubmit?: (values: z.output<S>) => void | Promise<void>;
  /** Called when submit is blocked, for a toast. */
  onInvalid?: (errors: FieldErrors<z.input<S> & Record<string, unknown>>) => void;
}

export function useValidatedForm<S extends z.ZodType>({
  schema,
  initialValues,
  onSubmit,
  onInvalid,
}: UseValidatedFormOptions<S>) {
  // Intersected with an index signature because `z.input<S>` on an unresolved
  // generic is `unknown`, which cannot be spread. Every form schema is an
  // object schema, so this narrows to the real shape at each call site while
  // staying spreadable here.
  type Values = z.input<S> & Record<string, unknown>;
  type Key = keyof Values & string;

  const [values, setValues] = useState<Values>(initialValues);
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Only ever read inside event handlers, never during render.
  const formRef = useRef<HTMLFormElement | null>(null);

  /** Validates the whole object and returns the field map (empty when valid). */
  const runSchema = (candidate: Values): FieldErrors<Values> => {
    const result = schema.safeParse(candidate);
    return result.success ? {} : (fieldErrorsOfZod(result.error) as FieldErrors<Values>);
  };

  /** Moves the caret to a field so the message is on screen and announced. */
  const focusField = (field: string) => {
    if (typeof document === "undefined") return;
    const scope: ParentNode = formRef.current ?? document;
    const element = scope.querySelector<HTMLElement>(
      `[name="${CSS.escape(field)}"], #${CSS.escape(`field-${field}`)}`
    );
    element?.focus?.();
    element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const setValue = (field: Key, value: unknown) => {
    const next = { ...values, [field]: value } as Values;
    setValues(next);

    // Only re-validate a field the user has already left (or that submit has
    // flagged). Validating on the first keystroke tells someone their email is
    // invalid when they have typed "a".
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const all = runSchema(next);
      const updated = { ...prev };
      if (all[field]) updated[field] = all[field];
      else delete updated[field];
      return updated;
    });
  };

  /** Replaces several fields at once — a picker that fills three inputs. */
  const setValuesPartial = (patch: Partial<Values>) => {
    setValues((prev) => ({ ...prev, ...patch }) as Values);
  };

  /**
   * Validates one field, but by parsing the whole object.
   *
   * That matters for cross-field rules — "passwords don't match", "end date is
   * before start date" — which are attached to one field but cannot be judged
   * from it alone.
   */
  const validateField = (field: Key, candidate: Values = values) => {
    const all = runSchema(candidate);
    setErrors((prev) => {
      const next = { ...prev };
      if (all[field]) next[field] = all[field];
      else delete next[field];
      return next;
    });
    return !all[field];
  };

  const handleBlur = (field: Key) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    const all = runSchema(values);
    setErrors((prev) => {
      const next = { ...prev };
      if (all[field]) next[field] = all[field];
      else delete next[field];
      return next;
    });
  };

  /**
   * Validates a subset — the step of a wizard.
   *
   * Only the named fields are reported, so step 1 is not blocked by a required
   * field that lives on step 3.
   */
  const validateFields = (fields: readonly Key[]): boolean => {
    const all = runSchema(values);
    const subset: FieldErrors<Values> = {};
    for (const field of fields) if (all[field]) subset[field] = all[field];

    setErrors((prev) => {
      const next = { ...prev };
      for (const field of fields) {
        if (subset[field]) next[field] = subset[field];
        else delete next[field];
      }
      return next;
    });
    setTouched((prev) => {
      const next = { ...prev };
      for (const field of fields) next[field] = true;
      return next;
    });

    const firstInvalid = fields.find((field) => subset[field]);
    if (firstInvalid) focusField(firstInvalid);
    return !firstInvalid;
  };

  /** Merges `{ field: [message] }` from a 400 response into the error map. */
  const setServerErrors = (fieldErrors: unknown) => {
    if (!fieldErrors || typeof fieldErrors !== "object") return false;
    const mapped: FieldErrors<Values> = {};
    for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
      const message = Array.isArray(messages) ? String(messages[0]) : String(messages);
      if (message) mapped[field as Key] = message;
    }
    if (!Object.keys(mapped).length) return false;
    setErrors((prev) => ({ ...prev, ...mapped }));
    const first = Object.keys(mapped)[0];
    if (first) focusField(first);
    return true;
  };

  const validate = (): boolean => {
    const all = runSchema(values);
    setErrors(all);
    setSubmitted(true);
    const first = Object.keys(all)[0];
    if (first) {
      focusField(first);
      onInvalid?.(all);
      return false;
    }
    return true;
  };

  const handleSubmit = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (submitting) return false;

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const all = fieldErrorsOfZod(parsed.error) as FieldErrors<Values>;
      setErrors(all);
      setSubmitted(true);
      const first = Object.keys(all)[0];
      if (first) focusField(first);
      onInvalid?.(all);
      return false;
    }

    setErrors({});
    setSubmitted(true);
    setSubmitting(true);
    try {
      await onSubmit?.(parsed.data);
      return true;
    } finally {
      setSubmitting(false);
    }
  };

  const reset = (next?: Values) => {
    setValues(next ?? initialValues);
    setErrors({});
    setTouched({});
    setSubmitted(false);
  };

  /**
   * Props for a controlled input.
   *
   * Includes the accessibility wiring that hand-rolled forms almost never
   * carry: `aria-invalid` so the state is exposed to a screen reader, and
   * `aria-describedby` pointing at the message element so it is *read out*
   * rather than merely displayed in red.
   */
  const field = (name: Key) => ({
    id: `field-${name}`,
    name,
    value: (values[name] ?? "") as string,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
      const target = event.target;
      const value =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target.value;
      setValue(name, value);
    },
    onBlur: () => handleBlur(name),
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `field-${name}-error` : undefined,
  });

  return {
    values,
    errors,
    touched,
    submitting,
    submitted,
    isValid: schema.safeParse(values).success,
    formRef,
    field,
    setValue,
    setValues: setValuesPartial,
    setErrors,
    setServerErrors,
    validate,
    validateField,
    validateFields,
    handleSubmit,
    focusField,
    reset,
  };
}
