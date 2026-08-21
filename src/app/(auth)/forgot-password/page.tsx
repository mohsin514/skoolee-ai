'use client';

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { requestPasswordReset, resetPassword, verifyToken } from "@/app/actions/auth/reset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, ArrowRight, Mail, Lock, CheckCircle2, AlertCircle,
  CheckCircle, XCircle, ShieldCheck, Eye, Sparkles,
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
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    if (token) {
      verifyToken(token).then(res => {
        setIsValidToken(res.valid);
        if (!res.valid) {
          toast.error("Your recovery link has expired or is invalid.");
        }
      });
    }
  }, [token]);

  // Form for Requesting Reset
  const requestForm = useForm({
    resolver: zodResolver(requestSchema),
  });

  // Form for Resetting Password
  const resetForm = useForm({
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

  const handleRequest = async (data: any) => {
    setIsLoading(true);
    try {
      await requestPasswordReset(data.email);
      setIsSubmitted(true);
      toast.success("Identity verification link sent to your email.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (data: any) => {
    if (!token) return;

    // Final check for requirements
    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      toast.error("Please satisfy all security requirements.");
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, data.password);
      toast.success("Security credentials updated successfully.");
      router.push("/login");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] bg-[#fff7fe] font-sans">
      <style>{`
        @keyframes skDrift {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          33%     { transform: translate3d(4%,-6%,0) scale(1.12); }
          66%     { transform: translate3d(-5%,4%,0) scale(0.95); }
        }
        @keyframes skRise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sk-blob { animation: skDrift 22s ease-in-out infinite; will-change: transform; }
        .sk-blob-2 { animation-duration: 28s; animation-delay: -8s; }
        .sk-blob-3 { animation-duration: 34s; animation-delay: -16s; }
        .sk-rise { animation: skRise .5s cubic-bezier(.2,.7,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .sk-blob, .sk-rise { animation: none !important; }
        }
      `}</style>

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

          <h1 className="mt-7 text-[2.6rem] xl:text-[3.1rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance">
            Regain access to
            <br />
            your
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent">
              {" "}campus.
            </span>
          </h1>

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
      <section className="relative flex flex-col items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-[30rem]">
          <div className="mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          <div className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9">
            {!token ? (
              // ── REQUEST RESET ──
              !isSubmitted ? (
                <>
                  <div className="mb-7 text-center">
                    <h2 className="text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
                      Recover account
                    </h2>
                    <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
                      We&apos;ll email you a single-use recovery link.
                    </p>
                  </div>

                  <form onSubmit={requestForm.handleSubmit(handleRequest)} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                      <Label htmlFor="recover-email" className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">
                        Email Identity
                      </Label>
                      <div className="group relative flex items-center">
                        <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-colors group-focus-within:text-[#8127cf]" />
                        <Input
                          id="recover-email"
                          type="email"
                          autoComplete="email"
                          placeholder="admin@horizon.edu"
                          className={`h-12 w-full rounded-2xl border-0 pl-10 pr-4 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 ${
                            requestForm.formState.errors.email ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"
                          }`}
                          {...requestForm.register("email")}
                        />
                      </div>
                      {requestForm.formState.errors.email && (
                        <p className="px-1 text-xs font-bold text-rose-500">
                          {(requestForm.formState.errors.email as any).message}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group mt-1 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/35 active:scale-[0.985] disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Sending…</span>
                        </>
                      ) : (
                        <>
                          <span>Send reset link</span>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h3 className="mb-2 text-2xl font-black tracking-tight text-[#1f1a23]">Check your inbox</h3>
                  <p className="mb-8 text-sm font-semibold leading-6 text-ink-muted">
                    We&apos;ve sent an encrypted, single-use link to your registered email.
                    It expires shortly — no worries if it lapses, you can start again.
                  </p>
                  <Link href="/login" className="text-sm font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                    Back to login
                  </Link>
                </div>
              )
            ) : isValidToken === false ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                  <AlertCircle className="h-10 w-10" />
                </div>
                <h3 className="mb-2 text-2xl font-black tracking-tight text-[#1f1a23]">Link expired</h3>
                <p className="mb-8 text-sm font-semibold leading-6 text-ink-muted">
                  This recovery link has reached its expiration or has already been used.
                  Request a fresh one to continue.
                </p>
                <button
                  onClick={() => router.push("/forgot-password")}
                  className="cursor-pointer text-sm font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]"
                >
                  Request new link
                </button>
              </div>
            ) : isValidToken === null ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="h-10 w-10 animate-spin text-[#8127cf]" />
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ink-muted">Verifying link…</p>
              </div>
            ) : (
              // ── RESET PASSWORD ──
              <>
                <div className="mb-7 text-center">
                  <h2 className="text-[1.85rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
                    New password
                  </h2>
                  <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
                    Define your new institutional access code.
                  </p>
                </div>

                <form onSubmit={resetForm.handleSubmit(handleReset)} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password" className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">
                      New Password
                    </Label>
                    <div className="group relative flex items-center">
                      <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-colors group-focus-within:text-[#8127cf]" />
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className={`h-12 w-full rounded-2xl border-0 pl-10 pr-4 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 ${
                          resetForm.formState.errors.password ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"
                        }`}
                        {...resetForm.register("password")}
                      />
                    </div>
                    {resetForm.formState.errors.password && (
                      <p className="px-1 text-xs font-bold text-rose-500">
                        {(resetForm.formState.errors.password as any).message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password" className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">
                      Confirm Password
                    </Label>
                    <div className="group relative flex items-center">
                      <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-colors group-focus-within:text-[#8127cf]" />
                      <Input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className={`h-12 w-full rounded-2xl border-0 pl-10 pr-4 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 ${
                          resetForm.formState.errors.confirmPassword ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"
                        }`}
                        {...resetForm.register("confirmPassword")}
                      />
                    </div>
                    {resetForm.formState.errors.confirmPassword && (
                      <p className="px-1 text-xs font-bold text-rose-500">
                        {(resetForm.formState.errors.confirmPassword as any).message}
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe] p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">
                      Security checklist
                    </p>
                    <div className="grid grid-cols-2 gap-y-1.5">
                      {passwordRequirements.map((req, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors ${
                            req.met ? "text-emerald-600" : "text-ink-subtle"
                          }`}
                        >
                          {req.met ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 opacity-30" />}
                          {req.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group mt-1 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/35 active:scale-[0.985] disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <span>Save new password</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
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