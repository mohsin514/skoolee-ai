"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, RotateCcw, ShieldOff } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MfaCodeField } from "@/components/auth/mfa/MfaCodeField";
import { MfaMethodToggle } from "@/components/auth/mfa/MfaMethodToggle";
import { mfaErrorText } from "@/components/auth/mfa/mfa-copy";
import { toMfaRequestError } from "@/components/auth/mfa/mfa-client";
import type { SecurityCopy } from "@/lib/auth/security-ui-copy";
import {
  CloseWhen, DialogAlert, DialogClose, DialogFooter, DialogLiveRegion, PasswordField, classifyError, postManage, useErrorFocus, type DialogError,
} from "./dialog-parts";

/** Turns 2FA off for roles that allow it. Needs the password plus an authenticator or recovery code. */
export function DisableTwoFactorDialog({ t, startWithRecovery = false, onClose, onDone, onStateChanged }: {
  t: SecurityCopy;
  startWithRecovery?: boolean;
  onClose: () => void;
  onDone: (outcome: "disabled") => void;
  onStateChanged: () => void;
}) {
  const formId = useId();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(startWithRecovery);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useErrorFocus(error, { password: passwordRef, code: codeRef, alert: alertRef });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || finished) return;
    setBusy(true);
    setError(null);
    try {
      await postManage({ action: "disable", password, code, recovery });
      setPassword("");
      setCode("");
      setFinished(true);
    } catch (failure) {
      const next = classifyError(toMfaRequestError(failure));
      if (next.reason === "secret_unavailable") { setRecovery(true); setCode(""); }
      setError(next);
    } finally {
      setBusy(false);
    }
  }

  function chooseMethod(next: boolean) {
    if (busy || next === recovery) return;
    setRecovery(next);
    setCode("");
    setError(null);
    codeRef.current?.focus();
  }

  const message = error ? mfaErrorText(t, error, recovery) : "";

  return (
    <Modal size="md" tone="rose" icon={ShieldOff} eyebrow={t.twoFactorTitle} title={t.disableTitle} subtitle={t.disableSubtitle}
      onClose={() => (finished ? onDone("disabled") : onClose())} dismissible={!busy}
      dirty={!finished && Boolean(password || code)}
      footer={
        <DialogFooter>
          <DialogClose label={t.cancel} disabled={busy} />
          <Button type="submit" form={formId} variant="destructive" disabled={busy || finished} aria-busy={busy}>
            {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <ShieldOff aria-hidden="true" />}{t.disableAction}
          </Button>
        </DialogFooter>
      }>
      <CloseWhen when={finished && !busy} />
      <DialogAlert message={error?.scope === "page" ? message : ""} status={error?.status} alertRef={alertRef} t={t}
        action={error?.reason === "state_changed" ? <Button type="button" variant="outline" size="sm" onClick={onStateChanged}><RotateCcw aria-hidden="true" />{t.reload}</Button> : undefined} />
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-status-warning-border bg-status-warning-surface p-4 text-status-warning-text">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p id="security-disable-warning" className="text-sm font-semibold leading-relaxed">{t.disableWarning}</p>
      </div>
      <form id={formId} onSubmit={submit} aria-busy={busy} aria-describedby="security-disable-warning" className="space-y-5" noValidate>
        <PasswordField id="security-disable-password" value={password} onChange={setPassword} readOnly={busy} inputRef={passwordRef} t={t}
          error={error?.scope === "password" ? message : undefined} />
        <MfaMethodToggle recovery={recovery} onChange={chooseMethod} disabled={busy} t={t} />
        <MfaCodeField id="security-disable-code" value={code} onChange={setCode} recovery={recovery}
          onRecoveryChange={next => { setRecovery(next); setError(null); }} allowRecovery readOnly={busy} inputRef={codeRef}
          label={recovery ? t.recoveryLabel : t.codeLabel} hint={recovery ? t.recoveryHint : t.codeHint}
          error={error?.scope === "code" ? message : undefined} />
      </form>
      <DialogLiveRegion busy={busy} busyLabel={t.working} message={finished ? t.disabled : ""} />
    </Modal>
  );
}
