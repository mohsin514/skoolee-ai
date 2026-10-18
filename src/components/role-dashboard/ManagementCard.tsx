"use client";
import { Button } from "@/components/ui/button";

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
    <div className="sk-panel sk-rise relative overflow-hidden">
      <CornerSparkles />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-300 to-primary opacity-60" />
      <div className="absolute -top-24 -end-24 w-48 h-48 bg-gradient-to-bl from-primary/6 to-transparent rounded-full blur-[80px] pointer-events-none" />
      <div className="relative p-5 sm:p-8">
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/10 to-brand-300/10 flex items-center justify-center text-primary">
              <Icon className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 dir="auto" className="text-lg font-bold text-ink-strong">{title}</h3>
            <p className="text-2xs font-semibold text-ink-subtle leading-relaxed italic mt-0.5">{description}</p>
          </div>
        </div>

        {user ? (
          <div className="relative p-5 rounded-[24px] bg-gradient-to-br from-brand-50/40 via-white to-brand-50/20 border border-primary/8 overflow-hidden">
            <div className="absolute -top-12 -end-12 w-24 h-24 bg-gradient-to-bl from-primary/8 to-transparent rounded-full blur-[50px] pointer-events-none" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div className="relative h-14 w-14 rounded-2xl bg-white border-2 border-primary/10 shadow-sm flex items-center justify-center overflow-hidden">
                    {isPendingInvite ? (
                      <MailPlus className="w-6 h-6 text-primary" />
                    ) : (
                      <AvatarImage
                        name={user.fullName || user.email}
                        alt=""
                        className="h-full w-full object-cover"
                        initialsClassName="text-base"
                      />
                    )}
                  </div>
                  <div className={`absolute -top-1 -end-1 h-4 w-4 rounded-full border-2 border-card ${isPendingInvite ? "bg-status-warning-text" : "bg-status-success-text"}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink-strong truncate">{user.fullName || user.email.split("@")[0]}</p>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-3xs font-semibold uppercase tracking-wider ${isPendingInvite ? (isExpired ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600") : "bg-emerald-50 text-emerald-600"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isPendingInvite ? (isExpired ? "bg-rose-500" : "bg-amber-500") : "bg-emerald-500"}`} />
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-medium text-ink-muted"><bdi dir="ltr">{user.email}</bdi></p>
                  {isPendingInvite && inviteExpiry ? (
                    <p className="mt-1.5 flex items-center gap-1 text-3xs font-semibold uppercase tracking-wider text-ink-subtle">
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
                  <Button variant="outline"
                    type="button"
                    onClick={() => onResendInvite(user.inviteId!)}
                    className="gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Resend
                  </Button>
                ) : null}
                {user.inviteId && onCancelInvite ? (
                  <Button variant="destructive"
                    type="button"
                    onClick={() => onCancelInvite(user.inviteId!)}
                    className="gap-2"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel Invite
                  </Button>
                ) : null}
              </div>
            ) : user.id && onRemove ? (
              <div className="mt-4 flex justify-end">
                <Button variant="destructive"
                  onClick={() => onRemove(user.id!)}
                  className="gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Revoke Access
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Button variant="outline"
            onClick={onAdd}
            className="block w-full gap-3 group/empty"
          >
            <div className="relative">
              <div className="absolute -inset-2 bg-primary/8 rounded-full blur-md opacity-0 group-hover/empty:opacity-100 transition-opacity" />
              <UserPlus className="relative w-5 h-5 text-primary/60 group-hover/empty:text-primary" />
            </div>
            {emptyLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
