"use client";

/**
 * SKAI-1004: a tiny form hook for /login, so the cold sign-in page does not ship
 * react-hook-form, @hookform/resolvers and zod (about 63 KB gzip together).
 *
 * It mirrors the slice of the react-hook-form API the page used — uncontrolled
 * inputs, validate on submit, re-validate on change after the first failed
 * submit, focus the first invalid field in visual order — and the messages of
 * `loginSchema` in `@/lib/validators/schemas`, which the server still applies
 * to every request. `tests/perf/login-form.test.ts` keeps the two in step.
 */
import { useCallback, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from "react";

export type LoginFields = { email: string; password: string };
type FieldName = keyof LoginFields;
export type LoginFieldErrors = Partial<Record<FieldName, { message: string }>>;

// The same pattern zod 4 uses for `z.string().email()`.
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function validateLogin(values: LoginFields): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  if (!EMAIL_PATTERN.test(values.email)) errors.email = { message: "Valid email required" };
  if (values.password.length < 1) errors.password = { message: "Password required" };
  return errors;
}

const ORDER: FieldName[] = ["email", "password"];

export function useLoginForm() {
  const inputs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});
  const submitted = useRef(false);
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  // Only the email is watched (for the typo hint); the password never sits in state.
  const [email, setEmail] = useState("");

  const readAll = useCallback((): LoginFields => ({
    email: inputs.current.email?.value ?? "",
    password: inputs.current.password?.value ?? "",
  }), []);
  // Reads the live inputs, so it needs no memoising.
  function getValues(): LoginFields;
  function getValues(name: FieldName): string;
  function getValues(name?: FieldName) { return name ? readAll()[name] : readAll(); }

  const revalidate = useCallback(() => {
    if (submitted.current) setErrors(validateLogin(readAll()));
  }, [readAll]);

  const setFocus = useCallback((name: FieldName) => inputs.current[name]?.focus(), []);

  const setValue = useCallback((name: FieldName, value: string, opts?: { shouldValidate?: boolean }) => {
    const el = inputs.current[name];
    if (el) el.value = value;
    if (name === "email") setEmail(value);
    if (opts?.shouldValidate) setErrors(validateLogin(readAll()));
  }, [readAll]);

  const register = useCallback((name: FieldName) => ({
    name,
    ref: (el: HTMLInputElement | null) => { inputs.current[name] = el; },
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (name === "email") setEmail(e.target.value);
      revalidate();
    },
    onBlur: (_e: FocusEvent<HTMLInputElement>) => {},
  }), [revalidate]);

  const handleSubmit = useCallback((onValid: (data: LoginFields) => unknown) => (e?: FormEvent) => {
    e?.preventDefault();
    submitted.current = true;
    const values = readAll();
    const next = validateLogin(values);
    setErrors(next);
    const firstInvalid = ORDER.find((n) => next[n]);
    if (firstInvalid) { setFocus(firstInvalid); return; }
    return onValid(values);
  }, [readAll, setFocus]);

  return { register, handleSubmit, getValues, setValue, setFocus, errors, email };
}
