'use client'

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, ChevronRight, Mail, Lock, 
  User as UserIcon, Loader2, GraduationCap, 
  CheckCircle, ShieldCheck, XCircle,
  ArrowRight, Hash, Building, Info, ChevronLeft,
  LucideIcon, Network
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { submitSignupStep1, submitSignupStep2 } from '@/app/actions/signup';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  icon: LucideIcon;
  type?: string;
}

interface TypeOptionProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  desc: string;
}

export default function SplitSignupFlow() {
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
    // Re-verify archetype selection and move to Step 2
    setStep(2);
    // Auto-gen ID for group flow if needed
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
      toast.error("Personal and Work contact details are required.");
      return;
    }

    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      toast.error("Please satisfy all security requirements.");
      return;
    }

    // Prepare final data based on archetype
    let finalSchoolName = formData.schoolName;
    let finalRegId = formData.regId;

    if (type === 'single_campus') {
       // Auto-generate hidden group entity for standalone schools
       finalSchoolName = `${formData.name} Academy`;
       finalRegId = `SC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    if (!finalSchoolName || !finalRegId) {
      toast.error("Institutional Identity is required.");
      return;
    }

    setLoading(true);
    try {
      await submitSignupStep1({
        email: formData.email,
        registrationType: type,
      });

      await submitSignupStep2({
        email: formData.email,
        fullName: formData.name,
        password: formData.password,
        schoolName: finalSchoolName,
        regId: finalRegId
      });

      setStep(3);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="w-full h-screen grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-[#fff7fe] font-sans">
      
      {/* ─── LEFT SIDE ─── */}
      <section className="hidden md:block relative overflow-hidden h-screen">
        <div className="absolute inset-0 bg-[#8127cf]/10 mix-blend-multiply z-10"></div>
        <img src="/login.svg" alt="Skoolee Registration" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#8127cf]/40 to-transparent z-20"></div>
        <div className="absolute bottom-12 left-12 z-30 max-w-md">
          <div className="bg-white/70 backdrop-blur-[24px] p-8 rounded-xl border border-white/20 shadow-2xl">
            <span className="text-[12px] font-bold tracking-widest text-[#9c48ea] uppercase mb-2 block">Institutional Phase</span>
            <h2 className="text-3xl font-extrabold text-[#1f1a23] leading-tight mb-4">
               {type === 'school_group' ? "Centralized management for educational networks." : "Professional console for standalone academies."}
            </h2>
            <p className="text-[#4d4354] font-medium text-sm">Deploy your architectural layer in minutes.</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE ─── */}
      <section className="flex flex-col items-center justify-center p-6 md:p-8 bg-[#fbf0fe] relative h-screen overflow-y-auto w-full">
        <div className="w-full max-w-lg">
          
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-[22px] flex items-center justify-center shadow-lg transform rotate-3 mb-4">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-[#1f1a23] mb-2">Skoolee AI</h1>
            <div className="h-1 w-12 bg-[#8127cf] rounded-full"></div>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-[#ffffff] rounded-[32px] p-8 shadow-[0_32px_64px_rgba(129,39,207,0.05)] border border-[#cfc2d6]/10">
                <div className="mb-8 text-center md:text-left">
                  <h2 className="text-2xl font-black text-[#1f1a23] tracking-tight">Select Archetype</h2>
                  <p className="text-[#4d4354]/60 text-sm font-medium mt-1">Determine your institutional structure first.</p>
                </div>
                
                <div className="space-y-4 mb-8">
                   <TypeOption active={type === 'school_group'} onClick={() => setType('school_group')} icon={Network} title="Multi-Campus Group" desc="Command center for educational chains." />
                   <TypeOption active={type === 'single_campus'} onClick={() => setType('single_campus')} icon={Building2} title="Standalone Academy" desc="Direct setup for single-facility schools." />
                </div>

                <button onClick={handleStep1} className="w-full h-14 bg-[#8127cf] text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 group hover:bg-[#9c48ea] active:scale-[0.98] transition-all">
                  Initialize Registry <ArrowRight className="h-5 w-5 group-hover:translate-x-1" />
                </button>
                
                <div className="mt-8 pt-6 border-t border-[#cfc2d6]/10 text-center">
                  <p className="text-sm text-[#4d4354] font-medium">
                    Already operational? <Link href="/login" className="text-[#8127cf] font-bold hover:underline ml-1">Log in to console</Link>
                  </p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#ffffff] rounded-[32px] p-8 shadow-[0_32px_64px_rgba(129,39,207,0.05)] border border-[#cfc2d6]/10">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-[#1f1a23] tracking-tight">Access Authority</h2>
                    <p className="text-xs font-bold text-[#8127cf] uppercase tracking-wider mt-1">{type.replace('_', ' ')} Phase</p>
                  </div>
                  <button onClick={() => setStep(1)} className="p-2 bg-[#fbf0fe] rounded-lg text-[#8127cf] hover:bg-[#8127cf] hover:text-white transition-all"><ArrowRight className="w-4 h-4 rotate-180" /></button>
                </div>

                <form className="space-y-5" onSubmit={handleStep2Submit}>
                  
                  {/* Common Personal Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <InputField label="Admin Name" placeholder="Your Name" value={formData.name} onChange={(v: string) => setFormData({...formData, name: v})} icon={UserIcon} />
                    <InputField label="Work Email" placeholder="email@school.edu" value={formData.email} onChange={(v: string) => setFormData({...formData, email: v})} icon={Mail} />
                  </div>

                  {/* Archetype Specific Registry */}
                  {type === 'school_group' && (
                    <div className="p-6 bg-[#fbf0fe] rounded-3xl border border-[#cfc2d6]/20 space-y-5">
                       <InputField label="Group/Organization Name" placeholder="e.g. Beaconhouse Group" value={formData.schoolName} onChange={(v: string) => setFormData({...formData, schoolName: v})} icon={Building} />
                       <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-[#8127cf] tracking-widest uppercase">Global Registry ID (Reg ID)</Label>
                          <div className="relative">
                             <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8127cf]/40" />
                             <Input 
                                readOnly={formData.autoId} 
                                value={formData.regId} 
                                onChange={e => setFormData({...formData, regId: e.target.value.toUpperCase()})}
                                className="h-12 pl-11 bg-white border-0 font-bold tracking-widest text-[#1f1a23] rounded-xl" 
                             />
                          </div>
                          <div className="flex gap-2">
                             <button type="button" onClick={() => handleAutoId(true)} className={`text-[9px] font-black px-2 py-0.5 rounded ${formData.autoId ? 'bg-[#8127cf] text-white' : 'bg-[#cfc2d6]/20 text-[#4d4354]/40'}`}>Auto-Gen</button>
                             <button type="button" onClick={() => handleAutoId(false)} className={`text-[9px] font-black px-2 py-0.5 rounded ${!formData.autoId ? 'bg-[#8127cf] text-white' : 'bg-[#cfc2d6]/20 text-[#4d4354]/40'}`}>Manual</button>
                          </div>
                       </div>
                    </div>
                  )}

                  {type === 'single_campus' && (
                    <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                       <ShieldCheck className="w-8 h-8 text-emerald-500" />
                       <div>
                          <p className="text-xs font-bold text-[#1f1a23]">Simplified Setup Enabled</p>
                          <p className="text-[10px] text-[#4d4354]/60">Your institutional group layer will be auto-instantiated.</p>
                       </div>
                    </div>
                  )}

                  {/* Security */}
                  <div className="grid grid-cols-2 gap-4">
                     <InputField label="Choose Password" type="password" placeholder="••••••••" value={formData.password} onChange={(v: string) => setFormData({...formData, password: v})} icon={Lock} />
                     <InputField label="Verify Password" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={(v: string) => setFormData({...formData, confirmPassword: v})} icon={ShieldCheck} />
                  </div>

                  {/* Password Feedback */}
                  <div className="p-4 bg-[#fbf0fe] rounded-2xl border border-emerald-100/30 grid grid-cols-2 gap-y-1.5">
                      {passwordRequirements.map((r, i) => (
                        <div key={i} className={`flex items-center gap-1.5 text-[10px] font-bold ${r.met ? 'text-emerald-600' : 'text-[#4d4354]/30'}`}>
                           {r.met ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3 opacity-30" />} {r.label}
                        </div>
                      ))}
                  </div>

                  <div className="flex gap-4">
                    <button type="button" onClick={() => setStep(1)} className="h-14 px-6 border border-[#cfc2d6]/30 text-[#4d4354]/60 rounded-xl font-bold hover:bg-white transition-all"><ChevronLeft className="w-5 h-5" /></button>
                    <button type="submit" disabled={loading} className="flex-1 h-14 bg-[#8127cf] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#9c48ea] shadow-lg shadow-[#8127cf]/20 transition-all active:scale-[0.98]">
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Complete Enrollment <ArrowRight className="h-5 w-5" /></>}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[40px] p-10 text-center shadow-xl border border-emerald-100/50">
                <div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center mx-auto mb-8 text-emerald-500 shadow-inner">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-extrabold text-[#1f1a23] mb-3 tracking-tighter text-center">Credentials Dispatched</h2>
                <p className="text-sm font-medium text-[#4d4354]/60 mb-10 leading-relaxed px-4">
                  We've successfully created your institutional account. Please check your registry email to verify access and start onboarding.
                </p>
                <Link href="/login" className="inline-flex w-full h-16 bg-emerald-500 text-white rounded-2xl font-extrabold items-center justify-center hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200/50">
                  Return to Console Login
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
      className={`relative group p-6 rounded-[24px] cursor-pointer transition-all border-2 flex items-center gap-5 overflow-hidden ${active ? 'border-[#8127cf] bg-[#fbf0fe]/30 shadow-xl shadow-[#8127cf]/10' : 'border-transparent bg-[#f3f4f9] hover:bg-white border-[#cfc2d6]/20'}`}
    >
      <div className={`p-3 rounded-2xl transition-all ${active ? 'bg-[#8127cf] text-white shadow-lg' : 'bg-white text-[#4d4354]/40 group-hover:bg-[#8127cf]/5 group-hover:text-[#8127cf]'}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-black text-[#1f1a23] tracking-tight text-left">{title}</h3>
        <p className="text-[10px] text-[#4d4354]/60 font-semibold leading-tight mt-1 text-left">{desc}</p>
      </div>
      {active && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="bg-[#8127cf] text-white p-1 rounded-full border-2 border-white absolute top-4 right-4 shadow-md">
           <CheckCircle className="w-3 h-3" />
        </motion.div>
      )}
    </div>
  );
}

function InputField({ label, placeholder, value, onChange, icon: Icon, type = "text" }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-black text-[#4d4354] uppercase tracking-[0.1em] ml-1.5">{label}</Label>
      <div className="relative group flex items-center">
        <Icon className="absolute left-4 w-4 h-4 text-[#4d4354]/40 group-focus-within:text-[#8127cf] transition-colors" />
        <Input 
          type={type} 
          placeholder={placeholder} 
          value={value} 
          onChange={e => onChange(e.target.value)}
          className="h-12 pl-11 bg-[#f3f4f9] border-0 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none placeholder:text-[#4d4354]/30"
        />
      </div>
    </div>
  );
}
