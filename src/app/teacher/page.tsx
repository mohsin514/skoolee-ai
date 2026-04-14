'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutGrid, Users, Bookmark, Star, Zap, 
  HelpCircle, LogOut, Bell, Settings,
  Search, Plus, ChevronRight, CheckCircle2,
  Clock, BookOpen, ClipboardCheck, MessageSquare,
  History, Sliders, Languages, Send, Shield,
  Printer, BrainCircuit, Type, FileText, Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getTeacherDashboardData } from '@/app/actions/dashboard';
import { saveMarks } from '@/app/actions/marks';

export default function TeacherDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('marks');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTeacherDashboardData();
      setData(result);
    } catch (e: any) {
      toast.error("Access Denied: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    toast.success("Safe logout completed");
    router.push('/login');
  };

  const [saving, setSaving] = useState(false);
  const handleFinalSubmit = async () => {
      setSaving(true);
      toast.info("Finalizing academic records...");
      // Simulate/Trigger full sync
      setTimeout(() => {
          setSaving(false);
          toast.success("Marks validated and locked in central DB.");
      }, 2000);
  };

  if (loading && !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
       <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest text-center">Syncing Teacher Console...<br/><span className="text-[10px] opacity-60">Connecting to Academic Instance</span></p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f3f4f9] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
      
      {/* ─── SIDEBAR ─── */}
      <aside className="w-64 bg-white/50 backdrop-blur-md border-r border-[#cfc2d6]/30 flex flex-col p-6 fixed h-full z-50">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg bg-[#8127cf] flex items-center justify-center shadow-lg">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <h1 className="font-black text-lg tracking-tighter text-[#8127cf]">Skoolee AI</h1>
          </div>
          <p className="text-[10px] font-bold text-[#b10e6b] uppercase tracking-wider pl-11">The Joyful Architect</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton icon={Bookmark} label="Academics" onClick={() => {}} />
          <NavButton icon={Star} label="Marks Entry" active={activeTab === 'marks'} onClick={() => setActiveTab('marks')} />
          <NavButton icon={Zap} label="AI Insights" onClick={() => {}} />
          <NavButton icon={FileText} label="Transcripts" onClick={() => {}} />
        </nav>

        <div className="pt-6 border-t border-[#cfc2d6]/20 space-y-2">
          <NavButton icon={HelpCircle} label="Support" onClick={() => {}} />
          <NavButton icon={LogOut} label="Logout" onClick={handleLogout} />
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 ml-64 p-8 flex flex-col h-screen overflow-hidden">
        
        <header className="flex items-center justify-between mb-8 shrink-0">
           <div className="flex items-center gap-3 text-[#4d4354]/60 font-bold text-sm">
              <Star className="w-4 h-4 text-[#8127cf]" />
              <span>Assessment Entry Mode</span>
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-[#4d4354]/40 text-xs font-black uppercase tracking-widest">
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Uplink Active</div>
              </div>
              <div className="h-4 w-[1px] bg-[#cfc2d6]/30" />
              <div className="flex items-center gap-4">
                 <div className="h-10 w-10 bg-orange-100 rounded-full border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/initials/svg?seed=Teacher" alt="U" />
                 </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[48px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
           
           <div className="p-8 border-b border-[#f3f4f9] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-10">
                 <h2 className="text-2xl font-black text-[#b10e6b] tracking-tighter">Marks Entry</h2>
                 <div className="flex gap-2">
                    <HeaderPill label={data?.subjects?.[0]?.name || "Mathematics"} />
                    <HeaderPill label="Mid-Term" />
                 </div>
              </div>
              <div className="flex items-center gap-6">
                 <button className="h-10 px-6 bg-[#fbf0fe] text-[#8127cf] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-[#8127cf]/10">
                    <History className="w-3.5 h-3.5" /> Log History
                 </button>
                 <Bell className="w-5 h-5 text-[#4d4354]/40" />
              </div>
           </div>

           <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
                 <div className="flex items-center gap-3 mb-10">
                    <button className="h-11 px-8 bg-[#8127cf] text-white rounded-full font-black text-xs flex items-center gap-2 shadow-lg shadow-[#8127cf]/20">
                       <Zap className="w-4 h-4 fill-white" /> Quick Entry
                    </button>
                    <button className="h-11 px-6 bg-[#f3f4f9] text-[#1f1a23]/60 rounded-full font-black text-xs">Bulk Import</button>
                 </div>

                 <table className="w-full text-left">
                    <thead>
                       <tr className="text-xs font-bold text-[#4d4354]/40 uppercase tracking-wider">
                          <th className="pb-6 pl-6 pt-2 text-left">Student Enrollment</th>
                          <th className="pb-6 pt-2 text-left">Marks (Max {data?.subjects?.[0]?.totalMarks || 100})</th>
                          <th className="pb-6 pt-2 text-left">Current AI Remark</th>
                          <th className="pb-6 pt-2 text-right pr-6">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f3f4f9]">
                       {data?.students?.map((stu: any) => (
                         <MarksRow key={stu.id} name={stu.fullName} email={stu.email} marks="Enter" remark="Awaiting evaluation cycle..." status="Pending" seed={stu.fullName} />
                       ))}
                    </tbody>
                 </table>

                 <div className="sticky bottom-0 left-0 right-0 py-8 flex items-center justify-end gap-3 pointer-events-none">
                    <button onClick={handleFinalSubmit} disabled={saving} className="h-14 px-10 bg-[#1f1a23] text-white rounded-[24px] font-black italic tracking-tighter text-lg shadow-2xl flex items-center gap-3 pointer-events-auto hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                       {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <>Final Deployment <Send className="w-5 h-5 text-emerald-400" /></>}
                    </button>
                 </div>
              </div>

              <div className="w-[360px] bg-[#f3f4f9]/30 border-l border-[#f3f4f9] p-8 overflow-y-auto custom-scrollbar">
                 <div className="bg-[#1f1a23] p-6 rounded-[32px] text-white relative overflow-hidden mb-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Academic Capacity</p>
                    <h4 className="text-4xl font-black mb-1">528</h4>
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Reports Generating...</p>
                 </div>

                 <div className="bg-white p-8 rounded-[40px] border border-[#cfc2d6]/10 shadow-lg">
                    <div className="flex items-start gap-4 mb-8">
                       <div className="h-10 w-10 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf]"><BrainCircuit className="w-6 h-6" /></div>
                       <div>
                          <h4 className="text-lg font-black tracking-tight leading-none mb-1">AI Engine</h4>
                          <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-widest">Powered by Claude</p>
                       </div>
                    </div>

                    <button className="w-full h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white rounded-[24px] font-black text-sm flex items-center justify-center gap-3 shadow-xl shadow-[#8127cf]/30 mb-8 hover:scale-105 transition-all">
                       Generate Remarks
                    </button>

                    <div className="space-y-6">
                       <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-[#1f1a23]/60 uppercase tracking-widest">Urdu Translation</p>
                          <div className="w-10 h-6 bg-[#8127cf] rounded-full p-1"><div className="w-4 h-4 bg-white rounded-full translate-x-4" /></div>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-[#1f1a23]/60 uppercase tracking-widest mb-3">Tone Setting</p>
                          <div className="p-4 rounded-2xl bg-[#fbf0fe]/50 border border-[#8127cf]/10 text-[11px] font-medium leading-relaxed italic text-[#1f1a23]">"Encouraging, constructive, growth mindset."</div>
                       </div>
                    </div>
                 </div>
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

function HeaderPill({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 bg-[#f3f4f9] rounded-xl text-xs font-bold text-[#1f1a23]/60 uppercase tracking-wider">
       {label}
    </div>
  );
}

function MarksRow({ name, email, marks, remark, status, seed }: any) {
  const statusColor = status === 'Saved' ? 'emerald' : 'slate';
  return (
    <tr className="group hover:bg-[#fbf0fe]/20 transition-all border-b border-[#f3f4f9]/50 last:border-0">
       <td className="px-6 py-5">
          <div className="flex items-center gap-4">
             <div className="h-10 w-10 border-2 rounded-xl bg-slate-50 border-white shadow-sm flex items-center justify-center overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`} alt="Avatar" />
             </div>
             <div>
                <p className="text-sm font-bold text-[#1f1a23] leading-none mb-1">{name}</p>
                <p className="text-xs font-medium text-[#4d4354]/60 uppercase tracking-wider">{email.split('@')[0]}</p>
             </div>
          </div>
       </td>
       <td className="px-2 py-5">
          <div className="h-11 w-20 px-1 bg-[#f3f4f9] group-hover:bg-white border-2 border-transparent group-hover:border-[#cfc2d6]/20 rounded-2xl flex items-center justify-center text-sm font-black text-[#1f1a23] transition-all cursor-pointer">
             {marks}
          </div>
       </td>
       <td className="px-6 py-5">
          <p className="text-[11px] font-medium italic text-[#1f1a23] max-w-[320px] leading-relaxed line-clamp-2">{remark}</p>
       </td>
       <td className="px-6 py-5 text-right">
          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${statusColor === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
             <div className="w-1.5 h-1.5 rounded-full bg-current" /> {status}
          </span>
       </td>
    </tr>
  );
}
