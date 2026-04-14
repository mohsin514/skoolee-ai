'use client'

import React, { useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building, GraduationCap, MapPin, 
  Plus, CheckCircle2,
  ChevronRight, Network, Loader2,
  Shield, Hash,
  Zap, Info, Trash2, LucideIcon, LogOut, Phone
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

  const isStandalone = session?.role === 'ADMIN';

  const [schoolData, setSchoolData] = useState({
    name: '',
    city: '',
    address: '',
    regId: '', 
    autoId: true
  });

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

  const generateId = (prefix: string) => {
    return `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  };

  useLayoutEffect(() => {
    getOnboardingSession().then((res: any) => {
      if (!res || res.error) router.push('/login');
      else if (res.redirect) {
        const role = res.role;
        router.push(role === 'SUPER_ADMIN' ? '/super' : '/admin');
      }
      else {
        const user = res.user;
        setSession(user);
        setSchoolData(prev => ({ 
          ...prev, 
          name: user?.school?.name || '', 
          city: user?.school?.city || '',
          regId: user?.school?.regId || generateId('SKL')
        }));
        if (user?.role === 'ADMIN') {
           setNewCampus(prev => ({ ...prev, regId: generateId('BR') }));
        }
      }
    });
  }, []);

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
      regId: auto ? generateId('BR') : (prev.autoId ? '' : prev.regId) 
    }));
  };

  const addCampus = () => {
    if (!newCampus.name || !newCampus.city || !newCampus.regId) {
      toast.error("Required fields missing.");
      return;
    }
    setCampuses([...campuses, { ...newCampus, id: Date.now().toString() }]);
    setNewCampus({
      name: '',
      city: '',
      address: '',
      phone: '',
      regId: generateId('BR'),
      autoId: true,
      board: 'Federal Board'
    });
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleProceedFromStep1 = () => {
    if (!schoolData.name || !schoolData.city) {
      toast.error("Required fields missing.");
      return;
    }
    if (isStandalone && !newCampus.regId) {
      toast.error("Campus Key is required.");
      return;
    }

    if (isStandalone) {
      setCampuses([{
        id: 'primary-node',
        name: schoolData.name,
        city: schoolData.city,
        address: schoolData.address,
        phone: '', 
        regId: newCampus.regId,
        autoId: newCampus.autoId,
        board: 'Default Board'
      }]);
      setStep(3); 
    } else {
      setStep(2);
    }
  };

  const handleFinalLaunch = async () => {
    setLoading(true);
    try {
      const res = await finishOnboarding(schoolData, campuses);
      if (res.success) {
        toast.success("Done!");
        router.push(res.role === 'SUPER_ADMIN' ? '/super' : '/admin');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#fff7fe] gap-4">
       <GraduationCap className="h-10 w-10 text-[#8127cf] animate-bounce" />
       <p className="text-[10px] font-black text-[#1f1a23] uppercase tracking-widest leading-none">Accessing Institutional Node...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff7fe] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
      
      {/* ─── SIDEBAR ─── */}
      <aside className="w-72 bg-white/50 backdrop-blur-md border-r border-[#cfc2d6]/30 hidden lg:flex flex-col p-8 fixed h-full z-50">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg">
               <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <h1 className="font-black text-xl tracking-tighter text-[#8127cf]">Skoolee AI</h1>
          </div>
          <p className="text-[10px] font-bold text-[#b10e6b] uppercase tracking-wider pl-11 leading-none">Joyful Setup</p>
        </div>

        <nav className="flex-1 space-y-3">
           <StepNav 
              active={step === 1} 
              done={step > 1} 
              num={1} 
              title={isStandalone ? "Campus Identity" : "Group Registry"} 
              desc="Set core details" 
           />
           {!isStandalone && (
             <StepNav active={step === 2} done={step > 2} num={2} title="Branch Network" desc="Map campus nodes" />
           )}
           <StepNav 
              active={step === 3} 
              done={step > 3} 
              num={isStandalone ? 2 : 3} 
              title="Launch Console" 
              desc="Deploy to cloud" 
           />
        </nav>

        <button onClick={handleLogout} className="mt-auto flex items-center gap-4 p-4 rounded-2xl text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-all font-bold text-sm cursor-pointer group">
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> <span>Sign Out</span>
        </button>
      </aside>

      <main className="flex-1 lg:ml-72 min-h-screen flex flex-col bg-[#fbf0fe]/50">
        
        <header className="px-10 py-5 flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-40 border-b border-[#cfc2d6]/10">
           <div className="flex items-center gap-2 text-[10px] font-black text-[#8127cf] uppercase tracking-[0.15em]">
              <Shield className="w-3.5 h-3.5" />
              {isStandalone ? 'Facility Setup Node' : 'Institutional Setup Hub'}
           </div>
           {step > 1 && (
             <button onClick={() => setStep(prev => prev - 1)} className="text-[10px] font-black uppercase text-[#4d4354]/40 hover:text-[#8127cf] transition-all cursor-pointer">Go Back</button>
           )}
        </header>

        <div className="p-8 md:p-12 flex-1 flex flex-col items-center">
           
           <div className="w-full max-w-4xl">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                     <div className="bg-white rounded-[40px] p-10 shadow-xl border border-[#cfc2d6]/10 relative overflow-hidden">
                        
                        <div className="flex items-center gap-6 mb-10">
                           <div className="w-16 h-16 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf] shadow-inner">
                              <Building className="w-8 h-8" />
                           </div>
                           <div>
                              <h2 className="text-3xl font-black text-[#1f1a23] tracking-tight leading-none">
                                 {isStandalone ? "Campus Identity" : "Group Registry"}
                              </h2>
                              <p className="text-[#4d4354]/60 font-semibold text-sm mt-1.5 italic">
                                 {isStandalone ? "Enter your school's unique name and site location." : "Synchronize your global institutional chain under one key."}
                              </p>
                           </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-10">
                           <div className="space-y-6">
                              <InputField label={isStandalone ? "Campus Name" : "Institution Name"} value={schoolData.name} onChange={(v: string) => setSchoolData({...schoolData, name: v})} placeholder="e.g. Horizon Academy" icon={GraduationCap} />
                              <InputField label="Primary City" value={schoolData.city} onChange={(v: string) => setSchoolData({...schoolData, city: v})} placeholder="City" icon={MapPin} />
                              <InputField label="Main Address" value={schoolData.address} onChange={(v: string) => setSchoolData({...schoolData, address: v})} placeholder="Street address..." icon={MapPin} isArea />
                           </div>
                           
                           <div className="space-y-6">
                              <div className="bg-[#fbf0fe] p-8 rounded-[32px] border border-[#cfc2d6]/20">
                                 <div className="flex items-center justify-between mb-5">
                                    <Label className="text-[10px] font-black text-[#8127cf] uppercase tracking-widest pl-1">{isStandalone ? 'Campus Key' : 'Group Key'}</Label>
                                    <div className="bg-white rounded-lg p-1 flex border border-[#cfc2d6]/10 shadow-sm">
                                       <button onClick={() => isStandalone ? handleCampusIdToggle(true) : handleSchoolIdToggle(true)} className={`px-3 py-1 text-[9px] font-black rounded-md transition-all cursor-pointer ${isStandalone ? (newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400') : (schoolData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400')}`}>Auto</button>
                                       <button onClick={() => isStandalone ? handleCampusIdToggle(false) : handleSchoolIdToggle(false)} className={`px-3 py-1 text-[9px] font-black rounded-md transition-all cursor-pointer ${isStandalone ? (!newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400') : (!schoolData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400')}`}>Manual</button>
                                    </div>
                                 </div>
                                 <Input 
                                    value={isStandalone ? newCampus.regId : schoolData.regId} 
                                    onChange={e => isStandalone ? setNewCampus({...newCampus, regId: e.target.value.toUpperCase()}) : setSchoolData({...schoolData, regId: e.target.value.toUpperCase()})}
                                    readOnly={isStandalone ? newCampus.autoId : schoolData.autoId}
                                    className="h-14 bg-white rounded-xl font-black text-lg tracking-[0.2em] border-0 text-center shadow-sm"
                                 />
                                 <p className="text-[10px] text-[#4d4354]/40 mt-4 pl-1 font-bold italic">Encrypted key for institutional synchronization.</p>
                              </div>
                              
                              <div className="p-5 bg-emerald-50 rounded-[24px] border border-emerald-100 flex items-center gap-4">
                                 <Shield className="w-7 h-7 text-emerald-500" />
                                 <div>
                                    <p className="text-[9px] font-black text-emerald-900 uppercase tracking-widest leading-none mb-1">Session Secured</p>
                                    <p className="text-[9px] font-bold text-emerald-600/70 leading-none">Your identity is verified.</p>
                                 </div>
                              </div>
                           </div>
                        </div>

                        <div className="mt-12 flex justify-end">
                           <button onClick={handleProceedFromStep1} className="h-14 px-10 bg-[#1f1a23] text-white rounded-2xl font-black text-base flex items-center gap-3 hover:bg-black transition-all shadow-2xl active:scale-95 cursor-pointer group">
                             {isStandalone ? "Review & Finish" : "Next Step"} <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                           </button>
                        </div>
                     </div>
                  </motion.div>
                )}

                {step === 2 && !isStandalone && (
                  <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid lg:grid-cols-5 gap-8">
                     <div className="lg:col-span-3 space-y-6">
                        <div className="bg-white rounded-[40px] p-10 shadow-xl border border-[#cfc2d6]/10">
                           <h2 className="text-2xl font-black text-[#1f1a23] mb-6 tracking-tight">Branch Network Modeling</h2>
                           <div className="space-y-5">
                              <InputField label="Campus Name" value={newCampus.name} onChange={(v: string) => setNewCampus({...newCampus, name: v})} placeholder="e.g. West Campus" icon={Building} />
                              <div className="grid grid-cols-2 gap-5">
                                 <InputField label="City" value={newCampus.city} onChange={(v: string) => setNewCampus({...newCampus, city: v})} placeholder="City" icon={MapPin} />
                                 <InputField label="Phone" value={newCampus.phone} onChange={(v: string) => setNewCampus({...newCampus, phone: v})} placeholder="Phone" icon={Phone} />
                              </div>
                              <InputField label="Full Address" value={newCampus.address} onChange={(v: string) => setNewCampus({...newCampus, address: v})} placeholder="Address" icon={MapPin} isArea />
                              
                              <div className="grid grid-cols-2 gap-5 items-end pt-2">
                                 <div className="space-y-1.5">
                                    <div className="flex justify-between items-center px-1 mb-1">
                                       <Label className="text-[9px] font-black text-[#8127cf] uppercase tracking-widest pl-1">NODE KEY</Label>
                                       <div className="flex bg-[#f3f4f9] p-0.5 rounded-lg border border-[#cfc2d6]/10 scale-90 origin-right shadow-sm">
                                          <button 
                                             onClick={() => handleCampusIdToggle(true)} 
                                             type="button"
                                             className={`px-2.5 py-1 text-[8px] font-black rounded-md transition-all cursor-pointer ${newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-[#4d4354]/40'}`}
                                          >
                                             Auto
                                          </button>
                                          <button 
                                             onClick={() => handleCampusIdToggle(false)} 
                                             type="button"
                                             className={`px-2.5 py-1 text-[8px] font-black rounded-md transition-all cursor-pointer ${!newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-[#4d4354]/40'}`}
                                          >
                                             Edit
                                          </button>
                                       </div>
                                    </div>
                                    <Input 
                                       value={newCampus.regId} 
                                       readOnly={newCampus.autoId} 
                                       onChange={e=>setNewCampus({...newCampus, regId: e.target.value.toUpperCase()})} 
                                       placeholder="BR-XXXX"
                                       className="h-12 bg-[#fbf0fe] border-0 font-black tracking-[0.2em] rounded-xl text-center focus:ring-2 focus:ring-[#8127cf]/10 transition-all text-sm" 
                                    />
                                 </div>
                                 <button onClick={addCampus} className="h-12 bg-[#8127cf] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-[#9c48ea] cursor-pointer shadow-lg shadow-[#8127cf]/20 transition-all">
                                    <Plus className="w-4 h-4" /> Instantiate Node
                                 </button>
                              </div>
                           </div>
                        </div>

                        <div className="flex items-center justify-between px-2">
                           <button onClick={() => setStep(3)} className="ml-auto h-12 px-8 bg-[#1f1a23] text-white rounded-xl font-black text-base flex items-center gap-3 hover:bg-black cursor-pointer shadow-xl transition-all group">
                              Review & Launch <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                           </button>
                        </div>
                     </div>

                     <div className="lg:col-span-2">
                        <div className="bg-white rounded-[40px] p-8 h-full min-h-[450px] flex flex-col border border-[#cfc2d6]/10 shadow-2xl relative">
                           <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-50 text-[#1f1a23]">
                              <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                 <Network className="w-4 h-4 text-[#8127cf]" /> Network Map
                              </h3>
                              <span className="text-[9px] font-black text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-full uppercase tracking-widest">{campuses.length} Facilities</span>
                           </div>

                           <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                              {campuses.map((c, i) => (
                                <div key={c.id} className="p-4 bg-[#fbf0fe]/50 rounded-[20px] border border-transparent flex items-center justify-between group hover:bg-white hover:border-[#8127cf]/10 transition-all shadow-sm">
                                   <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#8127cf] font-black text-[10px] shadow-sm">{i+1}</div>
                                      <div>
                                         <p className="text-xs font-black text-[#1f1a23] leading-none mb-1">{c.name}</p>
                                         <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-widest">{c.regId}</p>
                                      </div>
                                   </div>
                                   <button onClick={() => setCampuses(campuses.filter(x => x.id !== c.id))} className="text-rose-400 p-2 hover:bg-rose-50 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Trash2 className="w-4 h-4" />
                                   </button>
                                </div>
                              ))}
                              {campuses.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 pt-16">
                                   <Zap className="w-12 h-12 animate-pulse mb-3" />
                                   <p className="text-[9px] font-black uppercase tracking-widest">No nodes defined</p>
                                </div>
                              )}
                           </div>
                        </div>
                     </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto text-center space-y-10 py-8">
                     <div className="w-20 h-20 bg-emerald-50 rounded-[32px] flex items-center justify-center text-emerald-500 mx-auto shadow-2xl">
                        <CheckCircle2 className="w-10 h-10" />
                     </div>

                     <div className="space-y-3">
                        <h2 className="text-4xl font-black text-[#1f1a23] tracking-tighter italic">System Ready.</h2>
                        <p className="text-base font-semibold text-[#4d4354]/60 italic max-w-sm mx-auto">Confirm your final architecture parameters before activation.</p>
                     </div>

                     <div className="bg-white p-8 rounded-[40px] border border-[#cfc2d6]/10 text-left space-y-3 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Building className="w-32 h-32" /></div>
                        <div className="grid grid-cols-2 gap-6 relative z-10">
                           <SummaryItem icon={Building} label="Main Facility" value={schoolData.name} />
                           <SummaryItem icon={Hash} label="Cloud Key" value={isStandalone ? campuses[0]?.regId : schoolData.regId} />
                           <SummaryItem icon={Network} label="Structure" value={isStandalone ? "Standalone" : `${campuses.length} Campus Network`} />
                           <SummaryItem icon={MapPin} label="Region" value={schoolData.city} />
                        </div>
                     </div>

                     <div className="flex items-center gap-5 pt-6">
                        <button 
                           onClick={handleFinalLaunch}
                           disabled={loading}
                           className="flex-1 h-16 bg-[#1f1a23] text-white rounded-[24px] font-black text-lg shadow-2xl flex items-center justify-center gap-4 hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer group"
                        >
                           {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Activate Platform <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" /></>}
                        </button>
                     </div>
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
    <div className={`p-5 rounded-[24px] transition-all duration-700 flex items-center gap-5 border ${active ? 'bg-[#fbf0fe] border-[#8127cf]/10 shadow-xl shadow-[#8127cf]/5' : 'border-transparent'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all duration-500 shadow-md ${active ? 'bg-[#8127cf] text-white scale-110' : done ? 'bg-emerald-500 text-white' : 'bg-[#f3f4f9] text-[#4d4354]/30'}`}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : num}
      </div>
      <div className="overflow-hidden">
        <h4 className={`text-sm font-black text-[#1f1a23] leading-none mb-1.5 truncate ${!active && !done && 'opacity-40'}`}>{title}</h4>
        <p className={`text-[10px] font-bold text-[#4d4354]/60 tracking-wider truncate ${!active && 'opacity-40'}`}>{desc}</p>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, icon: Icon, isArea }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
       <Label className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest ml-1">{label}</Label>
       <div className="relative group flex items-center">
          <Icon className="absolute left-4 w-4 h-4 text-[#4d4354]/20 group-focus-within:text-[#8127cf] transition-colors" />
          {isArea ? (
            <textarea 
               value={value} 
               onChange={e=>onChange(e.target.value)}
               placeholder={placeholder}
               className="w-full min-h-[100px] pl-12 pr-5 py-4 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all outline-none resize-none placeholder:text-[#4d4354]/20"
            />
          ) : (
            <Input 
               value={value} 
               onChange={e=>onChange(e.target.value)}
               placeholder={placeholder}
               className="w-full h-14 pl-12 pr-5 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all shadow-none placeholder:text-[#4d4354]/20 text-[#1f1a23]"
            />
          )}
       </div>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: SummaryItemProps) {
  return (
    <div className="flex items-center gap-4 p-5 bg-[#fbf0fe]/50 rounded-[24px] border border-white/50 shadow-sm">
       <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#8127cf] shadow-sm flex-shrink-0">
          <Icon className="w-5 h-5" />
       </div>
       <div className="overflow-hidden">
          <p className="text-[9px] font-black text-[#4d4354]/40 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-xs font-black text-[#1f1a23] truncate pr-2">{value || '...'}</p>
       </div>
    </div>
  );
}
