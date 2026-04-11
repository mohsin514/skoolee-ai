"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  schoolGroupSchema,
  firstCampusSchema,
  ownerPasswordSchema,
  standaloneCampusSchema,
  firstClassSchema,
  teacherInviteSchema,
  type SchoolGroupFormData,
  type FirstCampusFormData,
  type OwnerPasswordFormData,
  type StandaloneCampusFormData,
  type FirstClassFormData,
  type TeacherInviteFormData,
} from "@/lib/validators/schemas";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Building,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Check,
  School,
  Users,
  Lock,
  Image,
  GraduationCap,
  Mail,
} from "lucide-react";

// ──── Types ────────────────────────────────────────────────────────
type RegistrationType = "school-group" | "standalone" | null;
type SchoolGroupStep = "school-info" | "campus-info" | "set-password" | "onboarding-class" | "invite-teacher" | "done";
type StandaloneStep = "campus-info" | "set-password" | "upload-logo" | "onboarding-class" | "invite-teacher" | "done";

const SCHOOL_GROUP_STEPS: SchoolGroupStep[] = ["school-info", "campus-info", "set-password", "onboarding-class", "invite-teacher"];
const STANDALONE_STEPS: StandaloneStep[] = ["campus-info", "set-password", "upload-logo", "onboarding-class", "invite-teacher"];

const stepLabels: Record<string, string> = {
  "school-info": "School Info",
  "campus-info": "Campus Info",
  "set-password": "Set Password",
  "upload-logo": "Upload Logo",
  "onboarding-class": "First Class",
  "invite-teacher": "Invite Teacher",
};

