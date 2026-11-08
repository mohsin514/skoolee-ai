"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskStatus } from "@/components/ui/task-patterns";
import { callMfaApi, toMfaRequestError } from "@/components/auth/mfa/mfa-client";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { TwoFactorCard, securityCardClass, type TwoFactorStatus } from "./TwoFactorCard";
import { SessionsCard, type SecuritySession } from "./SessionsCard";
import { ChangeAuthenticatorDialog } from "./ChangeAuthenticatorDialog";
import { RegenerateCodesDialog } from "./RegenerateCodesDialog";
import { DisableTwoFactorDialog } from "./DisableTwoFactorDialog";
import { MFA_MANAGE_URL } from "./dialog-parts";
import { securityUiCopy } from "@/lib/auth/security-ui-copy";
import { cn } from "@/lib/utils";

type Dialog = "password" | "change" | "enable" | "regenerate" | "disable" | null;
type Outcome = "changed" | "enabled" | "regenerated" | "disabled";

/**
 * Security & sign-in, as a section of the Settings modal: password, two-factor
 * status and management, and signed-in devices. Each flow opens as a dialog
 * stacked over Settings, so Escape closes only that flow and focus returns to
 * the button that opened it.
 */
export function SecuritySettingsPanel() {
  const locale = useLocale();
  const ui = useUiText();
  const t = securityUiCopy[locale.language];
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [announcement, setAnnouncement] = useState("");
  const [busySession, setBusySession] = useState("");

  // A full navigation: nothing here is valid once the session is gone.
  const expire = useCallback(() => window.location.assign("/login?reason=session-expired"), []);

  /** Status and sessions together; a 401 from either means the session is gone. */
  const load = useCallback(async () => {
    const [nextStatus, nextSessions] = await Promise.all([
      callMfaApi<TwoFactorStatus>(MFA_MANAGE_URL, { cache: "no-store" }),
      callMfaApi<{ sessions: SecuritySession[] }>("/api/auth/sessions", { cache: "no-store" }),
    ]);
    setStatus(nextStatus);
    setSessions(nextSessions.sessions ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    load().then(() => { if (active) setState("ready"); }).catch(failure => {
      if (!active) return;
      if (toMfaRequestError(failure).status === 401) expire();
      else setState("error");
    });
    return () => { active = false; };
  }, [attempt, load, expire]);

  /** Re-reads after a change without dropping back to the skeleton. */
  const refresh = useCallback(() => {
    void load().catch(failure => { if (toMfaRequestError(failure).status === 401) expire(); });
  }, [load, expire]);

  function open(next: Dialog) {
    setAnnouncement("");
    setDialog(next);
  }

  function finish(outcome: Outcome) {
    setDialog(null);
    setAnnouncement(t[outcome]);
    refresh();
  }

  function stateChanged() {
    setDialog(null);
    refresh();
  }

  async function endSession(session: SecuritySession) {
    setBusySession(session.id);
    setAnnouncement("");
    try {
      const response = await fetch("/api/auth/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: session.id }) });
      if (response.status === 401) { expire(); return; }
      if (!response.ok) throw new Error("end session failed");
      if (session.current) { window.location.assign("/login"); return; }
      setAnnouncement(t.ended);
      refresh();
    } catch {
      setAnnouncement(t.endFailed);
    } finally {
      setBusySession("");
    }
  }

  const unreadable = status?.authenticatorReadable === false;

  return (
    <div>
      {/* Post-dialog and session outcomes; always mounted so changes are announced. */}
      <div role="status" aria-live="polite" data-security-live className={announcement ? "mb-4" : undefined}>{announcement ? <TaskStatus>{announcement}</TaskStatus> : null}</div>

      <div className="space-y-4">
      <section aria-labelledby="security-password-heading" className={securityCardClass}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-primary">
            <KeyRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 id="security-password-heading" className="text-base font-bold tracking-tight text-ink-strong">{ui("Password")}</h4>
            <p className="mt-1 text-sm font-normal leading-relaxed text-ink-muted">{ui("Use a long password you don't use anywhere else.")}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => open("password")} className="sm:shrink-0">
            <KeyRound aria-hidden="true" />{ui("Change password")}
          </Button>
        </div>
      </section>

      {state === "loading" && (
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">{t.loading}</span>
          {[0, 1].map(card => (
            <div key={card} className={cn(securityCardClass, "space-y-4")}>
              <div className="flex items-center gap-4"><Skeleton className="size-11 rounded-2xl" delay={card * 80} /><Skeleton className="h-5 w-1/2 rounded-full" delay={card * 80 + 40} /></div>
              <Skeleton className="h-4 w-full rounded-full" delay={card * 80 + 80} />
              <Skeleton className="h-14 w-full rounded-2xl" delay={card * 80 + 120} />
            </div>
          ))}
        </div>
      )}

      {state === "error" && (
        <ErrorState description={t.loadError} retryLabel={t.retry} onRetry={() => { setState("loading"); setAttempt(value => value + 1); }} />
      )}

      {state === "ready" && status && (
        <>
          <TwoFactorCard status={status} t={t} locale={locale}
            onToggle={next => open(next ? "enable" : "disable")}
            onChange={() => open("change")}
            onRegenerate={() => open("regenerate")} />
          <SessionsCard sessions={sessions} t={t} locale={locale} busyId={busySession} onEnd={session => void endSession(session)} />
        </>
      )}
      </div>

      {dialog === "password" && <ChangePasswordDialog onClose={() => setDialog(null)} />}
      {(dialog === "change" || dialog === "enable") && (
        <ChangeAuthenticatorDialog key={dialog} mode={dialog} t={t} startWithRecovery={dialog === "change" && unreadable}
          onClose={() => setDialog(null)} onCommitted={refresh} onDone={finish} onStateChanged={stateChanged} />
      )}
      {dialog === "regenerate" && <RegenerateCodesDialog t={t} onClose={() => setDialog(null)} onCommitted={refresh} onDone={finish} onStateChanged={stateChanged} />}
      {dialog === "disable" && <DisableTwoFactorDialog t={t} startWithRecovery={unreadable} onClose={() => setDialog(null)} onDone={finish} onStateChanged={stateChanged} />}
    </div>
  );
}
