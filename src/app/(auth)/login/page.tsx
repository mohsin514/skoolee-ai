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
        <div className="absolute inset-0 bg-[#8127cf]/10 mix-blend-multiply z-10"></div>
        <img
          src="/login.svg"
          alt="Skoolee Empowering Education"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#8127cf]/40 to-transparent z-20"></div>

        <div className="absolute bottom-12 left-12 z-30 max-w-md">
          <div className="bg-white/70 backdrop-blur-[24px] p-8 rounded-xl border border-white/20 shadow-2xl">
            <span className="text-[12px] font-bold tracking-normal text-[#9c48ea] uppercase mb-2 block">Empowering Education</span>
            <h2 className="text-3xl font-extrabold text-[#1f1a23] leading-tight mb-4">"The best way to predict the future is to create it."</h2>
            <p className="text-[#4d4354] font-medium">Join thousands of educators managing their campus with Skoolee's joyful architecture.</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE: Interaction Canvas ─── */}
      <section className="flex flex-col items-center justify-center p-6 md:p-8 bg-[#fbf0fe] relative h-screen overflow-y-auto w-full">

        {/* Floating Help Button */}
        <button className="fixed md:absolute bottom-8 right-8 h-14 w-14 bg-[#eadfed] text-[#8127cf] rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform group border border-[#cfc2d6]/20 z-50">
          <span className="font-bold text-2xl">?</span>
          <span className="absolute right-16 bg-[#1f1a23] text-[#fff7fe] text-xs font-bold py-2 px-4 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Support Center</span>
        </button>

        <div className="w-full max-w-md">

          {/* Logo & Brand Header */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-[22px] flex items-center justify-center shadow-lg transform rotate-3 mb-4">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-normal text-[#1f1a23] mb-2">Skoolee AI</h1>
            <div className="h-1 w-12 bg-[#8127cf] rounded-full"></div>
          </div>

          {/* Form Section */}
          <div className="bg-[#ffffff] rounded-[32px] p-8 shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#1f1a23] tracking-normal">Welcome Back!</h2>
              <p className="text-[#4d4354] text-sm mt-1">Please enter your details to access your dashboard.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-normal">
                  Work Email
                </Label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#4d4354] pointer-events-none">
                    <Mail className="h-5 w-5" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="principal@institution.edu"
                    className="w-full h-14 pl-12 pr-4 bg-[#fbf0fe] border-0 rounded-lg focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-[#ffffff] transition-all placeholder:text-[#4d4354]/35 text-[#1f1a23] font-medium shadow-none"
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 font-medium px-1">{errors.email.message}</p>}
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label htmlFor="password" title="Enter your account password" className="text-xs font-bold text-[#4d4354] uppercase tracking-normal">
                    Password
                  </Label>
                  <Link href="/forgot-password" className="text-xs font-bold text-[#8127cf] hover:text-[#9c48ea] transition-colors">
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#4d4354] pointer-events-none">
                    <Lock className="h-5 w-5" />
                  </div>
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full h-14 pl-12 pr-12 bg-[#fbf0fe] border-0 rounded-lg focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-[#ffffff] transition-all placeholder:text-[#4d4354]/35 text-[#1f1a23] font-medium shadow-none tracking-normal"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 text-[#4d4354] hover:text-[#8127cf] transition-colors"
                  >
                    {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 font-medium px-1">{errors.password.message}</p>}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>Login to Campus</span>}
                {!isLoading && <ArrowRight className="h-5 w-5" />}
              </button>
            </form>

            {/* Social Logins */}
            <div className="mt-8 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#cfc2d6]/30"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-4 bg-[#ffffff] text-[#4d4354] font-bold tracking-normal">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button type="button" className="flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-[#fbf0fe] hover:bg-[#f5eaf8] transition-colors border border-[#cfc2d6]/10">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                <span className="text-sm font-bold text-[#1f1a23]">Google</span>
              </button>
              <button type="button" className="flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-[#fbf0fe] hover:bg-[#f5eaf8] transition-colors border border-[#cfc2d6]/10">
                <svg className="w-5 h-5" viewBox="0 0 23 23">
                  <path d="M0 0h23v23H0z" fill="#f3f3f3"></path>
                  <path d="M1 1h10v10H1z" fill="#f35325"></path>
                  <path d="M12 1h10v10H12z" fill="#81bc06"></path>
                  <path d="M1 12h10v10H1z" fill="#05a6f0"></path>
                  <path d="M12 12h10v10H12z" fill="#ffba08"></path>
                </svg>
                <span className="text-sm font-bold text-[#1f1a23]">Microsoft</span>
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-[#cfc2d6]/10 text-center">
              <p className="text-sm text-[#4d4354] font-medium">
                Do not have an account?
                <Link href="/register" className="text-[#8127cf] font-bold hover:underline ml-1">Create New Account</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
