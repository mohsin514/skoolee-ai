'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutGrid, Users, Bookmark, Star, Zap, GraduationCap,
  HelpCircle, LogOut, FileText, Bell, Settings,
  Search, Plus, Download, ChevronRight, Share2,
  CheckCircle2, Shield, MessageSquare, Mail, Phone, 
  TrendingUp, Sparkles, Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getPrincipalDashboardData } from '@/app/actions/dashboard';
import { updateSchoolSettings } from '@/app/actions/settings';

export default function PrincipalDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('reports');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPrincipalDashboardData();
      setData(result);
    } catch (e: any) {
      toast.error("Dashboard failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    toast.success("Administrator session closed");
    router.push('/login');
  };

  const [toggling, setToggling] = useState<string | null>(null);
  const handleToggle = async (key: string) => {
      setToggling(key);
      try {
          // Placeholder for settings update
          toast.success(`${key} configuration updated`);
      } finally {
          setToggling(null);
      }
  };

  if (loading && !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4 text-center px-6">
       <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest leading-relaxed">
          Accessing Academic Hub...<br/>
          <span className="text-[10px] opacity-60">Verifying Enrollment & Communication Nodes</span>
       </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f3f4f9] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
      
      {/* ─── SIDEBAR ─── */}
      <aside className="w-64 bg-white/50 backdrop-blur-md border-r border-[#cfc2d6]/30 flex flex-col p-6 fixed h-full z-50">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg">
               <img src="/favicon.svg" alt="Logo" className="h-6 w-6 object-contain brightness-0 invert" />
            </div>
            <h1 className="font-black text-xl tracking-tighter text-[#8127cf]">Skoolee AI</h1>
          </div>
          <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-[0.2em] pl-11">The Joyful Architect</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton icon={LayoutGrid} label="Academic Plan" onClick={() => {}} />
          <NavButton icon={Users} label="Faculty" onClick={() => {}} />
          <NavButton icon={Star} label="Exams" onClick={() => {}} />
          <NavButton icon={FileText} label="Reports Hub" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
          <NavButton icon={MessageSquare} label="Engagement" onClick={() => {}} />
        </nav>

        <div className="pt-6 border-t border-[#cfc2d6]/20 space-y-2">
          <NavButton icon={HelpCircle} label="Support" onClick={() => {}} />
          <NavButton icon={LogOut} label="Logout" onClick={handleLogout} />
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 ml-64 p-8 flex flex-col">
        
        <header className="flex items-center justify-between mb-8">
           <div className="flex items-center gap-3 text-[#4d4354]/60 font-bold text-sm">
              <FileText className="w-4 h-4 text-[#8127cf]" />
              <span>Campus Academic Control</span>
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                 <div className="text-right">
                    <p className="text-xs font-bold text-[#1f1a23]">Academic Head</p>
                    <p className="text-[10px] font-bold text-[#4d4354]/60 uppercase tracking-wider leading-none">Principal Authority</p>
                 </div>
                 <div className="h-10 w-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/initials/svg?seed=Principal" alt="User" />
                 </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[48px] shadow-2xl flex-1 p-12 relative overflow-hidden flex flex-col">
           
           <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-10">
                 <h2 className="text-3xl font-black text-[#b10e6b] tracking-tighter italic uppercase">Reports Hub</h2>
                 <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4d4354]/40" />
                    <input type="text" placeholder="Search database..." className="h-10 pl-12 pr-6 bg-[#f3f4f9] rounded-full text-xs font-bold text-[#1f1a23] border-0 focus:ring-2 focus:ring-[#8127cf]/20 transition-all outline-none w-64" />
                 </div>
              </div>
              <div className="flex items-center gap-4 pr-2">
                 <Bell className="w-5 h-5 text-[#4d4354]/40" />
                 <Settings className="w-5 h-5 text-[#4d4354]/40" />
              </div>
           </div>

           <div className="flex-1 flex gap-10 overflow-hidden">
              <div className="flex-1 space-y-10 overflow-y-auto pr-4 custom-scrollbar">
                 <div>
                    <div className="flex items-end justify-between mb-3">
                       <div>
                          <h3 className="text-5xl font-black tracking-tighter text-[#1f1a23]">Final Enrollment Reports</h3>
                          <p className="text-sm font-semibold text-[#4d4354]/60 mt-3 max-w-[480px] leading-relaxed italic">Monitoring end-of-term academic synchronization across {data?.totalStudents || 0} students.</p>
                       </div>
                       <button className="h-14 px-8 bg-[#8127cf] text-white rounded-3xl font-black text-sm flex items-center gap-3 shadow-xl hover:scale-105 active:scale-95 transition-all">
                          <Plus className="w-5 h-5" /> Initialize Cycle
                       </button>
                    </div>

                    <div className="bg-white border border-[#f3f4f9] p-10 rounded-[48px] shadow-xl relative overflow-hidden mt-10">
                       <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-8">
                          <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse" /> Final Verification Active
                       </div>
                       <h4 className="text-3xl font-black tracking-tight text-[#1f1a23] mb-8">Centralized Mark Sheets</h4>
                       
                       <div className="h-2 w-full bg-slate-100 rounded-full mb-8 overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: '78%' }} className="h-full bg-[#8127cf] rounded-full" />
                       </div>

                       <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest">Enrollment Sync: 78% Operational</p>
                          <div className="flex gap-4">
                             <button className="text-[10px] font-black text-[#8127cf] uppercase tracking-widest hover:underline">Download Master ZIP</button>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="pt-10">
                    <h3 className="text-xl font-black text-[#1f1a23] mb-4">Communication Hub</h3>
                    <div className="grid grid-cols-2 gap-6">
                       <CommCard icon={MessageSquare} label="WhatsApp Dispatch" sub="Live Sync" active onClick={() => handleToggle('WhatsApp')} />
                       <CommCard icon={Mail} label="Academic Mailer" sub="SMTP Active" active onClick={() => handleToggle('Email')} />
                       <CommCard icon={Phone} label="Emergency SMS" sub="Dormant" onClick={() => handleToggle('SMS')} />
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-6 pt-10">
                    <HubStat icon={CheckCircle2} label="Pending Reviews" value={data?.pendingRemarkReviews || 0} link="Audit Now" />
                    <HubStat icon={TrendingUp} label="Campus Yield" value="92.4%" link="Analytics" />
                    <HubStat icon={Sparkles} label="AI Agents" value="Active" link="Settings" />
                 </div>
              </div>

              <div className="w-[360px] bg-slate-50 border border-[#cfc2d6]/20 rounded-[48px] p-8 flex flex-col items-center text-center">
                 <h4 className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest mb-10">Preview Engine</h4>
                 <div className="bg-white p-6 rounded-3xl shadow-xl w-full relative overflow-hidden">
                    <div className="h-1.5 w-full bg-[#b10e6b] absolute top-0 left-0" />
                    <div className="flex items-center gap-4 mb-8">
                       <div className="h-10 w-10 bg-slate-100 rounded-full overflow-hidden border border-[#cfc2d6]/10">
                          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Elena" alt="Elena" />
                       </div>
                       <div className="text-left">
                          <p className="text-[8px] font-black text-[#8127cf] uppercase">Active Simulation</p>
                          <h5 className="text-xs font-black text-[#1f1a23]">Elena Rodriguez</h5>
                       </div>
                    </div>
                    <div className="space-y-4">
                       <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-[94%]" /></div>
                       <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-[#8127cf] w-[88%]" /></div>
                    </div>
                    <div className="mt-8 p-4 bg-[#fbf0fe] rounded-2xl italic text-[10px] text-[#1f1a23] leading-relaxed">
                       "Exceptional analytical output detected by semantic engine..."
                    </div>
                 </div>
                 <button className="mt-10 text-[11px] font-black text-[#8127cf] hover:underline uppercase tracking-widest">
                    Manage Global Templates ↗
                 </button>
              </div>
           </div>

        </div>
      </main>

    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 font-bold text-sm ${active ? 'bg-white text-[#8127cf] shadow-xl shadow-indigo-100 font-black' : 'text-[#4d4354] hover:bg-white/40 hover:text-[#1f1a23]'}`}>
      <Icon className={`w-5 h-5 ${active ? 'text-[#8127cf]' : 'text-[#4d4354]/60'}`} />
      {label}
    </button>
  );
}

function CommCard({ icon: Icon, label, sub, active, onClick }: any) {
  return (
    <div onClick={onClick} className="p-6 bg-[#f3f4f9]/50 border border-transparent hover:border-[#cfc2d6]/30 hover:bg-white transition-all rounded-[32px] flex items-center justify-between cursor-pointer group">
       <div className="flex items-center gap-4">
          <div className={`h-11 w-11 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-[#4d4354]/40'}`}>
             <Icon className="w-5 h-5" />
          </div>
          <div className="text-left">
             <p className="text-sm font-bold text-[#1f1a23]">{label}</p>
             <p className="text-xs font-medium text-[#4d4354]/60 tracking-wider uppercase">{sub}</p>
          </div>
       </div>
       <div className={`w-10 h-6 rounded-full p-1 transition-colors ${active ? 'bg-[#8127cf]' : 'bg-slate-200'}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${active ? 'translate-x-4' : 'translate-x-0'}`} />
       </div>
    </div>
  );
}

function HubStat({ icon: Icon, label, value, link }: any) {
  return (
    <div className="p-6 bg-white border border-[#f3f4f9] rounded-[32px] flex flex-col gap-4 hover:shadow-xl transition-all text-left">
       <div className="h-10 w-10 bg-[#fbf0fe] text-[#8127cf] rounded-2xl flex items-center justify-center"><Icon className="w-5 h-5" /></div>
       <div>
          <p className="text-xs font-bold text-[#1f1a23] mb-1">{label}</p>
          <p className="text-2xl font-black text-[#8127cf] leading-none mb-4">{value}</p>
          <span className="text-[10px] font-bold text-[#8127cf] uppercase tracking-wider hover:underline cursor-pointer">{link}</span>
       </div>
    </div>
  );
}
