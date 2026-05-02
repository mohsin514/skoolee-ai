"use client";

import type { LucideIcon } from "lucide-react";
import { MailPlus, Send, Trash2, UserPlus, X } from "lucide-react";

interface ManagedUser {
  id?: string;
  inviteId?: string;
  fullName?: string | null;
  email: string;
  status?: string;
  expiresAt?: Date | string;
}

interface ManagementCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  user?: ManagedUser | null;
  emptyLabel?: string;
  onAdd: () => void;
  onRemove?: (id: string) => void;
  onResendInvite?: (id: string) => void;
  onCancelInvite?: (id: string) => void;
}

export function ManagementCard({
  title,
  description,
  icon: Icon,
  user,
  emptyLabel = "Appoint Now",
  onAdd,
  onRemove,
  onResendInvite,
  onCancelInvite,
}: ManagementCardProps) {
  const isPendingInvite = Boolean(user?.inviteId);
  const statusLabel = user?.status || (isPendingInvite ? "Invited" : "Active");
  const statusClassName = isPendingInvite
    ? statusLabel === "Expired"
      ? "bg-rose-50 text-rose-600"
      : "bg-amber-50 text-amber-600"
    : "bg-emerald-50 text-emerald-600";
  const inviteExpiry = user?.expiresAt
    ? new Date(user.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="bg-white p-8 rounded-[32px] shadow-lg border border-[#cfc2d6]/10">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-10 w-10 bg-[#fbf0fe] rounded-xl flex items-center justify-center text-[#8127cf]">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-black text-[#1f1a23] tracking-normal">{title}</h3>
      </div>
      <p className="text-[11px] font-semibold text-[#4d4354]/40 leading-relaxed mb-8 italic">
        {description}
      </p>

      {user ? (
        <div className="space-y-4 p-5 bg-[#f3f4f9]/30 rounded-[24px] border border-transparent hover:border-[#8127cf]/10 group transition-all">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 bg-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                {isPendingInvite ? (
                  <MailPlus className="w-5 h-5 text-[#8127cf]" />
                ) : (
                  <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email)}`} alt="" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-[#1f1a23] truncate">{user.fullName || user.email.split("@")[0]}</p>
                <p className="text-[9px] font-bold text-[#4d4354]/60 uppercase tracking-normal truncate">{user.email}</p>
                {isPendingInvite && inviteExpiry ? (
                  <p className="mt-1 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/35">Expires {inviteExpiry}</p>
                ) : null}
              </div>
            </div>
            <span className={`shrink-0 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-normal ${statusClassName}`}>
              {statusLabel}
            </span>
          </div>

          {isPendingInvite ? (
            <div className="grid grid-cols-2 gap-2">
              {user.inviteId && onResendInvite ? (
                <button
                  type="button"
                  onClick={() => onResendInvite(user.inviteId!)}
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white text-[10px] font-black uppercase tracking-normal text-[#8127cf] shadow-sm transition-all hover:bg-[#8127cf] hover:text-white whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  Resend
                </button>
              ) : null}
              {user.inviteId && onCancelInvite ? (
                <button
                  type="button"
                  onClick={() => onCancelInvite(user.inviteId!)}
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 text-[10px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-500 hover:text-white whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel Invite
                </button>
              ) : null}
            </div>
          ) : user.id && onRemove ? (
            <div className="flex justify-end">
              <button
                onClick={() => onRemove(user.id!)}
                className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 text-[10px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-500 hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Revoke Access
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="w-full h-14 bg-white border-2 border-dashed border-[#cfc2d6]/30 text-[#4d4354]/40 rounded-[22px] font-black text-[11px] uppercase tracking-normal flex items-center justify-center gap-3 hover:border-[#8127cf] hover:text-[#8127cf] transition-all cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-[#8127cf]" />
          {emptyLabel}
        </button>
      )}
    </div>
  );
}
