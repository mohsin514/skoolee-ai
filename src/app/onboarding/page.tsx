'use client'

import React, { useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building, GraduationCap, MapPin, 
  UploadCloud, Plus, CheckCircle2,
  ChevronRight, Network, Loader2,
  Shield, Mail, X, Palette, Globe,
  LayoutGrid, LogOut, Phone, Hash,
  Zap, Info, Trash2, LucideIcon
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { finishOnboarding, getOnboardingSession } from '@/app/actions/completeOnboarding';
import { logout } from '@/app/actions/auth/logout';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StepNavProps {
  active: boolean;
  done: boolean;
  num: number;
  title: string;
  desc: string;
}

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  icon: LucideIcon;
  isArea?: boolean;
}

interface SummaryItemProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

export default function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);

  // --- School State ---
  const [schoolData, setSchoolData] = useState({
    name: '',
    city: '',
    address: '',
    regId: '',
    autoId: true
  });

  // --- Campus State ---
  const [campuses, setCampuses] = useState<any[]>([]);
  const [newCampus, setNewCampus] = useState({
    name: '',
    city: '',
    address: '',
    phone: '',
    regId: '',
    autoId: true,
    board: 'Federal Board'
  });

  useLayoutEffect(() => {
    getOnboardingSession().then(res => {
      if (!res) router.push('/login');
      else if (res.redirect) router.push('/super');
      else {
        setSession(res.user);
        setSchoolData(prev => ({ 
          ...prev, 
          name: res.user?.school?.name || '', 
          city: res.user?.school?.city || '' 
        }));
      }
    });
  }, []);

  const generateId = (prefix: string) => {
    return `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  };

  const handleSchoolIdToggle = (auto: boolean) => {
    setSchoolData(prev => ({ 
      ...prev, 
      autoId: auto, 
      regId: auto ? generateId('SKL') : prev.regId 
    }));
  };

  const handleCampusIdToggle = (auto: boolean) => {
    setNewCampus(prev => ({ 
      ...prev, 
      autoId: auto, 
      regId: auto ? generateId('BR') : prev.regId 
    }));
  };

  const addCampus = () => {
    if (!newCampus.name || !newCampus.city || !newCampus.regId) {
      toast.error("Please fill required blueprint fields.");
      return;
    }
    setCampuses([...campuses, { ...newCampus, id: Date.now().toString() }]);
    setNewCampus({
      name: '',
      city: '',
      address: '',
      phone: '',
      regId: '',
      autoId: true,
      board: 'Federal Board'
    });
    toast.success("Campus node instantiated.");
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleFinalLaunch = async () => {
    if (!schoolData.regId) {
      toast.error("Global Institutional ID is required.");
      setStep(1);
      return;
    }
    if (campuses.length === 0) {
      toast.error("Please add at least one campus node.");
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      const res = await finishOnboarding(schoolData, campuses);
      if (res.success) {
        toast.success("Platform Initialized successfully!");
        router.push(res.role === 'SUPER_ADMIN' ? '/super' : '/admin');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#fff7fe] flex font-sans text-[#1f1a23]">
      
      {/* ─── SIDEBAR ─── */}
      <aside className="w-80 bg-white border-r border-[#cfc2d6]/20 hidden lg:flex flex-col p-8 fixed h-full z-50">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tighter text-[#1f1a23]">Skoolee AI</h1>
          </div>
          <div className="h-1 w-8 bg-[#8127cf] rounded-full"></div>
        </div>

        <nav className="flex-1 space-y-3">
           <StepNav active={step === 1} done={step > 1} num={1} title="Global Registry" desc="Define core identity" />
           <StepNav active={step === 2} done={step > 2} num={2} title="Physical Network" desc="Map all campus nodes" />
           <StepNav active={step === 3} done={step > 3} num={3} title="Platform Launch" desc="Deploy architectural cloud" />
        </nav>

        <button 
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 p-4 rounded-xl text-[#4d4354]/60 hover:bg-rose-50 hover:text-rose-600 transition-all font-bold text-sm"
        >
          <LogOut className="w-5 h-5" /> Sign Out from Setup
        </button>
      </aside>

      <main className="flex-1 lg:ml-80 min-h-screen flex flex-col bg-[#fbf0fe]">
        
        <header className="px-8 py-6 flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-40 border-b border-[#cfc2d6]/10">
           <div className="flex items-center gap-2 text-xs font-bold text-[#4d4354]/60 uppercase tracking-widest">
              <Shield className="w-4 h-4 text-[#8127cf]" /> Onboarding Phase
           </div>
           <button onClick={handleLogout} className="lg:hidden text-[#4d4354]"><LogOut className="w-5 h-5" /></button>
        </header>

        <div className="p-8 md:p-12 flex-1 flex flex-col items-center">
           
           <div className="w-full max-w-4xl">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
                     <div className="bg-white rounded-[40px] p-10 shadow-[0_32px_64px_rgba(129,39,207,0.05)] border border-[#cfc2d6]/10">
                        <div className="flex items-center gap-6 mb-10 pb-8 border-b border-[#cfc2d6]/10">
                           <div className="w-16 h-16 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf]">
                              <Palette className="w-8 h-8" />
                           </div>
                           <div>
                              <h2 className="text-3xl font-extrabold text-[#1f1a23] tracking-tighter">Global Registry</h2>
                              <p className="text-[#4d4354]/60 font-medium text-sm">Synchronize your institution's global identity code and branding.</p>
                           </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                           <div className="space-y-6">
                              <InputField label="Institution Name" value={schoolData.name} onChange={(v: string) => setSchoolData({...schoolData, name: v})} placeholder="Horizon International" icon={Building} />
                              <InputField label="Primary City" value={schoolData.city} onChange={(v: string) => setSchoolData({...schoolData, city: v})} placeholder="London" icon={MapPin} />
                              <InputField label="Full Address" value={schoolData.address} onChange={(v: string) => setSchoolData({...schoolData, address: v})} placeholder="123 Academic St, Zone A" icon={MapPin} isArea />
                           </div>
                           <div className="space-y-6 bg-[#fbf0fe] p-8 rounded-3xl border border-[#cfc2d6]/20">
                              <div className="flex items-center justify-between mb-2">
                                 <Label className="text-xs font-bold text-[#8127cf] uppercase tracking-wider">Institutional ID</Label>
                                 <div className="bg-white rounded-lg p-1 flex border border-[#cfc2d6]/30">
                                    <button onClick={()=>handleSchoolIdToggle(true)} className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${schoolData.autoId ? 'bg-[#8127cf] text-white shadow-md' : 'text-[#4d4354]'}`}>Auto</button>
                                    <button onClick={()=>handleSchoolIdToggle(false)} className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${!schoolData.autoId ? 'bg-[#8127cf] text-white shadow-md' : 'text-[#4d4354]'}`}>Manual</button>
                                 </div>
                              </div>
                              <div className="relative">
                                 <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8127cf]/40" />
                                 <Input 
                                    value={schoolData.regId} 
                                    onChange={e => setSchoolData({...schoolData, regId: e.target.value.toUpperCase()})}
                                    readOnly={schoolData.autoId}
                                    placeholder="SKL-XXXX"
                                    className="h-14 pl-12 bg-white rounded-xl font-bold tracking-widest border-0 shadow-sm focus:ring-2 focus:ring-[#8127cf]/20"
                                 />
                              </div>
                              <p className="text-[10px] text-[#4d4354]/60 font-medium flex items-start gap-2 leading-relaxed">
                                 <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                 {schoolData.autoId 
                                    ? "Joyful Architect is generating a secure unique ID for your global group." 
                                    : "Enter your existing registration code exactly as it appears in your records."}
                              </p>
                           </div>
                        </div>

                        <div className="mt-12 flex justify-end">
                           <button 
                             onClick={() => setStep(2)}
                             className="h-16 px-12 bg-[#8127cf] text-white rounded-2xl font-bold flex items-center gap-3 hover:bg-[#9c48ea] shadow-lg shadow-[#8127cf]/20 transition-all active:scale-95"
                           >
                             Proceed to Network Mapping <ChevronRight className="w-5 h-5" />
                           </button>
                        </div>
                     </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid lg:grid-cols-5 gap-8">
                     <div className="lg:col-span-3 space-y-8">
                        <div className="bg-white rounded-[40px] p-10 shadow-[0_32px_64px_rgba(129,39,207,0.05)] border border-[#cfc2d6]/10">
                           <div className="mb-10">
                              <h2 className="text-2xl font-extrabold text-[#1f1a23] tracking-tighter">Campus Node Initializer</h2>
                              <p className="text-[#4d4354]/60 font-medium text-xs mt-1">Map your physical campus network to the cloud architectural tree.</p>
                           </div>
                           
                           <div className="space-y-4">
                              <InputField label="Campus Name" value={newCampus.name} onChange={(v: string) => setNewCampus({...newCampus, name: v})} placeholder="e.g. West End Branch" icon={Building} />
                              <div className="grid grid-cols-2 gap-4">
                                 <InputField label="City" value={newCampus.city} onChange={(v: string) => setNewCampus({...newCampus, city: v})} placeholder="London" icon={MapPin} />
                                 <InputField label="Phone" value={newCampus.phone} onChange={(v: string) => setNewCampus({...newCampus, phone: v})} placeholder="+44..." icon={Phone} />
                              </div>
                              <InputField label="Address" value={newCampus.address} onChange={(v: string) => setNewCampus({...newCampus, address: v})} placeholder="Branch street location..." icon={MapPin} isArea />
                              
                              <div className="grid grid-cols-2 gap-4 items-end">
                                 <div className="space-y-1">
                                    <div className="flex justify-between items-center px-1">
                                       <Label className="text-[10px] font-bold text-[#4d4354] uppercase tracking-wider">Campus ID</Label>
                                       <button onClick={()=>handleCampusIdToggle(!newCampus.autoId)} className="text-[10px] font-bold text-[#8127cf] hover:underline">
                                          {newCampus.autoId ? 'Manual' : 'Auto'}
                                       </button>
                                    </div>
                                    <Input 
                                       value={newCampus.regId} 
                                       onChange={e=>setNewCampus({...newCampus, regId: e.target.value.toUpperCase()})}
                                       readOnly={newCampus.autoId}
                                       placeholder="BR-XXXX"
                                       className="h-12 bg-[#fbf0fe] border-0 font-bold tracking-widest text-xs"
                                    />
                                 </div>
                                 <button onClick={addCampus} className="h-12 bg-[#8127cf] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#9c48ea] transition-all">
                                    <Plus className="w-4 h-4" /> Instantiate Node
                                 </button>
                              </div>
                           </div>
                        </div>

                        <div className="flex justify-between items-center px-4">
                           <button onClick={() => setStep(1)} className="text-sm font-bold text-[#4d4354]/60 hover:text-[#1f1a23]">Back to Registry</button>
                           <button 
                              onClick={() => setStep(3)}
                              className="h-14 px-10 bg-[#1f1a23] text-white rounded-2xl font-bold flex items-center gap-3 hover:bg-black transition-all"
                           >
                              Review & Deployment <ChevronRight className="w-5 h-5" />
                           </button>
                        </div>
                     </div>

                     <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-[32px] p-8 min-h-[500px] flex flex-col border border-[#cfc2d6]/10 shadow-xl shadow-indigo-100/20">
                           <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#cfc2d6]/10">
                              <h3 className="text-sm font-extrabold text-[#1f1a23] tracking-tight flex items-center gap-2">
                                 <Network className="w-4 h-4 text-[#8127cf]" /> Network Map
                              </h3>
                              <span className="bg-[#fbf0fe] text-[#8127cf] text-[9px] font-black px-2 py-0.5 rounded-full">{campuses.length} NODES</span>
                           </div>

                           <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                              {campuses.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grayscale pt-20">
                                   <Zap className="w-12 h-12 mb-4" />
                                   <p className="text-xs font-bold leading-relaxed">No campus nodes mapped yet.<br/>Add your first branch to continue.</p>
                                </div>
                              ) : (
                                campuses.map((c, i) => (
                                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={c.id} className="p-4 bg-[#fbf0fe] rounded-2xl border border-[#cfc2d6]/5 flex items-center justify-between group">
                                     <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#8127cf] font-bold text-[10px] shadow-sm">{i+1}</div>
                                        <div>
                                           <p className="text-[11px] font-bold text-[#1f1a23] leading-none mb-1">{c.name}</p>
                                           <div className="flex items-center gap-1.5 text-[8px] font-black text-[#4d4354]/40 uppercase">
                                              <Hash className="w-2.5 h-2.5" /> {c.regId}
                                           </div>
                                        </div>
                                     </div>
                                     <button onClick={() => setCampuses(campuses.filter(x => x.id !== c.id))} className="text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-rose-50 rounded-lg">
                                        <Trash2 className="w-4 h-4" />
                                     </button>
                                  </motion.div>
                                ))
                              )}
                           </div>
                        </div>
                     </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-xl mx-auto text-center space-y-10 py-12">
                     <div className="relative inline-block">
                        <div className="w-24 h-24 bg-[#fbf0fe] rounded-[32px] flex items-center justify-center text-[#8127cf] shadow-2xl mx-auto rotate-12 hover:rotate-0 transition-transform duration-500">
                           <LayoutGrid className="w-12 h-12" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-full border-4 border-white flex items-center justify-center shadow-lg">
                           <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                     </div>

                     <div className="space-y-4">
                        <h2 className="text-4xl font-extrabold text-[#1f1a23] tracking-tighter">Architecture Verified.</h2>
                        <p className="text-sm font-medium text-[#4d4354]/60 leading-relaxed max-w-sm mx-auto">
                           Registry and Network nodes are synchronized. Launching the global management console will instantiate all architectural layers.
                        </p>
                     </div>

                     <div className="bg-white p-6 rounded-3xl border border-[#cfc2d6]/20 text-left space-y-3 shadow-xl shadow-indigo-100/10">
                        <div className="flex justify-between items-center text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest px-1">
                           <span>Summary</span>
                           <span>Ready</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <SummaryItem icon={Building} label="Group" value={schoolData.name} />
                           <SummaryItem icon={Hash} label="ID" value={schoolData.regId} />
                           <SummaryItem icon={Network} label="Nodes" value={`${campuses.length} Campuses`} />
                           <SummaryItem icon={MapPin} label="Region" value={schoolData.city} />
                        </div>
                     </div>

                     <button 
                        onClick={handleFinalLaunch}
                        disabled={loading}
                        className="w-full h-18 bg-[#1f1a23] text-white rounded-2xl font-extrabold text-xl shadow-2xl flex items-center justify-center gap-4 hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                     >
                        {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <>Finalize Global Deployment <ChevronRight className="w-6 h-6" /></>}
                     </button>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>

        </div>
      </main>

    </div>
  );
}

function StepNav({ active, done, num, title, desc }: StepNavProps) {
  return (
    <div className={`p-5 rounded-2xl transition-all duration-500 flex items-center gap-5 border ${active ? 'bg-[#fbf0fe] border-[#8127cf]/20 shadow-lg shadow-[#8127cf]/5' : 'border-transparent'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-colors ${active ? 'bg-[#8127cf] text-white' : done ? 'bg-emerald-500 text-white' : 'bg-[#f3f4f9] text-[#4d4354]/30'}`}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : num}
      </div>
      <div>
        <h4 className={`text-sm font-extrabold text-[#1f1a23] leading-none mb-1 ${!active && !done && 'opacity-40'}`}>{title}</h4>
        <p className={`text-[10px] font-medium text-[#4d4354]/60 ${!active && 'opacity-40'}`}>{desc}</p>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, icon: Icon, isArea }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
       <Label className="text-[10px] font-bold text-[#4d4354] uppercase tracking-wider ml-1">{label}</Label>
       <div className="relative group flex items-center">
          <Icon className="absolute left-4 w-5 h-5 text-[#4d4354]/40 group-focus-within:text-[#8127cf] transition-colors" />
          {isArea ? (
            <textarea 
               value={value} 
               onChange={e=>onChange(e.target.value)}
               placeholder={placeholder}
               className="w-full min-h-[100px] pl-12 pr-4 py-4 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all outline-none resize-none"
            />
          ) : (
            <Input 
               value={value} 
               onChange={e=>onChange(e.target.value)}
               placeholder={placeholder}
               className="w-full h-14 pl-12 pr-4 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none"
            />
          )}
       </div>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: SummaryItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
       <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-[#8127cf] border border-[#cfc2d6]/20 flex-shrink-0">
          <Icon className="w-4 h-4" />
       </div>
       <div className="overflow-hidden">
          <p className="text-[8px] font-black text-[#4d4354]/40 uppercase leading-none mb-1">{label}</p>
          <p className="text-[11px] font-bold text-[#1f1a23] truncate">{value || '---'}</p>
       </div>
    </div>
  );
}
