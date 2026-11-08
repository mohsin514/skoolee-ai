"use client";
import { useEffect, useState, type ReactNode, type Ref, type RefObject } from "react";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { useModalSurface } from "@/components/ui/modal";
import { TaskStatus } from "@/components/ui/task-patterns";
import { callMfaApi, type MfaRequestError } from "@/components/auth/mfa/mfa-client";
import type { SecurityCopy } from "@/lib/auth/security-ui-copy";
import { cn } from "@/lib/utils";

export const MFA_MANAGE_URL = "/api/account/mfa";

/** Every manage mutation is a same-origin JSON POST (the route also rejects cross-site Origin). */
export function postManage<T = Record<string, unknown>>(body: Record<string, unknown>) {
  return callMfaApi<T>(MFA_MANAGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Where an error is shown: next to the password, next to the code, or as an alert at the top of the step. */
export type DialogError = { reason?: string; message?: string; status: number; scope: "password" | "code" | "page" };
const CODE_REASONS = new Set(["invalid_code", "clock_skew", "code_reused", "recovery_invalid", "secret_unavailable"]);
export function classifyError(error: MfaRequestError): DialogError {
  const scope = error.status === 401 ? "page" : error.reason === "password_invalid" ? "password" : error.reason && CODE_REASONS.has(error.reason) ? "code" : "page";
  return { reason: error.reason, message: error.message, status: error.status, scope };
}

/** Moves focus to the field that owns the error, or to the step alert. */
export function useErrorFocus(error: DialogError | null, { password, code, alert }: { password?: RefObject<HTMLInputElement | null>; code?: RefObject<HTMLInputElement | null>; alert: RefObject<HTMLDivElement | null> }) {
  // Ref objects are stable, so focus only moves when a new error arrives.
  useEffect(() => {
    if (!error) return;
    const target = error.scope === "password" ? password?.current : error.scope === "code" ? code?.current : alert.current;
    (target ?? alert.current)?.focus();
  }, [error, password, code, alert]);
}

/**
 * The dialog's one polite live region. It is always mounted so text changes
 * are announced; TaskStatus is only the visual pill inside it.
 */
export function DialogLiveRegion({ busy, busyLabel, message }: { busy: boolean; busyLabel: string; message: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-4 min-h-6">
      {busy ? <span className="sr-only">{busyLabel}</span> : message ? <TaskStatus>{message}</TaskStatus> : null}
    </div>
  );
}

/** A page-scoped error at the top of the step. 401 offers Sign in again; callers can add a recovery action. */
export function DialogAlert({ message, status, alertRef, t, action }: { message: string; status?: number; alertRef: Ref<HTMLDivElement>; t: Pick<SecurityCopy, "signInAgain">; action?: ReactNode }) {
  if (!message) return null;
  return (
    <Alert ref={alertRef} tabIndex={-1} tone="danger" live="assertive" icon={AlertCircle} className="sk-shake mb-5"
      actions={status === 401 ? (
        <Link href="/login?reason=session-expired" className={buttonVariants({ variant: "outline", size: "sm" })}>{t.signInAgain}</Link>
      ) : action ?? undefined}>
      <p className="min-w-0 text-sm font-medium leading-snug text-status-error-text">{message}</p>
    </Alert>
  );
}

/** Current password with a show/hide toggle that keeps the field's single surface. */
export function PasswordField({ id, value, onChange, error, readOnly, inputRef, t }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  t: Pick<SecurityCopy, "password" | "showPassword" | "hidePassword">;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField name="password" id={id} required label={t.password} error={error}>
      <InputGroup>
        <LockKeyhole aria-hidden="true" data-field-affix="start" className="size-4 text-primary" />
        <Input ref={inputRef} id={id} type={visible ? "text" : "password"} autoComplete="current-password" value={value}
          onChange={event => onChange(event.target.value)} readOnly={readOnly} spellCheck={false} />
        <FieldAction onClick={() => setVisible(shown => !shown)} aria-label={visible ? t.hidePassword : t.showPassword} aria-pressed={visible} aria-controls={id}
          className="flex size-11 items-center justify-center rounded-xl text-ink-muted hover:text-primary">
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </FieldAction>
      </InputGroup>
    </FormField>
  );
}

/** Footer Cancel/Done that goes through the Modal's own close path (dirty guard + exit animation). */
export function DialogClose({ label, disabled, variant = "outline" }: { label: string; disabled?: boolean; variant?: "outline" | "default" }) {
  const { requestClose } = useModalSurface();
  return <Button type="button" variant={variant} disabled={disabled} onClick={requestClose}>{label}</Button>;
}

/** Closes the surrounding Modal (with its exit animation) once `when` turns true. */
export function CloseWhen({ when }: { when: boolean }) {
  const { requestClose } = useModalSurface();
  useEffect(() => { if (when) requestClose(); }, [when, requestClose]);
  return null;
}

/** Footer layout: actions stack full-width on phones, sit end-aligned from sm up. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{children}</div>;
}
