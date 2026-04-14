'use client'

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Building2, ChevronRight, Mail, Lock, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SplitSignupFlow() {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'school_group' | 'single_campus'>('school_group');
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0a0a0a] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      
      <main className="w-full max-w-md">
        <AnimatePresence mode="wait">
          
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-center mb-8">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500 mx-auto flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20 mb-6">
                  S
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Step 1 of 2 — choose your setup type</p>
              </div>

              <div className="space-y-4 mb-8">
                <div 
                  onClick={() => setType('school_group')}
                  className={`p-5 rounded-2xl cursor-pointer transition-all border-2 ${type === 'school_group' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/50 bg-white dark:bg-[#111]'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Network className={`w-5 h-5 ${type === 'school_group' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <h3 className={`font-semibold ${type === 'school_group' ? 'text-indigo-900 dark:text-indigo-100' : ''}`}>School Group</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-8">
                    Multiple campuses under one school. School owner sees all, central billing and reporting.
                  </p>
                </div>

                <div 
                  onClick={() => setType('single_campus')}
                  className={`p-5 rounded-2xl cursor-pointer transition-all border-2 ${type === 'single_campus' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/10 hover:border-emerald-300 dark:hover:border-emerald-500/50 bg-white dark:bg-[#111]'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Building2 className={`w-5 h-5 ${type === 'single_campus' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                    <h3 className={`font-semibold ${type === 'single_campus' ? 'text-emerald-900 dark:text-emerald-100' : ''}`}>Single Campus</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-8">
                    One standalone campus setup. Fast configuration. Can upgrade to a school group later.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setStep(2)}
                className={`w-full py-3.5 text-white rounded-xl text-sm font-semibold tracking-wide shadow-lg transition-all flex items-center justify-center gap-2 ${type === 'school_group' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/25' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'}`}
              >
                Continue to Step 2 <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
               key="step2"
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.98 }}
               transition={{ duration: 0.2 }}
               className="bg-white dark:bg-[#111] p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm"
            >
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold tracking-tight mb-2">Your Details</h2>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                  Setup type: 
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${type === 'school_group' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'}`}>
                    {type === 'school_group' ? 'School Group' : 'Single Campus'}
                  </span>
                  <button onClick={() => setStep(1)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 ml-1">Change</button>
                </div>
              </div>

              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(3); }}>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="Mr. Tariq Ahmed" required className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:border-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="email" placeholder="tariq@school.edu.pk" required className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:border-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="password" placeholder="Min 8 characters" required className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:border-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-white/5 p-3 rounded-lg mb-4">
                    After signing up we'll send a verification link to your email. Once verified, log back in and your onboarding wizard will start automatically.
                  </p>
                  <button type="submit" className={`w-full py-3.5 text-white rounded-xl text-sm font-semibold tracking-wide shadow-lg transition-all flex items-center justify-center gap-2 ${type === 'school_group' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/25' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'}`}>
                    Create Account & Verify
                  </button>
                </div>
              </form>

            </motion.div>
          )}

          {step === 3 && (
            <motion.div
               key="step3"
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="bg-white dark:bg-[#111] p-10 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm text-center"
            >
              <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                 <Mail className="w-8 h-8 text-slate-600 dark:text-slate-300" />
              </div>
              <h2 className="text-2xl font-bold mb-3 tracking-tight">Check your email</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
                 We sent a verification link to your inbox. Click the link to verify your account so we can redirect you to the onboarding setup.
              </p>
              
              <button 
                onClick={() => router.push('/onboarding')}
                className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                (Demo Bypass) Go to Onboarding
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

    </div>
  );
}
