'use client'

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Network, Building2, ChevronRight, Mail, Lock, 
  User as UserIcon, Loader2, GraduationCap, 
  CheckCircle, ShieldCheck, XCircle, AlertCircle,
  ArrowRight, Hash, Building, Info, ChevronLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { submitSignupStep1, submitSignupStep2 } from '@/app/actions/signup';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    setStep(2);
    // Auto-gen ID for first time if none exists
    if (!formData.regId && formData.autoId) {
       setFormData(prev => ({ ...prev, regId: `SKL-${Math.random().toString(36).substring(2, 6).toUpperCase()}` }));
    }
  };

  const handleAutoId = (auto: boolean) => {
    const newId = auto ? `SKL-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : '';
    setFormData({ ...formData, autoId: auto, regId: newId });
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      toast.error("Please satisfy all security requirements.");
      return;
    }

    if (!formData.schoolName || !formData.regId) {
      toast.error("Institution Name and Identity ID are required.");
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
        schoolName: formData.schoolName,
        regId: formData.regId
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
      
      {/* ─── LEFT SIDE: Visual Narrative ─── */}
      <section className="hidden md:block relative overflow-hidden h-screen">
        <div className="absolute inset-0 bg-[#8127cf]/10 mix-blend-multiply z-10"></div>
        <img src="/login.svg" alt="Skoolee Registration" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#8127cf]/40 to-transparent z-20"></div>
        <div className="absolute bottom-12 left-12 z-30 max-w-md">
          <div className="bg-white/70 backdrop-blur-[24px] p-8 rounded-xl border border-white/20 shadow-2xl">
            <span className="text-[12px] font-bold tracking-widest text-[#9c48ea] uppercase mb-2 block">Institutional Setup</span>
            <h2 className="text-3xl font-extrabold text-[#1f1a23] leading-tight mb-4">"The foundation of every state is the education of its youth."</h2>
            <p className="text-[#4d4354] font-medium text-sm">Initialize your institution's digital architecture today with Skoolee AI.</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE: Interaction Canvas ─── */}
      <section className="flex flex-col items-center justify-center p-6 md:p-8 bg-[#fbf0fe] relative h-screen overflow-y-auto w-full">
        <div className="w-full max-w-lg">
          
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 mb-4">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-[#1f1a23] mb-2">Skoolee AI</h1>
            <div className="h-1 w-12 bg-[#8127cf] rounded-full"></div>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-[#ffffff] rounded-[32px] p-8 shadow-[0_32px_64px_rgba(129,39,207,0.05)] border border-[#cfc2d6]/10">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Select Archetype</h2>
                  <p className="text-[#4d4354] text-sm mt-1">Determine how your institution will be structured.</p>
                </div>
                
                <div className="space-y-4 mb-8">
                   <TypeOption active={type === 'school_group'} onClick={() => setType('school_group')} icon={Network} title="Multi-Campus Group" desc="Centralized command for chains and franchises." />
                   <TypeOption active={type === 'single_campus'} onClick={() => setType('single_campus')} icon={Building2} title="Single Campus" desc="Fast configuration for standalone educational nodes." />
                </div>

                <button onClick={handleStep1} className="w-full h-14 bg-[#8127cf] text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 group hover:bg-[#9c48ea] active:scale-[0.98] transition-all">
                  Proceed to Identity <ArrowRight className="h-5 w-5 group-hover:translate-x-1" />
                </button>
                
                <div className="mt-8 pt-6 border-t border-[#cfc2d6]/10 text-center">
                  <p className="text-sm text-[#4d4354] font-medium">
                    Already have an account? <Link href="/login" className="text-[#8127cf] font-bold hover:underline ml-1">Sign in instead</Link>
                  </p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#ffffff] rounded-[32px] p-8 shadow-[0_32px_64px_rgba(129,39,207,0.05)] border border-[#cfc2d6]/10">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Establish Identity</h2>
                    <p className="text-xs font-bold text-[#8127cf] uppercase tracking-wider mt-1">{type.replace('_', ' ')} Setup</p>
                  </div>
                  <button onClick={() => setStep(1)} type="button" className="text-xs font-bold text-[#4d4354]/40 hover:text-[#8127cf] flex items-center gap-1 transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Change Type
                  </button>
                </div>

                <form className="space-y-5" onSubmit={handleStep2Submit}>
                  {/* Account Owner */}
                  <div className="grid grid-cols-2 gap-4">
                    <InputField label="Full Name" placeholder="Full Name" value={formData.name} onChange={v => setFormData({...formData, name: v})} icon={UserIcon} />
                    <InputField label="Work Email" placeholder="email@institution.edu" value={formData.email} onChange={v => setFormData({...formData, email: v})} icon={Mail} />
                  </div>

                  {/* Institutional Global Registry (Synced to Onboarding) */}
                  <div className="p-6 bg-[#fbf0fe] rounded-3xl border border-[#cfc2d6]/20 space-y-5">
                     <div className="space-y-1">
                        <InputField label="Institution / Group Name" placeholder="e.g. Horizon International" value={formData.schoolName} onChange={v => setFormData({...formData, schoolName: v})} icon={Building} />
                        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-widest pl-1 mt-1 flex items-center gap-1.5 leading-none">
                           <Info className="w-3 h-3 text-[#8127cf]" /> This will be the global entity name.
                        </p>
                     </div>

                     <div className="space-y-2 pt-2">
                        <div className="flex justify-between items-center px-1">
                           <Label className="text-[10px] font-bold text-[#8127cf] tracking-widest uppercase">Global Registry identity (Reg ID)</Label>
                           <div className="bg-white rounded-lg p-1 flex border border-[#cfc2d6]/30">
                              <button type="button" onClick={()=>handleAutoId(true)} className={`px-2 py-0.5 text-[9px] font-black rounded-md transition-all ${formData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-[#4d4354]/40'}`}>Auto-Gen</button>
                              <button type="button" onClick={()=>handleAutoId(false)} className={`px-2 py-0.5 text-[9px] font-black rounded-md transition-all ${!formData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-[#4d4354]/40'}`}>Manual</button>
                           </div>
                        </div>
                        <div className="relative">
                           <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8127cf]/40" />
                           <Input 
                              readOnly={formData.autoId} 
                              value={formData.regId} 
                              onChange={e => setFormData({...formData, regId: e.target.value.toUpperCase()})}
                              placeholder="SKL-XXXX"
                              className="h-12 pl-11 bg-white border-0 font-bold tracking-widest text-[#1f1a23] rounded-xl focus:ring-2 focus:ring-[#8127cf]/20 shadow-none text-sm transition-all" 
                           />
                        </div>
                        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-widest pl-1 leading-relaxed">
                           {formData.autoId ? "System will generate a unique architectural code for you." : "Enter your permanent institutional registration code."}
                        </p>
                     </div>
                  </div>

                  {/* Security Credentials */}
                  <div className="grid grid-cols-2 gap-4">
                     <InputField label="New Password" type="password" placeholder="••••••••" value={formData.password} onChange={v => setFormData({...formData, password: v})} icon={Lock} />
                     <InputField label="Verify Password" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={v => setFormData({...formData, confirmPassword: v})} icon={ShieldCheck} />
                  </div>

                  <div className="p-4 bg-[#fbf0fe] rounded-2xl border border-emerald-100/30">
                     <div className="grid grid-cols-2 gap-y-1.5">
                        {passwordRequirements.map((r, i) => (
                          <div key={i} className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors ${r.met ? 'text-emerald-600' : 'text-[#4d4354]/30'}`}>
                             {r.met ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3 opacity-30" />} {r.label}
                          </div>
                        ))}
                     </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <button 
                      type="button"
                      onClick={() => setStep(1)}
                      className="h-14 px-6 border border-[#cfc2d6]/30 text-[#4d4354]/60 rounded-xl font-bold flex items-center justify-center hover:bg-white transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button type="submit" disabled={loading} className="flex-1 h-14 bg-[#8127cf] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#9c48ea] shadow-lg shadow-[#8127cf]/20 transition-all active:scale-[0.98]">
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Complete Identity Phase <ArrowRight className="h-5 w-5" /></>}
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
                <h2 className="text-3xl font-extrabold text-[#1f1a23] mb-3 tracking-tighter">Identity Dispatched</h2>
                <p className="text-sm font-medium text-[#4d4354]/60 mb-10 leading-relaxed px-4">
                  We've successfully created your institutional registry. A secure verification pass has been sent to your inbox. Please follow the link to confirm your authority and begin onboarding.
                </p>
                <Link href="/login" className="inline-flex w-full h-16 bg-emerald-500 text-white rounded-2xl font-extrabold tracking-tight items-center justify-center hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200/50">
                  Return to Login Screen
                </Link>
                <div className="mt-8 flex items-center justify-center gap-2">
                   <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                   <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Awaiting Verification</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}

function TypeOption({ active, onClick, icon: Icon, title, desc }: any) {
  return (
    <div 
      onClick={onClick} 
      className={`relative group p-6 rounded-[24px] cursor-pointer transition-all border-2 flex items-center gap-5 overflow-hidden ${active ? 'border-[#8127cf] bg-[#fbf0fe]/30 shadow-xl shadow-[#8127cf]/10' : 'border-transparent bg-[#f3f4f9] hover:bg-white border-[#cfc2d6]/20'}`}
    >
      <div className={`p-3 rounded-2xl transition-all ${active ? 'bg-[#8127cf] text-white shadow-lg' : 'bg-white text-[#4d4354]/40 group-hover:bg-[#8127cf]/5 group-hover:text-[#8127cf]'}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-black text-[#1f1a23] tracking-tight">{title}</h3>
        <p className="text-[10px] text-[#4d4354]/60 font-semibold leading-tight mt-1">{desc}</p>
      </div>
      {active && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="bg-[#8127cf] text-white p-1 rounded-full border-2 border-white absolute top-4 right-4 shadow-md">
           <CheckCircle className="w-3 h-3" />
        </motion.div>
      )}
    </div>
  );
}

function InputField({ label, placeholder, value, onChange, icon: Icon, type = "text" }: any) {
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
