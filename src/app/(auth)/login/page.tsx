"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { loginSchema, type LoginFormData } from "@/lib/validators/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Eye, EyeOff, ArrowRight, Mail, Lock, ShieldCheck,
  AlertCircle, CheckCircle2, Users, GraduationCap, Building2, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { dashboardPathForRole } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";

// Rotating proof points on the brand panel. Each pairs a claim with a
// concrete number so the panel says something instead of decorating.
const PROOF = [
  {
    icon: GraduationCap,
    stat: "32",
    unit: "live event types",
    quote: "Every mark, payment and absence reaches the right person the moment it happens.",
    caption: "Real-time notifications across every role",
  },
  {
    icon: Building2,
    stat: "Multi",
    unit: "campus by design",
    quote: "One login for the whole group. Each campus stays sealed from the others.",
    caption: "Built for school groups, not single classrooms",
  },
  {
    icon: Users,
    stat: "8",
    unit: "role-aware dashboards",
    quote: "Owners, principals, teachers and parents each see exactly their slice.",
    caption: "Nothing more, nothing less",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [capsOn, setCapsOn] = useState(false);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const liveRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const verified = searchParams.get("verified") === "true";
    const invited = searchParams.get("invite") === "accepted";
    if (verified) {
      toast.success("Account verified. Please log in.", { duration: 8000 });
    } else if (invited) {
      toast.success("Invitation accepted. Log in with your new password.", { duration: 8000 });
    }
    if (verified || invited) window.history.replaceState(null, "", "/login");
  }, [searchParams]);

  // Rotate the proof panel; pause on hover and honour reduced motion.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || paused) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % PROOF.length), 6000);
    return () => clearInterval(id);
  }, [paused]);

  const {
    register, handleSubmit, formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const trackCaps = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  // Spread this rather than register() inline: react-hook-form supplies its
  // own onBlur, and we need to run ours alongside it instead of replacing it.
  const passwordField = register("password");

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Login failed");

      toast.success(`Welcome back, ${json.user.fullName}!`);

      if (json.user.mustChangePassword) {
        router.push("/first-login");
      } else if (json.user.role === "TEACHER" && !json.user.onboardingComplete) {
        router.push("/teacher-onboarding");
      } else {
        router.push(dashboardPathForRole(json.user.role));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Login failed";
      setFormError(message);
      toast.error(message);
      setIsLoading(false);
    }
  };

  const active = PROOF[slide];
  const ActiveIcon = active.icon;

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
        @keyframes skShake {
          0%,100% { transform: translateX(0); }
          25%     { transform: translateX(-5px); }
          75%     { transform: translateX(5px); }
        }
        .sk-blob { animation: skDrift 22s ease-in-out infinite; will-change: transform; }
        .sk-blob-2 { animation-duration: 28s; animation-delay: -8s; }
        .sk-blob-3 { animation-duration: 34s; animation-delay: -16s; }
        .sk-rise { animation: skRise .5s cubic-bezier(.2,.7,.3,1) both; }
        .sk-shake { animation: skShake .34s ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
          .sk-blob, .sk-rise, .sk-shake { animation: none !important; }
        }
      `}</style>

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 xl:p-14"
      >
        {/* Animated mesh — kept strictly inside the brand purple family
            so the panel reads as Skoolee rather than generic dark SaaS. */}
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
          {/* Softens the hard edge where the panel meets the form side. */}
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
              AI-assisted school management
            </span>
          </div>

          <h1 className="mt-7 text-[2.9rem] xl:text-[3.4rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance">
            Run the whole
            <br />
            institution from
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent"> one place.</span>
          </h1>

          {/* Sits on a mid-purple ground, so the card needs a darker scrim
              and near-opaque text to stay legible. */}
          <div key={slide} className="sk-rise mt-9 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20">
                <ActiveIcon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-black tracking-tight text-white">{active.stat}</span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#f0dcff]">{active.unit}</span>
                </div>
                <p ref={liveRef} aria-live="polite" className="mt-2 text-[15px] font-semibold leading-relaxed text-white">
                  {active.quote}
                </p>
                <p className="mt-2.5 text-xs font-bold text-[#e4c9f7]">{active.caption}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2.5" role="tablist" aria-label="Product highlights">
            {PROOF.map((p, i) => (
              <button
                key={p.caption}
                role="tab"
                aria-selected={i === slide}
                aria-label={p.caption}
                onClick={() => setSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-400 cursor-pointer hover:bg-white/70 ${
                  i === slide ? "w-9 bg-white" : "w-1.5 bg-white/30"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-white/75">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Encrypted at rest &amp; in transit</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Human-reviewed AI</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-[30rem]">
          {/* Brand mark sits above the form on every breakpoint. */}
          <div className="mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          <div className="mb-7 text-center">
            <h2 className="text-[1.9rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
              Welcome back
            </h2>
            <p className="mt-2 text-[14.5px] font-semibold text-[#4d4354]/60">
              Sign in to your campus dashboard.
            </p>
          </div>

          <div className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9">
            {formError && (
              <div
                role="alert"
                className="sk-shake mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <p className="text-[13px] font-bold leading-snug text-rose-600">{formError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="ml-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]">
                  Work Email
                </Label>
                <div className="group relative flex items-center">
                  <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4d4354]/30 transition-colors group-focus-within:text-[#8127cf]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    aria-invalid={!!errors.email}
                    placeholder="principal@institution.edu.pk"
                    className={`h-12 w-full rounded-2xl border-0 pl-10 pr-4 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-[#4d4354]/25 focus:bg-white focus:ring-2 ${
                      errors.email ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"
                    }`}
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="px-1 text-xs font-bold text-rose-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]">
                    Password
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-[10px] font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="group relative flex items-center">
                  <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4d4354]/30 transition-colors group-focus-within:text-[#8127cf]" />
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    placeholder="••••••••"
                    className={`h-12 w-full rounded-2xl border-0 pl-10 pr-12 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-[#4d4354]/25 focus:bg-white focus:ring-2 ${
                      errors.password ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"
                    }`}
                    {...passwordField}
                    onKeyUp={trackCaps}
                    onKeyDown={trackCaps}
                    onBlur={(e) => { setCapsOn(false); passwordField.onBlur(e); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                    className="absolute right-4 cursor-pointer text-[#4d4354]/30 transition-colors hover:text-[#8127cf]"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="px-1 text-xs font-bold text-rose-500">{errors.password.message}</p>}
                {capsOn && !errors.password && (
                  <p className="flex items-center gap-1.5 px-1 text-xs font-bold text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is on
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
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-[#cfc2d6]/20 pt-5">
              <p className="text-center text-[12.5px] font-semibold leading-relaxed text-[#4d4354]/55">
                Accounts are issued by your school administrator.
                <br />
                New institution?{" "}
                <a
                  href="mailto:sales@skoolee.ai?subject=Skoolee%20access%20request"
                  className="font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]"
                >
                  Talk to us
                </a>
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-bold text-[#4d4354]/45">
            <Link href="/privacy" className="transition-colors hover:text-[#8127cf]">Privacy</Link>
            <span className="h-3 w-px bg-[#cfc2d6]/50" />
            <Link href="/security" className="transition-colors hover:text-[#8127cf]">Security</Link>
            <span className="h-3 w-px bg-[#cfc2d6]/50" />
            <Link href="/ai-governance" className="transition-colors hover:text-[#8127cf]">AI Governance</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
