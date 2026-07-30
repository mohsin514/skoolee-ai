"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  RefreshCw,
  School,
  Shield,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  oldValues: any;
  newValues: any;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
}

const ACTION_META: Record<string, { icon: any; label: string; tone: string }> = {
  login: { icon: LogIn, label: "Login", tone: "bg-emerald-50 text-emerald-600" },
  logout: { icon: LogOut, label: "Logout", tone: "bg-[#f3f4f9] text-[#4d4354]/60" },
  password_change: { icon: KeyRound, label: "Password Changed", tone: "bg-amber-50 text-amber-600" },
  modify_school: { icon: School, label: "School Modified", tone: "bg-indigo-50 text-indigo-600" },
  suspend_school: { icon: AlertCircle, label: "School Suspended", tone: "bg-rose-50 text-rose-600" },
  create_campus: { icon: School, label: "Campus Created", tone: "bg-[#fbf0fe] text-[#8127cf]" },
  delete_campus: { icon: School, label: "Campus Deleted", tone: "bg-rose-50 text-rose-600" },
  view_dashboard: { icon: Monitor, label: "Dashboard View", tone: "bg-[#f3f4f9] text-[#4d4354]/60" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: Activity, label: action.replace(/_/g, " "), tone: "bg-[#f3f4f9] text-[#4d4354]/60" };
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("30");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(p), limit: "30", days: daysFilter });
      if (actionFilter) qp.set("action", actionFilter);

      const res = await fetch(`/api/super/audit-logs?${qp}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        setTotalPages(json.pagination.pages);
        setTotal(json.pagination.total);
        setPage(p);
      }
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, daysFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseBrowser = (ua: string | null) => {
    if (!ua) return "Unknown";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return "Browser";
  };

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Security</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Audit Log</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            {total} actions recorded
          </p>
        </div>
        <button
          onClick={() => loadLogs(1)}
          className="flex items-center gap-2 h-11 px-5 rounded-xl bg-[#f3f4f9] text-sm font-black text-[#4d4354] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="password_change">Password Change</option>
            <option value="modify_school">School Modified</option>
            <option value="suspend_school">School Suspended</option>
            <option value="create_campus">Campus Created</option>
          </select>
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
              <FileText className="w-8 h-8 text-[#8127cf]/30" />
            </div>
            <h3 className="text-lg font-black text-[#1f1a23]">No Audit Entries</h3>
            <p className="mt-2 text-sm font-semibold text-[#4d4354]/50">No actions recorded in this time period.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const meta = getActionMeta(log.action);
              const Icon = meta.icon;
              const isExpanded = expandedId === log.id;

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full text-left rounded-2xl border border-transparent hover:border-[#cfc2d6]/15 p-4 transition-all hover:bg-[#fbf0fe]/20 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${meta.tone}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-[#1f1a23]">{meta.label}</p>
                        {log.status === "failed" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase bg-rose-50 text-rose-600">
                            <AlertCircle className="w-2 h-2" /> Failed
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-[10px] font-bold text-[#4d4354]/50 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" /> {log.user?.fullName || "System"}
                        </span>
                        {log.targetName && (
                          <span className="text-[10px] font-bold text-[#4d4354]/50">
                            Target: {log.targetName}
                          </span>
                        )}
                        {log.ipAddress && (
                          <span className="text-[10px] font-bold text-[#4d4354]/40 flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5" /> {log.ipAddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-[#4d4354]/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(log.createdAt)}
                      </p>
                      {log.userAgent && (
                        <p className="text-[9px] font-bold text-[#4d4354]/30 mt-0.5">
                          {parseBrowser(log.userAgent)}
                        </p>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#f3f4f9] space-y-3">
                      {log.errorMessage && (
                        <div className="rounded-xl bg-rose-50 px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-rose-500 mb-1">Error</p>
                          <p className="text-xs font-bold text-rose-700">{log.errorMessage}</p>
                        </div>
                      )}
                      {log.oldValues && (
                        <div className="rounded-xl bg-[#f3f4f9] px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-[#4d4354]/40 mb-1">Before</p>
                          <pre className="text-xs font-mono text-[#4d4354]/70 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.oldValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.newValues && (
                        <div className="rounded-xl bg-emerald-50/50 px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-emerald-600/60 mb-1">After</p>
                          <pre className="text-xs font-mono text-emerald-700/70 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.newValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.userAgent && (
                        <div className="rounded-xl bg-[#f3f4f9] px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-[#4d4354]/40 mb-1">User Agent</p>
                          <p className="text-xs font-mono text-[#4d4354]/50 break-all">{log.userAgent}</p>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#f3f4f9]">
            <p className="text-xs font-bold text-[#4d4354]/40">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loadLogs(page - 1)}
                disabled={page <= 1}
                className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => loadLogs(page + 1)}
                disabled={page >= totalPages}
                className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
