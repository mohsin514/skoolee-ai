import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { GraduationCap, ShieldCheck, UserCircle2, GraduationCap as StudentIcon } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Left Side — Branding & Hero */}
      <div className="hidden md:flex flex-1 relative bg-[#8127CF] overflow-hidden p-12 flex-col justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 text-white/90">
          <div className="relative">
            <GraduationCap className="absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-6 rotate-[-15deg] text-white" />
            <div className="w-8 h-8 rounded-full border-[3px] border-white bg-white/10 flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-white rounded-full" />
            </div>
          </div>
          <span className="text-2xl font-bold tracking-tight">Skoolee AI</span>
        </div>

        {/* Hero Image Container */}
        <div className="relative flex-1 my-12 group">
          <div className="absolute inset-0 bg-white/5 rounded-[40px] transform rotate-3 transition-transform group-hover:rotate-0" />
          <div className="relative h-full rounded-[40px] overflow-hidden border-8 border-white/10 shadow-2xl">
            <Image
              src="/signup-hero.png"
              alt="Classroom"
              fill
              className="object-cover"
              priority
            />
          </div>
          {/* Floating Card */}
          <div className="absolute -bottom-6 -left-6 bg-white p-8 rounded-[32px] shadow-2xl max-w-sm border border-purple-50">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-purple-600 text-xl font-bold">❤</span>
            </div>
            <h3 className="text-2xl font-extrabold text-[#1F1A23] leading-tight mb-3">
              The Joyful Architect of Education.
            </h3>
            <p className="text-[#4D4354] font-medium opacity-70 leading-relaxed text-sm">
              Join thousands of schools building a more creative and organized future for every student.
            </p>
          </div>
        </div>

        <div className="text-white/40 text-xs font-medium">
          © 2026 SkooleeAI — All rights reserved.
        </div>
      </div>

      {/* Right Side — Form Section */}
      <div className="flex-[1.2] flex flex-col items-center justify-center p-8 bg-[#FFF7FE] overflow-y-auto">
        <div className="w-full max-w-[480px] space-y-10 py-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-[#1F1A23]">Create Your Account</h1>
            <p className="text-[#4D4354] font-medium opacity-80">
              Step into your new digital classroom today.
            </p>
          </div>

          {/* Custom Role Selector UI (Purely Visual for now) */}
          <div className="space-y-4">
            <p className="text-[#1F1A23] font-bold text-xs tracking-widest uppercase opacity-60">
              Who are you?
            </p>
            <div className="grid grid-cols-3 gap-4">
              <button className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-purple-100 bg-white hover:border-[#8127CF] transition-all group active:scale-95">
                <ShieldCheck className="w-6 h-6 text-purple-300 group-hover:text-[#8127CF]" />
                <span className="text-xs font-bold text-[#4D4354]">Admin</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-[#8127CF] bg-purple-50 transition-all active:scale-95">
                <UserCircle2 className="w-6 h-6 text-[#8127CF]" />
                <span className="text-xs font-extrabold text-[#8127CF]">Teacher</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-purple-100 bg-white hover:border-[#8127CF] transition-all group active:scale-95">
                <StudentIcon className="w-6 h-6 text-purple-300 group-hover:text-[#8127CF]" />
                <span className="text-xs font-bold text-[#4D4354]">Student</span>
              </button>
            </div>
          </div>

          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-none bg-transparent p-0",
                header: "hidden",
                footer: "hidden",
                formButtonPrimary: 
                  "bg-[#8127CF] hover:bg-[#6D1FB5] text-white py-6 rounded-xl text-lg font-bold shadow-lg shadow-purple-200 transition-all mt-4",
                formFieldInput: 
                  "bg-white border-[#E2E8F0] focus:border-[#8127CF] focus:ring-1 focus:ring-[#8127CF] rounded-xl py-3 px-4 text-[#1F1A23] placeholder:text-[#94A3B8]",
                formFieldLabel: 
                  "text-[#1F1A23] font-bold text-sm tracking-wide uppercase",
                identityPreviewTextPrimary: "text-[#1F1A23]",
                identityPreviewEditButtonIcon: "text-[#8127CF]",
                socialButtonsBlockButton: 
                  "border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-xl py-3.5 font-bold text-[#1F1A23] transition-colors",
                dividerText: "text-[#94A3B8] font-bold text-xs uppercase tracking-widest",
                formResendCodeLink: "text-[#8127CF] font-bold",
                checkboxContainer: "items-start",
                formFieldHintText: "text-xs font-medium text-[#94A3B8]",
              },
              layout: {
                socialButtonsPlacement: "bottom",
                showOptionalFields: false,
              }
            }}
          />

          <div className="text-center pt-4">
            <Link
              href="/sign-in"
              className="text-sm font-bold text-[#4D4354] hover:text-[#8127CF] transition-colors"
            >
              Already have an account? <span className="text-[#8127CF]">Log in</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
