'use client'

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import SkooleeLogo from "@/components/SkooleeLogo";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export default function VerifySuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      router.push('/login');
    }
  }, [countdown, router]);

  return (
    <main className="w-full h-screen grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-[#fff7fe] font-sans">
      
      {/* ─── LEFT SIDE: Visual Narrative ─── */}
      <section className="hidden md:block relative overflow-hidden h-screen">
        <div className="absolute inset-0 bg-emerald-500/10 mix-blend-multiply z-10"></div>
        <Image src="/login.svg" alt="Skoolee Verification" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent z-20"></div>
        <div className="absolute bottom-12 left-12 z-30 max-w-md">
          <div className="bg-white/70 backdrop-blur-[24px] p-8 rounded-xl border border-white/20 shadow-2xl">
            <span className="text-[12px] font-bold tracking-normal text-emerald-600 uppercase mb-2 block">Identity Confirmed</span>
            <h2 className="text-3xl font-extrabold text-[#1f1a23] leading-tight mb-4">"Trust is the glue of life. It’s the most essential ingredient in effective communication."</h2>
            <p className="text-[#4d4354] font-medium text-sm">Your institutional authority has been verified. Welcome to the Skoolee ecosystem.</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE: Interaction Canvas ─── */}
      <section className="flex flex-col items-center justify-center p-6 md:p-8 bg-[#f6fdf9] relative h-screen overflow-y-auto w-full">
        <div className="w-full max-w-md">
          
          <div className="flex flex-col items-center mb-10">
            <div className="mb-4">
              <SkooleeLogo size="1.6rem" />
            </div>
            <div className="h-1 w-12 bg-emerald-500 rounded-full"></div>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#ffffff] rounded-[40px] p-10 text-center shadow-xl border border-emerald-100 flex flex-col items-center"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-[32px] flex items-center justify-center text-emerald-500 mb-8 shadow-inner">
              <CheckCircle className="w-12 h-12" />
            </div>
            
            <h2 className="text-3xl font-extrabold text-[#1f1a23] mb-4 tracking-normal">Authority Verified</h2>
            <p className="text-sm font-medium text-[#4d4354]/70 mb-10 leading-relaxed px-2">
              Your email identity has been synchronized with the institutional registry. You now have full access to your command console.
            </p>

            <Link href="/login" className="w-full h-16 bg-emerald-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200/50 group">
              Continue to Login <ArrowRight className="h-5 w-5 group-hover:translate-x-1" />
            </Link>

            <div className="mt-8 flex items-center gap-3 text-[#4d4354]/40 font-bold text-[10px] uppercase tracking-normal">
               <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auto-redirecting in {countdown}s
            </div>
          </motion.div>

          <p className="mt-8 text-center text-xs font-bold text-[#4d4354]/30 uppercase tracking-normal flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" /> End-to-End Encryption Verified
          </p>
        </div>
      </section>
    </main>
  );
}
