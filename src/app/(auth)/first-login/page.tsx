"use client";
import { FieldAction, InputGroup } from "@/components/ui/input-group";


import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError, FormField } from "@/components/ui/form-field";
import {
  Loader2, Eye, EyeOff, Lock, ArrowRight, Check, X, KeyRound, ShieldCheck,
} from "lucide-react";
import SkooleeLogo from "@/components/SkooleeLogo";
import { dashboardPathForRole } from "@/lib/roles";

interface Rule {
  label: string;
  test: (v: string) => boolean;
}

const RULES: Rule[] = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One letter", test: (v) => /[A-Za-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One symbol (recommended)", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const STRENGTH = [
  { label: "Too short", bar: "w-0", tone: "bg-[#cfc2d6]", text: "text-ink-subtle" },
  { label: "Weak", bar: "w-1/4", tone: "bg-rose-400", text: "text-rose-500" },
  { label: "Fair", bar: "w-2/4", tone: "bg-amber-400", text: "text-amber-600" },
  { label: "Good", bar: "w-3/4", tone: "bg-[#9c48ea]", text: "text-[#8127cf]" },
  { label: "Strong", bar: "w-full", tone: "bg-emerald-500", text: "text-emerald-600" },
];

export default function FirstLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = useMemo(() => RULES.map((r) => r.test(password)), [password]);
  const score = passed.filter(Boolean).length;
  const strength = STRENGTH[password.length === 0 ? 0 : score];
  const required = passed[0] && passed[1] && passed[2];
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = Boolean(required && matches) && !isLoading;
  const passwordError = passwordTouched && !required ? "Use at least 8 characters, including one letter and one number." : undefined;
  const confirmError = confirm.length > 0 && !matches ? "Passwords do not match" : undefined;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/first-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update password");

      toast.success("Password updated. Welcome to Skoolee.");
      const target =
        json.role === "TEACHER" && !json.onboardingComplete
          ? "/teacher-onboarding"
          : dashboardPathForRole(json.role);
      router.push(target);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update password";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#fbf0fe] p-4 sm:p-5 font-sans">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-7">
          <SkooleeLogo size="2.2rem" weight="heavy" className="mb-3" />
          <div className="h-0.5 w-10 bg-gradient-to-r from-[#8127cf] to-[#9c48ea] rounded-full" />
        </div>

        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-[0_32px_64px_rgba(31,26,35,0.06)] border border-[#cfc2d6]/15">
          <div className="flex flex-col items-start gap-4 mb-7 sm:flex-row">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/25">
              <KeyRound aria-hidden="true" className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#1f1a23] tracking-tight">Set your password</h1>
              <p className="text-sm font-semibold text-ink-muted mt-1 leading-relaxed">
                Your account was created with a temporary password. Choose your own to continue —
                you will only be asked this once.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" aria-busy={isLoading} noValidate>
            {error && (
              <div ref={errorRef} tabIndex={-1} role="group" aria-labelledby="first-login-error" className="rounded-2xl bg-status-error-surface border border-status-error-border px-4 py-3">
                <FieldError id="first-login-error">{error}</FieldError>
              </div>
            )}
            <FormField name="password" id="password" label="New Password" error={passwordError} required>
              <InputGroup>
                <Lock aria-hidden="true" data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  autoFocus
                  autoComplete="new-password"
                  aria-describedby="first-password-strength first-password-rules"
                  placeholder="Choose a strong password"
                  readOnly={isLoading}
                />
                <FieldAction type="button" data-field-affix="end" disabled={isLoading} onClick={() => setShow(value => !value)} aria-controls="password" aria-label={show ? "Hide new password" : "Show new password"}>
                  {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </FieldAction>
              </InputGroup>
            </FormField>
            <div className="px-1">
              <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${strength.bar} ${strength.tone}`} />
              </div>
              <p id="first-password-strength" className="text-sm font-semibold mt-1.5 text-ink-muted">
                {password.length > 0 ? `Password strength: ${strength.label}` : "Enter a password"}
              </p>
            </div>
            <ul id="first-password-rules" className="grid grid-cols-1 gap-x-4 gap-y-2 px-1 sm:grid-cols-2">
              {RULES.map((rule, i) => (
                <li key={rule.label} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${passed[i] ? "bg-emerald-800" : "bg-muted"}`}>
                    {passed[i] ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} /> : <X className="h-2.5 w-2.5 text-ink-muted" strokeWidth={3.5} />}
                  </span>
                  <span className={`text-sm font-semibold ${passed[i] ? "text-ink" : "text-ink-muted"}`}>
                    <span className="sr-only">{passed[i] ? "Met: " : "Not yet met: "}</span>{rule.label}
                  </span>
                </li>
              ))}
            </ul>
            <FormField name="confirm" id="confirm" label="Confirm Password" error={confirmError} required>
              <InputGroup>
                <ShieldCheck aria-hidden="true" data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Type it again"
                  readOnly={isLoading}
                />
                <FieldAction type="button" data-field-affix="end" disabled={isLoading} onClick={() => setShowConfirm(value => !value)} aria-controls="confirm" aria-label={showConfirm ? "Hide confirmed password" : "Show confirmed password"}>
                  {showConfirm ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </FieldAction>
              </InputGroup>
            </FormField>
            <p role="status" className="sr-only">{isLoading ? "Saving…" : ""}</p>
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {isLoading ? <><Loader2 aria-hidden="true" className="animate-spin" /><span>Saving…</span></> : <><span>Save and continue</span><ArrowRight aria-hidden="true" className="rtl:rotate-180" /></>}
            </Button>
          </form>
        </div>

        <p className="text-center text-[11px] font-bold text-ink-subtle mt-5">
          Skoolee will never ask for your password by email or WhatsApp.
        </p>
      </div>
    </main>
  );
}
