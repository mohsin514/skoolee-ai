"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Eye, EyeOff, Lock, ArrowRight, Check, X, KeyRound, ShieldCheck,
} from "lucide-react";
import SkooleeLogo from "@/components/SkooleeLogo";
import { dashboardPathForRole } from "@/lib/roles";

interface Rule {
  label: string;
  test: (v: string) => boolean;
}

const RULES: Rule[] = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One letter", test: (v) => /[A-Za-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One symbol (recommended)", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const STRENGTH = [
  { label: "Too short", bar: "w-0", tone: "bg-[#cfc2d6]", text: "text-[#4d4354]/40" },
  { label: "Weak", bar: "w-1/4", tone: "bg-rose-400", text: "text-rose-500" },
  { label: "Fair", bar: "w-2/4", tone: "bg-amber-400", text: "text-amber-600" },
  { label: "Good", bar: "w-3/4", tone: "bg-[#9c48ea]", text: "text-[#8127cf]" },
  { label: "Strong", bar: "w-full", tone: "bg-emerald-500", text: "text-emerald-600" },
];

export default function FirstLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = useMemo(() => RULES.map((r) => r.test(password)), [password]);
  const score = passed.filter(Boolean).length;
  const strength = STRENGTH[password.length === 0 ? 0 : score];
  const required = passed[0] && passed[1] && passed[2];
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = Boolean(required && matches) && !isLoading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/first-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update password");

      toast.success("Password updated. Welcome to Skoolee.");
      const target =
        json.role === "TEACHER" && !json.onboardingComplete
          ? "/teacher-onboarding"
          : dashboardPathForRole(json.role);
      router.push(target);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update password";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#fbf0fe] p-5 font-sans">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-7">
          <SkooleeLogo size="2.2rem" weight="heavy" className="mb-3" />
          <div className="h-0.5 w-10 bg-gradient-to-r from-[#8127cf] to-[#9c48ea] rounded-full" />
        </div>

        <div className="bg-white rounded-[32px] p-8 shadow-[0_32px_64px_rgba(31,26,35,0.06)] border border-[#cfc2d6]/15">
          <div className="flex items-start gap-4 mb-7">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/25">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#1f1a23] tracking-tight">Set your password</h1>
              <p className="text-sm font-semibold text-[#4d4354]/60 mt-1 leading-relaxed">
                Your account was created with a temporary password. Choose your own to continue —
                you will only be asked this once.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[10px] font-black text-[#4d4354] ml-1 uppercase tracking-wider">
                New Password
              </Label>
              <div className="relative flex items-center group">
                <div className="absolute left-3.5 text-[#4d4354]/30 group-focus-within:text-[#8127cf] transition-colors pointer-events-none">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                  placeholder="Choose a strong password"
                  className="w-full h-12 pl-10 pr-12 bg-[#fbf0fe] border-0 rounded-2xl focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all placeholder:text-[#4d4354]/25 text-[#1f1a23] font-bold shadow-none"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-4 text-[#4d4354]/30 hover:text-[#8127cf] transition-colors cursor-pointer"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="pt-2 px-1">
                <div className="h-1.5 w-full rounded-full bg-[#f3f4f9] overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.bar} ${strength.tone}`} />
                </div>
                <p className={`text-[11px] font-black mt-1.5 ${strength.text}`}>
                  {password.length > 0 ? strength.label : "Enter a password"}
                </p>
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
              {RULES.map((rule, i) => (
                <li key={rule.label} className="flex items-center gap-2">
                  <span
                    className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      passed[i] ? "bg-emerald-500" : "bg-[#f3f4f9]"
                    }`}
                  >
                    {passed[i]
                      ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                      : <X className="h-2.5 w-2.5 text-[#4d4354]/30" strokeWidth={3.5} />}
                  </span>
                  <span className={`text-[11px] font-bold ${passed[i] ? "text-[#4d4354]" : "text-[#4d4354]/40"}`}>
                    {rule.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-[10px] font-black text-[#4d4354] ml-1 uppercase tracking-wider">
                Confirm Password
              </Label>
              <div className="relative flex items-center group">
                <div className="absolute left-3.5 text-[#4d4354]/30 group-focus-within:text-[#8127cf] transition-colors pointer-events-none">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <Input
                  id="confirm"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Type it again"
                  className={`w-full h-12 pl-10 pr-4 border-0 rounded-2xl focus:ring-2 transition-all placeholder:text-[#4d4354]/25 text-[#1f1a23] font-bold shadow-none ${
                    confirm.length > 0 && !matches
                      ? "bg-rose-50 focus:ring-rose-200 focus:bg-rose-50"
                      : "bg-[#fbf0fe] focus:ring-[#8127cf]/20 focus:bg-white"
                  }`}
                />
              </div>
              {confirm.length > 0 && !matches && (
                <p className="text-xs text-rose-500 font-bold px-1">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
                <p className="text-xs font-bold text-rose-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-12 bg-gradient-to-r from-[#8127cf] to-[#9c48ea] text-white font-black rounded-2xl shadow-lg shadow-[#8127cf]/25 hover:shadow-xl hover:shadow-[#8127cf]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Save and continue</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] font-bold text-[#4d4354]/40 mt-5">
          Skoolee will never ask for your password by email or WhatsApp.
        </p>
      </div>
    </main>
  );
}
