'use client'

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Mail, Lock,
  User as UserIcon, Loader2,
  CheckCircle, ShieldCheck, XCircle,
  ArrowRight, Hash, Building,
  LucideIcon, Network, ChevronLeft, Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SkooleeLogo from "@/components/SkooleeLogo";

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  icon: LucideIcon;
  type?: string;
  className?: string;
}

interface TypeOptionProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  desc: string;
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'school_group' | 'single_campus'>('school_group');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    schoolName: '',
    regId: '',
    autoId: true
  });

  const passwordRequirements = [
    { label: "Min 8 characters", met: formData.password.length >= 8 },
    { label: "One uppercase", met: /[A-Z]/.test(formData.password) },
    { label: "One number", met: /[0-9]/.test(formData.password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(formData.password) },
    { label: "Passwords match", met: formData.password === formData.confirmPassword && formData.password !== '' }
  ];

  const handleStep1 = () => {
    setStep(2);
    if (type === 'school_group' && !formData.regId && formData.autoId) {
      setFormData(prev => ({ ...prev, regId: `SKL-${Math.random().toString(36).substring(2, 6).toUpperCase()}` }));
    }
  };

  const handleAutoId = (auto: boolean) => {
    const newId = auto ? `SKL-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : '';
    setFormData({ ...formData, autoId: auto, regId: newId });
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email) {
      toast.error("Name and email are required.");
      return;
    }

    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      toast.error("Please meet all password requirements.");
      return;
    }

    let finalSchoolName = formData.schoolName;
    let finalRegId = formData.regId;

    if (type === 'single_campus') {
      finalSchoolName = `${formData.name} Academy`;
      finalRegId = `SC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    if (!finalSchoolName || !finalRegId) {
      toast.error("School name and ID are required.");
      return;
    }

    setLoading(true);
    try {
      const step1Res = await fetch("/api/auth/signup-step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          registrationType: type,
        }),
      });
      const step1 = await step1Res.json();
      if (!step1.success) throw new Error(step1.error || "Could not start registration");

      const step2Res = await fetch("/api/auth/signup-step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          fullName: formData.name,
          password: formData.password,
          schoolName: finalSchoolName,
          regId: finalRegId
        }),
      });
      const step2 = await step2Res.json();
      if (!step2.success) throw new Error(step2.error || "Registration failed");
      if (step2.warning) toast.warning(step2.warning);

      setStep(3);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
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
              Start in minutes
            </span>
          </div>

          <h1 className="mt-7 text-[2.6rem] xl:text-[3.1rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance">
            Set up your school
            <br />
            in
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent">
              {" "}an afternoon.
            </span>
          </h1>

          <div className="sk-rise mt-9 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20">
                <Network className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  Free for up to 100 students, live the same day. AI report cards, fees,
                  attendance and WhatsApp parent updates — one login.
                </p>
                <p className="mt-2.5 text-xs font-bold text-[#e4c9f7]">
                  No consultants. No six-month rollout.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-white/75">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Encrypted at rest &amp; in transit</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> Human-reviewed AI</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-lg">
          <div className="mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          <AnimatePresence mode="wait">
            {/* ─── Step 1: Choose Type ─── */}
            {step === 1 && (
              <motion.div
                key="s1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9"
              >
                <div className="mb-7 text-center">
                  <h2 className="text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
                    How is your school set up?
                  </h2>
                  <p className="mt-2 text-[14.5px] font-semibold text-[#4d4354]/60">
                    Choose the option that best describes your institution.
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <TypeOption active={type === 'school_group'} onClick={() => setType('school_group')} icon={Network} title="Multi-Campus School Group" desc="One school with multiple campuses or branches." />
                  <TypeOption active={type === 'single_campus'} onClick={() => setType('single_campus')} icon={Building2} title="Single Campus School" desc="One school, one location — quick and simple." />
                </div>

                <button
                  onClick={handleStep1}
                  className="group mt-1 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/35 active:scale-[0.985]"
                >
                  Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>

                <div className="mt-6 border-t border-[#cfc2d6]/20 pt-5 text-center">
                  <p className="text-sm font-semibold text-[#4d4354]/55">
                    Already have an account?{" "}
                    <Link href="/login" className="font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                      Log in
                    </Link>
                  </p>
                </div>
              </motion.div>
            )}

            {/* ─── Step 2: Account Details ─── */}
            {step === 2 && (
              <motion.div
                key="s2"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9"
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{type === 'school_group' ? 'Multi-Campus' : 'Single Campus'}</p>
                    <h2 className="text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23] mt-1">Create your account</h2>
                  </div>
                  <button onClick={() => setStep(1)} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf] transition-colors hover:bg-[#8127cf] hover:text-white"><ArrowRight className="h-4 w-4 rotate-180" /></button>
                </div>

                <form className="space-y-4" onSubmit={handleStep2Submit}>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InputField label="Full Name" placeholder="Your full name" value={formData.name} onChange={(v: string) => setFormData({ ...formData, name: v })} icon={UserIcon} />
                    <InputField label="Email" placeholder="email@school.edu" value={formData.email} onChange={(v: string) => setFormData({ ...formData, email: v })} icon={Mail} />
                  </div>

                  {type === 'school_group' && (
                    <div className="space-y-4 rounded-3xl border border-[#cfc2d6]/20 bg-[#fbf0fe] p-5">
                      <InputField label="School Group Name" placeholder="e.g. Beaconhouse School System" value={formData.schoolName} onChange={(v: string) => setFormData({ ...formData, schoolName: v })} icon={Building} className="bg-white" />
                      <div className="space-y-1.5">
                        <Label className="ml-1.5 text-[10px] font-black uppercase tracking-wider text-[#8127cf]">School ID</Label>
                        <div className="relative flex items-center">
                          <Hash className="absolute left-3.5 h-4 w-4 text-[#8127cf]/40" />
                          <Input
                            readOnly={formData.autoId}
                            value={formData.regId}
                            onChange={e => setFormData({ ...formData, regId: e.target.value.toUpperCase() })}
                            className="h-12 w-full rounded-2xl border-0 bg-white pl-10 pr-4 font-bold tracking-normal text-[#1f1a23] shadow-none focus:ring-2 focus:ring-[#8127cf]/25"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleAutoId(true)} className={`cursor-pointer rounded-lg px-3 py-1 text-[9px] font-black transition-all ${formData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'bg-[#cfc2d6]/20 text-[#4d4354]/40'}`}>Auto</button>
                          <button type="button" onClick={() => handleAutoId(false)} className={`cursor-pointer rounded-lg px-3 py-1 text-[9px] font-black transition-all ${!formData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'bg-[#cfc2d6]/20 text-[#4d4354]/40'}`}>Manual</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {type === 'single_campus' && (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                      <ShieldCheck className="h-7 w-7 text-emerald-500" />
                      <div>
                        <p className="text-xs font-black text-[#1f1a23]">Quick Setup Mode</p>
                        <p className="text-[10px] font-semibold text-[#4d4354]/60">Your school will be created automatically with a single campus.</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InputField label="Password" type="password" placeholder="Min 8 characters" value={formData.password} onChange={(v: string) => setFormData({ ...formData, password: v })} icon={Lock} />
                    <InputField label="Confirm Password" type="password" placeholder="Re-enter password" value={formData.confirmPassword} onChange={(v: string) => setFormData({ ...formData, confirmPassword: v })} icon={ShieldCheck} />
                  </div>

                  <div className="grid grid-cols-2 gap-y-1.5 rounded-3xl border border-[#cfc2d6]/20 bg-[#fbf0fe] p-4">
                    <p className="col-span-2 mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">Password checklist</p>
                    {passwordRequirements.map((r, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-[11px] font-bold ${r.met ? 'text-emerald-600' : 'text-[#4d4354]/30'}`}>
                        {r.met ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 opacity-30" />} {r.label}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(1)} className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[#cfc2d6]/30 font-bold text-[#4d4354]/60 transition-all hover:border-[#8127cf]/20 hover:text-[#8127cf]"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="submit" disabled={loading} className="group mt-0 flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/35 active:scale-[0.985] disabled:cursor-wait disabled:opacity-60">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create Account <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* ─── Step 3: Success ─── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-[30px] border border-emerald-100/50 bg-white p-8 text-center shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[24px] bg-emerald-50 text-emerald-500 shadow-inner">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h2 className="mb-2 text-2xl font-black tracking-tight text-[#1f1a23]">Account created!</h2>
                <p className="mb-8 px-4 text-sm font-semibold leading-relaxed text-[#4d4354]/60">
                  We&apos;ve sent a verification email to your inbox. Please check your email and click the link to activate your account, then log in to start setting up your school.
                </p>
                <Link href="/login" className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 font-black text-white shadow-lg shadow-emerald-200/30 transition-all hover:shadow-xl hover:shadow-emerald-200/50">
                  Go to Login
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}

function TypeOption({ active, onClick, icon: Icon, title, desc }: TypeOptionProps) {
  return (
    <div
      onClick={onClick}
      className={`relative group flex cursor-pointer items-center gap-5 overflow-hidden rounded-2xl border-2 p-5 transition-all ${active ? 'border-[#8127cf] bg-gradient-to-br from-[#fbf0fe]/80 to-white shadow-xl shadow-[#8127cf]/10' : 'border-[#cfc2d6]/20 bg-[#f3f4f9] hover:border-[#8127cf]/20 hover:bg-white'}`}
    >
      <div className={`rounded-2xl p-3 transition-all ${active ? 'bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-lg shadow-[#8127cf]/20' : 'bg-white text-[#4d4354]/40 group-hover:bg-[#8127cf]/5 group-hover:text-[#8127cf]'}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <h3 className="text-left text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
        <p className="mt-1 text-left text-[11px] font-semibold leading-tight text-[#4d4354]/60">{desc}</p>
      </div>
      {active && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#8127cf] p-1 text-white shadow-md">
          <CheckCircle className="h-3 w-3" />
        </motion.div>
      )}
    </div>
  );
}

function InputField({ label, placeholder, value, onChange, icon: Icon, type = "text", className = "" }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="ml-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]">{label}</Label>
      <div className="group relative flex items-center">
        <Icon className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4d4354]/30 transition-colors group-focus-within:text-[#8127cf]" />
        <Input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`h-12 w-full rounded-2xl border-0 bg-[#fbf0fe] pl-10 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-[#4d4354]/25 focus:bg-white focus:ring-2 focus:ring-[#8127cf]/25 ${className}`}
        />
      </div>
    </div>
  );
}