'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  Building, GraduationCap, MapPin,
  Plus, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2,
  Shield, Hash,
  Trash2, LucideIcon, LogOut, Phone, School, Users,
  Globe, Mail, Upload, ImageIcon, CalendarDays, Tag, UserRound,
  CalendarRange, Clock, Sparkles, AlertCircle, RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  finishOnboarding,
  getOnboardingSession,
  type OnboardingCampusInput,
} from '@/app/actions/completeOnboarding';
import { logout } from '@/app/actions/auth/logout';
import { toast } from 'sonner';
import { getPlanLimits } from '@/config/plans';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardPathForRole } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";

// ─────────────────────────────────────────────────────────────────
// The wizard is keyed by step *id*, not by number. A standalone school
// skips the campus step, and the old numeric scheme meant every branch
// had to remember that "step 3" was screen 2 for half the users.
// ─────────────────────────────────────────────────────────────────
type StepId = 'identity' | 'campuses' | 'academic' | 'review';

const STEP_META: Record<StepId, { title: string; desc: string }> = {
  identity: { title: "School Details", desc: "Name, branding & contact" },
  campuses: { title: "Add Campuses", desc: "Set up your branches" },
  academic: { title: "Academic Setup", desc: "Session & working days" },
  review: { title: "Review & Finish", desc: "Confirm and launch" },
};

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  icon: LucideIcon;
  isArea?: boolean;
  required?: boolean;
  readonly?: boolean;
  type?: string;
}

interface SummaryItemProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface CampusDraft extends OnboardingCampusInput {
  id: string;
  autoId: boolean;
}

const BOARDS = [
  "Federal Board",
  "Punjab Board",
  "Sindh Board",
  "KPK Board",
  "Balochistan Board",
  "Aga Khan Board",
  "Cambridge (IGCSE)",
  "IB / International",
  "Other",
];

/** ISO weekday numbering — 1 = Monday … 7 = Sunday, matching the Weekend model. */
const WEEK_DAYS: { num: number; short: string; long: string }[] = [
  { num: 1, short: "Mon", long: "Monday" },
  { num: 2, short: "Tue", long: "Tuesday" },
  { num: 3, short: "Wed", long: "Wednesday" },
  { num: 4, short: "Thu", long: "Thursday" },
  { num: 5, short: "Fri", long: "Friday" },
  { num: 6, short: "Sat", long: "Saturday" },
  { num: 7, short: "Sun", long: "Sunday" },
];

const TIMEZONES = [
  { value: "Asia/Karachi", label: "Pakistan — Asia/Karachi (PKT)" },
  { value: "Asia/Dubai", label: "UAE — Asia/Dubai (GST)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia — Asia/Riyadh (AST)" },
  { value: "Asia/Kolkata", label: "India — Asia/Kolkata (IST)" },
  { value: "Asia/Dhaka", label: "Bangladesh — Asia/Dhaka (BST)" },
  { value: "Asia/Kabul", label: "Afghanistan — Asia/Kabul (AFT)" },
  { value: "Europe/London", label: "UK — Europe/London" },
  { value: "America/New_York", label: "US Eastern — America/New_York" },
  { value: "UTC", label: "UTC" },
];

const generateId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

