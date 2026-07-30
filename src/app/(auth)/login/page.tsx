"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { loginSchema, type LoginFormData } from "@/lib/validators/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2, Eye, EyeOff, ArrowRight, Mail, Lock } from "lucide-react";
import Link from "next/link";
import { dashboardPathForRole } from "@/lib/roles";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      toast.success("Account successfully verified! Please log in.", {
        duration: 8000,
      });
      window.history.replaceState(null, '', '/login');
    } else if (searchParams.get("invite") === "accepted") {
      toast.success("Invitation accepted. Please log in with your new password.", {
        duration: 8000,
      });
      window.history.replaceState(null, '', '/login');
    }
  }, [searchParams]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Login failed");
      toast.success(`Welcome back, ${json.user.fullName}!`);

      if (json.user.role === "TEACHER" && !json.user.onboardingComplete) {
        router.push("/teacher-onboarding");
      } else {
        router.push(dashboardPathForRole(json.user.role));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="w-full h-screen grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-[#fff7fe] font-sans">

      {/* ─── LEFT SIDE: Visual Narrative ─── */}
      <section className="hidden md:block relative overflow-hidden h-screen">
        <div className="absolute inset-0 bg-gradient-to-br from-[#8127cf]/20 via-transparent to-[#9c48ea]/10 z-10"></div>
        <img
          src="/login.svg"
          alt="Skoolee Empowering Education"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1f1a23]/60 via-[#8127cf]/20 to-transparent z-20"></div>

        <div className="absolute bottom-12 left-12 right-12 z-30">
          <div className="bg-white/75 backdrop-blur-[24px] p-8 rounded-[32px] border border-white/30 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/20">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-[11px] font-black tracking-wider text-[#8127cf] uppercase">Skoolee AI</span>
            </div>
            <h2 className="text-2xl font-black text-[#1f1a23] leading-snug mb-3">&ldquo;The best way to predict the future is to create it.&rdquo;</h2>
            <p className="text-sm font-semibold text-[#4d4354]/70">Join thousands of educators managing their campus with Skoolee&apos;s joyful architecture.</p>
            <div className="mt-5 flex gap-3">
              <div className="h-2 w-2 rounded-full bg-[#8127cf]" />
              <div className="h-2 w-2 rounded-full bg-[#8127cf]/30" />
              <div className="h-2 w-2 rounded-full bg-[#8127cf]/30" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE: Interaction Canvas ─── */}
      <section className="flex flex-col items-center justify-center p-6 md:p-8 bg-[#fbf0fe] relative h-screen overflow-y-auto w-full">
        <div className="w-full max-w-md">

          {/* Logo & Brand Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-xl flex items-center justify-center shadow-md shadow-[#8127cf]/20 mb-3">
              <GraduationCap className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#1f1a23] mb-1">Skoolee AI</h1>
            <div className="h-0.5 w-10 bg-gradient-to-r from-[#8127cf] to-[#9c48ea] rounded-full"></div>
          </div>

          {/* Form Section */}
          <div className="bg-[#ffffff] rounded-[32px] p-7 shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10">
            <div className="mb-6">
              <h2 className="text-xl font-black text-[#1f1a23] tracking-tight">Welcome Back!</h2>
              <p className="text-[#4d4354]/60 text-sm font-semibold mt-1">Please enter your details to access your dashboard.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* Email Input */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[10px] font-black text-[#4d4354] ml-1 uppercase tracking-wider">
                  Work Email
                </Label>
                <div className="relative flex items-center group">
                  <div className="absolute left-3.5 text-[#4d4354]/30 group-focus-within:text-[#8127cf] transition-colors pointer-events-none">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="principal@institution.edu"
                    className="w-full h-12 pl-10 pr-4 bg-[#fbf0fe] border-0 rounded-2xl focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all placeholder:text-[#4d4354]/25 text-[#1f1a23] font-bold shadow-none"
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 font-bold px-1">{errors.email.message}</p>}
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-1">
                  <Label htmlFor="password" className="text-[10px] font-black text-[#4d4354] uppercase tracking-wider">
                    Password
                  </Label>
                  <Link href="/forgot-password" className="text-[10px] font-black text-[#8127cf] hover:text-[#9c48ea] transition-colors">
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative flex items-center group">
                  <div className="absolute left-3.5 text-[#4d4354]/30 group-focus-within:text-[#8127cf] transition-colors pointer-events-none">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full h-12 pl-10 pr-12 bg-[#fbf0fe] border-0 rounded-2xl focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-white transition-all placeholder:text-[#4d4354]/25 text-[#1f1a23] font-bold shadow-none"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 text-[#4d4354]/30 hover:text-[#8127cf] transition-colors"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 font-bold px-1">{errors.password.message}</p>}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-[#8127cf] to-[#9c48ea] text-white font-black rounded-2xl shadow-lg shadow-[#8127cf]/25 hover:shadow-xl hover:shadow-[#8127cf]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Login to Campus</span>}
                {!isLoading && <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>

            {/* Social Logins */}
            <div className="mt-6 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#cfc2d6]/20"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-4 bg-white text-[#4d4354]/40 font-black tracking-wider text-[10px]">Or continue with</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" className="flex items-center justify-center gap-3 h-11 rounded-2xl bg-[#fbf0fe] hover:bg-[#f5eaf8] hover:shadow-md transition-all border border-[#cfc2d6]/10 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-sm font-bold text-[#1f1a23]">Google</span>
              </button>
              <button type="button" className="flex items-center justify-center gap-3 h-11 rounded-2xl bg-[#fbf0fe] hover:bg-[#f5eaf8] hover:shadow-md transition-all border border-[#cfc2d6]/10 cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 23 23">
                  <path d="M1 1h10v10H1z" fill="#f35325"/><path d="M12 1h10v10H12z" fill="#81bc06"/>
                  <path d="M1 12h10v10H1z" fill="#05a6f0"/><path d="M12 12h10v10H12z" fill="#ffba08"/>
                </svg>
                <span className="text-sm font-bold text-[#1f1a23]">Microsoft</span>
              </button>
            </div>

            <div className="mt-5 pt-5 border-t border-[#cfc2d6]/10 text-center">
              <p className="text-sm text-[#4d4354] font-semibold">
                Don&apos;t have an account?
                <Link href="/register" className="text-[#8127cf] font-black hover:text-[#9c48ea] transition-colors ml-1">Create New Account</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
