'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutGrid, Users, Bookmark, Star, Zap, 
  HelpCircle, LogOut, Building2, Bell, Settings,
  Search, Plus, Download, ChevronRight, FileSpreadsheet,
  RefreshCw, TrendingUp, Filter, MoreHorizontal,
  AlertCircle, MessageSquare, ClipboardCheck,
  CreditCard, Wallet, PieChart, BarChart3, Clock,
  CheckCircle2, AlertTriangle, Shield, Check, Loader2, X
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getCampusDashboardData } from '@/app/actions/dashboard';
import { addStudent } from '@/app/actions/addStudent';

export default function CampusAdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('students');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', rollNo: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await getCampusDashboardData();
      setData(stats);
    } catch (e: any) {
      toast.error("Failed to load dashboard: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.success("Logged out successfully");
      router.push('/login');
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.email) return toast.error("Name and Email required");
    setIsSubmitting(true);
    try {
      await addStudent(form);
      toast.success("Student registered successfully");
      setShowAddModal(false);
      setForm({ fullName: '', email: '', rollNo: '' });
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
       <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest">Accessing Node Data...</p>
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
          <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-[0.2em] pl-11">The Joyful Architect</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton icon={LayoutGrid} label="Dashboard" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <NavButton icon={Users} label="Students" active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
          <NavButton icon={Bookmark} label="Academics" active={activeTab === 'academics'} onClick={() => setActiveTab('academics')} />
          <NavButton icon={Star} label="Marks" active={activeTab === 'marks'} onClick={() => setActiveTab('marks')} />
          <NavButton icon={CreditCard} label="Finance" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
          <NavButton icon={Zap} label="AI Engine" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} />
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
              <Users className="w-4 h-4" />
              <span>{activeTab === 'students' ? 'Student Management' : 'Institutional Overview'}</span>
           </div>
           <div className="flex items-center gap-6">
              <Bell className="w-5 h-5 text-[#4d4354]/40 cursor-pointer" />
              <div className="h-4 w-[1px] bg-[#cfc2d6]/30" />
              <div className="flex items-center gap-4">
                 <div className="text-right">
                    <p className="text-xs font-bold text-[#1f1a23]">Node Admin</p>
                    <p className="text-[10px] font-bold text-[#4d4354]/60 uppercase tracking-wider">Campus Admin</p>
                 </div>
                 <div className="h-10 w-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" alt="Admin" />
                 </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[48px] shadow-2xl flex-1 p-12 relative overflow-hidden flex flex-col">
           
           <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-12">
                 <h2 className="text-3xl font-black text-[#8127cf] tracking-tighter italic">Skoolee AI</h2>
                 <nav className="flex items-center gap-8">
                    <ContentNavItem label="Students" active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
                    <ContentNavItem label="Finance" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
                 </nav>
              </div>
              <div className="relative group">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4d4354]/40" />
                 <input type="text" placeholder="Search data..." className="h-10 pl-12 pr-6 bg-[#f3f4f9] rounded-full text-xs font-bold text-[#1f1a23] outline-none w-64 border-0 focus:ring-2 focus:ring-[#8127cf]/20" />
              </div>
           </div>

           <AnimatePresence mode="wait">
             {activeTab === 'students' && (
               <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex gap-10 flex-1 overflow-hidden">
                  <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                     <div className="flex items-start justify-between mb-10">
                        <div>
                           <h3 className="text-5xl font-black tracking-tighter text-[#1f1a23]">Student Management</h3>
                           <p className="text-sm font-semibold text-[#4d4354]/60 mt-2">Manage institution enrollment and profile states.</p>
                        </div>
                        <div className="flex flex-col items-center p-6 bg-[#f3f4f9] rounded-[32px] min-w-[160px]">
                           <Users className="w-6 h-6 text-[#8127cf] mb-2" />
                           <p className="text-4xl font-black text-[#1f1a23]">{data?.stats?.totalStudents || 0}</p>
                           <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest">Total Students</p>
                        </div>
                     </div>

                     <div className="flex items-center gap-3 mb-8">
                        <ActionBtn icon={Plus} label="Register Student" onClick={() => setShowAddModal(true)} />
                        <ActionBtn icon={FileSpreadsheet} label="Import Batch" />
                     </div>

                     <div className="bg-white border border-[#f3f4f9] rounded-[48px] overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                           <thead>
                              <tr className="bg-[#f3f4f9]/30 border-b border-[#cfc2d6]/20 text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest">
                                 <th className="px-8 py-6">Identity</th>
                                 <th className="px-6 py-6">Status</th>
                                 <th className="px-8 py-6 text-right">Actions</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-[#f3f4f9]">
                              {data?.students?.map((stu: any) => (
                                <tr key={stu.id} className="hover:bg-slate-50 transition-colors">
                                   <td className="px-8 py-5">
                                      <div className="flex items-center gap-4">
                                         <div className="h-10 w-10 rounded-xl bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center font-black text-[#1f1a23]/30 overflow-hidden">
                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${stu.fullName}`} alt="S" />
                                         </div>
                                         <div>
                                            <p className="text-sm font-black text-[#1f1a23] leading-none mb-1">{stu.fullName}</p>
                                            <p className="text-[10px] font-bold text-[#4d4354]/60">{stu.email}</p>
                                         </div>
                                      </div>
                                   </td>
                                   <td className="px-6 py-5">
                                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${stu.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                         <div className="w-1.5 h-1.5 rounded-full bg-current" /> {stu.isActive ? 'Active' : 'Dormant'}
                                      </span>
                                   </td>
                                   <td className="px-8 py-5 text-right">
                                      <button className="p-2 hover:bg-white rounded-full transition-all text-[#4d4354]/40 hover:text-[#8127cf]"><MoreHorizontal className="w-5 h-5" /></button>
                                   </td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>

                  <div className="w-[320px] space-y-6">
                     <div className="bg-gradient-to-br from-[#8127cf] to-[#9c48ea] p-8 rounded-[40px] shadow-2xl text-white relative overflow-hidden group">
                        <div className="absolute right-0 bottom-0 opacity-10 transform scale-150 rotate-12"><Zap className="w-32 h-32 text-white" /></div>
                        <h4 className="text-xl font-black mb-1">AI Academic Insights</h4>
                        <p className="text-white/70 text-[11px] font-medium leading-relaxed mb-6">Institution performance is stable.</p>
                        <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                           <div className="h-full bg-white w-[82%] rounded-full shadow-lg" />
                        </div>
                     </div>
                     <div className="p-8 bg-white border border-[#cfc2d6]/20 rounded-[48px] shadow-lg shadow-indigo-100/30">
                        <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest mb-6 px-1">Active Alerts</p>
                        <div className="space-y-4">
                           <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-start gap-4">
                              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                              <p className="text-[11px] font-black text-rose-900 leading-tight">Syncing required for Batch 24 enrollment.</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </main>

      {/* ─── ADD MODAL ─── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-[#1f1a23]/40 backdrop-blur-sm" />
             <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-lg rounded-[48px] shadow-2xl overflow-hidden p-10">
                <div className="flex justify-between items-center mb-10">
                   <div>
                      <h3 className="text-3xl font-black tracking-tighter text-[#1f1a23]">Register Student</h3>
                      <p className="text-xs font-bold text-[#4d4354]/60 uppercase tracking-widest mt-1">Enrollment for Batch 2024</p>
                   </div>
                   <button onClick={() => setShowAddModal(false)} className="h-10 w-10 bg-[#f3f4f9] rounded-full flex items-center justify-center text-[#4d4354] hover:text-[#8127cf]"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleAddStudent} className="space-y-6">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-[#4d4354] uppercase tracking-wider pl-1">Full Name</label>
                      <input type="text" placeholder="Zain Ahmed" className="w-full h-14 px-6 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none" value={form.fullName} onChange={e=>setForm({...form, fullName: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-[#4d4354] uppercase tracking-wider pl-1">Authorized Email</label>
                      <input type="email" placeholder="student@institutional.edu" className="w-full h-14 px-6 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                   </div>
                   <button disabled={isSubmitting} type="submit" className="w-full h-16 bg-[#1f1a23] hover:bg-[#322a38] text-white rounded-[24px] font-black italic tracking-tighter text-lg shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 mt-4">
                      {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <>Complete Enrollment <ChevronRight className="w-6 h-6" /></>}
                   </button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

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

function ContentNavItem({ label, active, onClick }: any) {
  return (
    <div className="relative group cursor-pointer" onClick={onClick}>
       <span className={`text-sm font-black transition-colors ${active ? 'text-[#8127cf]' : 'text-[#4d4354]/40 group-hover:text-[#4d4354]'}`}>{label}</span>
       {active && <motion.div layoutId="underline" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#8127cf] rounded-full" />}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="h-10 px-6 bg-[#f3f4f9] hover:bg-white hover:shadow-lg rounded-full text-[11px] font-black text-[#1f1a23]/60 flex items-center gap-2 transition-all border border-transparent hover:border-[#cfc2d6]/20">
       <Icon className="w-4 h-4 text-[#8127cf]" /> {label}
    </button>
  );
}
