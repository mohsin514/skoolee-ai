"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  User,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface SessionEntry {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  loginAt: string;
  lastActivityAt: string;
  expiresAt: string;
  isActive: boolean;
  logoutAt: string | null;
  user: { id: string; fullName: string; email: string; role: string };
}

interface SecurityStats {
  campusCount: number;
  studentCount: number;
  teacherCount: number;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  recentLogins: number;
  recentAuditActions: number;
  totalRevenue: number;
  totalPaymentCount: number;
  pendingInvoices: number;
}

export function SecurityPanel() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ limit: "30" });
      if (showActiveOnly) qp.set("active", "true");

      const [sessRes, statsRes] = await Promise.all([
        fetch(`/api/super/sessions?${qp}`),
        fetch("/api/super/stats"),
      ]);
      const [sessJson, statsJson] = await Promise.all([sessRes.json(), statsRes.json()]);

      if (sessJson.success) setSessions(sessJson.data);
      if (statsJson.success) setStats(statsJson.data);
    } catch {
      toast.error("Failed to load security data");
    } finally {
      setLoading(false);
    }
  }, [showActiveOnly]);

  useEffect(() => { loadData(); }, [loadData]);

  const terminateSession = async (sessionId: string) => {
    setTerminatingId(sessionId);
    try {
      const res = await fetch("/api/super/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Session terminated");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTerminatingId(null);
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseDevice = (ua: string | null) => {
    if (!ua) return { browser: "Unknown", os: "Unknown", icon: Monitor };
    const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Browser";
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" : ua.includes("iPhone") ? "iOS" : "Unknown";
    const icon = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? Smartphone : Monitor;
    return { browser, os, icon };
  };

  const formatPKR = (paisa: number) => {
    return `PKR ${(paisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 0 })}`;
  };

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Security</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Security Overview</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            Sessions, system stats & security posture
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 h-11 px-5 rounded-xl bg-[#f3f4f9] text-sm font-black text-[#4d4354] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <SecurityStat icon={User} label="Total Users" value={stats.totalUsers} />
              <SecurityStat icon={CheckCircle2} label="Active Users" value={stats.activeUsers} tone="green" />
              <SecurityStat icon={X} label="Inactive" value={stats.inactiveUsers} tone="rose" />
              <SecurityStat icon={Activity} label="Logins (7d)" value={stats.recentLogins} tone="purple" />
              <SecurityStat icon={Shield} label="Audit Actions (30d)" value={stats.recentAuditActions} tone="amber" />
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="rounded-[24px] bg-gradient-to-br from-[#1f1a23] to-[#2d2633] p-5 text-white">
                <p className="text-[9px] font-black uppercase tracking-normal text-white/40">Total Revenue</p>
                <p className="text-2xl font-black mt-2">{formatPKR(stats.totalRevenue)}</p>
                <p className="text-xs font-bold text-white/50 mt-1">{stats.totalPaymentCount} payments recorded</p>
              </div>
              <div className="rounded-[24px] bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-100/50 p-5">
                <p className="text-[9px] font-black uppercase tracking-normal text-amber-600/60">Pending Invoices</p>
                <p className="text-2xl font-black text-amber-700 mt-2">{stats.pendingInvoices}</p>
                <p className="text-xs font-bold text-amber-600/50 mt-1">Pending, overdue or partial</p>
              </div>
              <div className="rounded-[24px] bg-gradient-to-br from-[#fbf0fe] to-white border border-[#cfc2d6]/10 p-5">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]/60">Network</p>
                <p className="text-2xl font-black text-[#1f1a23] mt-2">{stats.campusCount} Campuses</p>
                <p className="text-xs font-bold text-[#4d4354]/50 mt-1">{stats.studentCount} students / {stats.teacherCount} teachers</p>
              </div>
            </div>
          )}

          <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] flex items-center justify-center">
                  <Wifi className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-black text-[#1f1a23]">Active Sessions</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowActiveOnly(true)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${showActiveOnly ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]"}`}
                >
                  Active Only
                </button>
                <button
                  onClick={() => setShowActiveOnly(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${!showActiveOnly ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]"}`}
                >
                  All Sessions
                </button>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-14 w-14 rounded-[24px] bg-[#fbf0fe] flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-[#8127cf]/30" />
                </div>
                <p className="text-sm font-black text-[#1f1a23]">No Sessions</p>
                <p className="mt-1 text-xs font-semibold text-[#4d4354]/50">No active sessions found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => {
                  const device = parseDevice(session.userAgent);
                  const DeviceIcon = device.icon;
                  const isExpired = new Date(session.expiresAt) < new Date();

                  return (
                    <div
                      key={session.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        session.isActive && !isExpired
                          ? "border-emerald-100/50 bg-gradient-to-r from-emerald-50/30 to-white"
                          : "border-[#f3f4f9] bg-[#f3f4f9]/30"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                          session.isActive && !isExpired ? "bg-emerald-100 text-emerald-600" : "bg-[#f3f4f9] text-[#4d4354]/40"
                        }`}>
                          <DeviceIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-[#1f1a23]">{session.user.fullName}</p>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase ${
                              session.isActive && !isExpired
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-[#f3f4f9] text-[#4d4354]/40"
                            }`}>
                              <span className={`h-1 w-1 rounded-full ${session.isActive && !isExpired ? "bg-emerald-500" : "bg-[#4d4354]/30"}`} />
                              {session.isActive && !isExpired ? "Active" : "Ended"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-1">
                            <span className="text-[10px] font-bold text-[#4d4354]/40">{session.user.email}</span>
                            <span className="text-[10px] font-bold text-[#4d4354]/40 flex items-center gap-1">
                              <Globe className="w-2.5 h-2.5" /> {session.ipAddress || "—"}
                            </span>
                            <span className="text-[10px] font-bold text-[#4d4354]/40">
                              {device.browser} / {device.os}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-2">
                          <p className="text-[10px] font-bold text-[#4d4354]/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDate(session.loginAt)}
                          </p>
                          {session.isActive && !isExpired && (
                            <button
                              onClick={() => terminateSession(session.id)}
                              disabled={terminatingId === session.id}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase text-rose-600 bg-rose-50 hover:bg-rose-100 transition-all cursor-pointer disabled:opacity-40"
                            >
                              {terminatingId === session.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <LogOut className="w-3 h-3" />
                              )}
                              Terminate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black text-[#1f1a23]">Security Checklist</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ChecklistItem label="Password hashing" detail="bcrypt with 12 rounds" ok />
              <ChecklistItem label="JWT authentication" detail="HS256, httpOnly cookies" ok />
              <ChecklistItem label="Session tracking" detail="All logins recorded" ok />
              <ChecklistItem label="Audit logging" detail="Critical actions tracked" ok />
              <ChecklistItem label="Password history" detail="Last 5 passwords checked" ok />
              <ChecklistItem label="Role-based access" detail="Routes protected per role" ok />
              <ChecklistItem label="CSRF protection" detail="SameSite cookie policy" ok />
              <ChecklistItem label="Input validation" detail="Zod schemas on all endpoints" ok />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SecurityStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone?: string;
}) {
  const toneClass = {
    green: "text-emerald-600",
    rose: "text-rose-600",
    purple: "text-[#8127cf]",
    amber: "text-amber-600",
  }[tone || ""] || "text-[#1f1a23]";

  return (
    <div className="rounded-[20px] bg-white border border-[#cfc2d6]/10 p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm mb-3">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className={`mt-1 text-xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChecklistItem({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${ok ? "bg-emerald-50/50 border border-emerald-100/50" : "bg-rose-50/50 border border-rose-100/50"}`}>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      </div>
      <div>
        <p className="text-xs font-black text-[#1f1a23]">{label}</p>
        <p className="text-[10px] font-semibold text-[#4d4354]/50">{detail}</p>
      </div>
    </div>
  );
}
