import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Left Side — Hero Section */}
      <div className="hidden md:flex flex-1 relative bg-purple-100 overflow-hidden">
        <Image
          src="/login-hero.png"
          alt="Educator"
          fill
          className="object-cover opacity-90"
          priority
        />
        {/* Floating Quote Card */}
        <div className="absolute bottom-12 left-12 right-12 max-w-lg">
          <div className="bg-white/80 backdrop-blur-md p-10 rounded-[32px] shadow-2xl border border-white/20">
            <p className="text-[#8127CF] font-bold text-sm tracking-wider uppercase mb-3">
              Empowering Education
            </p>
            <h2 className="text-3xl font-extrabold text-[#1F1A23] leading-tight mb-4">
              "The best way to predict the future is to create it."
            </h2>
            <p className="text-[#4D4354] font-medium opacity-80 leading-relaxed">
              Join thousands of educators managing their campus with Skoolee's joyful architecture.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side — Auth Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#FFF7FE]">
        <div className="w-full max-w-[420px] space-y-8">
          {/* Logo Section */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 text-4xl font-bold text-[#8127CF] tracking-tight">
              <span>Sk</span>
              <div className="relative">
                <GraduationCap className="absolute -top-5 left-1/2 -translate-x-1/2 w-8 h-8 rotate-[-15deg]" />
                <div className="w-10 h-10 rounded-full border-[4px] border-[#8127CF] bg-white flex items-center justify-center">
                  <div className="w-3.5 h-3.5 bg-[#1F1A23] rounded-full" />
                </div>
              </div>
              <div className="w-10 h-10 rounded-full border-[4px] border-[#8127CF] bg-white flex items-center justify-center">
                <div className="w-3.5 h-3.5 bg-[#1F1A23] rounded-full" />
              </div>
              <span>leeAI</span>
            </div>
            <div className="text-center mt-6">
              <h1 className="text-3xl font-bold text-[#1F1A23]">Welcome Back!</h1>
              <p className="text-[#4D4354] mt-2 font-medium opacity-80">
                Please enter your details to access your dashboard.
              </p>
            </div>
          </div>

          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-none bg-transparent p-0",
                header: "hidden",
                footer: "hidden",
                formButtonPrimary: 
                  "bg-[#8127CF] hover:bg-[#6D1FB5] text-white py-6 rounded-xl text-lg font-bold shadow-lg shadow-purple-200 transition-all",
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
              },
              layout: {
                socialButtonsPlacement: "bottom",
                showOptionalFields: false,
              }
            }}
          />

          <div className="text-center">
            <Link
              href="/sign-up"
              className="text-sm font-bold text-[#4D4354] hover:text-[#8127CF] transition-colors"
            >
              New to the platform? <span className="text-[#8127CF]">Create an account</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
