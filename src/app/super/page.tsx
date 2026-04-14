'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, Users, GraduationCap, Wallet,
  Search, Bell, ChevronRight, Activity,
  Settings, Building, CheckCircle2,
  AlertCircle, Loader2, LogOut, Plus, Shield,
  HelpCircle, Star, ThumbsUp, ThumbsDown,
  LayoutGrid, Bookmark, Zap, Globe, Palette,
  Database, FileText, X, Mail
} from 'lucide-react';
import { getSuperAdminDashboardData } from '@/app/actions/dashboard';
import { addCampus } from '@/app/actions/addCampus';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('schools');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', board: 'Federal Board', adminEmail: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await getSuperAdminDashboardData();
      setData(stats);
    } catch (e: any) {
      toast.error("Data refresh failed: " + e.message);
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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.adminEmail) return toast.error("Name and Email are required");
    setIsSubmitting(true);
    try {
      await addCampus(form.name, form.location, form.board, form.adminEmail);
      toast.success("Campus node instantiated. Invitation sent to admin.");
      setShowAddModal(false);
      setForm({ name: '', location: '', board: 'Federal Board', adminEmail: '' });
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
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest">Initializing Console...</p>
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
          <NavButton icon={LayoutGrid} label="Schools" active={activeTab === 'schools'} onClick={() => setActiveTab('schools')} />
          <NavButton icon={Users} label="Admins" active={activeTab === 'admins'} onClick={() => setActiveTab('admins')} />
          <NavButton icon={Bookmark} label="Academics" active={activeTab === 'academics'} onClick={() => setActiveTab('academics')} />
          <NavButton icon={Star} label="Marks" active={activeTab === 'marks'} onClick={() => setActiveTab('marks')} />
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
              <Building className="w-4 h-4" />
              <span>{activeTab === 'schools' ? 'School Setup & Branding' : 'Administrative Directory'}</span>
           </div>
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-[#4d4354]/40">
                 <Star className="w-5 h-5" />
                 <ThumbsUp className="w-5 h-5" />
              </div>
              <div className="h-4 w-[1px] bg-[#cfc2d6]/30" />
              <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-bold text-[#1f1a23]">Global Master</p>
                    <p className="text-[10px] font-bold text-[#4d4354]/60 uppercase tracking-wider">Super Admin</p>
                  </div>
                 <div className="h-10 w-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                 </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[48px] shadow-2xl flex-1 p-12 relative overflow-hidden flex flex-col">
           
           <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-12">
                 <h2 className="text-3xl font-black text-[#8127cf] tracking-tighter italic">Skoolee AI</h2>
                 <nav className="flex items-center gap-8">
                    <ContentNavItem label="Schools" active={activeTab === 'schools'} onClick={() => setActiveTab('schools')} />
                    <ContentNavItem label="Admins" active={activeTab === 'admins'} onClick={() => setActiveTab('admins')} />
                    <ContentNavItem label="AI Engine" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} />
                 </nav>
              </div>
              <div className="flex items-center gap-4">
                 <Bell className="w-5 h-5 text-[#4d4354]" />
                 <Settings className="w-5 h-5 text-[#4d4354]" />
                 <div className="h-10 w-10 bg-slate-100 rounded-full" />
              </div>
           </div>

           <div className="flex gap-10 h-full overflow-y-auto pr-2 custom-scrollbar">
              
              <div className="flex-1 space-y-8">
                 {activeTab === 'schools' && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                      <div className="flex items-end justify-between">
                         <div>
                             <h2 className="text-5xl font-extrabold tracking-tight text-[#1f1a23]">School Network</h2>
                             <p className="text-sm font-semibold text-[#4d4354] mt-2 opacity-60">Managing {data?.totalCampuses || 0} active campuses across the territory.</p>
                         </div>
                         <button 
                            onClick={() => setShowAddModal(true)}
                            className="h-14 px-8 bg-[#8127cf] hover:bg-[#9c48ea] text-white rounded-3xl font-bold flex items-center gap-3 shadow-xl shadow-[#8127cf]/30 transition-all active:scale-95"
                          >
                            <Plus className="w-5 h-5" /> Add New School
                         </button>
                      </div>

                      <div className="grid grid-cols-2 gap-6 pt-6">
                         {data?.campusesList?.map((campus: any, i: number) => (
                           <SchoolCard key={campus.id} id={campus.id} name={campus.name} location={campus.city || 'Pakistan'} students={campus.students} active />
                         ))}
                         
                         <div className="bg-gradient-to-br from-[#8127cf] to-[#9c48ea] p-8 rounded-[40px] shadow-2xl relative overflow-hidden group">
                            <div className="absolute -right-10 -top-10 opacity-20 transform rotate-12 group-hover:scale-110 transition-transform">
                               <Zap className="w-48 h-48 text-white" />
                            </div>
                            <div className="relative z-10 h-full flex flex-col justify-between">
                               <div>
                                 <h3 className="text-2xl font-black text-white leading-tight mb-3">Quick Deploy</h3>
                                 <p className="text-white/80 text-sm font-medium leading-relaxed">Ready to expand? Use our AI-assisted setup to clone configurations across new campuses instantly.</p>
                               </div>
                               <button onClick={() => setShowAddModal(true)} className="h-12 w-40 bg-white text-[#8127cf] rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all mt-6">
                                  Start Wizard
                               </button>
                            </div>
                         </div>
                      </div>
                   </motion.div>
                 )}

                 {activeTab === 'admins' && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                       <h2 className="text-5xl font-extrabold tracking-tight text-[#1f1a23]">Administrative Directory</h2>
                       <div className="bg-white border border-[#f3f4f9] rounded-[48px] overflow-hidden shadow-sm">
                          <table className="w-full text-left">
                             <thead>
                                <tr className="bg-[#f3f4f9]/30 border-b border-[#cfc2d6]/20 text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest">
                                   <th className="px-8 py-6">Admin Name</th>
                                   <th className="px-8 py-6">Assigned Campus</th>
                                   <th className="px-8 py-6">Email</th>
                                   <th className="px-8 py-6 text-right">Status</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-[#f3f4f9]">
                                {data?.adminsList?.map((adm: any) => (
                                  <tr key={adm.id} className="hover:bg-slate-50 transition-colors">
                                     <td className="px-8 py-5 font-black text-[#1f1a23]">{adm.fullName}</td>
                                     <td className="px-8 py-5 text-sm font-bold text-[#4d4354]">{adm.campus?.name}</td>
                                     <td className="px-8 py-5 text-sm font-medium text-[#4d4354]/60">{adm.email}</td>
                                     <td className="px-8 py-5 text-right">
                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${adm.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                           {adm.isActive ? 'Active' : 'Offline'}
                                        </span>
                                     </td>
                                  </tr>
                                ))}
                                {data?.invitesList?.map((inv: any) => (
                                  <tr key={inv.id} className="opacity-60 bg-slate-50/50">
                                     <td className="px-8 py-5 font-bold italic text-[#4d4354]">Pending User</td>
                                     <td className="px-8 py-5 text-sm font-bold text-[#4d4354]">{inv.campus?.name}</td>
                                     <td className="px-8 py-5 text-sm font-medium text-[#4d4354]/60">{inv.email}</td>
                                     <td className="px-8 py-5 text-right">
                                        <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest">Invited</span>
                                     </td>
                                  </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                   </motion.div>
                 )}
              </div>

              <div className="w-[320px] space-y-6">
                 <div className="bg-[#f3f4f9] p-8 rounded-[48px] border border-[#cfc2d6]/20">
                    <h3 className="text-lg font-black text-[#1f1a23] mb-6 tracking-tight">System Controls</h3>
                    <div className="space-y-4">
                       <ControlToggle icon={FileText} label="Custom Report Cards" active />
                       <ControlToggle icon={Globe} label="Multi-tenant Isolation" active />
                       <ControlToggle icon={Zap} label="AI Auto-Grading" />
                    </div>
                 </div>
                 <div className="p-8 bg-white border border-[#cfc2d6]/20 rounded-[48px] shadow-lg shadow-indigo-100/30">
                    <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest mb-4">Instance Statistics</p>
                    <div className="space-y-4">
                       <StatRow label="Users Scoped" value={data?.staffCount + data?.studentCount} />
                       <StatRow label="Active Nodes" value={data?.totalCampuses} />
                    </div>
                 </div>
              </div>
           </div>
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
                      <h3 className="text-3xl font-black tracking-tighter text-[#1f1a23]">New Campus Node</h3>
                      <p className="text-xs font-bold text-[#4d4354]/60 uppercase tracking-widest mt-1">Initialize Institution Branch</p>
                   </div>
                   <button onClick={() => setShowAddModal(false)} className="h-10 w-10 bg-[#f3f4f9] rounded-full flex items-center justify-center text-[#4d4354] hover:text-[#8127cf]"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleAddSubmit} className="space-y-6">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-[#4d4354] uppercase tracking-wider pl-1">Campus Name</label>
                      <input type="text" placeholder="Horizon Central" className="w-full h-14 px-6 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-[#4d4354] uppercase tracking-wider pl-1">Primary Location</label>
                      <input type="text" placeholder="Lahore, Pakistan" className="w-full h-14 px-6 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none" value={form.location} onChange={e=>setForm({...form, location: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-[#4d4354] uppercase tracking-wider pl-1">Assigned Administrator Email</label>
                      <div className="relative">
                         <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4d4354]/40" />
                         <input type="email" placeholder="principal@campus.edu" className="w-full h-14 pl-14 pr-6 bg-[#f3f4f9] border-0 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all shadow-none" value={form.adminEmail} onChange={e=>setForm({...form, adminEmail: e.target.value})} />
                      </div>
                   </div>
                   <button disabled={isSubmitting} type="submit" className="w-full h-16 bg-[#1f1a23] hover:bg-[#322a38] text-white rounded-[24px] font-black italic tracking-tighter text-lg shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 mt-4">
                      {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <>Deploy Node <ChevronRight className="w-6 h-6" /></>}
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

function SchoolCard({ name, location, students, active }: any) {
  return (
    <div className="bg-white p-8 rounded-[40px] border border-[#cfc2d6]/30 shadow-sm hover:shadow-2xl transition-all group min-h-[220px] flex flex-col justify-between">
       <div className="flex justify-between items-start">
          <div className="h-12 w-12 rounded-2xl bg-[#fbf0fe] text-[#8127cf] flex items-center justify-center shadow-sm"><Building2 className="w-6 h-6" /></div>
          {active && <span className="text-[10px] font-black text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-full uppercase tracking-widest">Active</span>}
       </div>
       <div>
          <h4 className="text-xl font-black text-[#1f1a23] mt-4 leading-tight">{name}</h4>
          <p className="text-xs font-bold text-[#4d4354]/60 mt-1">{location}</p>
       </div>
       <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#f3f4f9]">
          <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest">{students} Students</p>
          <button className="text-[10px] font-black text-[#8127cf] flex items-center gap-1 uppercase tracking-widest hover:translate-x-1 transition-transform">Manage <ChevronRight className="w-3 h-3" /></button>
       </div>
    </div>
  );
}

function ControlToggle({ icon: Icon, label, active }: any) {
  return (
    <div className="p-4 bg-white rounded-3xl border border-[#cfc2d6]/20 flex items-center justify-between group">
       <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-[#8127cf]" />
          <p className="text-xs font-bold text-[#1f1a23] leading-none">{label}</p>
       </div>
       <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${active ? 'bg-[#8127cf]' : 'bg-slate-200'}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${active ? 'translate-x-4' : 'translate-x-0'}`} />
       </div>
    </div>
  );
}

function StatRow({ label, value }: any) {
  return (
    <div className="flex justify-between items-center">
       <span className="text-xs font-bold text-[#4d4354]">{label}</span>
       <span className="text-xs font-black text-[#1f1a23]">{value}</span>
    </div>
  );
}
