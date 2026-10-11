"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Loader2, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AuthenticatorSetup } from "@/components/auth/mfa/AuthenticatorSetup";
import { MfaCodeField } from "@/components/auth/mfa/MfaCodeField";
import { MfaMethodToggle } from "@/components/auth/mfa/MfaMethodToggle";
import { MfaStepper } from "@/components/auth/mfa/MfaStepper";
import { RecoveryCodesSheet, type RecoveryFeedback } from "@/components/auth/mfa/RecoveryCodesSheet";
import { mfaErrorText } from "@/components/auth/mfa/mfa-copy";
import { toMfaRequestError } from "@/components/auth/mfa/mfa-client";
import type { SecurityCopy } from "@/lib/auth/security-ui-copy";
import {
  DialogAlert, DialogClose, DialogFooter, DialogLiveRegion, PasswordField, classifyError, postManage, useErrorFocus, type DialogError,
} from "./dialog-parts";

type Feedback = "key" | RecoveryFeedback | null;

/**
 * Change (mode="change") or turn on (mode="enable") the authenticator.
 * Verify it's you → Scan → Confirm → Save codes. The swap is staged on the
 * server and only committed by `confirm`, so the account is never without MFA.
 */
export function ChangeAuthenticatorDialog({ mode, t, startWithRecovery = false, onClose, onCommitted, onDone, onStateChanged }: {
  mode: "change" | "enable";
  t: SecurityCopy;
  /** The current secret can't be decrypted here, so recovery is the only way to verify. */
  startWithRecovery?: boolean;
  onClose: () => void;
  /** The new authenticator is live (status changed); the page should re-read it. */
  onCommitted: () => void;
  onDone: (outcome: "changed" | "enabled") => void;
  onStateChanged: () => void;
}) {
  const formId = useId();
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(startWithRecovery);
  const [newCode, setNewCode] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [granted, setGranted] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [success, setSuccess] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const newCodeRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLParagraphElement>(null);
  const codesHeadingRef = useRef<HTMLHeadingElement>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);

  useErrorFocus(error, { password: passwordRef, code: step === 2 ? newCodeRef : codeRef, alert: alertRef });
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  useEffect(() => {
    if (step === 1) scanRef.current?.focus();
    else if (step === 2) newCodeRef.current?.focus();
    else if (step === 3) codesHeadingRef.current?.focus();
  }, [step]);

  function announce(next: Feedback) {
    setFeedback(next);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2400);
  }

  function fail(failure: unknown) {
    const next = classifyError(toMfaRequestError(failure));
    if (next.reason === "secret_unavailable") { setRecovery(true); setCode(""); }
    if (next.reason === "setup_expired") setGranted(false);
    setError(next);
  }

  async function begin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postManage<{ secret: string; uri: string }>({ action: "begin", mode, password, ...(mode === "change" ? { code, recovery } : {}) });
      setSecret(data.secret);
      setUri(data.uri);
      setGranted(true);
      setPassword("");
      setCode("");
      setStep(1);
    } catch (failure) { fail(failure); } finally { setBusy(false); }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postManage<{ recoveryCodes: string[] }>({ action: "confirm", code: newCode });
      setCodes(data.recoveryCodes);
      setGranted(false);
      setSecret("");
      setUri("");
      setNewCode("");
      setStep(3);
      setSuccess(mode === "change" ? t.changed : t.enabled);
      onCommitted();
    } catch (failure) { fail(failure); } finally { setBusy(false); }
  }

  function restart() {
    setError(null);
    setSecret("");
    setUri("");
    setNewCode("");
    setGranted(false);
    setStep(0);
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(secret);
      announce("key");
    } catch {
      announce("copyFailed");
    }
  }

  /** Runs after the Modal's exit animation. A staged-but-unconfirmed swap is cancelled (fire and forget). */
  function handleClose() {
    if (granted) void postManage({ action: "cancel" }).catch(() => {});
    if (step === 3) onDone(mode === "change" ? "changed" : "enabled");
    else onClose();
  }

  function chooseMethod(next: boolean) {
    if (busy || next === recovery) return;
    setRecovery(next);
    setCode("");
    setError(null);
    codeRef.current?.focus();
  }

  const message = error ? mfaErrorText(t, error, recovery) : "";
  const pageMessage = error?.scope === "page" ? message : "";
  const live = feedback === "key" || feedback === "codes" ? t.copied : feedback === "download" ? t.downloaded : feedback === "copyFailed" ? t.copyFailed : success;
  const spinner = <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />;
  const alertAction = error?.reason === "setup_expired"
    ? <Button type="button" variant="outline" size="sm" onClick={restart}><RotateCcw aria-hidden="true" />{t.restart}</Button>
    : error?.reason === "state_changed"
      ? <Button type="button" variant="outline" size="sm" onClick={onStateChanged}><RotateCcw aria-hidden="true" />{t.reload}</Button>
      : undefined;

  const footer = (
    <DialogFooter>
      {step === 3 ? <DialogClose variant="default" label={t.done} disabled={!ack} /> : <>
        <DialogClose label={t.cancel} disabled={busy} />
        {/* Distinct keys: if React reused the step-1 button as the step-2 submit, the click's
            default action would then submit the still-empty confirm form. */}
        {step === 1
          ? <Button key="scan" type="button" onClick={() => { setError(null); setStep(2); }}>{t.continue}<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" /></Button>
          : <Button key={`submit-${step}`} type="submit" form={formId} disabled={busy} aria-busy={busy}>
            {busy ? spinner : null}{step === 0 ? t.continue : t.confirm}{busy ? null : <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}
          </Button>}
      </>}
    </DialogFooter>
  );

  return (
    <Modal size="md" icon={mode === "change" ? Smartphone : ShieldCheck} eyebrow={t.twoFactorTitle}
      title={mode === "change" ? t.changeTitle : t.enableTitle} subtitle={mode === "change" ? t.changeSubtitle : t.enableSubtitle}
      onClose={handleClose} dismissible={!busy} disableBackdropClose={step > 0}
      dirty={step === 0 ? Boolean(password || code) : step === 3 ? !ack : false} dirtyMessage={step === 3 ? t.unackMessage : undefined}
      footer={footer}>
      <MfaStepper labels={t.changeSteps} current={step} progressLabel={t.progress} completedLabel={t.completed} className="mb-6" />
      <DialogAlert message={pageMessage} status={error?.status} alertRef={alertRef} t={t} action={alertAction} />

      {step === 0 && (
        <form id={formId} onSubmit={begin} aria-busy={busy} className="space-y-5" noValidate>
          <p className="text-sm font-semibold leading-relaxed text-ink-muted">{mode === "change" ? t.verifyIntro : t.enableIntro}</p>
          <PasswordField id="security-change-password" value={password} onChange={setPassword} readOnly={busy} inputRef={passwordRef} t={t}
            error={error?.scope === "password" ? message : undefined} />
          {mode === "change" && <>
            <MfaMethodToggle recovery={recovery} onChange={chooseMethod} disabled={busy} t={t} />
            <MfaCodeField id="security-change-code" value={code} onChange={setCode} recovery={recovery}
              onRecoveryChange={next => { setRecovery(next); setError(null); }} allowRecovery readOnly={busy} inputRef={codeRef}
              label={recovery ? t.recoveryLabel : t.codeLabel} hint={recovery ? t.recoveryHint : t.codeHint}
              error={error?.scope === "code" ? message : undefined} />
          </>}
        </form>
      )}

      {step === 1 && <>
        <p ref={scanRef} tabIndex={-1} className="mb-5 text-sm font-semibold leading-relaxed text-ink-muted">{t.scanBody}</p>
        <AuthenticatorSetup secret={secret} uri={uri} t={t} onCopy={() => void copyKey()} copied={feedback === "key"} idPrefix="security" />
      </>}

      {step === 2 && (
        <form id={formId} onSubmit={confirm} aria-busy={busy} noValidate>
          <MfaCodeField id="security-new-code" value={newCode} onChange={setNewCode} recovery={false} onRecoveryChange={() => {}}
            allowRecovery={false} readOnly={busy} inputRef={newCodeRef} label={t.newCodeLabel} hint={t.newCodeHint}
            error={error?.scope === "code" ? message : undefined} />
        </form>
      )}

      {step === 3 && (
        <RecoveryCodesSheet codes={codes} ack={ack} onAck={setAck} t={t} idPrefix="security-change" headingRef={codesHeadingRef}
          feedback={feedback} onFeedback={announce} />
      )}

      <DialogLiveRegion busy={busy} busyLabel={t.working} message={live} />
    </Modal>
  );
}
