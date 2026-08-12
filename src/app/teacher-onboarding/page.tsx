'use client';

import { useState, useEffect, FormEvent } from 'react';
import Image from "next/image";
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Loader2,
  MapPin,
  Phone,
  Shield,
  Sparkles,
  User,
  UserRound,
} from 'lucide-react';
import SkooleeLogo from "@/components/SkooleeLogo";
import { getTeacherOnboardingSession, completeTeacherOnboarding } from '@/app/actions/completeTeacherOnboarding';
import { dashboardPathForRole } from '@/lib/roles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STEPS = ["Personal Info", "Professional", "Address & Emergency"];

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    cnic: '',
    dateOfBirth: '',
    gender: '',
    qualification: '',
    specialization: '',
    experience: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    emergencyContact: '',
    emergencyPhone: '',
  });

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  useEffect(() => {
    const load = async () => {
      const session = await getTeacherOnboardingSession();
      if (!session) { router.replace('/login'); return; }
      if (session.redirect) { router.replace(dashboardPathForRole(session.role)); return; }
      if (session.error) { router.replace('/login'); return; }
      if (session.user) {
        setForm((p) => ({
          ...p,
          fullName: session.user!.fullName || '',
          phone: session.user!.phone || '',
        }));
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const canStep0 = form.fullName.trim().length >= 2 && form.phone.trim().length >= 7;
  const canSubmit = canStep0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await completeTeacherOnboarding(form);
      toast.success('Profile completed! Welcome to Skoolee.');
      router.push('/teacher');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf0fe]">
        <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
      </main>
    );
  }

  const Field = ({ label, id, value, placeholder, onChange, required, type = "text" }: {
    label: string; id: string; value: string; placeholder: string;
    onChange: (v: string) => void; required?: boolean; type?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-lg border-0 bg-[#fbf0fe] px-4 font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
      />
    </div>
  );

  const Select = ({ label, id, value, onChange, children }: {
    label: string; id: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-12 w-full rounded-lg border-0 bg-[#fbf0fe] px-4 text-sm font-medium shadow-none outline-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
      >
        {children}
      </select>
    </div>
  );

  return (
    <main className="grid min-h-screen grid-cols-1 overflow-hidden bg-[#fff7fe] font-sans text-[#1f1a23] md:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden md:block">
        <div className="absolute inset-0 z-10 bg-[#8127cf]/10 mix-blend-multiply" />
        <Image src="/login.svg" alt="Skoolee onboarding" fill className="object-cover" priority />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#8127cf]/40 to-transparent" />
        <div className="absolute bottom-12 left-12 z-30 max-w-md rounded-xl border border-white/20 bg-white/70 p-8 shadow-2xl backdrop-blur-[24px]">
          <span className="mb-2 block text-[12px] font-bold uppercase tracking-normal text-[#9c48ea]">Almost There</span>
          <h1 className="mb-4 text-3xl font-extrabold leading-tight text-[#1f1a23]">
            Complete your profile to start teaching with Skoolee.
          </h1>
          <p className="text-sm font-medium text-[#4d4354]">
            Your workspace is ready. Just a few details to personalize your experience.
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center overflow-y-auto bg-[#fbf0fe] p-6 md:p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4">
              <SkooleeLogo size="1.6rem" />
            </div>
            <div className="h-1 w-12 rounded-full bg-[#8127cf]" />
          </div>

          {/* Step indicators */}
          <div className="mb-6 flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => { if (i < step || (i === 1 && canStep0) || (i === 2 && canStep0)) setStep(i); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-normal transition-all ${
                  step === i
                    ? "bg-[#8127cf] text-white shadow-md"
                    : i < step
                    ? "bg-[#e8d5f5] text-[#8127cf] cursor-pointer"
                    : "bg-[#f3f4f9] text-[#4d4354]/40"
                }`}
              >
                {i < step ? <CheckCircle2 className="h-3 w-3" /> : null}
                {s}
              </button>
            ))}
          </div>

          <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-8 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "0ms" }}>
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#fbf0fe] px-3 py-1.5 text-[10px] font-black uppercase tracking-normal text-[#8127cf]">
                <Sparkles className="h-3.5 w-3.5" />
                Step {step + 1} of {STEPS.length}
              </div>
              <h1 className="text-xl font-black tracking-normal text-[#1f1a23]">{STEPS[step]}</h1>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Step 0 — Personal Info */}
              {step === 0 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">
                      Full Name <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative flex items-center">
                      <UserRound className="pointer-events-none absolute left-4 h-5 w-5 text-[#4d4354]" />
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={(e) => set("fullName", e.target.value)}
                        placeholder="Your official name"
                        className="h-12 rounded-lg border-0 bg-[#fbf0fe] pl-12 pr-4 font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                      />
                    </div>
                    {form.fullName && form.fullName.trim().length < 2 && (
                      <p className="px-1 text-xs font-medium text-rose-500">Name must be at least 2 characters</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">
                      Phone Number <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative flex items-center">
                      <Phone className="pointer-events-none absolute left-4 h-5 w-5 text-[#4d4354]" />
                      <Input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder="03XX-XXXXXXX"
                        className="h-12 rounded-lg border-0 bg-[#fbf0fe] pl-12 pr-4 font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                      />
                    </div>
                    {form.phone && form.phone.trim().length < 7 && (
                      <p className="px-1 text-xs font-medium text-rose-500">Phone must be at least 7 digits</p>
                    )}
                  </div>

                  <Field label="CNIC" id="cnic" value={form.cnic} placeholder="12345-1234567-1" onChange={(v) => set("cnic", v)} />
                  <Field label="Date of Birth" id="dob" value={form.dateOfBirth} placeholder="YYYY-MM-DD" onChange={(v) => set("dateOfBirth", v)} type="date" />
                  <Select label="Gender" id="gender" value={form.gender} onChange={(v) => set("gender", v)}>
                    <option value="">Not specified</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </div>
              )}

              {/* Step 1 — Professional */}
              {step === 1 && (
                <div className="space-y-4">
                  <Select label="Qualification" id="qualification" value={form.qualification} onChange={(v) => set("qualification", v)}>
                    <option value="">Select qualification</option>
                    <option value="Matric">Matric</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Bachelors">Bachelors</option>
                    <option value="Masters">Masters</option>
                    <option value="MPhil">MPhil</option>
                    <option value="PhD">PhD</option>
                    <option value="B.Ed">B.Ed</option>
                    <option value="M.Ed">M.Ed</option>
                  </Select>
                  <Field label="Specialization" id="specialization" value={form.specialization} placeholder="e.g. Mathematics, Physics" onChange={(v) => set("specialization", v)} />
                  <Field label="Experience" id="experience" value={form.experience} placeholder="e.g. 5 years" onChange={(v) => set("experience", v)} />
                </div>
              )}

              {/* Step 2 — Address & Emergency */}
              {step === 2 && (
                <div className="space-y-4">
                  <Field label="Address" id="address" value={form.address} placeholder="Street address" onChange={(v) => set("address", v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" id="city" value={form.city} placeholder="City" onChange={(v) => set("city", v)} />
                    <Select label="Province" id="province" value={form.province} onChange={(v) => set("province", v)}>
                      <option value="">Select</option>
                      <option value="Punjab">Punjab</option>
                      <option value="Sindh">Sindh</option>
                      <option value="KPK">KPK</option>
                      <option value="Balochistan">Balochistan</option>
                      <option value="Islamabad">Islamabad</option>
                      <option value="AJK">AJK</option>
                      <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                    </Select>
                  </div>
                  <Field label="Postal Code" id="postalCode" value={form.postalCode} placeholder="Postal code" onChange={(v) => set("postalCode", v)} />

                  <div className="mt-2 mb-1 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#8127cf]" />
                    <p className="text-xs font-bold uppercase tracking-normal text-[#8127cf]">Emergency Contact</p>
                  </div>
                  <Field label="Contact Person" id="emergencyContact" value={form.emergencyContact} placeholder="Emergency contact name" onChange={(v) => set("emergencyContact", v)} />
                  <Field label="Contact Phone" id="emergencyPhone" value={form.emergencyPhone} placeholder="Emergency phone number" onChange={(v) => set("emergencyPhone", v)} />
                </div>
              )}

              {/* Navigation buttons */}
              <div className="mt-6 flex items-center justify-between gap-3">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="flex h-12 items-center gap-2 rounded-xl bg-[#f3f4f9] px-5 text-sm font-bold text-[#4d4354] transition-all hover:bg-[#e8e0ec] cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                ) : <div />}

                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    disabled={step === 0 && !canStep0}
                    onClick={() => setStep(step + 1)}
                    className="flex h-12 items-center gap-2 rounded-xl bg-[#8127cf] px-6 text-sm font-bold text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:bg-[#9c48ea] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSubmit || saving}
                    className="flex h-12 items-center gap-2 rounded-xl bg-[#8127cf] px-6 text-sm font-bold text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:bg-[#9c48ea] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Complete Profile
                        <CheckCircle2 className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