// ──── Main Component ───────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();
  const [regType, setRegType] = useState<RegistrationType>(null);
  const [schoolGroupStep, setSchoolGroupStep] = useState<SchoolGroupStep>("school-info");
  const [standaloneStep, setStandaloneStep] = useState<StandaloneStep>("campus-info");
  const [isLoading, setIsLoading] = useState(false);
  const [schoolGroupData, setSchoolGroupData] = useState<Partial<SchoolGroupFormData & FirstCampusFormData & OwnerPasswordFormData>>({});
  const [standaloneData, setStandaloneData] = useState<Partial<StandaloneCampusFormData>>({});
  const [registrationResult, setRegistrationResult] = useState<{ schoolId: string; campusId: string } | null>(null);

  const currentSteps = regType === "school-group" ? SCHOOL_GROUP_STEPS : STANDALONE_STEPS;
  const currentStep = regType === "school-group" ? schoolGroupStep : standaloneStep;
  const stepIndex = currentSteps.indexOf(currentStep as any);
  const progressPct = ((stepIndex + 1) / currentSteps.length) * 100;

  // ── Registration submission ────────────────────────────────────
  const submitRegistration = async (additionalData: object = {}) => {
    setIsLoading(true);
    try {
      const payload =
        regType === "school-group"
          ? { type: "school-group", ...schoolGroupData, ...additionalData }
          : { type: "standalone", ...standaloneData, ...additionalData };

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Registration failed");
      setRegistrationResult({ schoolId: json.schoolId, campusId: json.campusId });
      toast.success("School registered successfully! 🎉");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fff7fe] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl">
        {/* Logo & Brand Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-500">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#b10e6b] rounded-xl border-4 border-[#fff7fe] flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-xl"></div>
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-[#1f1a23] mb-2">Skoolee AI</h1>
          <div className="h-1 w-12 bg-[#8127cf] rounded-xl"></div>
          <p className="text-[#4d4354] text-sm mt-4 font-medium">AI-powered school management for Pakistan</p>
        </div>

        <AnimatePresence mode="wait">
          {/* ── STEP 0: Choose Registration Type ── */}
          {!regType && (
            <motion.div key="choose" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="bg-white rounded-[40px] shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10 p-8 sm:p-10 space-y-4">
                <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight text-center">Choose registration type</h2>
                <p className="text-center text-[#4d4354] text-sm font-medium">School group or standalone campus?</p>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <button
                    onClick={() => setRegType("school-group")}
                    className="group flex flex-col items-center gap-3 p-8 border-2 border-[#cfc2d6]/10 rounded-[32px] hover:border-[#8127cf] hover:bg-[#fbf0fe] shadow-none hover:shadow-xl hover:shadow-[#8127cf]/5 transition-all duration-300 transform hover:scale-[1.02]"
                  >
                    <Building2 className="h-8 w-8 text-[#8127cf] group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#1f1a23]">School Group</p>
                      <p className="text-[#4d4354]  mt-2 font-medium opacity-70 leading-relaxed">Multiple campuses under one group</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setRegType("standalone")}
                    className="group flex flex-col items-center gap-3 p-8 border-2 border-[#cfc2d6]/10 rounded-[32px] hover:border-[#b10e6b] hover:bg-[#fbf0fe] shadow-none hover:shadow-xl hover:shadow-[#b10e6b]/5 transition-all duration-300 transform hover:scale-[1.02]"
                  >
                    <Building className="h-8 w-8 text-[#b10e6b] group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#1f1a23]">Standalone Campus</p>
                      <p className="text-[#4d4354]  mt-2 font-medium opacity-70 leading-relaxed">Single campus, simpler signup</p>
                    </div>
                  </button>
                </div>
                <p className="text-center text-xs text-[#7e7385] mt-4">
                  Standalone: no school_id · school owner skipped · same structure, simpler signup
                </p>
              </div>
            </motion.div>
          )}

          {/* ── SCHOOL GROUP STEPS ──────────────────────────── */}
          {regType === "school-group" && (
            <motion.div key={`sg-${schoolGroupStep}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <StepCard
                steps={SCHOOL_GROUP_STEPS}
                currentStep={schoolGroupStep}
                progress={progressPct}
                onBack={() => {
                  const idx = SCHOOL_GROUP_STEPS.indexOf(schoolGroupStep);
                  if (idx === 0) setRegType(null);
                  else setSchoolGroupStep(SCHOOL_GROUP_STEPS[idx - 1]);
                }}
              >
                {schoolGroupStep === "school-info" && (
                  <SchoolInfoStep
                    onNext={(data) => { setSchoolGroupData((p) => ({ ...p, ...data })); setSchoolGroupStep("campus-info"); }}
                    isLoading={isLoading}
                  />
                )}
                {schoolGroupStep === "campus-info" && (
                  <CampusInfoStep
                    onNext={(data) => { setSchoolGroupData((p) => ({ ...p, ...data })); setSchoolGroupStep("set-password"); }}
                    isLoading={isLoading}
                  />
                )}
                {schoolGroupStep === "set-password" && (
                  <OwnerPasswordStep
                    isGroup
                    onNext={async (data) => {
                      setSchoolGroupData((p) => ({ ...p, ...data }));
                      await submitRegistration(data);
                      setSchoolGroupStep("onboarding-class");
                    }}
                    isLoading={isLoading}
                  />
                )}
                {schoolGroupStep === "onboarding-class" && (
                  <FirstClassStep
                    onNext={() => setSchoolGroupStep("invite-teacher")}
                    onSkip={() => setSchoolGroupStep("invite-teacher")}
                    isLoading={isLoading}
                  />
                )}
                {schoolGroupStep === "invite-teacher" && (
                  <InviteTeacherStep
                    onNext={() => router.push("/dashboard")}
                    onSkip={() => router.push("/dashboard")}
                    isLoading={isLoading}
                  />
                )}
              </StepCard>
            </motion.div>
          )}

          {/* ── STANDALONE STEPS ───────────────────────────── */}
          {regType === "standalone" && (
            <motion.div key={`sa-${standaloneStep}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <StepCard
                steps={STANDALONE_STEPS}
                currentStep={standaloneStep}
                progress={progressPct}
                onBack={() => {
                  const idx = STANDALONE_STEPS.indexOf(standaloneStep);
                  if (idx === 0) setRegType(null);
                  else setStandaloneStep(STANDALONE_STEPS[idx - 1]);
                }}
              >
                {standaloneStep === "campus-info" && (
                  <StandaloneCampusStep
                    onNext={(data) => { setStandaloneData((p) => ({ ...p, ...data })); setStandaloneStep("set-password"); }}
                    isLoading={isLoading}
                  />
                )}
                {standaloneStep === "set-password" && (
                  <OwnerPasswordStep
                    isGroup={false}
                    onNext={async (data) => {
                      const mergedData = { ...standaloneData, ...data };
                      setStandaloneData(mergedData as StandaloneCampusFormData);
                      await submitRegistration(mergedData);
                      setStandaloneStep("upload-logo");
                    }}
                    isLoading={isLoading}
                  />
                )}
                {standaloneStep === "upload-logo" && (
                  <UploadLogoStep
                    onNext={() => setStandaloneStep("onboarding-class")}
                    onSkip={() => setStandaloneStep("onboarding-class")}
                    isLoading={isLoading}
                  />
                )}
                {standaloneStep === "onboarding-class" && (
                  <FirstClassStep
                    onNext={() => setStandaloneStep("invite-teacher")}
                    onSkip={() => setStandaloneStep("invite-teacher")}
                    isLoading={isLoading}
                  />
                )}
                {standaloneStep === "invite-teacher" && (
                  <InviteTeacherStep
                    onNext={() => router.push("/dashboard")}
                    onSkip={() => router.push("/dashboard")}
                    isLoading={isLoading}
                  />
                )}
              </StepCard>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 text-center pb-8 border-none mx-auto w-full max-w-[448px]">
          <p className="text-[13px] text-[#4d4354] font-medium">
            Already have an account?{" "}
            <Link href="/login" className="text-[#8127cf] font-bold hover:underline ml-1">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shared Step Card Wrapper
// ──────────────────────────────────────────────────────────────────
function StepCard({
  steps,
  currentStep,
  progress,
  onBack,
  children,
}: {
  steps: string[];
  currentStep: string;
  progress: number;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-[40px] shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10 overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-[#fbf0fe]">
        <div className="h-full bg-[#8127cf] transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      {/* Step indicators */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#cfc2d6]/5 overflow-x-auto">
        <button 
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] hover:bg-[#eadfed] transition-colors border border-[#cfc2d6]/10 shadow-sm"
          title="Go Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-6 w-[1px] bg-[#cfc2d6]/20 shrink-0" />
        {steps.map((step, i) => {
          const isActive = step === currentStep;
          const isDone = steps.indexOf(step) < steps.indexOf(currentStep);
          return (
            <div key={step} className="flex items-center gap-2 shrink-0">
              <div className={`flex h-6 w-6 items-center justify-center rounded-xl text-xs font-bold transition-colors ${
                isDone ? "bg-[#34A853] text-white" : isActive ? "bg-[#8127cf] text-white" : "bg-[#fbf0fe] text-[#4d4354]"
              }`}>
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[12px] font-bold uppercase tracking-wider ${isActive ? "text-[#8127cf]" : isDone ? "text-[#34A853]" : "text-[#7e7385]"}`}>
                {stepLabels[step]}
              </span>
              {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
            </div>
          );
        })}
      </div>
      <div className="p-8">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// School Group — Step 1: School Info
// ──────────────────────────────────────────────────────────────────
function SchoolInfoStep({ onNext, isLoading }: { onNext: (d: SchoolGroupFormData) => void; isLoading: boolean }) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<SchoolGroupFormData>({
    resolver: zodResolver(schoolGroupSchema),
    defaultValues: { city: "", contactEmail: "", schoolName: "", slug: "" },
  });

  const schoolName = watch("schoolName");

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <School className="h-5 w-5 text-[#8127cf]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Enter school info</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">name, city, board</p>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">School Name *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="e.g. City Grammar Schools" {...register("schoolName")}
          onChange={(e) => { register("schoolName").onChange(e); setValue("slug", slugify(e.target.value)); }} />
        {errors.schoolName && <p className="text-xs text-red-500">{errors.schoolName.message}</p>}
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Slug (subdomain) *</Label>
        <div className="flex items-center">
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-l-full rounded-r-none px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full border-r-0" placeholder="city-grammar" {...register("slug")} />
          <span className="flex h-[56px] items-center px-5 border-0 bg-[#fbf0fe] rounded-r-full  text-[#7e7385] font-medium shadow-none border-l-0 border">.skooleeai.com</span>
        </div>
        {errors.slug && <p className="text-xs text-red-500">{errors.slug.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">City *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="Lahore" {...register("city")} />
          {errors.city && <p className="text-xs text-red-500">{errors.city.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Contact Email *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" type="email" placeholder="info@school.edu.pk" {...register("contactEmail")} />
          {errors.contactEmail && <p className="text-xs text-red-500">{errors.contactEmail.message}</p>}
        </div>
      </div>

      <Button type="submit" className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2" disabled={isLoading}>
        Continue <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// School Group — Step 2: First Campus
// ──────────────────────────────────────────────────────────────────
function CampusInfoStep({ onNext, isLoading }: { onNext: (d: FirstCampusFormData) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FirstCampusFormData>({
    resolver: zodResolver(firstCampusSchema),
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Building className="h-5 w-5 text-[#8127cf]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Add first campus</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">At least one campus required</p>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Campus Name *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="e.g. Main Campus" {...register("campusName")} />
        {errors.campusName && <p className="text-xs text-red-500">{errors.campusName.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">City *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="Lahore" {...register("campusCity")} />
          {errors.campusCity && <p className="text-xs text-red-500">{errors.campusCity.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Board *</Label>
          <select className="flex h-[56px] w-full bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] font-medium focus:outline-none appearance-none shadow-none" {...register("board")}>
            <option value="">Select board</option>
            <option value="FBISE">FBISE (Federal)</option>
            <option value="BISE Lahore">BISE Lahore</option>
            <option value="BISE Karachi">BISE Karachi</option>
            <option value="BISE Rawalpindi">BISE Rawalpindi</option>
            <option value="BISE Faisalabad">BISE Faisalabad</option>
            <option value="AKU-EB">AKU-EB (O/A Levels)</option>
            <option value="Cambridge">Cambridge (O/A Levels)</option>
            <option value="IB">IB</option>
          </select>
          {errors.board && <p className="text-xs text-red-500">{errors.board.message}</p>}
        </div>
      </div>

      <Button type="submit" className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2" disabled={isLoading}>
        Continue <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// Standalone — Step 1: Campus Info (combined)
// ──────────────────────────────────────────────────────────────────
function StandaloneCampusStep({
  onNext,
  isLoading,
}: {
  onNext: (d: Partial<StandaloneCampusFormData>) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { campusName: "", city: "", board: "" },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Building className="h-5 w-5 text-[#b10e6b]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Enter campus info</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">name, city, board</p>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Campus Name *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="e.g. Beaconhouse Gulberg" {...register("campusName", { required: true })} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">City *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="Lahore" {...register("city", { required: true })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Board *</Label>
          <select className="flex h-[56px] w-full bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] font-medium focus:outline-none appearance-none shadow-none" {...register("board", { required: true })}>
            <option value="">Select board</option>
            <option value="FBISE">FBISE</option>
            <option value="BISE Lahore">BISE Lahore</option>
            <option value="BISE Karachi">BISE Karachi</option>
            <option value="BISE Rawalpindi">BISE Rawalpindi</option>
            <option value="Cambridge">Cambridge</option>
            <option value="AKU-EB">AKU-EB</option>
          </select>
        </div>
      </div>

      <Button type="submit" className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2" disabled={isLoading}>
        Continue <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// Both flows — Set Password step
// ──────────────────────────────────────────────────────────────────
function OwnerPasswordStep({
  isGroup,
  onNext,
  isLoading,
}: {
  isGroup: boolean;
  onNext: (d: OwnerPasswordFormData) => Promise<void>;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<OwnerPasswordFormData>({
    resolver: zodResolver(ownerPasswordSchema),
  });
  const [busy, setBusy] = useState(false);

  const handleNext = async (data: OwnerPasswordFormData) => {
    setBusy(true);
    try { await onNext(data); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={handleSubmit(handleNext)} className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Lock className="h-5 w-5 text-[#8127cf]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">{isGroup ? "Set owner password" : "Set password"}</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">{isGroup ? "school_owner role" : "become campus admin"}</p>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Full Name *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="Muhammad Ali" {...register("ownerName")} />
        {errors.ownerName && <p className="text-xs text-red-500">{errors.ownerName.message}</p>}
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Email Address *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" type="email" placeholder="admin@school.edu.pk" {...register("ownerEmail")} />
        {errors.ownerEmail && <p className="text-xs text-red-500">{errors.ownerEmail.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Password *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" type="password" placeholder="Min 8 characters" {...register("password")} />
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Confirm Password *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" type="password" placeholder="Repeat password" {...register("confirmPassword")} />
          {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={busy || isLoading}>
        {busy || isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {isGroup ? "Create School & Set Password" : "Create Account"}
      </Button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// Standalone only — Upload Logo (optional)
// ──────────────────────────────────────────────────────────────────
function UploadLogoStep({
  onNext,
  onSkip,
  isLoading,
}: {
  onNext: () => void;
  onSkip: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Image className="h-5 w-5 text-[#b10e6b]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Upload logo</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">Optional, skippable</p>

      <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center cursor-pointer hover:border-primary transition-colors">
        <div className="mx-auto h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
          <Image className="h-6 w-6 text-[#7e7385]" />
        </div>
        <p className="text-[#4d4354] text-sm mt-1">Click to upload or drag and drop</p>
        <p className="text-xs text-[#7e7385] mt-1">PNG, JPG up to 2MB</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onSkip} className="h-[56px] border-none bg-[#fbf0fe] hover:bg-purple-50/80 rounded-xl font-bold text-[#1f1a23] shadow-none w-full">Skip for now</Button>
        <Button onClick={onNext} className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2">Continue <ArrowRight className="ml-2 h-5 w-5" /></Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Both flows — Add First Class (onboarding step)
// ──────────────────────────────────────────────────────────────────
function FirstClassStep({
  onNext,
  onSkip,
  isLoading,
}: {
  onNext: () => void;
  onSkip: () => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<FirstClassFormData>({
    resolver: zodResolver(firstClassSchema),
    defaultValues: { name: "", academicYear: new Date().getFullYear() },
  });
  const [busy, setBusy] = useState(false);

  const submit = async (data: FirstClassFormData) => {
    setBusy(true);
    try {
      await fetch("/api/onboarding/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      onNext();
    } catch {
      toast.error("Could not create class, but you can add it later");
      onNext(); // Don't block progress
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <GraduationCap className="h-5 w-5 text-[#8127cf]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Add first class</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">You can add more classes from the dashboard later</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Class Name *</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="e.g. Grade 6" {...register("name")} />
          {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Section</Label>
          <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="A / Blue / Noon" {...register("section")} />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Academic Year *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" type="number" {...register("academicYear", { valueAsNumber: true })} />
        {errors.academicYear && <p className="text-xs text-red-500">{errors.academicYear.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={onSkip} className="h-[56px] border-none bg-[#fbf0fe] hover:bg-purple-50/80 rounded-xl font-bold text-[#1f1a23] shadow-none w-full">Skip</Button>
        <Button type="submit" className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Class <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// Both flows — Invite First Teacher (magic link)
// ──────────────────────────────────────────────────────────────────
function InviteTeacherStep({
  onNext,
  onSkip,
  isLoading,
}: {
  onNext: () => void;
  onSkip: () => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<TeacherInviteFormData>({
    resolver: zodResolver(teacherInviteSchema),
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  const submit = async (data: TeacherInviteFormData) => {
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.magicLink) setMagicLink(json.magicLink);
      setSent(true);
      toast.success("Invite sent via magic link!");
    } catch {
      toast.error("Could not send invite");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-xl bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-[#34A853]" />
        </div>
        <h2 className="text-xl text-lg font-bold text-[#1f1a23]">Invite sent!</h2>
        <p className="text-[#4d4354] text-sm">The teacher will receive a magic link to set up their account.</p>
        {magicLink && (
          <div className="rounded-lg bg-gray-50 p-3 text-left">
            <p className="text-xs text-[#7e7385] mb-1">Dev only — Magic Link:</p>
            <p className="text-xs break-all text-[#8127cf]">{magicLink}</p>
          </div>
        )}
        <Button className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2" onClick={onNext}>
          Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Mail className="h-5 w-5 text-[#8127cf]" />
        <h2 className="text-2xl font-bold text-[#1f1a23] tracking-tight">Invite first teacher via magic link</h2>
      </div>
      <p className="text-[#4d4354] text-sm mt-1">They'll receive a link to set their password and log in</p>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Teacher's Full Name *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" placeholder="e.g. Ms. Fatima Malik" {...register("fullName")} />
        {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider">Teacher's Email *</Label>
        <Input className="h-[56px] bg-[#fbf0fe] border-0  rounded-lg px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385] font-medium shadow-none w-full" type="email" placeholder="fatima@school.edu.pk" {...register("email")} />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={onSkip} className="h-[56px] border-none bg-[#fbf0fe] hover:bg-purple-50/80 rounded-xl font-bold text-[#1f1a23] shadow-none w-full">Skip for now</Button>
        <Button type="submit" className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send Invite
          <Mail className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
