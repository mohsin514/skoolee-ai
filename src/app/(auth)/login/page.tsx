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
  ChevronLeft, Timer, Check,
} from "lucide-react";
import Link from "next/link";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";
import AvatarOrbit from "@/components/auth/AvatarOrbit";
import LiveActivityTicker from "@/components/auth/LiveActivityTicker";

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

/**
 * One address can hold accounts at several schools (a parent with children at
 * two institutions, a teacher working across two groups), so /api/auth/login
 * may answer with a choice instead of a session. The password is already
 * verified by the time this list comes back — it is a disambiguation prompt,
 * not an enumeration oracle.
 */
type SchoolChoice = {
  schoolId: string;
  schoolName: string;
  schoolCity?: string;
  logoUrl?: string | null;
  campusName?: string | null;
  role: string;
};

type LoginUser = {
  fullName: string;
  role: string;
  mustChangePassword?: boolean;
  onboardingComplete?: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(false);
  const [choices, setChoices] = useState<SchoolChoice[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  // Seconds left on a 429. The button stays disabled and says so, rather than
  // letting people hammer a request that cannot succeed yet.
  const [cooldown, setCooldown] = useState(0);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const brandRef = useRef<HTMLElement>(null);

  // Subtle parallax: blobs and the avatar orbit drift opposite the cursor
  // for a sense of depth. Written straight to the DOM (no re-render) and
  // skipped entirely on touch devices / reduced-motion.
  const handleBrandMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = brandRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", String((e.clientX - rect.left) / rect.width - 0.5));
    el.style.setProperty("--my", String((e.clientY - rect.top) / rect.height - 0.5));
  }, []);
  const resetBrandParallax = useCallback(() => {
    setPaused(false);
    const el = brandRef.current;
    el?.style.setProperty("--mx", "0");
    el?.style.setProperty("--my", "0");
  }, []);

  useEffect(() => {
    const verified = searchParams.get("verified") === "true";
    const invited = searchParams.get("invite") === "accepted";
    // Set by signOutInvalidSession() when the server stopped accepting the
    // session. Without a word here the redirect looks like a random logout.
    const expired = searchParams.get("reason") === "session-expired";
    if (verified) {
      toast.success("Account verified. Please log in.", { duration: 8000 });
    } else if (invited) {
      toast.success("Invitation accepted. Log in with your new password.", { duration: 8000 });
    } else if (expired) {
      toast.info("Your session has ended. Please sign in again.", { duration: 8000 });
    }
    if (verified || invited || expired) window.history.replaceState(null, "", "/login");
  }, [searchParams]);

  // Rotate the proof panel; pause on hover and honour reduced motion.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || paused) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % PROOF.length), 6000);
    return () => clearInterval(id);
  }, [paused]);

  // Tick the rate-limit cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const {
    register, handleSubmit, getValues, formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const trackCaps = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  // Spread this rather than register() inline: react-hook-form supplies its
  // own onBlur, and we need to run ours alongside it instead of replacing it.
  const passwordField = register("password");

  // Where a signed-in user actually belongs. Shared by the plain sign-in and
  // by the school picker so the two can never drift apart.
  const landAfterLogin = useCallback(async (user: LoginUser) => {
    toast.success(`Welcome back, ${user.fullName}!`);
    setSuccess(true);

    // Let the button's checkmark morph play before navigating away —
    // a beat of confirmation feels more deliberate than an instant jump.
    await new Promise((resolve) => setTimeout(resolve, 550));

    if (user.mustChangePassword) {
      router.push("/first-login");
    } else if (user.role === "TEACHER" && !user.onboardingComplete) {
      router.push("/teacher-onboarding");
    } else {
      router.push(dashboardPathForRole(user.role));
    }
  }, [router]);

  /**
   * One request shape for both passes. The second pass adds `schoolId`, which
   * narrows the candidate lookup to the school the user picked.
   */
  const attemptLogin = useCallback(async (
    data: LoginFormData,
    schoolId?: string,
  ): Promise<{ choices: SchoolChoice[] } | { user: LoginUser }> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, rememberMe: remember, ...(schoolId ? { schoolId } : {}) }),
    });
    const json = await res.json();

    if (res.status === 429) {
      // Honour the server's own Retry-After rather than guessing.
      const retry = Number(res.headers.get("Retry-After")) || 60;
      setCooldown(retry);
      throw new Error(json.error || "Too many attempts. Please wait a moment.");
    }
    if (!res.ok) {
      // Zod field errors come back as an object; flatten to the first message.
      const raw = json.error;
      const message = typeof raw === "string"
        ? raw
        : Object.values(raw ?? {}).flat()[0] as string | undefined;
      throw new Error(message || "Login failed");
    }
    if (json.needsSchoolSelection) return { choices: json.schools as SchoolChoice[] };
    return { user: json.user as LoginUser };
  }, [remember]);

  const onSubmit = async (data: LoginFormData) => {
    if (cooldown > 0) return;
    setIsLoading(true);
    setFormError(null);
    try {
      const result = await attemptLogin(data);
      if ("choices" in result) {
        setChoices(result.choices);
        setIsLoading(false);
        return;
      }
      await landAfterLogin(result.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Login failed";
      setFormError(message);
      toast.error(message);
      setIsLoading(false);
    }
  };

  // Second pass: the password is already verified, so this re-submits the same
  // credentials pinned to one school rather than asking for them again.
  const pickSchool = async (choice: SchoolChoice) => {
    setChoosing(choice.schoolId);
    setFormError(null);
    try {
      const result = await attemptLogin(getValues(), choice.schoolId);
      if ("choices" in result) throw new Error("Could not sign in to that school.");
      await landAfterLogin(result.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Login failed";
      setFormError(message);
      toast.error(message);
      setChoosing(null);
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
        @keyframes skShimmer {
          from { transform: translateX(-130%) skewX(-12deg); }
          to   { transform: translateX(130%) skewX(-12deg); }
        }
        @keyframes skCheckPop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .sk-blob { animation: skDrift 22s ease-in-out infinite; will-change: transform; }
        .sk-blob-2 { animation-duration: 28s; animation-delay: -8s; }
        .sk-blob-3 { animation-duration: 34s; animation-delay: -16s; }
        .sk-parallax { transition: transform .35s ease-out; will-change: transform; }
        .sk-rise { animation: skRise .6s cubic-bezier(.2,.7,.3,1) both; }
        .sk-shake { animation: skShake .34s ease-in-out; }
        .sk-shimmer { animation: skShimmer 2.6s ease-in-out infinite; }
        .sk-check-pop { animation: skCheckPop .4s cubic-bezier(.2,.7,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .sk-blob, .sk-rise, .sk-shake, .sk-shimmer, .sk-check-pop { animation: none !important; }
          .sk-parallax { transition: none !important; }
        }
      `}</style>

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section
        ref={brandRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={resetBrandParallax}
        onMouseMove={handleBrandMouseMove}
        className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 xl:p-14"
      >
        {/* Animated mesh — kept strictly inside the brand purple family
            so the panel reads as Skoolee rather than generic dark SaaS.
            Each blob sits in its own parallax wrapper (cursor offset) while
            an inner element carries the independent drift animation. */}
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div
            className="sk-parallax absolute -top-1/4 -left-1/5 h-[72%] w-[72%]"
            style={{ transform: "translate3d(calc(var(--mx, 0) * 26px), calc(var(--my, 0) * 26px), 0)" }}
          >
            <div className="sk-blob h-full w-full rounded-full bg-[#9c48ea] opacity-70 blur-[90px]" />
          </div>
          <div
            className="sk-parallax absolute top-1/4 -right-1/4 h-[68%] w-[68%]"
            style={{ transform: "translate3d(calc(var(--mx, 0) * -34px), calc(var(--my, 0) * -34px), 0)" }}
          >
            <div className="sk-blob sk-blob-2 h-full w-full rounded-full bg-[#b073f0] opacity-45 blur-[100px]" />
          </div>
          <div
            className="sk-parallax absolute -bottom-1/3 left-1/5 h-[62%] w-[62%]"
            style={{ transform: "translate3d(calc(var(--mx, 0) * 16px), calc(var(--my, 0) * 16px), 0)" }}
          >
            <div className="sk-blob sk-blob-3 h-full w-full rounded-full bg-[#fbf0fe] opacity-[0.14] blur-[110px]" />
          </div>
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

        {/* Orbiting user avatars — "every role, always connected". Anchored
            off the bottom-right corner so it reads as ambient motion behind
            the copy rather than competing with it. */}
        <div
          className="sk-parallax absolute -bottom-16 -right-16 z-0"
          style={{ transform: "translate3d(calc(var(--mx, 0) * -12px), calc(var(--my, 0) * -12px), 0)" }}
        >
          <AvatarOrbit size={340} duration={50} className="opacity-90" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">
            Skoolee AI
          </p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="sk-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#e9d5ff]" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">
              AI-assisted school management
            </span>
          </div>

          <h1
            className="sk-rise mt-7 text-[2.9rem] xl:text-[3.4rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance"
            style={{ animationDelay: "80ms" }}
          >
            Run the whole
            <br />
            institution from
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent"> one place.</span>
          </h1>

          {/* Sits on a mid-purple ground, so the card needs a darker scrim
              and near-opaque text to stay legible. */}
          <div
            key={slide}
            className="sk-rise mt-9 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl"
            style={{ animationDelay: slide === 0 ? "160ms" : "0ms" }}
          >
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

          <div className="sk-rise mt-6" style={{ animationDelay: "240ms" }}>
            <LiveActivityTicker />
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
          <div className="sk-rise mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          <div className="sk-rise mb-7 text-center" style={{ animationDelay: "70ms" }}>
            <h2 className="text-[1.9rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
              {choices ? "Choose your school" : "Welcome back"}
            </h2>
            <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
              {choices
                ? "This email is registered at more than one institution."
                : "Sign in to your campus dashboard."}
            </p>
          </div>

          <div
            className="sk-rise rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9"
            style={{ animationDelay: "140ms" }}
          >
            {formError && (
              <div
                role="alert"
                className="sk-shake mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <p className="text-[13px] font-bold leading-snug text-rose-600">{formError}</p>
              </div>
            )}

            {choices ? (
              <div className="space-y-2.5">
                {choices.map((c, i) => {
                  const busy = choosing === c.schoolId;
                  return (
                    <button
                      key={c.schoolId}
                      type="button"
                      onClick={() => pickSchool(c)}
                      disabled={!!choosing}
                      className="sk-rise group flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-4 text-left transition-all hover:border-[#8127cf]/45 hover:bg-white hover:shadow-lg hover:shadow-[#8127cf]/10 disabled:cursor-wait disabled:opacity-60"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      {c.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.logoUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-2xl object-cover shadow-sm"
                        />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-[15px] font-black text-white shadow-sm shadow-[#8127cf]/25">
                          {c.schoolName.trim().charAt(0).toUpperCase() || "S"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-black text-[#1f1a23]">
                          {c.schoolName}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#8127cf]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                            {roleLabel(c.role)}
                          </span>
                          {(c.campusName || c.schoolCity) && (
                            <span className="truncate text-[11px] font-bold text-ink-subtle">
                              {c.campusName || c.schoolCity}
                            </span>
                          )}
                        </span>
                      </span>
                      {busy ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#8127cf]" />
                      ) : (
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-subtle transition-all group-hover:translate-x-0.5 group-hover:text-[#8127cf]" />
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => { setChoices(null); setFormError(null); }}
                  disabled={!!choosing}
                  className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-[#cfc2d6]/30 py-3 text-[12px] font-black text-ink-muted transition-colors hover:border-[#8127cf]/25 hover:text-[#8127cf] disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Use a different account
                </button>
              </div>
            ) : (
              <>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">
                  Work Email
                </Label>
                <div className="group relative flex items-center">
                  <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-[#8127cf]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    aria-invalid={!!errors.email}
                    placeholder="principal@institution.edu.pk"
                    className={`h-12 w-full rounded-2xl border-0 pl-10 pr-4 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 ${
                      errors.email ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"
                    }`}
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="px-1 text-xs font-bold text-rose-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-wider text-ink">
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
                  <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-[#8127cf]" />
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    placeholder="••••••••"
                    className={`h-12 w-full rounded-2xl border-0 pl-10 pr-12 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 ${
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
                    className="absolute right-4 cursor-pointer text-ink-subtle transition-colors hover:text-[#8127cf]"
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

              {/* A 30-day session instead of 7 — an explicit choice, never the
                  default, since school accounts are often on shared machines. */}
              <label className="group flex cursor-pointer items-center gap-2.5 px-1 pt-0.5 select-none">
                <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-[7px] border-2 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#8127cf]/30 peer-focus-visible:ring-offset-2 ${
                      remember
                        ? "border-[#8127cf] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-sm shadow-[#8127cf]/30"
                        : "border-[#cfc2d6]/70 bg-white group-hover:border-[#8127cf]/50"
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 text-white transition-all duration-200 ${
                        remember ? "scale-100 opacity-100" : "scale-50 opacity-0"
                      }`}
                      strokeWidth={3.5}
                    />
                  </span>
                </span>
                <span className="text-[12px] font-bold text-ink-muted transition-colors group-hover:text-[#1f1a23]">
                  Keep me signed in for 30 days
                </span>
              </label>

              <button
                type="submit"
                disabled={isLoading || success || cooldown > 0}
                className={`group relative mt-1 flex h-12 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl font-black text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.985] disabled:cursor-wait disabled:active:scale-100 ${
                  success
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-emerald-500/30"
                    : cooldown > 0
                    ? "bg-gradient-to-r from-[#a08bb0] to-[#8f7aa0] shadow-none"
                    : "bg-gradient-to-r from-[#8127cf] to-[#9c48ea] shadow-[#8127cf]/25 hover:shadow-[#8127cf]/35 disabled:opacity-60"
                }`}
              >
                {!isLoading && !success && cooldown === 0 && (
                  <span className="sk-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {success ? (
                    <>
                      <CheckCircle2 className="sk-check-pop h-4 w-4" />
                      <span>Welcome back!</span>
                    </>
                  ) : cooldown > 0 ? (
                    <>
                      <Timer className="h-4 w-4" />
                      <span>Try again in {cooldown}s</span>
                    </>
                  ) : isLoading ? (
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
                </span>
              </button>
            </form>

            <div className="mt-6 border-t border-[#cfc2d6]/20 pt-5">
              <p className="text-center text-[12.5px] font-semibold leading-relaxed text-ink-muted">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                  Create New Account
                </Link>
              </p>
            </div>
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-bold text-ink-subtle">
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
