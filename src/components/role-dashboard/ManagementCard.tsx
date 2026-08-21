"use client";

import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Clock, Copy, MailPlus, Send, Trash2, UserPlus, X } from "lucide-react";
import { CornerSparkles } from "@/components/CornerSparkles";
import { AvatarImage } from "@/components/ui/avatar-image";

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
  const isExpired = statusLabel === "Expired";
  const inviteExpiry = user?.expiresAt
    ? new Date(user.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="sk-rise group relative bg-white rounded-[32px] shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] border border-[#cfc2d6]/25 overflow-hidden transition-all duration-500 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5 hover:border-[#8127cf]/25">
      <CornerSparkles />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#8127cf] via-[#b876f0] to-[#8127cf] opacity-60" />
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-bl from-[#8127cf]/6 to-transparent rounded-full blur-[80px] pointer-events-none" />
      <div className="relative p-8">
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="absolute -inset-2 bg-[#8127cf]/18 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center text-[#8127cf] transition-all duration-300 group-hover:from-[#8127cf] group-hover:to-[#b876f0] group-hover:text-white group-hover:shadow-lg group-hover:shadow-[#8127cf]/20">
              <Icon className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-black text-[#1f1a23] tracking-wider transition-colors group-hover:text-[#8127cf]">{title}</h3>
            <p className="text-[10px] font-semibold text-ink-subtle leading-relaxed italic mt-0.5">{description}</p>
          </div>
        </div>

        {user ? (
          <div className="relative p-5 rounded-[24px] bg-gradient-to-br from-[#fbf0fe]/40 via-white to-[#fbf0fe]/20 border border-[#8127cf]/8 transition-all duration-300 hover:bg-[#fbf0fe]/60 hover:border-[#8127cf]/20 hover:shadow-md overflow-hidden">
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-[#8127cf]/8 to-transparent rounded-full blur-[50px] pointer-events-none" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/8 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative h-14 w-14 rounded-2xl bg-white border-2 border-[#8127cf]/10 shadow-sm flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:border-[#8127cf]/30 group-hover:shadow-md">
                    {isPendingInvite ? (
                      <MailPlus className="w-6 h-6 text-[#8127cf]" />
                    ) : (
                      <AvatarImage
                        name={user.fullName || user.email}
                        alt=""
                        className="h-full w-full object-cover"
                        initialsClassName="text-base"
                      />
                    )}
                  </div>
                  <div className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${isPendingInvite ? "bg-amber-400" : "bg-emerald-500"}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-[#1f1a23] truncate">{user.fullName || user.email.split("@")[0]}</p>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[7px] font-black uppercase tracking-wider ${isPendingInvite ? (isExpired ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600") : "bg-emerald-50 text-emerald-600"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isPendingInvite ? (isExpired ? "bg-rose-500" : "bg-amber-500") : "bg-emerald-500"}`} />
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-[9px] font-bold text-ink-muted uppercase tracking-wider truncate mt-0.5">{user.email}</p>
                  {isPendingInvite && inviteExpiry ? (
                    <p className="mt-1.5 flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-ink-subtle">
                      <Clock className="w-2.5 h-2.5" />
                      Expires {inviteExpiry}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {isPendingInvite ? (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {user.inviteId && onResendInvite ? (
                  <button
                    type="button"
                    onClick={() => onResendInvite(user.inviteId!)}
                    className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white text-[10px] font-black uppercase tracking-wider text-[#8127cf] shadow-sm border border-[#8127cf]/10 transition-all hover:bg-[#8127cf] hover:text-white hover:border-[#8127cf] hover:shadow-md hover:shadow-[#8127cf]/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Resend
                  </button>
                ) : null}
                {user.inviteId && onCancelInvite ? (
                  <button
                    type="button"
                    onClick={() => onCancelInvite(user.inviteId!)}
                    className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 text-[10px] font-black uppercase tracking-wider text-rose-600 border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel Invite
                  </button>
                ) : null}
              </div>
            ) : user.id && onRemove ? (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => onRemove(user.id!)}
                  className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 px-5 text-[10px] font-black uppercase tracking-wider text-rose-600 border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20"
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
            className="w-full h-16 bg-white border-2 border-dashed border-[#cfc2d6]/25 rounded-[22px] text-ink-subtle font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-3 transition-all hover:border-[#8127cf] hover:text-[#8127cf] hover:bg-[#fbf0fe]/30 hover:shadow-md hover:-translate-y-0.5 cursor-pointer group/empty"
          >
            <div className="relative">
              <div className="absolute -inset-2 bg-[#8127cf]/8 rounded-full blur-md opacity-0 group-hover/empty:opacity-100 transition-opacity" />
              <UserPlus className="relative w-5 h-5 text-[#8127cf]/60 group-hover/empty:text-[#8127cf]" />
            </div>
            {emptyLabel}
          </button>
        )}
      </div>
    </div>
  );
}
