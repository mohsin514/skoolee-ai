'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, Users, Building2, Search, Bell, Settings,
  HelpCircle, ChevronRight, LayoutGrid, Zap, LogOut,
  Mail, X, Plus, Shield, MapPin, MoreHorizontal,
  TrendingUp, Globe, Loader2, RefreshCw, UserPlus, Trash2
} from 'lucide-react';
import { getSuperAdminDashboardData } from '@/app/actions/dashboard';
import { inviteStaff, removeStaff, cancelInvitation } from '@/app/actions/invite';
import { addCampus } from '@/app/actions/addCampus';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampus, setSelectedCampus] = useState<any>(null);
  const [showAddCampusModal, setShowAddCampusModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newCampusData, setNewCampusData] = useState({ 
    name: '', 
    location: '', 
    regId: '', 
    autoId: true 
  });
  const [addingCampus, setAddingCampus] = useState(false);
  const [inviteRole, setInviteRole] = useState<'CAMPUS_ADMIN' | 'PRINCIPAL'>('CAMPUS_ADMIN');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSuperAdminDashboardData();
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
    if (!inviteEmail) return toast.error("Email is required");
    setInviting(true);
    try {
      await inviteStaff({ email: inviteEmail, role: inviteRole, campusId: selectedCampus.id });
      toast.success("Invitation dispatched successfully");
      setShowInviteModal(false);
      setInviteEmail('');
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleAddCampus = async () => {
    if (!newCampusData.name || !newCampusData.location) {
      return toast.error("Please fill all required fields");
    }
    setAddingCampus(true);
    try {
      await addCampus(
        newCampusData.name, 
        newCampusData.location, 
        "Default", 
        undefined, 
        newCampusData.autoId ? undefined : newCampusData.regId
      );
      toast.success("New facility instantiated successfully");
      setShowAddCampusModal(false);
      setNewCampusData({ name: '', location: '', regId: '', autoId: true });
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingCampus(false);
    }
  };

  const handleRemove = async (userId: string, type: 'Admin' | 'Principal') => {
    if (!confirm(`Are you sure you want to remove this ${type}?`)) return;
    try {
      await removeStaff(userId);
      toast.success(`${type} removed successfully`);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const generateLocalId = () => {
    const id = `BR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    setNewCampusData(prev => ({ ...prev, regId: id, autoId: false }));
  };

  if (loading && !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
       <GraduationCap className="h-12 w-12 text-[#8127cf] animate-bounce" />
       <p className="text-sm font-black text-[#1f1a23] uppercase tracking-widest">Synchronizing School Network...</p>
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
          <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-[0.2em] pl-11">The Joyful Architect</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton icon={LayoutGrid} label="Schools" active={!selectedCampus} onClick={() => setSelectedCampus(null)} />
          <NavButton icon={Star} label="AI Engine" onClick={() => {}} />
        </nav>

        <div className="pt-6 border-t border-[#cfc2d6]/20 space-y-2">
          <NavButton icon={HelpCircle} label="Support" onClick={() => {}} />
          <NavButton icon={LogOut} label="Logout" onClick={handleLogout} />
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 ml-64 p-8 flex flex-col h-screen overflow-hidden">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8 shrink-0">
           <div className="bg-white/50 backdrop-blur-xl border border-[#cfc2d6]/20 px-6 py-3 rounded-2xl flex items-center gap-4 w-[400px]">
              <Search className="w-5 h-5 text-[#4d4354]/40" />
              <input type="text" placeholder="Search facilities or users..." className="bg-transparent border-none outline-none text-sm font-bold w-full" />
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                 <Bell className="w-6 h-6 text-[#4d4354]/40 hover:text-[#8127cf] cursor-pointer transition-colors" />
                 <Settings className="w-6 h-6 text-[#4d4354]/40 hover:text-[#8127cf] cursor-pointer transition-colors" />
                 <div className="h-4 w-[1px] bg-[#cfc2d6]/30" />
                 <div className="flex items-center gap-4 cursor-pointer group" onClick={() => {}}>
                    <div className="text-right">
                       <p className="text-sm font-black text-[#1f1a23] group-hover:text-[#8127cf] transition-colors">{data.user.fullName}</p>
                       <p className="text-[10px] font-bold text-[#b10e6b] uppercase tracking-wider">{data.user.role}</p>
                    </div>
                    <div className="h-10 w-10 bg-[#fbf0fe] rounded-full border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                       <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${data.user.fullName}`} alt="User" />
                    </div>
                 </div>
              </div>
           </div>
        </header>

        <div className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
           <AnimatePresence mode="wait">
             {!selectedCampus ? (
               <motion.div 
                 key="grid"
                 initial={{ opacity: 0, y: 20 }} 
                 animate={{ opacity: 1, y: 0 }} 
                 exit={{ opacity: 0, y: -20 }}
                 className="p-8 overflow-y-auto custom-scrollbar flex-1"
               >
                  <div className="flex items-center justify-between mb-10">
                     <div>
                        <h2 className="text-3xl font-black text-[#1f1a23] tracking-tighter">School Network</h2>
                        <p className="text-[#4d4354]/40 font-bold mt-1 uppercase text-[10px] tracking-widest italic">{data.schoolName} Group</p>
                     </div>
                     <button onClick={() => setShowAddCampusModal(true)} className="h-12 px-8 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white rounded-[18px] font-black italic tracking-tighter text-base shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 cursor-pointer">
                        <Building2 className="w-5 h-5" /> Add New School
                     </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {data.campuses.map((campus: any) => (
                       <CampusCard 
                          key={campus.id} 
                          campus={campus} 
                          onManage={() => setSelectedCampus(campus)} 
                       />
                     ))}
                     
                     {/* Quick Deploy Card */}
                     <div className="bg-gradient-to-br from-[#8127cf] to-[#9c48ea] p-8 rounded-[40px] text-white relative overflow-hidden flex flex-col justify-end min-h-[280px] shadow-2xl group cursor-pointer">
                        <div className="absolute top-[-20%] right-[-20%] opacity-10 group-hover:rotate-12 transition-transform duration-500">
                           <Zap className="w-48 h-48" />
                        </div>
                        <h3 className="text-xl font-black mb-3 leading-tight tracking-tight">Quick Deploy</h3>
                        <p className="text-white/60 text-xs font-bold mb-6 leading-relaxed italic">Clone configurations across new campuses instantly with AI setup.</p>
                        <button className="h-10 w-fit px-6 bg-white text-[#8127cf] rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl">Start Wizard</button>
                     </div>
                  </div>
               </motion.div>
             ) : (
               <motion.div 
                 key="detail"
                 initial={{ opacity: 0, x: 20 }} 
                 animate={{ opacity: 1, x: 0 }} 
                 exit={{ opacity: 0, x: -20 }}
                 className="flex flex-col h-full"
               >
                  <div className="p-8 border-b border-[#f3f4f9] flex items-center justify-between bg-white shrink-0">
                     <div className="flex items-center gap-6">
                        <button onClick={() => setSelectedCampus(null)} className="h-10 w-10 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer">
                           <ChevronRight className="w-5 h-5 rotate-180" />
                        </button>
                        <div>
                           <h2 className="text-2xl font-black text-[#1f1a23] tracking-tighter leading-none mb-1">{selectedCampus.name}</h2>
                           <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-widest flex items-center gap-2">
                             <MapPin className="w-3 h-3" /> {selectedCampus.city} • Facility Identity Hub
                           </p>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active Node
                        </div>
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/30">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Admin Management */}
                        <ManagementSection 
                          title="Campus Administrator" 
                          icon={Shield} 
                          desc="Sole authority for facility operations. Only 1 active admin per campus."
                          user={selectedCampus.admin}
                          onAdd={() => { setInviteRole('CAMPUS_ADMIN'); setShowInviteModal(true); }}
                          onRemove={(id: string) => handleRemove(id, 'Admin')}
                        />

                        {/* Principal Management */}
                        <ManagementSection 
                          title="Principal / Academic Head" 
                          icon={Star} 
                          desc="Primary academic overseer. Manages faculty and curricula."
                          user={selectedCampus.principal}
                          onAdd={() => { setInviteRole('PRINCIPAL'); setShowInviteModal(true); }}
                          onRemove={(id: string) => handleRemove(id, 'Principal')}
                        />
                     </div>

                     <div className="mt-8 bg-white p-8 rounded-[32px] border border-[#cfc2d6]/10 shadow-lg">
                        <h3 className="text-[9px] font-black text-[#8127cf] uppercase tracking-[0.2em] mb-6">Node Identity & Parameters</h3>
                        <div className="grid grid-cols-4 gap-4">
                           <InfoPill label="Facility Code" value={selectedCampus.id.split('-')[0].toUpperCase()} />
                           <InfoPill label="Sync Status" value="Live Uplink" active />
                           <InfoPill label="Member Capacity" value="Limited" />
                           <InfoPill label="Model Version" value="Skoolee AI v2" />
                        </div>
                     </div>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1f1a23]/30 backdrop-blur-sm p-6">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }} 
             animate={{ scale: 1, opacity: 1 }}
             className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl border border-[#cfc2d6]/10"
           >
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-[#1f1a23] tracking-tighter italic">Invite {inviteRole === 'CAMPUS_ADMIN' ? 'Admin' : 'Principal'}</h3>
                 <button onClick={() => setShowInviteModal(false)} className="text-[#4d4354]/40 hover:text-rose-500 cursor-pointer"><X className="w-6 h-6" /></button>
              </div>
              
              <div className="space-y-6 mb-10">
                 <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-4">
                    <Mail className="w-6 h-6 text-[#8127cf]" />
                    <input 
                      type="email" 
                      placeholder="Enter official email..." 
                      className="bg-transparent border-none outline-none font-bold text-sm w-full"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                 </div>
                 <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-widest pl-2">An encrypted activation link will be sent to this address.</p>
              </div>

              <div className="flex gap-4">
                 <button onClick={() => setShowInviteModal(false)} className="flex-1 h-16 bg-[#f3f4f9] text-[#4d4354] rounded-[24px] font-black italic tracking-tighter text-lg cursor-pointer">Cancel</button>
                 <button onClick={handleInvite} disabled={inviting} className="flex-[2] h-16 bg-[#1f1a23] text-white rounded-[24px] font-black italic tracking-tighter text-lg shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer">
                    {inviting ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Send Invite <Zap className="w-4 h-4 text-emerald-400" /></>}
                 </button>
              </div>
           </motion.div>
        </div>
      )}

      {/* Add New Facility Modal */}
      {showAddCampusModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1f1a23]/30 backdrop-blur-sm p-6 overflow-y-auto">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }} 
             animate={{ scale: 1, opacity: 1 }}
             className="bg-white w-full max-w-2xl rounded-[48px] p-10 my-10 shadow-2xl border border-[#cfc2d6]/10"
           >
              <div className="flex justify-between items-center mb-8">
                 <div>
                    <h3 className="text-3xl font-black text-[#1f1a23] tracking-tighter italic">Instantiate Facility</h3>
                    <p className="text-[10px] font-bold text-[#8127cf] uppercase tracking-widest mt-1">Deploying New Academic Node</p>
                 </div>
                 <button onClick={() => setShowAddCampusModal(false)} className="text-[#4d4354]/40 hover:text-rose-500 cursor-pointer"><X className="w-6 h-6" /></button>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8 mb-10">
                 <div className="space-y-6">
                    <div>
                       <label className="text-[9px] font-black text-[#4d4354]/40 uppercase tracking-widest pl-2 mb-2 block">Campus Name</label>
                       <div className="p-4 bg-[#f3f4f9] rounded-2xl border border-transparent focus-within:border-[#8127cf]/30 transition-all flex items-center gap-3">
                          <Building2 className="w-5 h-5 text-[#4d4354]/40" />
                          <input type="text" placeholder="e.g. South Campus" className="bg-transparent border-none outline-none font-bold text-sm w-full" value={newCampusData.name} onChange={(e) => setNewCampusData({...newCampusData, name: e.target.value})} />
                       </div>
                    </div>
                    <div>
                       <label className="text-[9px] font-black text-[#4d4354]/40 uppercase tracking-widest pl-2 mb-2 block">City / Location</label>
                       <div className="p-4 bg-[#f3f4f9] rounded-2xl border border-transparent focus-within:border-[#8127cf]/30 transition-all flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-[#4d4354]/40" />
                          <input type="text" placeholder="e.g. Islamabad" className="bg-transparent border-none outline-none font-bold text-sm w-full" value={newCampusData.location} onChange={(e) => setNewCampusData({...newCampusData, location: e.target.value})} />
                       </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="p-8 bg-[#fbf0fe] rounded-[32px] border border-[#cfc2d6]/20">
                       <div className="flex justify-between items-center mb-4">
                          <label className="text-[9px] font-black text-[#8127cf] uppercase tracking-widest">Campus Key</label>
                          <button 
                            onClick={newCampusData.autoId ? () => setNewCampusData({...newCampusData, autoId: false}) : () => setNewCampusData({...newCampusData, autoId: true, regId: ''})} 
                            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg transition-all ${newCampusData.autoId ? 'bg-[#8127cf] text-white' : 'bg-white text-[#8127cf] border border-[#8127cf]/20'}`}
                          >
                             {newCampusData.autoId ? 'Auto ON' : 'Manual'}
                          </button>
                       </div>
                       <input 
                         type="text" 
                         placeholder={newCampusData.autoId ? "KEY-AUTO" : "BR-XXXX"}
                         readOnly={newCampusData.autoId}
                         className={`w-full h-14 bg-white rounded-xl border-none outline-none font-black text-center tracking-[0.2em] shadow-sm transition-all ${newCampusData.autoId ? 'text-[#8127cf]/30' : 'text-[#1f1a23]'}`}
                         value={newCampusData.regId}
                         onChange={(e) => setNewCampusData({...newCampusData, regId: e.target.value.toUpperCase()})}
                       />
                       <p className="text-[8px] font-bold text-[#4d4354]/40 mt-4 text-center italic">
                          {newCampusData.autoId ? "System will generate a unique key." : "Type your institutional reference node."}
                       </p>
                    </div>
                 </div>
              </div>

              <div className="flex gap-4">
                 <button onClick={() => setShowAddCampusModal(false)} className="flex-1 h-18 bg-[#f3f4f9] text-[#4d4354] rounded-[28px] font-black italic tracking-tighter text-xl cursor-pointer">Cancel</button>
                 <button onClick={handleAddCampus} disabled={addingCampus} className="flex-[2] h-18 bg-[#1f1a23] text-white rounded-[28px] font-black italic tracking-tighter text-xl shadow-2xl flex items-center justify-center gap-4 disabled:opacity-50 cursor-pointer">
                    {addingCampus ? <Loader2 className="w-8 h-8 animate-spin" /> : <>Deploy Node <Zap className="w-6 h-6 text-emerald-400" /></>}
                 </button>
              </div>
           </motion.div>
        </div>
      )}

    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 font-bold text-sm cursor-pointer ${active ? 'bg-white text-[#8127cf] shadow-xl shadow-indigo-100 font-black' : 'text-[#4d4354] hover:bg-white/40 hover:text-[#1f1a23]'}`}>
      <Icon className={`w-5 h-5 ${active ? 'text-[#8127cf]' : 'text-[#4d4354]/60'}`} />
      {label}
    </button>
  );
}

function CampusCard({ campus, onManage }: { campus: any, onManage: () => void }) {
  return (
    <div className="bg-white p-7 rounded-[32px] shadow-lg border border-[#cfc2d6]/10 flex flex-col min-h-[280px] relative overflow-hidden group hover:shadow-2xl transition-all">
       <div className="absolute top-6 right-6">
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[7px] font-black uppercase tracking-widest">Active</span>
       </div>
       
       <div className="h-14 w-14 bg-[#fbf0fe] rounded-[20px] flex items-center justify-center text-[#8127cf] mb-6 shadow-inner group-hover:scale-110 transition-transform">
          <Building2 className="w-7 h-7" />
       </div>

       <h3 className="text-xl font-black text-[#1f1a23] tracking-tighter mb-1">{campus.name}</h3>
       <div className="flex items-center gap-2 text-[#4d4354]/40 text-[9px] font-bold uppercase tracking-widest mb-8">
          <MapPin className="w-2.5 h-2.5 text-[#8127cf]" /> {campus.city}
       </div>

       <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center -space-x-1.5">
             {[1,2,3].map(i => <div key={i} className="h-7 w-7 rounded-full border-2 border-white overflow-hidden bg-slate-100"><img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${campus.name}${i}`} alt="u" /></div>)}
             <div className="h-7 w-7 rounded-full border-2 border-white bg-[#fbf0fe] flex items-center justify-center text-[7px] font-black text-[#8127cf]">{campus.studentCount}+</div>
          </div>
          <button onClick={onManage} className="flex items-center gap-1.5 text-[#8127cf] font-black italic tracking-tighter text-base hover:translate-x-1 transition-transform cursor-pointer">
             Manage <ChevronRight className="w-4 h-4" />
          </button>
       </div>
    </div>
  );
}

interface ManagementSectionProps {
  title: string;
  icon: any;
  desc: string;
  user: any;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

function ManagementSection({ title, icon: Icon, desc, user, onAdd, onRemove }: ManagementSectionProps) {
  return (
    <div className="bg-white p-8 rounded-[36px] shadow-lg border border-[#cfc2d6]/10">
       <div className="flex items-center gap-4 mb-5">
          <div className="h-10 w-10 bg-[#fbf0fe] rounded-xl flex items-center justify-center text-[#8127cf]"><Icon className="w-5 h-5" /></div>
          <h3 className="text-lg font-black text-[#1f1a23] tracking-tight">{title}</h3>
       </div>
       <p className="text-[11px] font-semibold text-[#4d4354]/40 leading-relaxed mb-8 italic">"{desc}"</p>

       <AnimatePresence mode="wait">
          {user ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between p-5 bg-[#f3f4f9]/30 rounded-[28px] border border-transparent hover:border-[#8127cf]/10 group transition-all">
               <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                     <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.email}`} alt="u" />
                  </div>
                  <div>
                     <p className="text-xs font-black text-[#1f1a23]">{user.fullName || user.email.split('@')[0]}</p>
                     <p className="text-[9px] font-bold text-[#4d4354]/60 uppercase tracking-widest">{user.email}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>{user.status}</span>
                  <button onClick={() => onRemove(user.id)} className="h-9 w-9 rounded-lg bg-white text-rose-500 shadow-sm flex items-center justify-center hover:bg-rose-50 transform hover:scale-105 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
               </div>
            </motion.div>
          ) : (
            <motion.button 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               onClick={onAdd}
               className="w-full h-14 bg-white border-2 border-dashed border-[#cfc2d6]/30 text-[#4d4354]/40 rounded-[22px] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 hover:border-[#8127cf] hover:text-[#8127cf] transition-all cursor-pointer"
            >
               <UserPlus className="w-4 h-4 text-[#8127cf]" /> Appoint Now
            </motion.button>
          )}
       </AnimatePresence>
    </div>
  );
}

function InfoPill({ label, value, active }: { label: string, value: any, active?: boolean }) {
  return (
    <div className="p-5 bg-[#f3f4f9]/50 rounded-[24px] border border-white">
       <p className="text-[8px] font-black text-[#4d4354]/40 uppercase tracking-widest mb-1">{label}</p>
       <p className={`text-xs font-black italic tracking-tighter ${active ? 'text-[#8127cf]' : 'text-[#1f1a23]'}`}>{value}</p>
    </div>
  );
}

function Star(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
