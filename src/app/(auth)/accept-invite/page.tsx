"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  MailCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { acceptInvite } from "@/app/actions/invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordChecks = useMemo(
    () => [
      { label: "8 characters", met: password.length >= 8 },
      { label: "Uppercase letter", met: /[A-Z]/.test(password) },
      { label: "Number", met: /[0-9]/.test(password) },
      { label: "Passwords match", met: password !== "" && password === confirmPassword },
    ],
    [confirmPassword, password]
  );

  const canSubmit = token && fullName.trim() && passwordChecks.every((item) => item.met);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      toast.error("This invitation link is missing its secure token.");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!passwordChecks.every((item) => item.met)) {
      toast.error("Please complete the password requirements.");
      return;
    }

    setLoading(true);
    try {
      await acceptInvite(token, password, fullName);
      toast.success("Invitation accepted. Please log in.");
      router.push("/login?invite=accepted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 overflow-hidden bg-[#fff7fe] font-sans text-[#1f1a23] md:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden md:block">
        <div className="absolute inset-0 z-10 bg-[#8127cf]/10 mix-blend-multiply" />
        <img
          src="/login.svg"
          alt="Skoolee invitation"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#8127cf]/40 to-transparent" />
        <div className="absolute bottom-12 left-12 z-30 max-w-md rounded-xl border border-white/20 bg-white/70 p-8 shadow-2xl backdrop-blur-[24px]">
          <span className="mb-2 block text-[12px] font-bold uppercase tracking-normal text-[#9c48ea]">
            Secure Invitation
          </span>
          <h1 className="mb-4 text-3xl font-extrabold leading-tight text-[#1f1a23]">
            Create your profile and step into your Skoolee workspace.
          </h1>
          <p className="text-sm font-medium text-[#4d4354]">
            Your campus role is already prepared. Complete this setup to activate your protected account.
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center overflow-y-auto bg-[#fbf0fe] p-6 md:p-8">
        <div className="w-full max-w-md">
          <div className="mb-10 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 rotate-3 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <h2 className="mb-2 text-4xl font-extrabold tracking-normal text-[#1f1a23]">Skoolee AI</h2>
            <div className="h-1 w-12 rounded-full bg-[#8127cf]" />
          </div>

          <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-8 shadow-[0_32px_64px_rgba(31,26,35,0.04)]">
            <div className="mb-8">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fbf0fe] px-3 py-1.5 text-[10px] font-black uppercase tracking-normal text-[#8127cf]">
                <MailCheck className="h-3.5 w-3.5" />
                Invitation link
              </div>
              <h1 className="text-2xl font-black tracking-normal text-[#1f1a23]">Accept Invitation</h1>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d4354]/65">
                Set your name and password to activate your campus account.
              </p>
            </div>

            {!token ? (
              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-sm font-bold text-rose-600">
                This invitation link is incomplete. Please open the latest invite email or ask your administrator to resend it.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">
                    Full Name
                  </Label>
                  <div className="relative flex items-center">
                    <UserRound className="pointer-events-none absolute left-4 h-5 w-5 text-[#4d4354]" />
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Your official name"
                      className="h-14 rounded-lg border-0 bg-[#fbf0fe] pl-12 pr-4 font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">
                    Password
                  </Label>
                  <div className="relative flex items-center">
                    <Lock className="pointer-events-none absolute left-4 h-5 w-5 text-[#4d4354]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Create a secure password"
                      className="h-14 rounded-lg border-0 bg-[#fbf0fe] pl-12 pr-12 font-medium tracking-normal shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute right-4 cursor-pointer text-[#4d4354] transition-colors hover:text-[#8127cf]"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="ml-1 text-xs font-bold uppercase tracking-normal text-[#4d4354]">
                    Confirm Password
                  </Label>
                  <div className="relative flex items-center">
                    <ShieldCheck className="pointer-events-none absolute left-4 h-5 w-5 text-[#4d4354]" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repeat password"
                      className="h-14 rounded-lg border-0 bg-[#fbf0fe] pl-12 pr-4 font-medium tracking-normal shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-3xl bg-[#fbf0fe] p-4">
                  {passwordChecks.map((item) => (
                    <div
                      key={item.label}
                      className={`flex items-center gap-2 text-[10px] font-black ${
                        item.met ? "text-emerald-600" : "text-[#4d4354]/40"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                  ))}
                </div>

                <Button type="submit" disabled={!canSubmit || loading} className="h-14 w-full rounded-xl text-base">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>Activate Account</span>}
                  {!loading ? <ArrowRight className="h-5 w-5" /> : null}
                </Button>
              </form>
            )}

            <div className="mt-6 border-t border-[#cfc2d6]/10 pt-6 text-center">
              <Link href="/login" className="text-sm font-bold text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                Return to login
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
