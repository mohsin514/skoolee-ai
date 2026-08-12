"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Search,
  Shield,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  onboardingComplete: boolean;
  lastLogin: string | null;
  lastPasswordChange: string | null;
  createdAt: string;
  campus: { id: string; name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] text-white",
  CAMPUS_ADMIN: "bg-indigo-100 text-indigo-700",
  ADMIN: "bg-indigo-100 text-indigo-700",
  PRINCIPAL: "bg-emerald-100 text-emerald-700",
  TEACHER: "bg-sky-100 text-sky-700",
  PARENT: "bg-amber-100 text-amber-700",
  STUDENT: "bg-[#fbf0fe] text-[#8127cf]",
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) qp.set("search", search);
      if (roleFilter) qp.set("role", roleFilter);
      if (statusFilter) qp.set("status", statusFilter);

      const res = await fetch(`/api/super/users?${qp}`);
      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
        setPagination(json.pagination);
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Security</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">User Management</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            {pagination.total} total users across all campuses
          </p>
        </div>
      </div>

      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex-1 min-w-[200px] max-w-sm relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4d4354]/40" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none placeholder:text-[#4d4354]/35 focus:ring-2 focus:ring-[#8127cf]/20"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="CAMPUS_ADMIN">Campus Admin</option>
            <option value="PRINCIPAL">Principal</option>
            <option value="TEACHER">Teacher</option>
            <option value="PARENT">Parent</option>
            <option value="STUDENT">Student</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
              <Users className="w-8 h-8 text-[#8127cf]/30" />
            </div>
            <h3 className="text-lg font-black text-[#1f1a23]">No Users Found</h3>
            <p className="mt-2 text-sm font-semibold text-[#4d4354]/50">Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 bg-gradient-to-r from-[#fbf0fe]/30 to-transparent">
                    <th className="px-4 py-3 rounded-tl-2xl">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Campus</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3">Password Changed</th>
                    <th className="px-4 py-3 text-right rounded-tr-2xl">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f9]">
                  {users.map((u) => (
                    <tr key={u.id} className="text-sm transition-all duration-200 hover:bg-[#fbf0fe]/20">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] flex items-center justify-center text-[#8127cf] shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-[#1f1a23] truncate">{u.fullName}</p>
                            <p className="text-[10px] font-bold text-[#4d4354]/40 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${ROLE_COLORS[u.role] || "bg-[#f3f4f9] text-[#4d4354]"}`}>
                          {u.role === "SUPER_ADMIN" && <Shield className="w-2.5 h-2.5" />}
                          {u.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[#4d4354]/70 font-bold text-xs">
                        {u.campus?.name || "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${u.isActive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[#4d4354]/60 text-xs font-semibold">
                        {formatDate(u.lastLogin)}
                      </td>
                      <td className="px-4 py-4 text-[#4d4354]/60 text-xs font-semibold">
                        {formatDate(u.lastPasswordChange)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => { setSelectedUser(u); setShowPasswordModal(true); }}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-normal text-[#8127cf] bg-[#fbf0fe] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          Reset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#f3f4f9]">
                <p className="text-xs font-bold text-[#4d4354]/40">
                  Page {pagination.page} of {pagination.pages} ({pagination.total} users)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadUsers(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white disabled:opacity-30 disabled:hover:bg-[#f3f4f9] disabled:hover:text-[#4d4354] transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => loadUsers(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white disabled:opacity-30 disabled:hover:bg-[#f3f4f9] disabled:hover:text-[#4d4354] transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showPasswordModal && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          onClose={() => { setShowPasswordModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowPasswordModal(false); setSelectedUser(null); loadUsers(pagination.page); }}
        />
      )}
    </div>
  );
}

function ChangePasswordModal({
  user,
  onClose,
  onSuccess,
}: {
  user: UserRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async () => {
    setError("");
    if (!newPassword) return setError("Password is required");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      const res = await fetch(`/api/super/users/${user.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to change password");
      toast.success(`Password changed for ${user.fullName}`);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-md max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar">
        <div className="flex justify-between items-start gap-5 mb-6">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf]">Security action</p>
            <h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">Change Password</h3>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#fbf0fe]/50 border border-[#cfc2d6]/10 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-[#8127cf]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-black text-sm text-[#1f1a23]">{user.fullName}</p>
              <p className="text-[10px] font-bold text-[#4d4354]/40">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password..."
                className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 pr-12 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4d4354]/40 hover:text-[#8127cf] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        level <= strength.level
                          ? strength.level <= 1 ? "bg-rose-500" : strength.level <= 2 ? "bg-amber-500" : strength.level <= 3 ? "bg-emerald-400" : "bg-emerald-600"
                          : "bg-[#f3f4f9]"
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-normal ${
                  strength.level <= 1 ? "text-rose-500" : strength.level <= 2 ? "text-amber-500" : "text-emerald-600"
                }`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
              Confirm Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password..."
              className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-2 text-xs font-bold text-rose-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Passwords do not match
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50/60 border border-amber-200/40 p-4 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-800">Security Notice</p>
              <p className="text-[10px] font-semibold text-amber-700/70 mt-0.5">
                This action is logged in the audit trail. The user will need to use the new password on their next login.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200/40 p-4 mb-4">
            <p className="text-xs font-bold text-rose-700">{error}</p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 h-14 rounded-2xl bg-[#f3f4f9] text-sm font-black text-[#4d4354] hover:bg-[#e8e0ec] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !newPassword || newPassword !== confirmPassword}
            className="flex-[2] h-14 rounded-2xl bg-gradient-to-r from-[#1f1a23] to-[#2d2633] text-sm font-black text-white hover:from-black hover:to-[#1f1a23] disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {loading ? "Updating..." : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getPasswordStrength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "Weak" };
  if (score <= 2) return { level: 2, label: "Fair" };
  if (score <= 3) return { level: 3, label: "Good" };
  return { level: 4, label: "Strong" };
}
