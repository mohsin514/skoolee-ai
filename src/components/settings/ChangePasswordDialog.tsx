"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle, Eye, EyeOff, KeyRound, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Change the signed-in user's password. Opened from Settings → Security & sign-in and the account menu. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useUiText();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = passwordStrength(newPassword);
  const mismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;

  const reqs = [
    { label: "Min 8 characters", met: newPassword.length >= 8 },
    { label: "One uppercase", met: /[A-Z]/.test(newPassword) },
    { label: "One lowercase", met: /[a-z]/.test(newPassword) },
    { label: "One number", met: /[0-9]/.test(newPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(newPassword) },
    { label: "Passwords match", met: newPassword === confirmPassword && newPassword !== "" },
  ];

  const handleSubmit = async () => {
    setError("");
    if (!currentPassword) return setError("Current password is required");
    if (!newPassword) return setError("New password is required");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to change password");
      toast.success(t("Password changed successfully"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const type = showPasswords ? "text" : "password";

  return (
    <Modal
      title={t("Change Password")}
      eyebrow={t("Security")}
      subtitle={t("Update your account password")}
      icon={KeyRound}
      size="xs"
      onClose={onClose}
      dismissible={!loading}
      dirty={Boolean(currentPassword || newPassword) && !loading}
      dirtyMessage={t("Your new password has not been saved yet. Leave without changing it?")}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>{t("Cancel")}</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !currentPassword || !newPassword || newPassword !== confirmPassword}
            aria-busy={loading}
          >
            {loading ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <KeyRound aria-hidden="true" />}
            {t(loading ? "Updating..." : "Update Password")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField name="currentPassword" id="current-password" label={t("Current Password")}>
          <Input type={type} id="current-password" autoComplete="current-password" value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t("Enter current password")} />
        </FormField>

        <FormField name="newPassword" id="new-password" label={t("New Password")}>
          <InputGroup>
            <Input type={type} id="new-password" autoComplete="new-password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} placeholder={t("Enter new password")} />
            <FieldAction
              onClick={() => setShowPasswords(!showPasswords)}
              aria-label={t(showPasswords ? "Hide passwords" : "Show passwords")}
              aria-pressed={showPasswords}
              className="flex size-11 items-center justify-center rounded-xl text-ink-muted hover:text-[#8127cf]"
            >
              {showPasswords ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </FieldAction>
          </InputGroup>
        </FormField>
        {newPassword && (
          <div className="-mt-1 flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-hidden="true">
              {[1, 2, 3, 4].map((level) => (
                <div key={level} className={cn("h-1.5 flex-1 rounded-full", level <= strength.level
                  ? strength.level <= 1 ? "bg-rose-500" : strength.level <= 2 ? "bg-amber-500" : strength.level <= 3 ? "bg-emerald-400" : "bg-emerald-600"
                  : "bg-[#efe8f5]")} />
              ))}
            </div>
            <span className={cn("text-xs font-bold", strength.level <= 1 ? "text-rose-600" : strength.level <= 2 ? "text-amber-700" : "text-emerald-700")}>
              {t(strength.label)}
            </span>
          </div>
        )}

        <FormField name="confirmPassword" id="confirm-new-password" label={t("Confirm New Password")} error={mismatch ? t("Passwords do not match") : undefined}>
          <Input type={type} id="confirm-new-password" autoComplete="new-password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("Re-enter new password")} />
        </FormField>

        <ul className="grid grid-cols-1 gap-x-3 gap-y-1.5 rounded-2xl border border-[#ece3f3] bg-[#fcfaff] p-3.5 min-[400px]:grid-cols-2">
          {reqs.map((r) => (
            <li key={r.label} className={cn("flex items-center gap-1.5 text-xs font-semibold", r.met ? "text-emerald-700" : "text-ink-muted")}>
              {r.met ? <CheckCircle aria-hidden="true" className="size-3.5 shrink-0" /> : <XCircle aria-hidden="true" className="size-3.5 shrink-0 opacity-40" />}
              {t(r.label)}
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-sm font-bold text-status-error-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}

function passwordStrength(password: string): { level: number; label: string } {
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
