"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Clock, MailPlus, Send, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

/**
 * One leadership seat on a campus (campus admin or principal): who holds it, or the pending invitation, or the
 * vacancy with its one action. The caller owns the confirmations (revoke, cancel invite — ConfirmAction).
 * `readOnly` renders the seat without actions and with an optional `note` ("Managed by {group}") for screens
 * that show leadership to someone who cannot change it (§4.5.6). Strings are EN UI keys, translated here.
 */
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
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  onResendInvite?: (id: string) => void;
  onCancelInvite?: (id: string) => void;
  readOnly?: boolean;
  note?: ReactNode;
}

const STATUS_LABEL: Record<string, string> = { Active: "Active", Onboarding: "Setting up", Invited: "Invited", Expired: "Invitation expired", "Delivery failed": "Delivery failed" };

export function ManagementCard({
  title,
  description,
  icon: Icon,
  user,
  emptyLabel = "Appoint",
  onAdd,
  onRemove,
  onResendInvite,
  onCancelInvite,
  readOnly = false,
  note,
}: ManagementCardProps) {
  const t = useUiText();
  const { date } = useLocaleFormat();
  const isPendingInvite = Boolean(user?.inviteId);
  const statusLabel = user?.status || (isPendingInvite ? "Invited" : "Active");
  const problem = statusLabel === "Expired" || statusLabel === "Delivery failed";
  const tone = isPendingInvite ? (problem ? "danger" : "warning") : "success";

  return (
    <div className="sk-panel relative overflow-hidden" data-leadership-seat={title}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-300 to-primary opacity-60" />
      <div className="relative p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-4">
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink-strong">{t(title)}</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{t(description)}</p>
          </div>
        </div>

        {user ? (
          <div className="rounded-3xl border border-border-subtle bg-surface-subtle p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative shrink-0">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
                  {isPendingInvite ? (
                    <MailPlus aria-hidden="true" className="h-6 w-6 text-primary" />
                  ) : (
                    <AvatarImage name={user.fullName || user.email} alt="" className="h-full w-full object-cover" initialsClassName="text-base" />
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-ink-strong"><bdi>{user.fullName || user.email.split("@")[0]}</bdi></p>
                  <Badge size="sm" dot variant={tone}>{t(STATUS_LABEL[statusLabel] ?? statusLabel)}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs font-medium text-ink-muted"><bdi dir="ltr">{user.email}</bdi></p>
                {isPendingInvite && user.expiresAt ? (
                  <p className="mt-1.5 flex items-center gap-1 text-2xs font-semibold text-ink-subtle">
                    <Clock aria-hidden="true" className="h-3 w-3" />
                    {t("Expires {0}", [date(user.expiresAt)])}
                  </p>
                ) : null}
              </div>
            </div>

            {readOnly ? null : isPendingInvite ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {user.inviteId && onResendInvite ? (
                  <Button variant="outline" size="sm" type="button" onClick={() => onResendInvite(user.inviteId!)}>
                    <Send aria-hidden="true" className="h-3.5 w-3.5 rtl:-scale-x-100" />
                    {t("Resend invitation")}
                  </Button>
                ) : null}
                {user.inviteId && onCancelInvite ? (
                  <Button variant="outline" size="sm" type="button" onClick={() => onCancelInvite(user.inviteId!)}>
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("Cancel invitation")}
                  </Button>
                ) : null}
              </div>
            ) : user.id && onRemove ? (
              <div className="mt-4 flex justify-start">
                <Button variant="outline" size="sm" type="button" onClick={() => onRemove(user.id!)}>
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("Revoke access")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : readOnly || !onAdd ? (
          <p className="rounded-3xl border border-dashed border-border-subtle px-4 py-5 text-sm font-medium text-ink-muted">{t("Vacant")}</p>
        ) : (
          <Button variant="outline" type="button" onClick={onAdd} className="w-full justify-center gap-2">
            <UserPlus aria-hidden="true" className="h-4 w-4 text-primary" />
            {t(emptyLabel)}
          </Button>
        )}
        {note ? <div className="mt-3 text-xs text-ink-muted">{note}</div> : null}
      </div>
    </div>
  );
}
