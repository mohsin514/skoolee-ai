'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutGrid, Users, Bookmark, Star, Zap, 
  HelpCircle, LogOut, FileText, Bell, Settings,
  Calendar, CreditCard, ChevronRight, Download,
  Printer, Share2, Shield, Award, UserCircle,
  TrendingUp, GraduationCap, ZapOff, BookOpen,
  CheckCircle2, AlertTriangle, MessageSquare, Loader2, BrainCircuit
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getStudentDashboardData } from '@/app/actions/dashboard';

export default function StudentDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('reports');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getStudentDashboardData();
      setData(result);
    } catch (e: any) {
      toast.error("Access denied: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    toast.success("Safe departure recorded");
    router.push('/login');
  };

  if (loading && !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4 text-center px-6">
       <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest leading-relaxed">
          Accessing Academic Record...<br/>
          <span className="text-[10px] opacity-60">Synchronizing with Official Instant</span>
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
               <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <h1 className="font-black text-xl tracking-tighter text-[#8127cf]">Skoolee AI</h1>
          </div>
          <p className="text-[10px] font-bold text-[#b10e6b] uppercase tracking-wider pl-11">The Joyful Architect</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton icon={LayoutGrid} label="My Overview" onClick={() => {}} />
          <NavButton icon={BookOpen} label="Coursework" onClick={() => {}} />
          <NavButton icon={Calendar} label="Schedule" onClick={() => {}} />
          <NavButton icon={FileText} label="Report Card" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
          <NavButton icon={CreditCard} label="Fee Tokens" onClick={() => {}} />
        </nav>

        <div className="pt-6 border-t border-[#cfc2d6]/20 space-y-2">
          <NavButton icon={HelpCircle} label="Help Center" onClick={() => {}} />
          <NavButton icon={LogOut} label="Logout" onClick={handleLogout} />
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 ml-64 p-8 flex flex-col">
        
        <header className="flex items-center justify-between mb-8 shrink-0">
           <div className="flex items-center gap-3 text-[#4d4354]/60 font-bold text-sm">
              <FileText className="w-4 h-4 text-[#8127cf]" />
              <span>Official Academic Transcript</span>
           </div>
           
           <div className="flex items-center gap-6">
              <Bell className="w-5 h-5 text-[#4d4354]/40" />
              <div className="h-4 w-[1px] bg-[#cfc2d6]/30" />
              <div className="flex items-center gap-4">
                 <div className="h-10 w-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${data?.user?.fullName}`} alt="User" />
                 </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[48px] shadow-2xl flex-1 p-12 relative overflow-hidden flex flex-col">
           
           <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-10">
                 <h2 className="text-3xl font-black text-[#8127cf] tracking-tighter italic">Skoolee AI</h2>
                 <nav className="flex items-center gap-8">
                    <ContentNavItem label="Semester Cycle" active={true} />
                    <ContentNavItem label="Historical" active={false} />
                 </nav>
              </div>
              <div className="flex items-center gap-4">
                 <button className="h-11 px-6 bg-white border border-[#cfc2d6]/30 text-[#1f1a23] rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50">
                    <Share2 className="w-4 h-4" /> Share
                 </button>
                 <button className="h-11 px-6 bg-[#1f1a23] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all">
                    <Printer className="w-4 h-4" /> Download PDF
                 </button>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
              
              <div className="flex gap-10 items-start mb-12">
                 <div className="h-24 w-24 rounded-[32px] bg-slate-100 border-4 border-[#cfc2d6]/20 shadow-xl overflow-hidden shrink-0">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${data?.user?.fullName}`} alt="Avatar" />
                 </div>

                 <div className="flex-1 pt-2">
                    <h3 className="text-4xl font-black tracking-tighter text-[#1f1a23] leading-none mb-2">{data?.user?.fullName}</h3>
                    <p className="text-sm font-semibold text-[#4d4354]/60 uppercase tracking-widest">Mid-Term Cycle 2024</p>
                    <div className="flex gap-3 mt-4">
                       <span className="text-[10px] font-black text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-lg uppercase tracking-widest">ENROLLED</span>
                       <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg uppercase tracking-widest">Verified</span>
                    </div>
                 </div>

                 <div className="flex gap-4">
                    <StatBox icon={Calendar} label="Attendance" value="98.2%" sub="Centralized Sync" />
                    <StatBox icon={Award} label="Standing" value="Merit" />
                 </div>
              </div>

              <div className="grid grid-cols-5 gap-10 mb-12">
                 <div className="col-span-2 space-y-8">
                    <h4 className="text-lg font-black text-[#1f1a23] tracking-tight">Academic Performance</h4>
                    <div className="space-y-6">
                       {data?.user?.marks?.slice(0, 3).map((m: any, i: number) => (
                         <PerfBar key={m.id} label={m.subject?.name} score={m.marksObtained} color={i === 0 ? 'indigo' : i === 1 ? 'rose' : 'amber'} />
                       ))}
                       {(!data?.user?.marks || data?.user?.marks.length === 0) && (
                         <p className="text-xs font-bold text-[#4d4354]/40 italic">No marks recorded in current cycle.</p>
                       )}
                    </div>
                 </div>

                 <div className="col-span-3">
                    <div className="bg-white border border-[#f3f4f9] rounded-[40px] overflow-hidden shadow-sm">
                       <table className="w-full text-left">
                          <thead>
                             <tr className="bg-[#f3f4f9]/30 text-[9px] font-black text-[#4d4354]/40 uppercase tracking-widest border-b border-[#cfc2d6]/10">
                                <th className="px-8 py-4">Subject</th>
                                <th className="px-4 py-4 text-center">Marks</th>
                                <th className="px-8 py-4 text-right">Status</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f3f4f9] text-[11px] font-bold text-[#1f1a23]">
                             {data?.user?.marks?.map((m: any) => (
                               <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-8 py-4">{m.subject?.name}</td>
                                  <td className="px-4 py-4 text-center">{m.marksObtained} / {m.subject?.totalMarks || 100}</td>
                                  <td className="px-8 py-4 text-right">
                                     <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest">Validated</span>
                                  </td>
                               </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>

              <div className="bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-[48px] p-10 shadow-2xl relative overflow-hidden flex gap-10">
                 <div className="absolute right-[-10px] top-[-10px] opacity-10"><Zap className="w-48 h-48 text-white" /></div>
                 
                 <div className="flex-1 text-white space-y-8">
                    <div className="flex items-center gap-3">
                       <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center"><BrainCircuit className="w-6 h-6 text-white" /></div>
                       <h4 className="text-xl font-black italic tracking-tighter leading-none mb-1">AI Performance Insight</h4>
                    </div>

                    <div className="space-y-6">
                       <div className="space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/60">English Commentary</p>
                          <p className="text-sm font-medium leading-relaxed italic pr-12">
                             "{data?.user?.marks?.[0]?.aiRemark || "Academic performance is being analyzed by the semantic engine. Preliminary results suggest strong logic-based capabilities."}"
                          </p>
                       </div>
                    </div>
                 </div>

                 <div className="w-[200px] shrink-0 flex flex-col items-center justify-center p-8 bg-white/10 backdrop-blur-xl rounded-[40px] border border-white/20">
                    <TrendingUp className="w-12 h-12 text-white mb-4" />
                    <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1 leading-none">Learning Style</p>
                    <p className="text-sm font-black text-white italic tracking-tighter">Visual-Logical</p>
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

function ContentNavItem({ label, active }: { label: string, active: boolean }) {
  return (
    <div className="relative group cursor-pointer">
       <span className={`text-sm font-black transition-colors ${active ? 'text-[#8127cf]' : 'text-[#4d4354]/40 group-hover:text-[#4d4354]'}`}>{label}</span>
       {active && <motion.div layoutId="underline" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#8127cf] rounded-full" />}
    </div>
  );
}

function StatBox({ icon: Icon, label, value, sub }: any) {
  return (
    <div className="p-6 bg-[#f3f4f9]/50 rounded-[32px] border border-[#cfc2d6]/20 flex flex-col gap-1 min-w-[180px]">
       <div className="flex items-center gap-2 text-[#8127cf]/60 mb-2">
          <Icon className="w-4 h-4" />
          <span className="text-[10px] font-bold text-[#4d4354] uppercase tracking-wider">{label}</span>
       </div>
       <p className="text-2xl font-black text-[#1f1a23] leading-none mb-1">{value}</p>
       {sub && <p className="text-[9px] font-medium text-[#4d4354]/40 uppercase tracking-wider">{sub}</p>}
    </div>
  );
}

function PerfBar({ label, score, color }: any) {
  const cMap: any = { indigo: 'bg-indigo-500', rose: 'bg-rose-500', amber: 'bg-amber-500' };
  return (
    <div>
       <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-black text-[#1f1a23]">{label}</span>
          <span className="text-[10px] font-black text-[#4d4354]/40">{score}/100</span>
       </div>
       <div className="h-3 w-full bg-[#f3f4f9] rounded-full overflow-hidden p-0.5 border border-[#cfc2d6]/10">
          <motion.div initial={{ width: 0 }} animate={{ width: score + '%' }} className={`h-full ${cMap[color]} rounded-full`} />
       </div>
    </div>
  );
}