/** "2026-27" from 2026 — the label a school actually writes on a report card. */
const sessionLabelFor = (year: number) =>
  `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

const emptyCampus = (): Omit<CampusDraft, 'id'> => ({
  name: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  principalName: '',
  regId: generateId('BR'),
  autoId: true,
  board: BOARDS[0],
});

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>('identity');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ role?: string; email?: string; phone?: string | null; school?: { name?: string; city?: string; contactEmail?: string; phone?: string | null; regId?: string; plan?: string } } | null>(null);

  const isStandalone = session?.role === 'ADMIN';
  const flow: StepId[] = useMemo(
    () => (isStandalone ? ['identity', 'academic', 'review'] : ['identity', 'campuses', 'academic', 'review']),
    [isStandalone],
  );
  const stepIndex = Math.max(0, flow.indexOf(step));
  const progress = ((stepIndex + 1) / flow.length) * 100;

  const thisYear = new Date().getFullYear();

  const [schoolData, setSchoolData] = useState({
    name: '',
    city: '',
    address: '',
    email: '',
    phone: '',
    website: '',
    logoUrl: '',
    establishedYear: '',
    tagline: '',
    regId: '',
    autoId: true,
    // ── Academic setup ──────────────────────────────────────────
    // Not cosmetic: without an ACTIVE cycle the app falls back to the
    // calendar year and files marks under a year nobody is looking at,
    // and without weekend rows exam scheduling books papers on a Sunday.
    timezone: 'Asia/Karachi',
    academicYear: String(thisYear),
    sessionLabel: sessionLabelFor(thisYear),
    sessionStart: '',
    sessionEnd: '',
    /** Days the campus is CLOSED. Sunday off is the common default here. */
    weekends: [7] as number[],
  });

  const [campuses, setCampuses] = useState<CampusDraft[]>([]);
  const [newCampus, setNewCampus] = useState<Omit<CampusDraft, 'id'>>(emptyCampus);

  useEffect(() => {
    const loadSession = async () => {
      const res = await getOnboardingSession();

      if (res && 'user' in res && res.user) {
        const user = res.user;
        setSession(user);
        setSchoolData((prev) => ({
          ...prev,
          name: user?.school?.name || '',
          city: user?.school?.city || '',
          email: user?.school?.contactEmail || user?.email || '',
          // Captured at signup — carry it forward rather than making the owner
          // type their number a second time.
          phone: user?.school?.phone || user?.phone || '',
          regId: user?.school?.regId || generateId('SKL'),
          // Trust the browser's zone as the opening guess, but only when it is
          // one we actually offer — otherwise leave the Pakistan default.
          timezone: (() => {
            const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return TIMEZONES.some((t) => t.value === detected) ? detected : prev.timezone;
          })(),
        }));
      }
    };

    loadSession();
  }, []);

  const handleLogoFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("Use a logo image under 1.5 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSchoolData((prev) => ({ ...prev, logoUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSchoolIdToggle = (auto: boolean) => {
    setSchoolData(prev => ({
      ...prev,
      autoId: auto,
      regId: auto ? generateId('SKL') : prev.regId
    }));
  };

  const handleCampusIdToggle = (auto: boolean) => {
    setNewCampus(prev => ({
      ...prev,
      autoId: auto,
      regId: auto ? generateId('BR') : (prev.autoId ? '' : prev.regId)
    }));
  };

  /** Toggle a day between working and closed, refusing to close the whole week. */
  const toggleWorkingDay = useCallback((day: number) => {
    setSchoolData((prev) => {
      const closed = prev.weekends.includes(day);
      const next = closed
        ? prev.weekends.filter((d) => d !== day)
        : [...prev.weekends, day].sort((a, b) => a - b);
      if (next.length >= 7) {
        toast.error("A campus needs at least one working day.");
        return prev;
      }
      return { ...prev, weekends: next };
    });
  }, []);

  const setAcademicYear = (raw: string) => {
    const year = raw.replace(/[^\d]/g, '').slice(0, 4);
    setSchoolData((prev) => {
      const numeric = Number(year);
      // Keep the label in step with the year while it still looks auto-derived,
      // so a hand-typed label like "Session A" is never overwritten.
      const labelWasDerived = prev.sessionLabel === sessionLabelFor(Number(prev.academicYear));
      return {
        ...prev,
        academicYear: year,
        sessionLabel: labelWasDerived && numeric >= 2000 ? sessionLabelFor(numeric) : prev.sessionLabel,
      };
    });
  };

  const addCampus = () => {
    if (!newCampus.name || !newCampus.city || !newCampus.regId) {
      toast.error("Please fill in Campus Name, City, and Campus ID.");
      return;
    }
    if (campuses.some((c) => c.regId.toUpperCase() === newCampus.regId.toUpperCase())) {
      toast.error("That Campus ID is already used by another campus.");
      return;
    }
    try {
      const plan = session?.school?.plan;
      const maxCampuses = getPlanLimits(plan).maxCampuses;
      if (maxCampuses >= 0 && campuses.length + 1 > maxCampuses) {
        const planName = getPlanLimits(plan).name || 'your plan';
        toast.error(`${planName} allows ${maxCampuses} campus${maxCampuses === 1 ? '' : 'es'}. Upgrade to add more.`);
        return;
      }
    } catch {
      // let server validate
    }
    setCampuses([...campuses, { ...newCampus, id: Date.now().toString() }]);
    setNewCampus(emptyCampus());
    toast.success(`${newCampus.name} added.`);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const goTo = (target: StepId) => {
    if (flow.indexOf(target) <= stepIndex) setStep(target);
  };

  const goBack = () => {
    if (stepIndex > 0) setStep(flow[stepIndex - 1]);
  };

  const handleProceedFromIdentity = () => {
    if (!schoolData.name || !schoolData.city) {
      toast.error("School name and city are required.");
      return;
    }
    if (isStandalone && !newCampus.regId) {
      toast.error("Campus ID is required.");
      return;
    }

    if (isStandalone) {
      // A single-campus school still needs a Campus row: every class, student
      // and timetable hangs off one, so it is created from the school's own
      // details rather than asked for twice.
      setCampuses([{
        id: 'primary-node',
        name: schoolData.name,
        city: schoolData.city,
        address: schoolData.address,
        phone: schoolData.phone,
        email: schoolData.email,
        website: schoolData.website,
        principalName: '',
        regId: newCampus.regId,
        autoId: newCampus.autoId,
        board: BOARDS[0],
      }]);
    }
    setStep('academic');
  };

  const handleProceedFromAcademic = () => {
    const year = Number(schoolData.academicYear);
    if (!year || year < 2000 || year > thisYear + 5) {
      toast.error("Enter a valid academic year.");
      return;
    }
    if (!schoolData.sessionLabel.trim()) {
      toast.error("Give the session a name, e.g. 2026-27.");
      return;
    }
    if (schoolData.sessionStart && schoolData.sessionEnd && schoolData.sessionEnd <= schoolData.sessionStart) {
      toast.error("The session must end after it starts.");
      return;
    }
    setStep('review');
  };

  const handleFinalLaunch = async () => {
    setLoading(true);
    try {
      const res = await finishOnboarding(schoolData, campuses);
      if (res.success) {
        toast.success("Setup complete! Opening your dashboard...");
        router.push(dashboardPathForRole(res.role));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const workingDays = WEEK_DAYS.filter((d) => !schoolData.weekends.includes(d.num));
  const offDays = WEEK_DAYS.filter((d) => schoolData.weekends.includes(d.num));

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#fff7fe] gap-4">
      <Loader2 className="h-8 w-8 text-[#8127cf] animate-spin" />
      <p className="text-xs font-bold text-ink">Loading your setup...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff7fe] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
      <style>{`
        @keyframes skRise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sk-rise { animation: skRise .6s cubic-bezier(.2,.7,.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .sk-rise { animation: none !important; } }
      `}</style>

      {/* ─── SIDEBAR (desktop) ─── */}
      <aside className="w-72 bg-white/50 backdrop-blur-md border-r border-[#cfc2d6]/30 hidden lg:flex flex-col p-8 fixed h-full z-50">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <SkooleeLogo size="1.4rem" />
          </div>
          <p className="text-[10px] font-bold text-ink-muted uppercase tracking-normal leading-none">Setup Wizard</p>
        </div>

        {/* Overall progress — how much of the wizard is behind you. */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">
              Step {stepIndex + 1} of {flow.length}
            </span>
            <span className="text-[9px] font-black text-[#8127cf]">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#cfc2d6]/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <nav className="flex-1 space-y-3">
          {flow.map((id, i) => (
            <StepNav
              key={id}
              active={step === id}
              done={stepIndex > i}
              num={i + 1}
              title={STEP_META[id].title}
              desc={STEP_META[id].desc}
              disabled={i > stepIndex}
              onClick={() => goTo(id)}
            />
          ))}
        </nav>

        <button onClick={handleLogout} className="mt-auto flex items-center gap-4 p-4 rounded-2xl text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-all font-bold text-sm cursor-pointer group">
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> <span>Sign Out</span>
        </button>
      </aside>

      <main className="flex-1 lg:ml-72 min-h-screen flex flex-col bg-[#fbf0fe]/50">

        {/* ─── MOBILE STEP BAR ─── */}
        <div className="lg:hidden px-6 pt-6 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <SkooleeLogo size="1.2rem" />
          </div>
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[#cfc2d6]/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {flow.map((id, i) => {
              const isActive = step === id;
              const isDone = stepIndex > i;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goTo(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-normal transition-all ${
                    isActive
                      ? "bg-[#8127cf] text-white shadow-md"
                      : isDone
                      ? "bg-[#e8d5f5] text-[#8127cf] cursor-pointer"
                      : "bg-[#f3f4f9] text-ink-subtle"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-3 w-3" /> : null}
                  {STEP_META[id].title}
                </button>
              );
            })}
          </div>
        </div>

        <header className="px-6 md:px-10 py-5 flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-40 border-b border-[#cfc2d6]/10">
          <div className="flex items-center gap-2 text-[10px] font-black text-[#8127cf] uppercase tracking-normal">
            <School className="w-3.5 h-3.5" />
            {isStandalone ? 'Single Campus Setup' : 'Multi-Campus Setup'}
          </div>
          <div className="flex items-center gap-3">
            {stepIndex > 0 && (
              <button onClick={goBack} className="text-[10px] font-black uppercase text-ink-subtle hover:text-[#8127cf] transition-all cursor-pointer">Go Back</button>
            )}
            <button onClick={handleLogout} className="lg:hidden text-[10px] font-black uppercase text-rose-400 hover:text-rose-600 transition-all cursor-pointer">Sign Out</button>
          </div>
        </header>

        <div className="p-6 md:p-12 flex-1 flex flex-col items-center">

          <div className="w-full max-w-4xl">
            <AnimatePresence mode="wait">
              {/* ═══ STEP: School Details ═══ */}
              {step === 'identity' && (
                <motion.div key="identity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                  <div className="sk-rise bg-white rounded-[40px] p-6 md:p-10 shadow-xl border border-[#cfc2d6]/10 relative overflow-hidden">

                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-16 h-16 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf] shadow-inner shrink-0">
                        <Building className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl md:text-3xl font-black text-[#1f1a23] tracking-normal leading-none">
                          {isStandalone ? "Your School" : "School Group Details"}
                        </h2>
                        <p className="text-ink-muted font-semibold text-sm mt-1.5">
                          {isStandalone ? "Enter your school's name and location to get started." : "Set up your school group's identity. You'll add campuses next."}
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-10">
                      <div className="space-y-6">
                        <div className="bg-white rounded-[28px] border-2 border-dashed border-[#8127cf]/25 p-6 flex items-center gap-5 hover:border-[#8127cf]/40 transition-colors">
                          <div className="w-20 h-20 rounded-2xl bg-[#fbf0fe] border border-[#cfc2d6]/10 shadow-sm overflow-hidden flex items-center justify-center flex-shrink-0">
                            {schoolData.logoUrl ? (
                              <Image src={schoolData.logoUrl} alt="Institution logo" width={80} height={80} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-8 h-8 text-[#8127cf]/40" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-ink-muted uppercase tracking-normal mb-1">Institution Logo</p>
                            <p className="text-[9px] font-bold text-ink-subtle mb-3">PNG or JPG under 1.5 MB. Shown on report cards, emails and receipts.</p>
                            <div className="flex items-center gap-2">
                              <label className="h-10 px-4 bg-[#8127cf] text-white rounded-xl font-black text-[10px] uppercase tracking-normal flex items-center gap-2 hover:bg-[#9c48ea] cursor-pointer shadow-lg shadow-[#8127cf]/20 transition-all">
                                <Upload className="w-4 h-4" /> Choose Logo
                                <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoFile(e.target.files?.[0])} />
                              </label>
                              {schoolData.logoUrl && (
                                <button onClick={() => setSchoolData({ ...schoolData, logoUrl: '' })} className="h-10 px-4 bg-white border border-[#cfc2d6]/20 text-ink-muted rounded-xl font-black text-[10px] uppercase tracking-normal hover:text-rose-500 hover:border-rose-200 transition-all cursor-pointer">Remove</button>
                              )}
                            </div>
                          </div>
                        </div>

                        <InputField label={isStandalone ? "School Name" : "School Group Name"} value={schoolData.name} onChange={(v: string) => setSchoolData({ ...schoolData, name: v })} placeholder="e.g. Horizon Academy" icon={GraduationCap} required />
                        <InputField label="Tagline / Motto" value={schoolData.tagline} onChange={(v: string) => setSchoolData({ ...schoolData, tagline: v })} placeholder="e.g. Knowledge is Power (optional)" icon={Tag} />
                        <InputField label="City" value={schoolData.city} onChange={(v: string) => setSchoolData({ ...schoolData, city: v })} placeholder="e.g. Lahore" icon={MapPin} required />
                        <InputField label="Address" value={schoolData.address} onChange={(v: string) => setSchoolData({ ...schoolData, address: v })} placeholder="Street address (optional)" icon={MapPin} isArea />
                      </div>

                      <div className="space-y-6">
                        <InputField label="Contact Email" value={schoolData.email} onChange={(v: string) => setSchoolData({ ...schoolData, email: v })} placeholder="e.g. info@school.edu.pk" icon={Mail} readonly />
                        <div className="grid grid-cols-2 gap-5">
                          <InputField label="Phone Number" value={schoolData.phone} onChange={(v: string) => setSchoolData({ ...schoolData, phone: v })} placeholder="+92 300 0000000" icon={Phone} />
                          <InputField label="Est. Year" value={schoolData.establishedYear} onChange={(v: string) => setSchoolData({ ...schoolData, establishedYear: v.replace(/[^\d]/g, '').slice(0, 4) })} placeholder="e.g. 1998" icon={CalendarDays} />
                        </div>
                        <InputField label="Website" value={schoolData.website} onChange={(v: string) => setSchoolData({ ...schoolData, website: v })} placeholder="e.g. www.school.edu.pk (optional)" icon={Globe} />
                        <div className="bg-[#fbf0fe] p-6 md:p-8 rounded-[32px] border border-[#cfc2d6]/20">
                          <div className="flex items-center justify-between mb-5">
                            <Label className="text-[10px] font-black text-[#8127cf] uppercase tracking-normal pl-1">{isStandalone ? 'Campus ID' : 'School ID'}</Label>
                            <div className="bg-white rounded-lg p-1 flex border border-[#cfc2d6]/10 shadow-sm">
                              <button onClick={() => isStandalone ? handleCampusIdToggle(true) : handleSchoolIdToggle(true)} className={`px-3 py-1 text-[9px] font-black rounded-md transition-all cursor-pointer ${isStandalone ? (newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400') : (schoolData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400')}`}>Auto</button>
                              <button onClick={() => isStandalone ? handleCampusIdToggle(false) : handleSchoolIdToggle(false)} className={`px-3 py-1 text-[9px] font-black rounded-md transition-all cursor-pointer ${isStandalone ? (!newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400') : (!schoolData.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-gray-400')}`}>Manual</button>
                            </div>
                          </div>
                          <Input
                            value={isStandalone ? newCampus.regId : schoolData.regId}
                            onChange={e => isStandalone ? setNewCampus({ ...newCampus, regId: e.target.value.toUpperCase() }) : setSchoolData({ ...schoolData, regId: e.target.value.toUpperCase() })}
                            readOnly={isStandalone ? newCampus.autoId : schoolData.autoId}
                            className="h-14 bg-white rounded-xl font-black text-lg tracking-normal border-0 text-center shadow-sm"
                          />
                          <p className="text-[10px] text-ink-subtle mt-4 pl-1 font-bold">A unique identifier for your {isStandalone ? 'campus' : 'school group'}.</p>
                        </div>

                        <div className="p-5 bg-emerald-50 rounded-[24px] border border-emerald-100 flex items-center gap-4">
                          <Shield className="w-7 h-7 text-emerald-500 shrink-0" />
                          <div>
                            <p className="text-[9px] font-black text-emerald-900 uppercase tracking-normal leading-none mb-1">Secure Session</p>
                            <p className="text-[9px] font-bold text-emerald-600/70 leading-none">Your account is verified and ready.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 flex justify-end">
                      <button onClick={handleProceedFromIdentity} className="h-14 px-8 md:px-10 bg-[#1f1a23] text-white rounded-2xl font-black text-base flex items-center gap-3 hover:bg-black transition-all shadow-2xl active:scale-95 cursor-pointer group">
                        {isStandalone ? "Next: Academic Setup" : "Next: Add Campuses"} <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ═══ STEP: Add Campuses (multi-campus only) ═══ */}
              {step === 'campuses' && (
                <motion.div key="campuses" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid lg:grid-cols-5 gap-8">
                  <div className="lg:col-span-3 space-y-6">
                    <div className="sk-rise bg-white rounded-[40px] p-6 md:p-10 shadow-xl border border-[#cfc2d6]/10">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-[#fbf0fe] rounded-xl flex items-center justify-center text-[#8127cf] shrink-0">
                          <Building className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-[#1f1a23] tracking-normal">Add Your Campuses</h2>
                          <p className="text-xs font-semibold text-ink-muted mt-0.5">Add each branch or campus of your school group.</p>
                        </div>
                      </div>
                      <div className="space-y-5">
                        <InputField label="Campus Name" value={newCampus.name} onChange={(v: string) => setNewCampus({ ...newCampus, name: v })} placeholder="e.g. Main Campus, West Branch" icon={Building} required />
                        <div className="grid grid-cols-2 gap-5">
                          <InputField label="City" value={newCampus.city} onChange={(v: string) => setNewCampus({ ...newCampus, city: v })} placeholder="City" icon={MapPin} required />
                          <InputField label="Phone" value={newCampus.phone ?? ''} onChange={(v: string) => setNewCampus({ ...newCampus, phone: v })} placeholder="Phone number" icon={Phone} />
                        </div>
                        <InputField label="Address" value={newCampus.address ?? ''} onChange={(v: string) => setNewCampus({ ...newCampus, address: v })} placeholder="Full street address" icon={MapPin} isArea />
                        <div className="grid grid-cols-2 gap-5">
                          <InputField label="Campus Email" value={newCampus.email ?? ''} onChange={(v: string) => setNewCampus({ ...newCampus, email: v })} placeholder="campus@school.edu.pk" icon={Mail} />
                          <InputField label="Website" value={newCampus.website ?? ''} onChange={(v: string) => setNewCampus({ ...newCampus, website: v })} placeholder="Website (optional)" icon={Globe} />
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                          <InputField label="Head of Campus" value={newCampus.principalName ?? ''} onChange={(v: string) => setNewCampus({ ...newCampus, principalName: v })} placeholder="Principal / director name" icon={UserRound} />
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black text-ink-subtle uppercase tracking-normal ml-1">Board</Label>
                            <div className="relative group flex items-center">
                              <GraduationCap className="absolute left-4 w-4 h-4 text-ink-subtle group-focus-within:text-[#8127cf] transition-colors pointer-events-none" />
                              <select
                                value={newCampus.board || BOARDS[0]}
                                onChange={e => setNewCampus({ ...newCampus, board: e.target.value })}
                                className="w-full h-14 pl-12 pr-5 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all outline-none appearance-none text-[#1f1a23] cursor-pointer"
                              >
                                {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-5 items-end pt-2">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center px-1 mb-1">
                              <Label className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal pl-1">Campus ID</Label>
                              <div className="flex bg-[#f3f4f9] p-0.5 rounded-lg border border-[#cfc2d6]/10 scale-90 origin-right shadow-sm">
                                <button
                                  onClick={() => handleCampusIdToggle(true)}
                                  type="button"
                                  className={`px-2.5 py-1 text-[8px] font-black rounded-md transition-all cursor-pointer ${newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-ink-subtle'}`}
                                >
                                  Auto
                                </button>
                                <button
                                  onClick={() => handleCampusIdToggle(false)}
                                  type="button"
                                  className={`px-2.5 py-1 text-[8px] font-black rounded-md transition-all cursor-pointer ${!newCampus.autoId ? 'bg-[#8127cf] text-white shadow-sm' : 'text-ink-subtle'}`}
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                            <Input
                              value={newCampus.regId}
                              readOnly={newCampus.autoId}
                              onChange={e => setNewCampus({ ...newCampus, regId: e.target.value.toUpperCase() })}
                              placeholder="BR-XXXX"
                              className="h-12 bg-[#fbf0fe] border-0 font-black tracking-normal rounded-xl text-center focus:ring-2 focus:ring-[#8127cf]/10 transition-all text-sm"
                            />
                          </div>
                          <button onClick={addCampus} className="h-12 bg-[#8127cf] text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-[#9c48ea] cursor-pointer shadow-lg shadow-[#8127cf]/20 transition-all">
                            <Plus className="w-4 h-4" /> Add Campus
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-2">
                      <button onClick={goBack} className="h-12 px-5 rounded-xl border border-[#cfc2d6]/30 font-black text-xs uppercase tracking-wider text-ink-muted hover:text-[#8127cf] hover:border-[#8127cf]/25 transition-all cursor-pointer flex items-center gap-2">
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                      <button onClick={() => setStep('academic')} disabled={campuses.length === 0} className="h-12 px-8 bg-[#1f1a23] text-white rounded-xl font-black text-base flex items-center gap-3 hover:bg-black cursor-pointer shadow-xl transition-all group disabled:opacity-40 disabled:cursor-not-allowed">
                        Next: Academic Setup <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="sk-rise bg-white rounded-[40px] p-8 h-full min-h-[450px] flex flex-col border border-[#cfc2d6]/10 shadow-2xl relative" style={{ animationDelay: "160ms" }}>
                      <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-50 text-[#1f1a23]">
                        <h3 className="text-[10px] font-black uppercase tracking-normal flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#8127cf]" /> Your Campuses
                        </h3>
                        <span className="text-[9px] font-black text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-full uppercase tracking-normal">{campuses.length} Added</span>
                      </div>

                      <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        {campuses.map((c, i) => (
                          <div key={c.id} className="p-4 bg-[#fbf0fe]/50 rounded-[20px] border border-transparent flex items-center justify-between group hover:bg-white hover:border-[#8127cf]/10 transition-all shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#8127cf] font-black text-[10px] shadow-sm">{i + 1}</div>
                              <div>
                                <p className="text-xs font-black text-[#1f1a23] leading-none mb-1">{c.name}</p>
                                <p className="text-[9px] font-bold text-ink-subtle uppercase tracking-normal">{c.city} &middot; {c.regId}</p>
                                {(c.phone || c.email || c.principalName) && (
                                  <p className="text-[9px] font-bold text-ink-subtle uppercase tracking-normal mt-0.5 truncate max-w-[180px]">{c.principalName}{c.principalName ? " · " : ""}{c.phone}{c.phone ? " · " : ""}{c.email}</p>
                                )}
                              </div>
                            </div>
                            <button onClick={() => setCampuses(campuses.filter(x => x.id !== c.id))} className="text-rose-400 p-2 hover:bg-rose-50 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {campuses.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-30 pt-16">
                            <Building className="w-12 h-12 mb-3" />
                            <p className="text-[9px] font-black uppercase tracking-normal">No campuses added yet</p>
                            <p className="text-[8px] font-bold text-ink-subtle mt-1">Fill in the form and click &ldquo;Add Campus&rdquo;</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ═══ STEP: Academic Setup ═══
                  The Academic Hub grades a year as "set up" on three facts: an
                  ACTIVE cycle, defined periods, and weekend days. Two of the
                  three are settled right here so a brand-new school does not
                  land on a dashboard already telling it what it forgot. */}
              {step === 'academic' && (
                <motion.div key="academic" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div className="sk-rise bg-white rounded-[40px] p-6 md:p-10 shadow-xl border border-[#cfc2d6]/10">
                    <div className="flex items-center gap-6 mb-9">
                      <div className="w-16 h-16 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf] shadow-inner shrink-0">
                        <CalendarRange className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl md:text-3xl font-black text-[#1f1a23] tracking-normal leading-none">Academic Setup</h2>
                        <p className="text-ink-muted font-semibold text-sm mt-1.5">
                          Your first session and weekly rhythm. Everything else — marks, attendance, exams — is filed against these.
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-10">
                      {/* ── Session ── */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-[#8127cf]" />
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">Current session</p>
                        </div>

                        <div className="grid grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black text-ink-subtle uppercase tracking-normal ml-1">
                              Academic Year <span className="text-rose-500">*</span>
                            </Label>
                            <div className="relative group flex items-center">
                              <CalendarDays className="absolute left-4 w-4 h-4 text-ink-subtle group-focus-within:text-[#8127cf] transition-colors pointer-events-none" />
                              <Input
                                value={schoolData.academicYear}
                                onChange={e => setAcademicYear(e.target.value)}
                                placeholder={String(thisYear)}
                                inputMode="numeric"
                                className="w-full h-14 pl-12 pr-5 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all shadow-none text-[#1f1a23]"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black text-ink-subtle uppercase tracking-normal ml-1">
                              Session Name <span className="text-rose-500">*</span>
                            </Label>
                            <div className="relative group flex items-center">
                              <Tag className="absolute left-4 w-4 h-4 text-ink-subtle group-focus-within:text-[#8127cf] transition-colors pointer-events-none" />
                              <Input
                                value={schoolData.sessionLabel}
                                onChange={e => setSchoolData({ ...schoolData, sessionLabel: e.target.value })}
                                placeholder={sessionLabelFor(thisYear)}
                                className="w-full h-14 pl-12 pr-11 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all shadow-none text-[#1f1a23]"
                              />
                              <button
                                type="button"
                                aria-label="Reset session name"
                                onClick={() => setSchoolData({ ...schoolData, sessionLabel: sessionLabelFor(Number(schoolData.academicYear) || thisYear) })}
                                className="absolute right-4 text-ink-subtle hover:text-[#8127cf] hover:rotate-90 transition-all cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 rounded-2xl bg-[#fbf0fe] px-4 py-3">
                          <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[#8127cf]" />
                          <p className="text-[10px] font-bold leading-snug text-ink-muted">
                            A session labelled {sessionLabelFor(Number(schoolData.academicYear) || thisYear)} often starts in {Number(schoolData.academicYear) || thisYear}{" "}and ends the year after — so the academic year is asked for separately from today&apos;s date.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-5">
                          <InputField
                            label="Session Starts" type="date" icon={CalendarDays}
                            value={schoolData.sessionStart} placeholder=""
                            onChange={(v) => setSchoolData({ ...schoolData, sessionStart: v })}
                          />
                          <InputField
                            label="Session Ends" type="date" icon={CalendarDays}
                            value={schoolData.sessionEnd} placeholder=""
                            onChange={(v) => setSchoolData({ ...schoolData, sessionEnd: v })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black text-ink-subtle uppercase tracking-normal ml-1">Time Zone</Label>
                          <div className="relative group flex items-center">
                            <Clock className="absolute left-4 w-4 h-4 text-ink-subtle group-focus-within:text-[#8127cf] transition-colors pointer-events-none" />
                            <select
                              value={schoolData.timezone}
                              onChange={e => setSchoolData({ ...schoolData, timezone: e.target.value })}
                              className="w-full h-14 pl-12 pr-5 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all outline-none appearance-none text-[#1f1a23] cursor-pointer"
                            >
                              {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <p className="text-[10px] font-bold text-ink-subtle ml-1">
                            Decides which calendar day an attendance mark or fee cutoff falls on.
                          </p>
                        </div>
                      </div>

                      {/* ── Working week ── */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <CalendarRange className="w-3.5 h-3.5 text-[#8127cf]" />
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">Working week</p>
                        </div>

                        <p className="text-[11px] font-semibold leading-relaxed text-ink-muted -mt-2">
                          Tap a day to close it. Closed days are greyed out on attendance and timetable grids, and exam scheduling refuses to book a paper on one.
                        </p>

                        <div className="grid grid-cols-7 gap-1.5 md:gap-2">
                          {WEEK_DAYS.map((d) => {
                            const off = schoolData.weekends.includes(d.num);
                            return (
                              <button
                                key={d.num}
                                type="button"
                                onClick={() => toggleWorkingDay(d.num)}
                                aria-pressed={!off}
                                aria-label={`${d.long} — ${off ? "closed" : "working day"}`}
                                className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 py-3 transition-all cursor-pointer ${
                                  off
                                    ? "border-[#cfc2d6]/25 bg-[#f3f4f9] text-ink-subtle hover:border-rose-200"
                                    : "border-[#8127cf] bg-gradient-to-br from-[#fbf0fe] to-white text-[#8127cf] shadow-md shadow-[#8127cf]/10"
                                }`}
                              >
                                <span className="text-[10px] font-black uppercase tracking-wider">{d.short}</span>
                                <span className={`h-1.5 w-1.5 rounded-full transition-colors ${off ? "bg-[#cfc2d6]" : "bg-[#8127cf]"}`} />
                              </button>
                            );
                          })}
                        </div>

                        <div className="rounded-[28px] border border-[#cfc2d6]/20 bg-[#fbf0fe] p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">Week at a glance</p>
                            <span className="rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf] shadow-sm">
                              {workingDays.length} working {workingDays.length === 1 ? "day" : "days"}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#8127cf] text-white shadow-sm">
                                <CheckCircle2 className="h-3 w-3" />
                              </span>
                              <p className="text-[11px] font-bold leading-snug text-[#1f1a23]">
                                Open: {workingDays.map((d) => d.short).join(", ") || "—"}
                              </p>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-ink-subtle shadow-sm">
                                <Clock className="h-3 w-3" />
                              </span>
                              <p className="text-[11px] font-bold leading-snug text-ink-muted">
                                Closed: {offDays.map((d) => d.long).join(", ") || "No weekend set"}
                              </p>
                            </div>
                          </div>
                          <p className="border-t border-[#cfc2d6]/20 pt-3 text-[10px] font-bold leading-snug text-ink-subtle">
                            Applied to {isStandalone ? "your campus" : `all ${campuses.length} campus${campuses.length === 1 ? "" : "es"}`}. Individual campuses can override this later from Academic → Calendar.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-11 flex items-center justify-between">
                      <button onClick={goBack} className="h-12 px-5 rounded-xl border border-[#cfc2d6]/30 font-black text-xs uppercase tracking-wider text-ink-muted hover:text-[#8127cf] hover:border-[#8127cf]/25 transition-all cursor-pointer flex items-center gap-2">
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                      <button onClick={handleProceedFromAcademic} className="h-14 px-8 md:px-10 bg-[#1f1a23] text-white rounded-2xl font-black text-base flex items-center gap-3 hover:bg-black transition-all shadow-2xl active:scale-95 cursor-pointer group">
                        Review &amp; Finish <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ═══ STEP: Review & Finish ═══ */}
              {step === 'review' && (
                <motion.div key="review" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto text-center space-y-9 py-4">
                  <div className="w-20 h-20 bg-emerald-50 rounded-[32px] flex items-center justify-center text-emerald-500 mx-auto shadow-2xl">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-3xl md:text-4xl font-black text-[#1f1a23] tracking-normal">All Set!</h2>
                    <p className="text-base font-semibold text-ink-muted max-w-sm mx-auto">Review your details below and launch your dashboard.</p>
                  </div>

                  <div className="sk-rise bg-white p-6 md:p-8 rounded-[40px] border border-[#cfc2d6]/10 text-left space-y-3 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Building className="w-32 h-32" /></div>
                    {(schoolData.logoUrl || schoolData.tagline) && (
                      <div className="flex items-center gap-4 mb-6 relative z-10">
                        {schoolData.logoUrl && (
                          <div className="w-14 h-14 rounded-xl overflow-hidden border border-[#cfc2d6]/10 shadow-sm flex-shrink-0 bg-[#fbf0fe]">
                            <Image src={schoolData.logoUrl} alt="Institution logo" width={56} height={56} className="w-full h-full object-cover" />
                          </div>
                        )}
                        {schoolData.tagline && (
                          <p className="text-[11px] font-bold text-ink-muted italic">&ldquo;{schoolData.tagline}&rdquo;</p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 relative z-10">
                      <SummaryItem icon={Building} label={isStandalone ? "School" : "School Group"} value={schoolData.name} />
                      <SummaryItem icon={Hash} label={isStandalone ? "Campus ID" : "School ID"} value={isStandalone ? (campuses[0]?.regId ?? '') : schoolData.regId} />
                      <SummaryItem icon={Users} label="Structure" value={isStandalone ? "Single Campus" : `${campuses.length} Campus${campuses.length === 1 ? '' : 'es'}`} />
                      <SummaryItem icon={MapPin} label="City" value={schoolData.city} />
                      <SummaryItem icon={Mail} label="Contact Email" value={schoolData.email} />
                      <SummaryItem icon={Phone} label="Phone" value={schoolData.phone} />
                      <SummaryItem icon={Globe} label="Website" value={schoolData.website} />
                      <SummaryItem icon={CalendarDays} label="Established" value={schoolData.establishedYear} />
                    </div>

                    {/* The academic block gets its own panel: it is the part that
                        decides how the rest of the product behaves on day one. */}
                    <div className="mt-6 pt-6 border-t border-[#cfc2d6]/10 relative z-10">
                      <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal mb-3">Academic setup</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                        <SummaryItem icon={CalendarRange} label="Session" value={`${schoolData.sessionLabel} (AY ${schoolData.academicYear})`} />
                        <SummaryItem icon={Clock} label="Time Zone" value={schoolData.timezone} />
                        <SummaryItem
                          icon={CalendarDays}
                          label="Session Dates"
                          value={schoolData.sessionStart ? `${schoolData.sessionStart}${schoolData.sessionEnd ? ` → ${schoolData.sessionEnd}` : ''}` : 'Starts today'}
                        />
                        <SummaryItem
                          icon={CheckCircle2}
                          label="Weekly Off"
                          value={offDays.map((d) => d.short).join(", ") || "None"}
                        />
                      </div>
                    </div>

                    {!isStandalone && campuses.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-[#cfc2d6]/10 relative z-10">
                        <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal mb-3">Campuses</p>
                        <div className="space-y-2">
                          {campuses.map((c, i) => (
                            <div key={c.id} className="flex items-center gap-3 p-3 bg-[#fbf0fe]/50 rounded-xl">
                              <div className="w-6 h-6 rounded-md bg-[#8127cf]/10 flex items-center justify-center text-[#8127cf] font-black text-[9px]">{i + 1}</div>
                              <div className="flex-1">
                                <p className="text-xs font-black text-[#1f1a23] leading-none">{c.name}</p>
                                <p className="text-[8px] font-bold text-ink-subtle mt-0.5">{c.city} &middot; {c.regId}</p>
                                {(c.phone || c.email) && (
                                  <p className="text-[8px] font-bold text-ink-subtle mt-0.5">{c.phone}{c.phone && c.email ? " · " : ""}{c.email}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button
                      onClick={goBack}
                      disabled={loading}
                      className="h-16 w-16 shrink-0 rounded-[24px] border border-[#cfc2d6]/30 bg-white text-ink-muted flex items-center justify-center hover:text-[#8127cf] hover:border-[#8127cf]/25 transition-all cursor-pointer disabled:opacity-40"
                      aria-label="Back"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleFinalLaunch}
                      disabled={loading}
                      className="flex-1 h-16 bg-[#8127cf] text-white rounded-[24px] font-black text-lg shadow-2xl shadow-[#8127cf]/25 flex items-center justify-center gap-4 hover:bg-[#9c48ea] transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer group"
                    >
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Launch Dashboard <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </main>

    </div>
  );
}

function StepNav({ active, done, num, title, desc, disabled, onClick }: {
  active: boolean;
  done: boolean;
  num: number;
  title: string;
  desc: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left p-5 rounded-[24px] transition-all duration-300 flex items-center gap-5 border ${active ? 'bg-[#fbf0fe] border-[#8127cf]/10 shadow-xl shadow-[#8127cf]/5' : 'border-transparent hover:bg-white/65 hover:border-[#cfc2d6]/20'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:-translate-y-0.5'}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all duration-500 shadow-md shrink-0 ${active ? 'bg-[#8127cf] text-white scale-110' : done ? 'bg-emerald-500 text-white' : 'bg-[#f3f4f9] text-ink-subtle'}`}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : num}
      </div>
      <div className="overflow-hidden">
        <h4 className={`text-sm font-black text-[#1f1a23] leading-none mb-1.5 truncate ${!active && !done && 'opacity-40'}`}>{title}</h4>
        <p className={`text-[10px] font-bold text-ink-muted tracking-normal truncate ${!active && 'opacity-40'}`}>{desc}</p>
      </div>
    </button>
  );
}

function InputField({ label, value, onChange, placeholder, icon: Icon, isArea, required, readonly, type = "text" }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-black text-ink-subtle uppercase tracking-normal ml-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <div className="relative group flex items-center">
        <Icon className="absolute left-4 w-4 h-4 text-ink-subtle group-focus-within:text-[#8127cf] transition-colors pointer-events-none" />
        {isArea ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[100px] pl-12 pr-5 py-4 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all outline-none resize-none placeholder:text-ink-subtle"
          />
        ) : (
          <Input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            readOnly={readonly}
            className={`w-full h-14 pl-12 pr-5 bg-[#f3f4f9] border-0 rounded-[20px] text-xs font-bold focus:ring-4 focus:ring-[#8127cf]/10 focus:bg-white transition-all shadow-none placeholder:text-ink-subtle text-[#1f1a23] ${readonly ? 'opacity-70 cursor-not-allowed selection:bg-transparent' : ''}`}
          />
        )}
      </div>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: SummaryItemProps) {
  return (
    <div className="flex items-center gap-4 p-4 md:p-5 bg-[#fbf0fe]/50 rounded-[24px] border border-white/50 shadow-sm">
      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#8127cf] shadow-sm flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="overflow-hidden">
        <p className="text-[9px] font-black text-ink-subtle uppercase tracking-normal mb-1">{label}</p>
        <p className="text-xs font-black text-[#1f1a23] truncate pr-2">{value || '...'}</p>
      </div>
    </div>
  );
}
