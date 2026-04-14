'use client';

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { requestPasswordReset, resetPassword, verifyToken } from "@/app/actions/auth/reset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2, ArrowRight, Mail, Lock, CheckCircle2, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    if (token) {
      verifyToken(token).then(res => {
        setIsValidToken(res.valid);
        if (!res.valid) {
          toast.error("Your recovery link has expired or is invalid.");
        }
      });
    }
  }, [token]);

  // Form for Requesting Reset
  const requestForm = useForm({
    resolver: zodResolver(requestSchema),
  });

  // Form for Resetting Password
  const resetForm = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' }
  });

  const watchPassword = resetForm.watch("password");
  const watchConfirm = resetForm.watch("confirmPassword");

  const passwordRequirements = [
    { label: "Min 8 characters", met: watchPassword.length >= 8 },
    { label: "One uppercase", met: /[A-Z]/.test(watchPassword) },
    { label: "One number", met: /[0-9]/.test(watchPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(watchPassword) },
    { label: "Passwords match", met: watchPassword === watchConfirm && watchPassword !== '' }
  ];

  const handleRequest = async (data: any) => {
    setIsLoading(true);
    try {
      await requestPasswordReset(data.email);
      setIsSubmitted(true);
      toast.success("Identity verification link sent to your email.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (data: any) => {
    if (!token) return;
    
    // Final check for requirements
    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      toast.error("Please satisfy all security requirements.");
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, data.password);
      toast.success("Security credentials updated successfully.");
      router.push("/login");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="w-full h-screen grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-[#fff7fe] font-sans">
      {/* ─── LEFT SIDE ─── */}
      <section className="hidden md:block relative overflow-hidden h-screen">
        <div className="absolute inset-0 bg-[#8127cf]/10 mix-blend-multiply z-10"></div>
        <img src="/login.svg" alt="Skoolee Access" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#8127cf]/40 to-transparent z-20"></div>
        <div className="absolute bottom-12 left-12 z-30 max-w-md">
          <div className="bg-white/70 backdrop-blur-[24px] p-8 rounded-xl border border-white/20 shadow-2xl">
            <span className="text-[12px] font-bold tracking-widest text-[#9c48ea] uppercase mb-2 block">Security Recovery</span>
            <h2 className="text-3xl font-extrabold text-[#1f1a23] leading-tight mb-4">"Security is not a product, but a process."</h2>
            <p className="text-[#4d4354] font-medium">Reset your secure credentials to continue managing your institution.</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE ─── */}
      <section className="flex flex-col items-center justify-center p-6 md:p-8 bg-[#fbf0fe] relative h-screen overflow-y-auto w-full">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-2xl flex items-center justify-center shadow-lg mb-4">
               <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-[#1f1a23] mb-2">Skoolee AI</h1>
            <div className="h-1 w-12 bg-[#8127cf] rounded-full"></div>
          </div>

          <div className="bg-[#ffffff] rounded-[32px] p-8 shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10">
            
            {!token ? (
              // REQUEST RESET UI
              !isSubmitted ? (
                <>
                  <div className="mb-8 text-left">
                    <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Recover Account</h2>
                    <p className="text-[#4d4354] text-sm mt-1">Enter your registered email below to receive a reset link.</p>
                  </div>

                  <form onSubmit={requestForm.handleSubmit(handleRequest)} className="space-y-6">
                    <div className="space-y-2">
                       <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Email Identity</Label>
                       <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d4354]" />
                          <Input placeholder="admin@horizon.edu" className="w-full h-14 pl-12 bg-[#fbf0fe] border-0 rounded-lg focus:ring-2 focus:ring-[#8127cf]/20" {...requestForm.register("email")} />
                       </div>
                       {requestForm.formState.errors.email && <p className="text-xs text-red-500 font-medium px-1">{(requestForm.formState.errors.email as any).message}</p>}
                    </div>
                    <button type="submit" className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg hover:bg-[#9c48ea] transition-all flex items-center justify-center gap-2" disabled={isLoading}>
                       {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Send Reset Link <ArrowRight className="h-5 w-5" /></>}
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center py-6">
                   <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600">
                      <CheckCircle2 className="w-10 h-10" />
                   </div>
                   <h3 className="text-2xl font-bold text-[#1f1a23] mb-2">Check your inbox</h3>
                   <p className="text-[#4d4354] text-sm mb-8">We've sent an encrypted security path to your registered email address.</p>
                   <Link href="/login" className="text-sm font-bold text-[#8127cf] hover:underline">Back to Login</Link>
                </div>
              )
            ) : isValidToken === false ? (
               <div className="text-center py-6">
                  <div className="h-16 w-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-600">
                     <AlertCircle className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#1f1a23] mb-2">Link Expired</h3>
                  <p className="text-[#4d4354] text-sm mb-8 pr-1">This security path has reached its expiration or has already been used. Please request a new link.</p>
                  <button onClick={() => router.push("/forgot-password")} className="text-sm font-bold text-[#8127cf] hover:underline">Request New Link</button>
               </div>
            ) : isValidToken === null ? (
               <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="h-10 w-10 text-[#8127cf] animate-spin" />
                  <p className="text-xs font-bold text-[#4d4354] uppercase tracking-wider">Verifying path...</p>
               </div>
            ) : (
              // RESET PASSWORD UI
              <>
                <div className="mb-8 text-left">
                  <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">New Password</h2>
                  <p className="text-[#4d4354] text-sm mt-1">Please define your new institutional access code.</p>
                </div>

                <form onSubmit={resetForm.handleSubmit(handleReset)} className="space-y-5">
                   <div className="space-y-2">
                       <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">New Password</Label>
                       <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d4354]" />
                          <Input type="password" placeholder="••••••••" className="w-full h-14 pl-12 bg-[#fbf0fe] border-0 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-[#8127cf]/20" {...resetForm.register("password")} />
                       </div>
                       {resetForm.formState.errors.password && <p className="text-xs text-red-500 font-medium px-1">{(resetForm.formState.errors.password as any).message}</p>}
                   </div>
                   <div className="space-y-2">
                       <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Confirm Identity Code</Label>
                       <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d4354]" />
                          <Input type="password" placeholder="••••••••" className="w-full h-14 pl-12 bg-[#fbf0fe] border-0 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-[#8127cf]/20" {...resetForm.register("confirmPassword")} />
                       </div>
                       {resetForm.formState.errors.confirmPassword && <p className="text-xs text-red-500 font-medium px-1">{(resetForm.formState.errors.confirmPassword as any).message}</p>}
                   </div>

                   <div className="p-4 bg-[#fbf0fe] rounded-2xl border border-[#cfc2d6]/20">
                       <p className="text-[10px] font-bold text-[#8127cf] uppercase tracking-wider mb-2">Security Checklist</p>
                       <div className="grid grid-cols-2 gap-y-1.5">
                          {passwordRequirements.map((r, i) => (
                            <div key={i} className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors ${r.met ? 'text-emerald-600' : 'text-[#4d4354]/40'}`}>
                               {r.met ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3 opacity-30" />}
                               {r.label}
                            </div>
                          ))}
                       </div>
                    </div>

                   <button type="submit" className="w-full h-14 bg-[#1f1a23] text-white rounded-xl text-lg font-black italic tracking-tighter shadow-lg hover:bg-[#322a38] transition-all flex items-center justify-center gap-2" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Save New Credentials <ArrowRight className="h-5 w-5" /></>}
                   </button>
                </form>
              </>
            )}

            <div className="mt-8 pt-6 border-t border-[#cfc2d6]/10 text-center">
               <Link href="/login" className="text-sm font-bold text-[#4d4354]/60 hover:text-[#8127cf]">Nevermind, I remember it.</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
