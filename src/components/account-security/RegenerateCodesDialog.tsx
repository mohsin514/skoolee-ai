"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { KeyRound, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MfaCodeField } from "@/components/auth/mfa/MfaCodeField";
import { MfaStepper } from "@/components/auth/mfa/MfaStepper";
import { RecoveryCodesSheet, type RecoveryFeedback } from "@/components/auth/mfa/RecoveryCodesSheet";
import { mfaErrorText } from "@/components/auth/mfa/mfa-copy";
import { toMfaRequestError } from "@/components/auth/mfa/mfa-client";
import type { SecurityCopy } from "@/lib/auth/security-ui-copy";
import {
  DialogAlert, DialogClose, DialogFooter, DialogLiveRegion, PasswordField, classifyError, postManage, useErrorFocus, type DialogError,
} from "./dialog-parts";

/** Password + current authenticator code → a fresh set of recovery codes. The old set stops working at once. */
export function RegenerateCodesDialog({ t, onClose, onCommitted, onDone, onStateChanged }: {
  t: SecurityCopy;
  onClose: () => void;
  onCommitted: () => void;
  onDone: (outcome: "regenerated") => void;
  onStateChanged: () => void;
}) {
  const formId = useId();
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);
  const [feedback, setFeedback] = useState<RecoveryFeedback | null>(null);
  const [success, setSuccess] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const codesHeadingRef = useRef<HTMLHeadingElement>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);

  useErrorFocus(error, { password: passwordRef, code: codeRef, alert: alertRef });
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  useEffect(() => { if (step === 1) codesHeadingRef.current?.focus(); }, [step]);

  function announce(next: RecoveryFeedback) {
    setFeedback(next);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2400);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postManage<{ recoveryCodes: string[] }>({ action: "regenerate", password, code });
      setCodes(data.recoveryCodes);
      setPassword("");
      setCode("");
      setStep(1);
      setSuccess(t.regenerated);
      onCommitted();
    } catch (failure) {
      setError(classifyError(toMfaRequestError(failure)));
    } finally {
      setBusy(false);
    }
  }

  const message = error ? mfaErrorText(t, error, false) : "";
  const live = feedback === "codes" ? t.copied : feedback === "download" ? t.downloaded : feedback === "copyFailed" ? t.copyFailed : success;

  return (
    <Modal size="md" icon={KeyRound} eyebrow={t.twoFactorTitle} title={t.regenerateTitle} subtitle={t.regenerateSubtitle}
      onClose={() => (step === 1 ? onDone("regenerated") : onClose())} dismissible={!busy} disableBackdropClose={step > 0}
      dirty={step === 0 ? Boolean(password || code) : !ack} dirtyMessage={step === 1 ? t.unackMessage : undefined}
      footer={
        <DialogFooter>
          {step === 1 ? <DialogClose variant="default" label={t.done} disabled={!ack} /> : <>
            <DialogClose label={t.cancel} disabled={busy} />
            <Button type="submit" form={formId} loading={busy}>
              {!busy && <KeyRound aria-hidden="true" />}{t.regenerateAction}
            </Button>
          </>}
        </DialogFooter>
      }>
      <MfaStepper labels={t.regenerateSteps} current={step} progressLabel={t.progress} completedLabel={t.completed} className="mb-6" />
      <DialogAlert message={error?.scope === "page" ? message : ""} status={error?.status} alertRef={alertRef} t={t}
        action={error?.reason === "state_changed" ? <Button type="button" variant="outline" size="sm" onClick={onStateChanged}><RotateCcw aria-hidden="true" />{t.reload}</Button> : undefined} />

      {step === 0 ? (
        <form id={formId} onSubmit={submit} aria-busy={busy} className="space-y-5" noValidate>
          <p className="text-sm font-normal leading-relaxed text-ink-muted">{t.regenerateIntro}</p>
          <PasswordField id="security-regenerate-password" value={password} onChange={setPassword} readOnly={busy} inputRef={passwordRef} t={t}
            error={error?.scope === "password" ? message : undefined} />
          <MfaCodeField id="security-regenerate-code" value={code} onChange={setCode} recovery={false} onRecoveryChange={() => {}}
            allowRecovery={false} readOnly={busy} inputRef={codeRef} label={t.codeLabel} hint={t.codeHint}
            error={error?.scope === "code" ? message : undefined} />
        </form>
      ) : (
        <RecoveryCodesSheet codes={codes} ack={ack} onAck={setAck} t={t} idPrefix="security-regenerate" headingRef={codesHeadingRef}
          feedback={feedback} onFeedback={announce} />
      )}

      <DialogLiveRegion busy={busy} busyLabel={t.working} message={live} />
    </Modal>
  );
}
