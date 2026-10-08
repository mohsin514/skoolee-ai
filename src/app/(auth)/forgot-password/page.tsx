'use client';
import { FieldAction, InputGroup } from "@/components/ui/input-group";


import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { requestPasswordReset, resetPassword, verifyToken } from "@/app/actions/auth/reset";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError, FormField } from "@/components/ui/form-field";
import {
  Loader2, ArrowRight, Mail, Lock, CheckCircle2, AlertCircle,
  CheckCircle, XCircle, ShieldCheck, Eye, EyeOff, Sparkles,
} from "lucide-react";
import SkooleeLogo from "@/components/SkooleeLogo";
import Link from "next/link";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [verification, setVerification] = useState<{ token: string; status: "valid" | "invalid" | "error" } | null>(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const verificationStatus = verification?.token === token ? verification.status : "loading";
  const [requestError, setRequestError] = useState<string>();
  const [resetError, setResetError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const stateHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestErrorRef = useRef<HTMLDivElement>(null);
  const resetErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyToken(token).then(res => {
      if (!active) return;
      setVerification({ token, status: res.valid ? "valid" : "invalid" });
      if (!res.valid) toast.error("Your recovery link has expired or is invalid.");
    }).catch(() => {
      if (active) setVerification({ token, status: "error" });
    });
    return () => { active = false; };
  }, [token, verificationAttempt]);

  useEffect(() => {
    if (isSubmitted || verificationStatus === "invalid" || verificationStatus === "error") {
      stateHeadingRef.current?.focus();
    }
  }, [isSubmitted, verificationStatus]);

  useEffect(() => {
    if (requestError) requestErrorRef.current?.focus();
    if (resetError) resetErrorRef.current?.focus();
  }, [requestError, resetError]);

  // Form for Requesting Reset
  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
  });

  // Form for Resetting Password
  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const watchPassword = resetForm.watch("password");
  const watchConfirm = resetForm.watch("confirmPassword");

  const passwordRequirements = [
    { label: "Min 8 characters", met: watchPassword.length >= 8 },
    { label: "One uppercase", met: /[A-Z]/.test(watchPassword) },
    { label: "One number", met: /[0-9]/.test(watchPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(watchPassword) },
    { label: "Passwords match", met: watchPassword === watchConfirm && watchPassword !== '' },
  ];

  const handleRequest = async (data: z.infer<typeof requestSchema>) => {
    setRequestError(undefined);
    setIsLoading(true);
    try {
      await requestPasswordReset(data.email);
      setIsSubmitted(true);
      toast.success("Identity verification link sent to your email.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send a recovery link. Please try again.";
      setRequestError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (data: z.infer<typeof resetSchema>) => {
    if (!token) return;
    setResetError(undefined);

    // Final check for requirements
    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      resetForm.setError("password", { type: "validate", message: "Please satisfy all security requirements." }, { shouldFocus: true });
      toast.error("Please satisfy all security requirements.");
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, data.password);
      toast.success("Security credentials updated successfully.");
      router.push("/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save your password. Please try again.";
      setResetError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] bg-[#fff7fe] font-sans">

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 xl:p-14">
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div className="sk-blob absolute -top-1/4 -left-1/5 h-[72%] w-[72%] rounded-full bg-[#9c48ea] opacity-70 blur-[90px]" />
          <div className="sk-blob sk-blob-2 absolute top-1/4 -right-1/4 h-[68%] w-[68%] rounded-full bg-[#b073f0] opacity-45 blur-[100px]" />
          <div className="sk-blob sk-blob-3 absolute -bottom-1/3 left-1/5 h-[62%] w-[62%] rounded-full bg-[#fbf0fe] opacity-[0.14] blur-[110px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#fff7fe]/12 to-transparent" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">
            Skoolee AI
          </p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#e9d5ff]" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">
              Account recovery
            </span>
          </div>

          <h2 className="mt-7 text-[2.6rem] xl:text-[3.1rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance">
            Regain access to
            <br />
            your
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent">
              {" "}campus.
            </span>
          </h2>

          <div className="sk-rise mt-9 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  A secure, unique recovery link is sent only to your registered
                  email. It expires quickly and is verified before any change.
                </p>
                <p className="mt-2.5 text-xs font-bold text-[#e4c9f7]">
                  We never store or reveal your credentials in plain text.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-white/75">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Encrypted at rest &amp; in transit</span>
          <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Single-use recovery links</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center p-4 sm:p-10 lg:p-14">
        <div className="w-full max-w-[30rem]">
          <div className="mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          <div className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-6 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9">
            {!token ? (
              // ── REQUEST RESET ──
              !isSubmitted ? (
                <>
                  <div className="mb-7 text-center">
                    <h1 className="text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
                      Recover account
                    </h1>
                    <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
                      We&apos;ll email you a single-use recovery link.
                    </p>
                  </div>

                  <form onSubmit={requestForm.handleSubmit(handleRequest)} className="space-y-4" aria-busy={isLoading} noValidate>
                    {requestError && <div ref={requestErrorRef} tabIndex={-1} role="group" aria-labelledby="recover-request-error"><FieldError id="recover-request-error">{requestError}</FieldError></div>}
                    <FormField name="email" id="recover-email" label="Email Identity" error={requestForm.formState.errors.email?.message} required>
                      <InputGroup>
                        <Mail data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                        <Input
                          id="recover-email"
                          type="email"
                          autoComplete="email"
                          placeholder="admin@horizon.edu"
                          readOnly={isLoading}
                          {...requestForm.register("email")}
                        />
                      </InputGroup>
                    </FormField>
                    <p role="status" className="sr-only">{isLoading ? "Sending…" : ""}</p>
                    <Button type="submit" disabled={isLoading} className="mt-1 w-full">
                      {isLoading ? <><Loader2 aria-hidden="true" className="animate-spin" /><span>Sending…</span></> : <><span>Send reset link</span><ArrowRight aria-hidden="true" className="rtl:rotate-180" /></>}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h1 ref={stateHeadingRef} tabIndex={-1} className="mb-2 text-2xl font-black tracking-tight text-[#1f1a23]">Check your inbox</h1>
                  <p className="mb-8 text-sm font-semibold leading-6 text-ink-muted">
                    If an eligible account exists, a single-use link will be sent. Check your inbox and spam folder.
                    If it does not arrive, try again in five minutes or contact your school administrator.
                  </p>
                  <Link href="/login" className="text-sm font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                    Back to login
                  </Link>
                </div>
              )
            ) : verificationStatus === "invalid" ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                  <AlertCircle className="h-10 w-10" />
                </div>
                <h1 ref={stateHeadingRef} tabIndex={-1} className="mb-2 text-2xl font-black tracking-tight text-[#1f1a23]">Link expired</h1>
                <p className="mb-8 text-sm font-semibold leading-6 text-ink-muted">
                  This recovery link has reached its expiration or has already been used.
                  Request a fresh one to continue.
                </p>
                <Button type="button" variant="outline" onClick={() => router.push("/forgot-password")}>
                  Request new link
                </Button>
              </div>
            ) : verificationStatus === "error" ? (
              <div className="py-6 text-center">
                <h1 ref={stateHeadingRef} tabIndex={-1} className="mb-2 text-2xl font-black tracking-tight text-ink">Unable to verify link</h1>
                <p className="mb-6 text-sm font-semibold leading-6 text-ink-muted">We couldn&apos;t check this recovery link. Please try again.</p>
                <Button type="button" variant="outline" onClick={() => { setVerification(null); setVerificationAttempt(attempt => attempt + 1); }}>
                  Try again
                </Button>
              </div>
            ) : verificationStatus === "loading" ? (
              <div role="status" className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-primary" />
                <h1 className="text-base font-bold text-ink-muted">Verifying link…</h1>
              </div>
            ) : (
              // ── RESET PASSWORD ──
              <>
                <div className="mb-7 text-center">
                  <h1 className="text-[1.85rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
                    New password
                  </h1>
                  <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
                    Define your new institutional access code.
                  </p>
                </div>

                <form onSubmit={resetForm.handleSubmit(handleReset)} className="space-y-4" aria-busy={isLoading} noValidate>
                  {resetError && <div ref={resetErrorRef} tabIndex={-1} role="group" aria-labelledby="recover-reset-error"><FieldError id="recover-reset-error">{resetError}</FieldError></div>}
                  <FormField name="password" id="new-password" label="New Password" error={resetForm.formState.errors.password?.message} required>
                    <InputGroup>
                      <Lock data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                      <Input id="new-password" aria-describedby="password-requirements" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="••••••••" readOnly={isLoading} {...resetForm.register("password")} />
                      <FieldAction type="button" data-field-affix="end" aria-controls="new-password" aria-label={showPassword ? "Hide new password" : "Show new password"} disabled={isLoading} onClick={() => setShowPassword(value => !value)}>
                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </FieldAction>
                    </InputGroup>
                  </FormField>
                  <FormField name="confirmPassword" id="confirm-password" label="Confirm Password" error={resetForm.formState.errors.confirmPassword?.message} required>
                    <InputGroup>
                      <Lock data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                      <Input id="confirm-password" aria-describedby="password-requirements" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="••••••••" readOnly={isLoading} {...resetForm.register("confirmPassword")} />
                      <FieldAction type="button" data-field-affix="end" aria-controls="confirm-password" aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"} disabled={isLoading} onClick={() => setShowConfirmPassword(value => !value)}>
                        {showConfirmPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </FieldAction>
                    </InputGroup>
                  </FormField>
                  <div className="rounded-2xl border border-border bg-muted p-4">
                    <h2 className="mb-2 text-sm font-bold text-ink">Security checklist</h2>
                    <ul id="password-requirements" className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                      {passwordRequirements.map(req => (
                        <li key={req.label} className={`flex items-start gap-1.5 text-sm font-semibold ${req.met ? "text-emerald-800" : "text-ink-muted"}`}>
                          {req.met ? <CheckCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
                          <span><span className="sr-only">{req.met ? "Met: " : "Not yet met: "}</span>{req.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p role="status" className="sr-only">{isLoading ? "Saving…" : ""}</p>
                  <Button type="submit" disabled={isLoading} className="mt-1 w-full">
                    {isLoading ? <><Loader2 aria-hidden="true" className="animate-spin" /><span>Saving…</span></> : <><span>Save new password</span><ArrowRight aria-hidden="true" className="rtl:rotate-180" /></>}
                  </Button>
                </form>
              </>
            )}
          </div>

          <div className="mt-5 border-t border-[#cfc2d6]/20 pt-4 text-center">
            <Link
              href="/login"
              className="text-sm font-bold text-ink-muted transition-colors hover:text-[#8127cf]"
            >
              Nevermind, I remember it.
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
