'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, Users, Bookmark, Star, Zap, 
  HelpCircle, LogOut, Bell, Settings,
  Search, Plus, ChevronRight, CheckCircle2,
  Trash2, UserPlus, Mail, X, Loader2, Building,
  LayoutGrid, BookOpen, Presentation, Shield, MoreVertical,
  MapPin, Check
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getCampusDashboardData } from '@/app/actions/dashboard';
import { inviteStaff, removeStaff } from '@/app/actions/invite';

export default function CampusAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'classes' | 'teachers'>('classes');
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState<'TEACHER' | 'PRINCIPAL'>('TEACHER');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCampusDashboardData();
      setData(result);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleInvite = async () => {
    if (!inviteEmail) return toast.error("Email required");
    setInviting(true);
    try {
      await inviteStaff({ email: inviteEmail, role: inviteRole });
      toast.success("Invitation dispatched");
      setShowInviteModal(false);
      setInviteEmail('');
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string, label: string) => {
    if (!confirm(`Are you sure you want to remove this ${label}?`)) return;
    try {
      await removeStaff(userId);
      toast.success(`${label} removed`);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading && !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
       <GraduationCap className="h-12 w-12 text-[#8127cf] animate-bounce" />
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest leading-none">Accessing Institutional Node...</p>
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
          <p className="text-[10px] font-bold text-[#b10e6b] uppercase tracking-wider pl-11">Joyful Management</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton icon={LayoutGrid} label="Academic Plan" active={activeTab === 'classes'} onClick={() => setActiveTab('classes')} />
          <NavButton icon={Users} label="Faculty Hub" active={activeTab === 'teachers'} onClick={() => setActiveTab('teachers')} />
          <NavButton icon={Star} label="AI Engine" onClick={() => {}} />
        </nav>

        <div className="pt-6 border-t border-[#cfc2d6]/20 space-y-2">
          <NavButton icon={HelpCircle} label="Help Center" onClick={() => {}} />
          <NavButton icon={LogOut} label="Logout" onClick={handleLogout} />
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 ml-64 p-8 flex flex-col h-screen overflow-hidden">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8 shrink-0">
           <div className="bg-white/50 backdrop-blur-xl border border-[#cfc2d6]/20 px-6 py-3 rounded-2xl flex items-center gap-4 w-[400px]">
              <Search className="w-5 h-5 text-[#4d4354]/40" />
              <input type="text" placeholder="Search academics or staff..." className="bg-transparent border-none outline-none text-sm font-bold w-full" />
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 cursor-pointer" onClick={() => {}}>
                  <div className="text-right">
                     <p className="text-sm font-black text-[#1f1a23]">{data.adminName}</p>
                     <p className="text-[10px] font-bold text-[#8127cf] uppercase tracking-widest">{data.campusName}</p>
                  </div>
                  <div className="h-10 w-10 bg-[#fbf0fe] rounded-full border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                     <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${data.adminName}`} alt="U" />
                  </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
           
           <div className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 sticky top-0 flex items-center justify-between shrink-0">
              <div>
                 <h2 className="text-2xl font-black text-[#1f1a23] tracking-tighter italic">{activeTab === 'classes' ? 'Academic Classes' : 'Faculty Network'}</h2>
                 <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-widest mt-1 opacity-50">{data.schoolName} — Live Identity</p>
              </div>
              
              <div className="flex items-center gap-4">
                 <button onClick={() => { setInviteRole('TEACHER'); setShowInviteModal(true); }} className="h-10 px-6 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white rounded-[16px] font-black italic tracking-tighter text-base shadow-xl shadow-indigo-100 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all cursor-pointer">
                    <Plus className="w-4 h-4" /> New Entry
                 </button>
              </div>
           </div>

           <div className="flex-1 overflow-hidden flex">
              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                 <AnimatePresence mode="wait">
                    {activeTab === 'classes' ? (
                      <motion.div key="classes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         {data.classes.map((cls: any) => (
                           <ClassCard key={cls.id} cls={cls} />
                         ))}
                         {data.classes.length === 0 && (
                           <div className="col-span-full py-20 text-center opacity-30 italic font-bold">No classes defined in the current architecture.</div>
                         )}
                      </motion.div>
                    ) : (
                      <motion.div key="faculty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                         {data.teachers.map((teacher: any) => (
                           <FacultyRow key={teacher.id} teacher={teacher} onRemove={() => handleRemove(teacher.id, 'Teacher')} />
                         ))}
                         {data.teachers.length === 0 && (
                           <div className="py-20 text-center opacity-30 italic font-bold">No faculty records found.</div>
                         )}
                      </motion.div>
                    )}
                 </AnimatePresence>
              </div>

              {/* Right Sidebar - Principal Management */}
              <div className="w-[340px] bg-[#fbf0fe]/20 border-l border-[#f3f4f9] p-8 overflow-y-auto custom-scrollbar">
                 <div className="bg-[#1f1a23] p-7 rounded-[32px] text-white relative overflow-hidden mb-8 shadow-2xl">
                    <div className="absolute top-[-10%] right-[-10%] opacity-10"><Shield className="w-32 h-32" /></div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-5">Facility Head</p>
                    
                    {data.principal ? (
                      <div>
                         <div className="flex items-center gap-4 mb-6">
                            <div className="h-14 w-14 rounded-2xl bg-white/10 border-2 border-white/20 overflow-hidden"><img src={`https://api.dicebear.com/7.x/initials/svg?seed=${data.principal.fullName}`} alt="P" /></div>
                            <div>
                               <h4 className="text-lg font-black italic tracking-tighter leading-none mb-1">{data.principal.fullName}</h4>
                               <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em]">Principal Node</p>
                            </div>
                         </div>
                         <button onClick={() => handleRemove(data.principal.id, 'Principal')} className="w-full h-10 bg-white/10 hover:bg-rose-500/20 text-white/60 hover:text-rose-400 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all cursor-pointer">Remove Official</button>
                      </div>
                    ) : (
                      <button onClick={() => { setInviteRole('PRINCIPAL'); setShowInviteModal(true); }} className="w-full h-28 border-2 border-dashed border-white/10 hover:border-[#8127cf] hover:text-[#8127cf] transition-all rounded-[24px] flex flex-col items-center justify-center gap-2 text-white/30 cursor-pointer">
                         <UserPlus className="w-6 h-6" />
                         <span className="text-[9px] font-black uppercase tracking-[0.2em]">Appoint Principal</span>
                      </button>
                    )}
                 </div>

                 <div className="bg-white p-7 rounded-[32px] border border-[#cfc2d6]/10 shadow-lg">
                    <h3 className="text-[9px] font-black text-[#8127cf] uppercase tracking-widest mb-6">Node Insights</h3>
                    <div className="space-y-4">
                       <StatRow label="Active Teachers" value={data.teachers.length} />
                       <StatRow label="Class Hubs" value={data.classes.length} />
                       <StatRow label="Sync Status" value="Live" active />
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1f1a23]/30 backdrop-blur-sm p-6">
           <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl border border-[#cfc2d6]/10">
              <div className="flex justify-between items-center mb-10">
                 <h3 className="text-2xl font-black text-[#1f1a23] tracking-tighter italic">Invite {inviteRole === 'PRINCIPAL' ? 'Principal' : 'Teacher'}</h3>
                 <button onClick={() => setShowInviteModal(false)} className="text-[#4d4354]/40 hover:text-rose-500 cursor-pointer"><X className="w-6 h-6" /></button>
              </div>
              <div className="space-y-6 mb-10">
                 <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-center gap-4">
                    <Mail className="w-6 h-6 text-[#8127cf]" />
                    <input type="email" placeholder="Official Email Address" className="bg-transparent border-none outline-none font-bold text-sm w-full" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                 </div>
              </div>
              <div className="flex gap-4">
                 <button onClick={() => setShowInviteModal(false)} className="flex-1 h-18 bg-[#f3f4f9] text-[#4d4354] rounded-3xl font-black italic tracking-tighter text-lg cursor-pointer">Cancel</button>
                 <button onClick={handleInvite} disabled={inviting} className="flex-[2] h-18 bg-[#1f1a23] text-white rounded-3xl font-black italic tracking-tighter text-lg shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer">
                    {inviting ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Send Invite <Zap className="w-4 h-4 text-emerald-400" /></>}
                 </button>
              </div>
           </motion.div>
        </div>
      )}

    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 font-bold text-sm cursor-pointer ${active ? 'bg-white text-[#8127cf] shadow-xl shadow-indigo-100 font-black' : 'text-[#4d4354] hover:bg-white/40 hover:text-[#1f1a23]'}`}>
      <Icon className={`w-5 h-5 ${active ? 'text-[#8127cf]' : 'text-[#4d4354]/60'}`} />
      {label}
    </button>
  );
}

function ClassCard({ cls }: any) {
  return (
    <div className="bg-[#fbf0fe]/20 p-7 rounded-[32px] border border-[#cfc2d6]/10 hover:border-[#8127cf]/30 hover:shadow-2xl transition-all group relative overflow-hidden">
       <div className="flex items-start justify-between mb-6">
          <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><BookOpen className="w-6 h-6 text-[#8127cf]" /></div>
          <button className="h-8 w-8 bg-white rounded-lg flex items-center justify-center text-[#4d4354]/20 hover:text-[#8127cf] cursor-pointer"><MoreVertical className="w-4 h-4" /></button>
       </div>
       <h3 className="text-xl font-black text-[#1f1a23] tracking-tighter mb-1">{cls.name}</h3>
       <p className="text-[9px] font-bold text-[#b10e6b]/60 uppercase tracking-widest mb-6">Section {cls.section || 'N/A'}</p>
       
       <div className="pt-5 border-t border-[#cfc2d6]/10 flex items-center justify-between">
          <div>
             <p className="text-[7px] font-black uppercase text-[#4d4354]/40 tracking-widest mb-1">Mentor</p>
             <p className="text-[11px] font-black text-[#1f1a23] italic">{cls.classTeacher?.fullName || 'Unassigned'}</p>
          </div>
          <div className="text-right">
             <p className="text-[16px] font-black text-[#8127cf] italic leading-none">{cls._count.students}</p>
             <p className="text-[7px] font-black uppercase text-[#4d4354]/40 tracking-tighter">Enrolled</p>
          </div>
       </div>
    </div>
  );
}

function FacultyRow({ teacher, onRemove }: any) {
  return (
    <div className="bg-white p-5 rounded-[28px] border border-transparent hover:border-[#8127cf]/10 hover:shadow-xl transition-all flex items-center justify-between group">
       <div className="flex items-center gap-5">
          <div className="h-12 w-12 bg-[#fbf0fe] rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center">
             <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${teacher.fullName}`} alt="T" />
          </div>
          <div>
             <h4 className="text-base font-black text-[#1f1a23] tracking-tight leading-none mb-1">{teacher.fullName}</h4>
             <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-widest leading-none">{teacher.email}</p>
          </div>
       </div>
       <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />
             <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600">Active Node</span>
          </div>
          <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 h-9 w-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all cursor-pointer"><Trash2 className="w-4 h-4" /></button>
       </div>
    </div>
  );
}

function StatRow({ label, value, active }: any) {
  return (
    <div className="flex items-center justify-between py-2">
       <span className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-widest">{label}</span>
       <span className={`text-sm font-black italic tracking-tighter shrink-0 ${active ? 'text-emerald-500' : 'text-[#1f1a23]'}`}>{value}</span>
    </div>
  );
}
