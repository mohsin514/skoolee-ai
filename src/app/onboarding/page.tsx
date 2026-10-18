'use client'

import { Button, buttonVariants } from "@/components/ui/button";
import { clearDeviceDrafts } from "@/lib/drafts/store";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import { InputGroup, FieldAction } from "@/components/ui/input-group";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Building, GraduationCap, MapPin, Plus, CheckCircle2, ChevronRight, ChevronLeft, Loader2,
  Hash, Trash2, LucideIcon, LogOut, Phone, School, Users, Globe, Mail, Upload, ImageIcon,
  CalendarDays, Tag, UserRound, CalendarRange, Clock, Sparkles, AlertCircle, RefreshCw, Pencil,
  Package, Layers, ClipboardCheck, UserPlus, ShieldCheck, Lock,
} from 'lucide-react';
import Link from "next/link";
import {
  assignOnboardingDelegate,
  finishOnboarding,
  getOnboardingSession,
  revokeOnboardingDelegate,
  saveOnboardingStep,
} from '@/app/actions/completeOnboarding';
import type { SetupView } from "@/lib/onboarding/setup-service";
import {
  campusesForCompletion,
  reachableSteps,
  resumeStep,
  setupFlow,
  splitByCapacity,
  unresolvedOptionalWork,
  validateCampusDraft,
  validateStep,
  type AdoptionMode,
  type CampusDraft,
  type InstitutionType,
  type SchoolDraft,
  type SetupDraft,
  type SetupStepId,
  type StepErrors,
} from "@/lib/onboarding/setup-state";
import { logout } from '@/app/actions/auth/logout';
import { toast } from "@/components/ui/toast";
import { EXAM_BOARDS, DEFAULT_EXAM_BOARD } from '@/config/boards';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardPathForRole } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select as SystemSelect } from "@/components/ui/select";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";
import { fill, isRtlLanguage, onboardingCopy, type OnboardingCopy } from "./copy";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";

/** Wizard strings that the shared setup copy does not carry yet (English, Arabic, Urdu). */
const LOCAL_COPY = {
  en: {
    loadFailedTitle: "Setup could not be loaded",
    noCampusesHint: "Use the form to add your first campus. Each campus is saved as soon as you add it.",
    sessionStartHint: "Leave empty to start the session on the day you activate setup.",
    contactEmailHint: "Set when the institution was registered. It cannot be changed here.",
    logoUploadFailed: "The logo could not be uploaded. Check your connection and try again.",
  },
  ar: {
    loadFailedTitle: "تعذر تحميل الإعداد",
    noCampusesHint: "استخدم النموذج لإضافة أول فرع. يُحفظ كل فرع فور إضافته.",
    sessionStartHint: "اتركه فارغًا لتبدأ الجلسة يوم تفعيل الإعداد.",
    contactEmailHint: "حُدد عند تسجيل المؤسسة ولا يمكن تغييره هنا.",
    logoUploadFailed: "تعذر رفع الشعار. تحقق من اتصالك وحاول مرة أخرى.",
  },
  ur: {
    loadFailedTitle: "سیٹ اپ لوڈ نہیں ہو سکا",
    noCampusesHint: "پہلا کیمپس شامل کرنے کے لیے فارم استعمال کریں۔ ہر کیمپس شامل کرتے ہی محفوظ ہو جاتا ہے۔",
    sessionStartHint: "خالی چھوڑ دیں تو سیشن سیٹ اپ فعال کرنے کے دن سے شروع ہو گا۔",
    contactEmailHint: "یہ ادارے کی رجسٹریشن کے وقت طے ہوا تھا اور یہاں تبدیل نہیں ہو سکتا۔",
    logoUploadFailed: "لوگو اپ لوڈ نہیں ہو سکا۔ اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں۔",
  },
} as const;

function localCopy(language: string | null | undefined) {
  const code = (language || "en").slice(0, 2).toLowerCase();
  return LOCAL_COPY[code === "ar" ? "ar" : code === "ur" ? "ur" : "en"];
}

// ─────────────────────────────────────────────────────────────────
// The wizard renders the server's setup state (SKO-391). Every Continue
// saves to the institution's setup record, so progress follows the owner
// across sign-out, devices, checkout and an authorised handover. The step
// list comes from the saved institution *type*, never from the role.
// ─────────────────────────────────────────────────────────────────

const STEP_ICONS: Record<SetupStepId, LucideIcon> = {
  structure: Layers, identity: Building, package: Package, campuses: Users, academic: CalendarRange, review: ClipboardCheck,
};

/** ISO weekday numbering — 1 = Monday … 7 = Sunday, matching the Weekend model. */
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7];

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
const sessionLabelFor = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

type CampusForm = Omit<CampusDraft, "key">;
const emptyCampus = (): CampusForm => ({
  name: '', city: '', address: '', phone: '', email: '', website: '', principalName: '',
  regId: generateId('BR'), autoId: true, board: DEFAULT_EXAM_BOARD,
});

function weekdayName(day: number, language: string, style: "short" | "long") {
  // 2024-01-01 is a Monday; ISO 1 = Monday.
  const date = new Date(Date.UTC(2024, 0, day));
  return new Intl.DateTimeFormat(language, { weekday: style, timeZone: "UTC" }).format(date);
}

type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "noAccess" } | { kind: "error" };

export default function OnboardingWizard() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [view, setView] = useState<SetupView | null>(null);
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [type, setType] = useState<InstitutionType>("STANDALONE");
  const [mode, setMode] = useState<AdoptionMode | null>(null);
  const [step, setStep] = useState<SetupStepId>("structure");
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [errors, setErrors] = useState<StepErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ activated: number; drafts: number } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [newCampus, setNewCampus] = useState<CampusForm>(emptyCampus);
  const [campusErrors, setCampusErrors] = useState<StepErrors>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [campusToDelete, setCampusToDelete] = useState<CampusDraft | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const [savingCampus, setSavingCampus] = useState(false);

  const language = view?.language || "en";
  const t = onboardingCopy(language);
  const local = localCopy(language);
  const rtl = isRtlLanguage(language);

  const applyView = useCallback((next: SetupView, requested?: string | null) => {
    setView(next);
    const nextDraft = { ...next.draft, school: { ...next.draft.school } };
    // The browser's zone is only an opening guess for a brand-new setup.
    if (!nextDraft.school.timezone) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      nextDraft.school.timezone = TIMEZONES.some((z) => z.value === detected) ? detected : "Asia/Karachi";
    }
    setDraft(nextDraft);
    setType(next.institutionType);
    setMode(next.adoptionMode);
    setStep(resumeStep(next.flow, next.completedSteps, next.currentStep, requested));
  }, []);

  const reload = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const res = await getOnboardingSession();
      if ("view" in res) {
        applyView(res.view, new URLSearchParams(window.location.search).get("step"));
        setLoad({ kind: "ready" });
      } else if ("redirect" in res) {
        window.location.replace(dashboardPathForRole(res.role));
      } else if ("signedOut" in res) {
        window.location.replace("/login");
      } else if ("noAccess" in res) {
        setLoad({ kind: "noAccess" });
      } else {
        setLoad({ kind: "error" });
      }
    } catch {
      setLoad({ kind: "error" });
    }
  }, [applyView]);

  useEffect(() => { void reload(); }, [reload]);

  const flow = useMemo(() => setupFlow(type), [type]);
  const completed = view?.completedSteps ?? [];
  const reachable = useMemo(() => reachableSteps(flow, completed), [flow, completed]);
  const stepIndex = Math.max(0, flow.indexOf(step));
  const progress = ((stepIndex + 1) / flow.length) * 100;

  // Local edits not yet acknowledged by the server.
  const dirty = Boolean(view && draft) && JSON.stringify({ draft, type, mode }) !== JSON.stringify({ draft: view!.draft, type: view!.institutionType, mode: view!.adoptionMode });
  useUnsavedGuard(dirty && !success);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => { if (hasErrors) summaryRef.current?.focus(); }, [hasErrors, errors]);

  const setSchool = (patch: Partial<SchoolDraft>) => setDraft((prev) => prev ? { ...prev, school: { ...prev.school, ...patch } } : prev);

  /** Saves to the institution's setup record. Returns the acknowledged state or null. */
  const persist = async (opts: { step: SetupStepId; complete: boolean; nextStep?: SetupStepId; draft?: SetupDraft; type?: InstitutionType; mode?: AdoptionMode | null }) => {
    if (!view || !draft) return null;
    setSaving(true);
    setBanner(null);
    try {
      const res = await saveOnboardingStep({
        expectedVersion: view.version,
        step: opts.step,
        complete: opts.complete,
        nextStep: opts.nextStep,
        institutionType: opts.type ?? type,
        adoptionMode: opts.mode === undefined ? mode : opts.mode,
        draft: opts.draft ?? draft,
      });
      if (res.ok) {
        applyView(res.view, opts.nextStep ?? opts.step);
        setErrors({});
        return res.view;
      }
      if (res.errors) setErrors(res.errors);
      if (res.view) { applyView(res.view); setBanner(t.conflict); }
      else setBanner(res.denied ? t.denied : res.message);
      return null;
    } catch {
      setBanner(t.loadFailed);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const continueFrom = async (current: SetupStepId) => {
    if (!draft) return;
    const local = validateStep(current, { institutionType: type, adoptionMode: mode, draft });
    if (Object.keys(local).length) { setErrors(local); return; }
    const next = flow[flow.indexOf(current) + 1];
    await persist({ step: current, complete: true, nextStep: next });
  };

  const goTo = async (target: SetupStepId) => {
    if (!reachable.includes(target) || target === step) return;
    setErrors({});
    if (dirty) await persist({ step, complete: false, nextStep: target });
    else setStep(target);
  };

  const goBack = () => { if (stepIndex > 0) void goTo(flow[stepIndex - 1]); };

  const handleLogout = async () => {
    clearDeviceDrafts();
    await logout();
    // A full-document navigation discards the client router cache, so Back
    // cannot repaint this half-finished setup after sign-out.
    window.location.href = '/login';
  };

  const saveAndExit = async () => {
    if (dirty) {
      const saved = await persist({ step, complete: false });
      if (!saved) return;
    }
    await handleLogout();
  };

  const handleLogoFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t.logoType); return; }
    if (file.size > 1_500_000) { toast.error(t.logoSize); return; }
    setLogoUploading(true);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "school-logo", fileName: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData?.data?.key || !presignData?.data?.uploadUrl) throw new Error(presignData?.error || "Could not prepare upload");
      const { key, uploadUrl } = presignData.data;
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Upload failed");
      setSchool({ logoUrl: key });
      toast.success(t.logoUploaded);
    } catch {
      // The presign/storage reply is technical; say what happened and what to do.
      toast.error(local.logoUploadFailed);
    } finally {
      setLogoUploading(false);
    }
  };

  // ── Campus drafts (group only). Each change is saved at once so a draft is never lost. ──
  const saveCampus = async () => {
    if (!draft) return;
    const key = editingKey ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : generateId("campus"));
    const candidate: CampusDraft = { ...newCampus, key };
    const problems = validateCampusDraft(candidate, draft.campuses);
    setCampusErrors(problems);
    if (Object.keys(problems).length) return;
    const campuses = editingKey ? draft.campuses.map((c) => (c.key === editingKey ? candidate : c)) : [...draft.campuses, candidate];
    const nextDraft = { ...draft, campuses };
    setSavingCampus(true);
    const saved = await persist({ step: "campuses", complete: false, draft: nextDraft }).finally(() => setSavingCampus(false));
    if (!saved) return;
    const index = campuses.findIndex((c) => c.key === key);
    const overLimitNow = saved.plan.maxCampuses >= 0 && index + 1 > saved.plan.maxCampuses;
    if (overLimitNow && !editingKey) toast.warning(fill(t.draftCampusNote, candidate.name));
    else toast.success(fill(t.campusSaved, candidate.name));
    setEditingKey(null);
    setNewCampus(emptyCampus());
  };

  const editCampus = (campus: CampusDraft) => {
    const { key, ...rest } = campus;
    setNewCampus(rest);
    setEditingKey(key);
    setCampusErrors({});
    document.getElementById("field-campusName")?.focus();
  };

  const confirmDeleteCampus = async () => {
    if (!draft || !campusToDelete) return;
    const removed = campusToDelete;
    setCampusToDelete(null);
    const saved = await persist({ step: "campuses", complete: false, draft: { ...draft, campuses: draft.campuses.filter((c) => c.key !== removed.key) } });
    if (saved) toast.success(fill(t.campusDeleted, removed.name));
  };

  const handleActivate = async () => {
    if (!view) return;
    let version = view.version;
    if (dirty) {
      const saved = await persist({ step: "review", complete: false });
      if (!saved) return;
      version = saved.version;
    }
    setActivating(true);
    setBanner(null);
    try {
      const res = await finishOnboarding(version);
      if (res.success) {
        setSuccess({ activated: res.activated, drafts: res.drafts });
        // Setup leads continue on the readiness home (SKO-397), which links on to guided AI setup.
        const target = "/setup/readiness";
        setTimeout(() => { window.location.href = target; }, 1200);
        return;
      }
      if (res.errors) setErrors(res.errors);
      if (res.view) applyView(res.view, "review");
      if (!res.view && !res.errors) setBanner(res.denied ? t.denied : res.message);
    } catch {
      setBanner(t.loadFailed);
    } finally {
      setActivating(false);
    }
  };

  // ── Loading / no-access / error states ──
  if (load.kind === "loading" || (load.kind === "ready" && (!view || !draft))) {
    // The wizard's own shape (step rail + step card), so nothing jumps when the saved setup lands.
    return (
      <div className="min-h-screen w-full lg:flex" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{t.loading}</span>
        <div aria-hidden="true" className="hidden w-72 shrink-0 flex-col gap-4 border-e border-edge/30 bg-white/50 p-8 lg:flex">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-1.5 w-full rounded-full" />
          {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} delay={index * 60} className="h-16 w-full rounded-2xl" />)}
        </div>
        <div aria-hidden="true" className="flex-1 p-4 md:p-10">
          <div className="mx-auto w-full max-w-4xl space-y-5">
            <Skeleton className="h-1.5 w-full rounded-full lg:hidden" />
            <div className="sk-panel animate-skeleton-in p-5 md:p-10">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 shrink-0 rounded-2xl md:h-14 md:w-14" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-7 w-2/3 max-w-xs" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((index) => <Skeleton key={index} delay={index * 60} className="h-24 w-full rounded-2xl" />)}
              </div>
              <div className="mt-8 flex justify-end">
                <Skeleton className="h-11 w-36 rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (load.kind === "noAccess" || load.kind === "error") {
    const pageLanguage = typeof document !== "undefined" ? document.documentElement.lang : "en";
    const copy = onboardingCopy(pageLanguage);
    if (load.kind === "error") {
      return (
        <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
          <ErrorState
            variant="page"
            className="sk-enter-scale shadow-lg"
            title={localCopy(pageLanguage).loadFailedTitle}
            description={copy.loadFailed}
            onRetry={() => void reload()}
            retryLabel={copy.retry}
            action={<Button variant="outline" onClick={handleLogout}><LogOut aria-hidden="true" className="h-4 w-4" /> {copy.signOut}</Button>}
          />
        </main>
      );
    }
    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
        <div className="sk-panel sk-enter-scale max-w-md w-full px-6 py-10 sm:px-10 space-y-4 text-center shadow-lg">
          <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-2xl border border-status-brand-border bg-status-brand-surface text-primary shadow-sm">
            <Lock className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-ink-strong">{copy.noAccessTitle}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">{copy.noAccessBody}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button variant="outline" onClick={handleLogout}><LogOut aria-hidden="true" className="h-4 w-4" /> {copy.signOut}</Button>
          </div>
        </div>
      </main>
    );
  }

  const v = view!;
  const d = draft!;
  const s = d.school;
  const isGroup = type === "GROUP";
  const limit = v.plan.maxCampuses;
  const planned = campusesForCompletion(type, d);
  const split = splitByCapacity(planned, limit);
  const overLimit = split.drafts.length > 0;
  const comparePackagesHref = `/onboarding/package?returnStep=${encodeURIComponent(step)}&campuses=${Math.max(1, planned.length)}`;
  const offDays = WEEK_DAYS.filter((day) => s.weekends.includes(day));
  const workingDays = WEEK_DAYS.filter((day) => !s.weekends.includes(day));
  const thisYear = new Date().getFullYear();
  const typeChanged = type !== v.institutionType;
  const failed = v.status === "FAILED" && v.lastError;
  const listSeparator = rtl ? "، " : ", ";

  const toggleWorkingDay = (day: number) => {
    const closed = s.weekends.includes(day);
    const next = closed ? s.weekends.filter((x) => x !== day) : [...s.weekends, day].sort((a, b) => a - b);
    if (next.length >= 7) { toast.error(t.errors["weekends.allClosed"]); return; }
    setSchool({ weekends: next });
  };

  const setAcademicYear = (raw: string) => {
    const year = raw.replace(/[^\d]/g, '').slice(0, 4);
    const numeric = Number(year);
    // Keep the label in step with the year while it still looks auto-derived.
    const labelWasDerived = s.sessionLabel === sessionLabelFor(Number(s.academicYear));
    setSchool({ academicYear: year, sessionLabel: labelWasDerived && numeric >= 2000 ? sessionLabelFor(numeric) : s.sessionLabel });
  };

  const errorEntries = Object.entries(errors);
  const focusError = (field: string) => {
    const campusKey = field.startsWith("campus:") ? field.slice(7) : null;
    const target = campusKey ? document.getElementById(`campus-${campusKey}`) : document.getElementById(`field-${field}`);
    target?.focus();
    target?.scrollIntoView({ block: "center" });
  };

  return (
    <div lang={language} dir={rtl ? "rtl" : "ltr"} className="min-h-screen flex font-sans text-ink-strong selection:bg-primary/30">

      {/* ─── SIDEBAR (desktop) ─── */}
      <aside className="w-72 bg-white/50 backdrop-blur-md border-e border-edge/30 hidden lg:flex flex-col p-8 fixed h-full z-50 overflow-y-auto">
        <div className="mb-8">
          <SkooleeLogo size="1.4rem" />
          <p className="sk-eyebrow mt-1.5">{t.wizard}</p>
        </div>
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="sk-eyebrow">{fill(t.stepOf, stepIndex + 1, flow.length)}</span>
            <span className="text-2xs font-bold tabular-nums text-primary" aria-hidden="true">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} size="sm" label={t.wizard} valueText={fill(t.stepOf, stepIndex + 1, flow.length)} />
        </div>
        <nav aria-label={t.wizard}>
          <ol className="flex-1 space-y-2">
            {flow.map((id, i) => (
              <li key={id}>
                <StepNav
                  t={t}
                  icon={STEP_ICONS[id]}
                  active={step === id}
                  done={completed.includes(id)}
                  num={i + 1}
                  title={t.steps[id].title}
                  desc={t.steps[id].desc}
                  disabled={!reachable.includes(id) || saving}
                  onClick={() => void goTo(id)}
                />
              </li>
            ))}
          </ol>
        </nav>
        <Button variant="ghost" onClick={handleLogout} className="mt-auto w-full justify-start gap-3 text-ink-muted">
          <LogOut aria-hidden="true" className="w-5 h-5 rtl:rotate-180" /> <span>{t.signOut}</span>
        </Button>
      </aside>

      <main className="flex-1 lg:ms-72 min-h-screen min-w-0 flex flex-col bg-brand-50/50">
        {/* ─── MOBILE STEP BAR ─── */}
        <div className="lg:hidden px-4 pt-5 pb-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <SkooleeLogo size="1.2rem" />
            <span className="sk-eyebrow">{fill(t.stepOf, stepIndex + 1, flow.length)}</span>
          </div>
          <Progress value={progress} size="sm" label={t.wizard} valueText={fill(t.stepOf, stepIndex + 1, flow.length)} className="mb-3" />
          <nav aria-label={t.wizard}>
            <ol className="flex items-center gap-2 overflow-x-auto pb-1">
              {flow.map((id) => (
                <li key={id} className="relative shrink-0">
                  <Button variant="choice" size="sm" type="button"
                    aria-current={step === id ? "step" : undefined}
                    disabled={!reachable.includes(id) || saving}
                    onClick={() => void goTo(id)}
                    className="rounded-full"
                  >
                    {completed.includes(id) ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
                    {t.steps[id].title}
                    <span className="sr-only">({completed.includes(id) ? t.stepState.done : step === id ? t.stepState.current : reachable.includes(id) ? "" : t.stepState.locked})</span>
                  </Button>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <header className="px-4 md:px-10 py-4 flex flex-wrap items-center justify-between gap-3 bg-white/50 backdrop-blur-md sticky top-0 z-40 border-b border-edge/10">
          {/* Structure stays visible for the whole journey. */}
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-primary" data-testid="structure-summary">
            <School className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t.types[type].short}{mode ? ` · ${t.modes[mode].short}` : ""}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle" role="status" aria-live="polite">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" /> {t.saving}</> : !dirty ? <><CheckCircle2 className="h-3.5 w-3.5 text-status-success-text" aria-hidden="true" /> {t.savedAt}</> : null}
            </span>
            <Button variant="outline" size="sm" onClick={() => void saveAndExit()} disabled={saving || activating}>{t.saveExit}</Button>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={handleLogout}>{t.signOut}</Button>
          </div>
        </header>

        <div className="p-4 md:p-10 flex-1 flex flex-col items-center">
          <div className="w-full max-w-4xl space-y-5">
            {v.actor.kind === "delegate" && (
              <Alert tone="info" icon={ShieldCheck} live="off" role="note">
                {t.delegateBanner} {v.actor.canPurchase ? t.delegateBannerBuy : t.delegateBannerNoBuy}
              </Alert>
            )}
            {banner && (
              <Alert tone="warning" live="assertive">{banner}</Alert>
            )}
            {errorEntries.length > 0 && (
              <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="sk-enter rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-status-error-text shadow-xs">
                <p id="error-summary-title" className="flex items-center gap-2 text-sm font-semibold"><AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />{t.errorSummary(errorEntries.length)}</p>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {errorEntries.map(([field, code]) => (
                    <li key={field}>
                      <Button variant="ghost" type="button" onClick={() => focusError(field)} className="-mx-2 min-h-10 justify-start px-2 text-start text-sm font-medium text-status-error-text underline underline-offset-2">
                        {field.startsWith("campus:") ? `${d.campuses.find((c) => `campus:${c.key}` === field)?.name || t.campusName}: ` : ""}{t.errors[code] ?? code}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ═══ STEP: Institution type & adoption mode ═══ */}
            {step === 'structure' && (
              <section className="sk-panel sk-rise p-5 md:p-10 space-y-8" aria-labelledby="step-heading">
                <StepHeading refEl={headingRef} icon={Layers} title={t.structureTitle} intro={t.structureIntro} />
                <fieldset className="space-y-3" id="field-adoptionMode" tabIndex={-1}>
                  <legend className="mb-3 text-base font-bold text-ink-strong">{t.modeQuestion}</legend>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(["EXAM_STUDIO", "FULL_OPERATIONS"] as const).map((option) => (
                      <ChoiceCard key={option} name="adoptionMode" checked={mode === option} onSelect={() => { setMode(option); setErrors({}); }}
                        title={t.modes[option].label} desc={t.modes[option].desc} />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="mb-3 text-base font-bold text-ink-strong">{t.typeQuestion}</legend>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(["STANDALONE", "GROUP"] as const).map((option) => (
                      <ChoiceCard key={option} name="institutionType" checked={type === option} onSelect={() => setType(option)}
                        title={t.types[option].label} desc={t.types[option].example} />
                    ))}
                  </div>
                </fieldset>
                {typeChanged && (
                  <Alert tone="info" title={fill(t.shapePreviewTitle, t.types[type].label)} className="sk-enter" data-testid="shape-preview">
                    <div className="space-y-1 text-ink-muted">
                      <p>{type === "STANDALONE" ? fill(t.shapeToStandalone, d.campuses.length) : t.shapeToGroup}</p>
                      <p>{fill(t.shapeCapacity, t.campusCount(limit))}</p>
                      <p>{t.shapeReopen}</p>
                    </div>
                  </Alert>
                )}
                <StepActions t={t} onContinue={() => void continueFrom("structure")} busy={saving} />
              </section>
            )}

            {/* ═══ STEP: Institution details ═══ */}
            {step === 'identity' && (
              <section className="sk-panel sk-rise p-5 md:p-10" aria-labelledby="step-heading">
                <StepHeading refEl={headingRef} icon={Building} title={isGroup ? t.identityTitleGroup : t.identityTitleSchool} intro={isGroup ? t.identityIntroGroup : t.identityIntroSchool} />
                <div className="grid md:grid-cols-2 gap-8 mt-8">
                  <div className="space-y-5">
                    <div className="bg-white rounded-3xl border-2 border-dashed border-primary/25 p-5 flex flex-col items-start gap-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center">
                      <div className="w-16 h-16 rounded-2xl bg-brand-50 overflow-hidden flex items-center justify-center shrink-0 shadow-xs ring-1 ring-border-subtle">
                        {resolveMediaUrl(s.logoUrl)
                          ? <Image src={resolveMediaUrl(s.logoUrl)!} alt={t.logo} width={64} height={64} className="w-full h-full object-cover" unoptimized />
                          : <ImageIcon className="w-7 h-7 text-primary/40" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-strong mb-1">{t.logo} <span className="text-xs font-normal text-ink-subtle">({t.optional})</span></p>
                        <p className="text-xs leading-relaxed text-ink-subtle mb-3">{t.logoHint}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label aria-busy={logoUploading || undefined} className={buttonVariants({ size: "sm", className: logoUploading ? "cursor-wait opacity-60" : "cursor-pointer" })}>
                            {logoUploading ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Upload aria-hidden="true" className="w-4 h-4" />}
                            {logoUploading ? t.uploading : t.chooseLogo}
                            <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleLogoFile(e.target.files?.[0])} disabled={logoUploading} />
                          </label>
                          {s.logoUrl && <Button variant="outline" size="sm" onClick={() => setSchool({ logoUrl: "" })} disabled={logoUploading}>{t.remove}</Button>}
                        </div>
                      </div>
                    </div>
                    <InputField field="name" error={errors.name && t.errors[errors.name]} label={isGroup ? t.groupName : t.schoolName} value={s.name} onChange={(val) => setSchool({ name: val })} placeholder="Horizon Academy" icon={GraduationCap} required />
                    <InputField field="tagline" label={t.tagline} value={s.tagline} onChange={(val) => setSchool({ tagline: val })} placeholder={t.optional} icon={Tag} />
                    <InputField field="city" error={errors.city && t.errors[errors.city]} label={t.city} value={s.city} onChange={(val) => setSchool({ city: val })} placeholder="Lahore" icon={MapPin} required />
                    <InputField field="address" label={t.address} value={s.address} onChange={(val) => setSchool({ address: val })} placeholder={t.optional} icon={MapPin} isArea />
                  </div>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField field="phone" error={errors.phone && t.errors[errors.phone]} label={t.phone} value={s.phone} onChange={(val) => setSchool({ phone: val.replace(/[^\d\s+\-()]/g, '') })} placeholder="+92 300 0000000" icon={Phone} type="tel" />
                      <InputField field="establishedYear" error={errors.establishedYear && t.errors[errors.establishedYear]} label={t.established} value={s.establishedYear} onChange={(val) => setSchool({ establishedYear: val.replace(/[^\d]/g, '').slice(0, 4) })} placeholder="1998" icon={CalendarDays} inputMode="numeric" />
                    </div>
                    <InputField field="website" label={t.website} value={s.website} onChange={(val) => setSchool({ website: val })} placeholder="www.school.edu.pk" icon={Globe} type="url" />
                    <InputField field="email" label={t.contactEmail} value={s.email} onChange={() => undefined} placeholder="" icon={Mail} type="email" readonly hint={local.contactEmailHint} />
                    <div className="bg-surface-subtle p-5 rounded-3xl border border-border-subtle">
                      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                        <Label htmlFor="field-regId" className="text-sm font-semibold text-ink-strong">{isGroup ? t.schoolId : t.campusId}</Label>
                        <div className="bg-white rounded-xl p-1 flex gap-1 border border-border-subtle shadow-xs" role="group" aria-label={isGroup ? t.schoolId : t.campusId}>
                          <Button size="sm" aria-pressed={isGroup ? s.autoId : s.primaryCampusAutoId} variant="choice" onClick={() => isGroup ? setSchool({ autoId: true, regId: generateId('SKL') }) : setSchool({ primaryCampusAutoId: true, primaryCampusRegId: generateId('BR') })}>{t.auto}</Button>
                          <Button size="sm" aria-pressed={isGroup ? !s.autoId : !s.primaryCampusAutoId} variant="choice" onClick={() => isGroup ? setSchool({ autoId: false }) : setSchool({ primaryCampusAutoId: false })}>{t.manual}</Button>
                        </div>
                      </div>
                      <Input id="field-regId" dir="ltr" aria-invalid={!!errors.regId} aria-describedby={errors.regId ? "regId-hint field-regId-error" : "regId-hint"}
                        value={isGroup ? s.regId : s.primaryCampusRegId}
                        onChange={(e) => isGroup ? setSchool({ regId: e.target.value.toUpperCase() }) : setSchool({ primaryCampusRegId: e.target.value.toUpperCase() })}
                        readOnly={isGroup ? s.autoId : s.primaryCampusAutoId}
                        className="text-center font-mono tabular-nums" />
                      <p id="regId-hint" className="text-xs leading-relaxed text-ink-subtle mt-3">{isGroup ? t.idHintGroup : t.idHintCampus}</p>
                      {errors.regId && <FieldError id="field-regId-error">{t.errors[errors.regId]}</FieldError>}
                    </div>
                    {!isGroup && (
                      <Alert tone="success" live="off">{t.primaryCampusNote}</Alert>
                    )}
                  </div>
                </div>
                <StepActions t={t} onBack={goBack} onContinue={() => void continueFrom("identity")} busy={saving} />
              </section>
            )}

            {/* ═══ STEP: Package ═══ */}
            {step === 'package' && (
              <section className="sk-panel sk-rise p-5 md:p-10 space-y-6" aria-labelledby="step-heading">
                <StepHeading refEl={headingRef} icon={Package} title={t.packageTitle} intro={t.packageIntro} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryItem icon={Package} label={t.currentPackage} value={v.plan.name} />
                  <SummaryItem icon={Building} label={t.activatedCapacity} value={fill(t.covers, t.campusCount(limit))} />
                  <SummaryItem icon={Users} label={t.campuses} value={fill(t.planned, planned.length)} />
                </div>
                {overLimit && (
                  <Alert tone="warning">{fill(t.overLimit, split.drafts.length)}</Alert>
                )}
                <p className="text-sm leading-relaxed text-ink-muted">{v.actor.canPurchase ? t.noPaymentNeeded : t.purchaseNotDelegated}</p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" onClick={goBack} className="gap-2"><ChevronLeft aria-hidden="true" className="w-4 h-4 rtl:rotate-180" /> {t.back}</Button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {v.actor.canPurchase && (
                      <Link href={comparePackagesHref} className={buttonVariants({ variant: "outline" })}>{t.comparePackages}</Link>
                    )}
                    <Button variant="dark" onClick={() => void continueFrom("package")} disabled={saving} loading={saving} className="sk-nudge-trigger gap-2">
                      {fill(t.continueWith, v.plan.name)} <ForwardArrow />
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {/* ═══ STEP: Campuses (group only) ═══ */}
            {step === 'campuses' && (
              <section className="grid lg:grid-cols-5 gap-6" aria-labelledby="step-heading">
                <div className="lg:col-span-3 space-y-5">
                  <div className="sk-panel sk-rise p-5 md:p-8">
                    <StepHeading refEl={headingRef} icon={Building} title={editingKey ? t.editCampus : t.campusesTitle} intro={t.campusesIntro} />
                    <div className="space-y-4 mt-6">
                      <InputField field="campusName" error={campusErrors.campusName && t.errors[campusErrors.campusName]} label={t.campusName} value={newCampus.name} onChange={(val) => setNewCampus({ ...newCampus, name: val })} placeholder="North Campus" icon={Building} required />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputField field="campusCity" error={campusErrors.campusCity && t.errors[campusErrors.campusCity]} label={t.city} value={newCampus.city} onChange={(val) => setNewCampus({ ...newCampus, city: val })} placeholder="Lahore" icon={MapPin} required />
                        <InputField field="campusPhone" error={campusErrors.campusPhone && t.errors[campusErrors.campusPhone]} label={t.phone} value={newCampus.phone} onChange={(val) => setNewCampus({ ...newCampus, phone: val })} placeholder="+92 42 0000000" icon={Phone} type="tel" />
                      </div>
                      <InputField field="campusAddress" label={t.address} value={newCampus.address} onChange={(val) => setNewCampus({ ...newCampus, address: val })} placeholder={t.optional} icon={MapPin} isArea />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputField field="campusEmail" error={campusErrors.campusEmail && t.errors[campusErrors.campusEmail]} label={t.campusEmail} value={newCampus.email} onChange={(val) => setNewCampus({ ...newCampus, email: val })} placeholder="campus@school.edu.pk" icon={Mail} type="email" />
                        <InputField field="campusPrincipal" label={t.headOfCampus} value={newCampus.principalName} onChange={(val) => setNewCampus({ ...newCampus, principalName: val })} placeholder={t.optional} icon={UserRound} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                        <div className="space-y-1.5">
                          <Label htmlFor="field-campusBoard" className="sk-field-label">{t.board}</Label>
                          <InputGroup className="min-w-0">
                            <GraduationCap data-field-affix="start" className="h-4 w-4" />
                            <SystemSelect id="field-campusBoard" value={newCampus.board || DEFAULT_EXAM_BOARD} onChange={(e) => setNewCampus({ ...newCampus, board: e.target.value })} className="w-full">
                              {EXAM_BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
                            </SystemSelect>
                          </InputGroup>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap justify-between items-center gap-2">
                            <Label htmlFor="field-campusRegId" className="sk-field-label">{t.campusId}</Label>
                            <div className="flex gap-1" role="group" aria-label={t.campusId}>
                              <Button size="sm" aria-pressed={newCampus.autoId} variant="choice" onClick={() => setNewCampus({ ...newCampus, autoId: true, regId: generateId('BR') })}>{t.auto}</Button>
                              <Button size="sm" aria-pressed={!newCampus.autoId} variant="choice" onClick={() => setNewCampus({ ...newCampus, autoId: false })}>{t.manual}</Button>
                            </div>
                          </div>
                          <Input id="field-campusRegId" dir="ltr" aria-invalid={!!campusErrors.campusRegId} aria-describedby={campusErrors.campusRegId ? "field-campusRegId-error" : undefined} value={newCampus.regId} readOnly={newCampus.autoId}
                            onChange={(e) => setNewCampus({ ...newCampus, regId: e.target.value.toUpperCase() })} placeholder="BR-XXXX" className="text-center font-mono tabular-nums" />
                          {campusErrors.campusRegId && <FieldError id="field-campusRegId-error">{t.errors[campusErrors.campusRegId]}</FieldError>}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        {editingKey && <Button variant="secondary" onClick={() => { setEditingKey(null); setNewCampus(emptyCampus()); setCampusErrors({}); }}>{t.cancel}</Button>}
                        <Button onClick={() => void saveCampus()} disabled={saving} loading={savingCampus} className="gap-2">
                          {!savingCampus && (editingKey ? <CheckCircle2 aria-hidden="true" className="w-4 h-4" /> : <Plus aria-hidden="true" className="w-4 h-4" />)}
                          {editingKey ? t.updateCampus : t.addCampus}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <StepActions t={t} onBack={goBack} onContinue={() => void continueFrom("campuses")} busy={saving} disabled={d.campuses.length === 0} disabledReason={t.errors["campuses.required"]} />
                </div>

                <div className="lg:col-span-2">
                  <div className="sk-panel sk-rise p-5 md:p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-subtle gap-2">
                      <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-ink-strong"><Users className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" /> {t.yourCampuses}</h2>
                      <Badge variant="secondary" size="sm" className="shrink-0 tabular-nums">{fill(t.added, d.campuses.length)}</Badge>
                    </div>
                    {overLimit && (
                      <Alert
                        tone="warning"
                        className="mb-4"
                        actions={v.actor.canPurchase ? <Link href={comparePackagesHref} className="sk-link text-sm">{t.comparePackages}</Link> : undefined}
                      >
                        {fill(t.overLimit, split.drafts.length)}
                      </Alert>
                    )}
                    <ul className="space-y-3" aria-label={t.yourCampuses}>
                      {d.campuses.map((c, i) => {
                        const isDraft = limit >= 0 && i >= limit;
                        return (
                          <li key={c.key} id={`campus-${c.key}`} tabIndex={-1} className={`sk-enter p-4 rounded-2xl border flex items-start justify-between gap-3 transition-colors ${editingKey === c.key ? 'bg-surface-selected' : 'bg-surface-subtle'} ${errors[`campus:${c.key}`] ? 'border-destructive' : editingKey === c.key ? 'border-primary/30' : 'border-border-subtle'}`}>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-strong leading-snug break-words">{c.name}</p>
                              <p className="text-xs text-ink-subtle mt-1 break-words"><span>{c.city}</span> · <bdi dir="ltr" className="font-mono">{c.regId}</bdi></p>
                              <Badge variant={isDraft ? "warning" : "success"} size="sm" dot className="mt-2">{isDraft ? t.draftBadge : t.activateBadge}</Badge>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <IconButton variant="secondary" label={`${t.editCampus}: ${c.name}`} onClick={() => editCampus(c)} disabled={editingKey === c.key}><Pencil aria-hidden="true" /></IconButton>
                              <IconButton variant="outline" label={`${t.deleteCampus}: ${c.name}`} onClick={() => setCampusToDelete(c)} className="actionable-hover:border-status-error-border actionable-hover:text-destructive"><Trash2 aria-hidden="true" /></IconButton>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {d.campuses.length === 0 && (
                      <EmptyState size="sm" icon={Building} title={t.noCampuses} description={local.noCampusesHint} />
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ═══ STEP: Academic defaults ═══ */}
            {step === 'academic' && (
              <section className="sk-panel sk-rise p-5 md:p-10" aria-labelledby="step-heading">
                <StepHeading refEl={headingRef} icon={CalendarRange} title={t.academicTitle} intro={t.academicIntro} />
                <div className="grid md:grid-cols-2 gap-8 mt-8">
                  <div className="space-y-5">
                    <h2 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Sparkles className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" /> {t.currentSession}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField field="academicYear" error={errors.academicYear && t.errors[errors.academicYear]} label={t.academicYear} value={s.academicYear} onChange={setAcademicYear} placeholder={String(thisYear)} icon={CalendarDays} inputMode="numeric" required />
                      <div className="space-y-1.5">
                        <Label htmlFor="field-sessionLabel" className="sk-field-label">{t.sessionName} <span className="text-destructive" aria-hidden="true">*</span></Label>
                        <InputGroup>
                          <Tag data-field-affix="start" className="h-4 w-4" />
                          <Input id="field-sessionLabel" aria-required aria-invalid={!!errors.sessionLabel} aria-describedby={errors.sessionLabel ? "field-sessionLabel-error" : undefined} value={s.sessionLabel} onChange={(e) => setSchool({ sessionLabel: e.target.value })} placeholder={sessionLabelFor(thisYear)} className="w-full" />
                          <Tooltip content={t.resetSessionName} describe={false}>
                            <FieldAction data-field-affix="end" type="button" aria-label={t.resetSessionName} onClick={() => setSchool({ sessionLabel: sessionLabelFor(Number(s.academicYear) || thisYear) })}>
                              <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
                            </FieldAction>
                          </Tooltip>
                        </InputGroup>
                        {errors.sessionLabel && <FieldError id="field-sessionLabel-error">{t.errors[errors.sessionLabel]}</FieldError>}
                      </div>
                    </div>
                    <Alert tone="info" live="off" className="text-xs">
                      {fill(t.sessionHint, sessionLabelFor(Number(s.academicYear) || thisYear), Number(s.academicYear) || thisYear)}
                    </Alert>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField field="sessionStart" label={t.sessionStarts} type="date" icon={CalendarDays} value={s.sessionStart} placeholder="" onChange={(val) => setSchool({ sessionStart: val })} hint={local.sessionStartHint} />
                      <InputField field="sessionEnd" error={errors.sessionEnd && t.errors[errors.sessionEnd]} label={t.sessionEnds} type="date" icon={CalendarDays} value={s.sessionEnd} placeholder="" onChange={(val) => setSchool({ sessionEnd: val })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="field-timezone" className="sk-field-label">{t.timezone}</Label>
                      <InputGroup className="min-w-0">
                        <Clock data-field-affix="start" className="h-4 w-4" />
                        <SystemSelect id="field-timezone" dir="ltr" value={s.timezone} onChange={(e) => setSchool({ timezone: e.target.value })} className="w-full" aria-describedby="timezone-hint">
                          {TIMEZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                        </SystemSelect>
                      </InputGroup>
                      <p id="timezone-hint" className="text-xs leading-relaxed text-ink-subtle">{t.timezoneHint}</p>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <h2 id="working-week-title" className="flex items-center gap-2 text-base font-bold text-ink-strong"><CalendarRange className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" /> {t.workingWeek}</h2>
                    <p id="working-week-hint" className="text-sm leading-relaxed text-ink-muted">{t.workingWeekHint}</p>
                    <div className="grid grid-cols-7 gap-1.5" id="field-weekends" tabIndex={-1} role="group" aria-labelledby="working-week-title" aria-describedby="working-week-hint">
                      {WEEK_DAYS.map((day) => {
                        const off = s.weekends.includes(day);
                        return (
                          <Button variant="choice" key={day} type="button" onClick={() => toggleWorkingDay(day)} aria-pressed={!off}
                            aria-label={`${weekdayName(day, language, "long")} — ${off ? t.dayClosed : t.dayWorking}`}
                            className="min-w-0 flex-col px-0.5 py-3">
                            <span className="max-w-full truncate text-2xs font-semibold">{weekdayName(day, language, "short")}</span>
                            <span className={`h-1.5 w-1.5 rounded-full ${off ? "bg-edge" : "bg-primary"}`} aria-hidden="true" />
                          </Button>
                        );
                      })}
                    </div>
                    <div className="rounded-3xl border border-border-subtle bg-surface-subtle p-5 space-y-2">
                      <p className="text-sm font-semibold tabular-nums text-primary">{t.workingDays(workingDays.length)}</p>
                      <p className="text-sm text-ink"><span className="font-semibold text-ink-strong">{t.open}:</span> {workingDays.map((day) => weekdayName(day, language, "short")).join(listSeparator) || "—"}</p>
                      <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">{t.closed}:</span> {offDays.map((day) => weekdayName(day, language, "long")).join(listSeparator) || t.noWeekend}</p>
                      <p className="border-t border-border-subtle pt-2 text-xs leading-relaxed text-ink-subtle">{t.appliedTo}</p>
                    </div>
                  </div>
                </div>
                <StepActions t={t} onBack={goBack} onContinue={() => void continueFrom("academic")} busy={saving} />
              </section>
            )}

            {/* ═══ STEP: Review & activate ═══ */}
            {step === 'review' && (
              <section className="space-y-5" aria-labelledby="step-heading">
                <div className="sk-panel sk-rise p-5 md:p-8 space-y-6">
                  <StepHeading refEl={headingRef} icon={ClipboardCheck} title={t.reviewTitle} intro={t.reviewIntro} />
                  {success && (
                    <Alert tone="success" title={t.successTitle} className="sk-enter">
                      {fill(t.successBody, success.activated, success.drafts)} {t.openingWorkspace}
                    </Alert>
                  )}
                  {failed && !success && (
                    <Alert
                      tone="danger"
                      title={t.failedTitle}
                      data-testid="setup-failure"
                      actions={v.failedStep && v.failedStep !== "review" && flow.includes(v.failedStep as SetupStepId) ? (
                        <Button variant="outline" size="sm" onClick={() => void goTo(v.failedStep as SetupStepId)}>{fill(t.goToStep, t.steps[v.failedStep as SetupStepId].title)}</Button>
                      ) : undefined}
                    >
                      <p>{v.lastError}</p>
                      <p className="mt-1 text-ink-muted">{t.failedBody}</p>
                    </Alert>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SummaryItem icon={Layers} label={t.institutionType} value={t.types[type].label} />
                    <SummaryItem icon={Sparkles} label={t.adoptionMode} value={mode ? t.modes[mode].short : "—"} />
                    <SummaryItem icon={Package} label={t.currentPackage} value={v.plan.name} />
                    <SummaryItem icon={Building} label={t.activatedCapacity} value={fill(t.capacityValue, split.activate.length, limit < 0 ? "∞" : limit)} />
                  </div>
                  <div>
                    <h2 className="mb-3 text-base font-bold text-ink-strong">{t.identity}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SummaryItem icon={Building} label={isGroup ? t.groupName : t.schoolName} value={s.name} />
                      <SummaryItem icon={Hash} label={isGroup ? t.schoolId : t.campusId} value={isGroup ? s.regId : s.primaryCampusRegId} ltr />
                      <SummaryItem icon={MapPin} label={t.city} value={s.city} />
                      <SummaryItem icon={Mail} label={t.contactEmail} value={s.email} ltr />
                    </div>
                  </div>
                  <div>
                    <h2 className="mb-3 text-base font-bold text-ink-strong">{t.academicDefaults}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SummaryItem icon={CalendarRange} label={t.session} value={`${s.sessionLabel} (${s.academicYear})`} ltr />
                      <SummaryItem icon={Clock} label={t.timezone} value={s.timezone} ltr />
                      <SummaryItem icon={CalendarDays} label={t.sessionDates} value={s.sessionStart ? `${s.sessionStart}${s.sessionEnd ? ` → ${s.sessionEnd}` : ''}` : t.startsToday} ltr={Boolean(s.sessionStart)} />
                      <SummaryItem icon={CheckCircle2} label={t.weeklyOff} value={offDays.map((day) => weekdayName(day, language, "short")).join(listSeparator) || t.none} />
                    </div>
                  </div>
                  <div>
                    <h2 className="mb-3 text-base font-bold text-ink-strong">{t.campuses}</h2>
                    <ul className="grid gap-2 sm:grid-cols-2" data-testid="review-campuses">
                      {planned.map((c, i) => {
                        const isDraft = i >= split.activate.length;
                        return (
                          <li key={c.key} className="flex items-start justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-strong break-words">{isGroup ? c.name : t.primaryCampus}</p>
                              <p className="mt-0.5 text-xs text-ink-subtle break-words">{c.city} · <bdi dir="ltr" className="font-mono">{c.regId}</bdi></p>
                            </div>
                            <Badge variant={isDraft ? "warning" : "success"} size="sm" dot className="shrink-0">{isDraft ? t.draftBadge : t.activateBadge}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-status-brand-border bg-status-brand-surface p-4">
                    <h2 className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink-strong"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> {t.authoritative}</h2>
                    <p className="text-sm leading-relaxed text-ink">{mode === "EXAM_STUDIO" ? t.authoritativeExam : t.authoritativeFull}</p>
                  </div>
                  <div>
                    <h2 className="mb-2 text-base font-bold text-ink-strong">{t.unresolved}</h2>
                    <ul className="list-disc ps-5 text-sm leading-relaxed text-ink-muted space-y-1 marker:text-primary" data-testid="optional-work">
                      {unresolvedOptionalWork(type, mode, d).map((key) => <li key={key}>{t.optionalWork[key]}</li>)}
                    </ul>
                  </div>
                </div>
                {overLimit && (
                  <Alert id="launch-capacity-note" tone="warning">
                    {fill(t.activateNote, split.activate.length, split.drafts.length)}
                  </Alert>
                )}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  <Button variant="outline" onClick={goBack} disabled={activating || Boolean(success)} className="gap-2"><ChevronLeft aria-hidden="true" className="w-4 h-4 rtl:rotate-180" /> {t.back}</Button>
                  {overLimit && v.actor.canPurchase && (
                    <Link href={comparePackagesHref} className={buttonVariants({ variant: "outline" })}>{t.changePackage}</Link>
                  )}
                  <Button size="lg" onClick={() => void handleActivate()} disabled={activating || saving || Boolean(success)} loading={activating} aria-describedby={overLimit ? "launch-capacity-note" : undefined} className="sk-nudge-trigger flex-1 gap-3">
                    {activating ? t.activating : <>{overLimit ? t.activateEligible : t.activate} <ForwardArrow className="w-5 h-5" /></>}
                  </Button>
                </div>
              </section>
            )}

            {(v.actor.canDelegate || v.delegate) && v.actor.kind === "owner" && !success && (
              <HandoverPanel t={t} view={v} onChange={(next) => applyView(next, step)} />
            )}
          </div>
        </div>
      </main>

      <Dialog open={!!campusToDelete} onOpenChange={(open) => !open && setCampusToDelete(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.deleteCampusTitle}</DialogTitle>
            <DialogDescription>{fill(t.deleteCampusBody, campusToDelete?.name ?? "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampusToDelete(null)}>{t.cancel}</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteCampus()}>{t.deleteCampus}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HandoverPanel({ t, view, onChange }: { t: OnboardingCopy; view: SetupView; onChange: (view: SetupView) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", canPurchaseSubscription: false });
  const [formErrors, setFormErrors] = useState<StepErrors>({});
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const delegate = view.delegate;

  const submit = async () => {
    setBusy(true);
    setFormErrors({});
    const res = await assignOnboardingDelegate(form);
    setBusy(false);
    if (!res.ok) {
      if (res.errors) setFormErrors(res.errors); else toast.error(res.message);
      return;
    }
    onChange(res.view);
    setOpen(false);
    setIssued({ email: res.email, password: res.temporaryPassword });
    setForm({ fullName: "", email: "", canPurchaseSubscription: false });
  };

  const revoke = async () => {
    setBusy(true);
    const res = await revokeOnboardingDelegate();
    setBusy(false);
    setConfirmRevoke(false);
    if (res.ok) { onChange(res.view); toast.success(t.revoked); } else toast.error(res.message);
  };

  return (
    <section className="sk-panel p-5 md:p-6 space-y-3" aria-labelledby="handover-title" data-testid="handover-panel">
      <h2 id="handover-title" className="flex items-center gap-2 text-base font-bold text-ink-strong"><UserPlus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {t.handoverTitle}</h2>
      {delegate ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm leading-relaxed text-ink break-words">
            <span className="font-semibold text-ink-strong">{t.delegateLabel}:</span> {delegate.fullName} (<bdi dir="ltr">{delegate.email}</bdi>) · {delegate.canPurchaseSubscription ? t.canBuy : t.cannotBuy}
            {delegate.pendingFirstSignIn ? <> · <Badge variant="warning" size="sm" dot className="align-middle">{t.pendingFirstSignIn}</Badge></> : ""}
          </p>
          <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(true)} className="shrink-0">{t.revoke}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm leading-relaxed text-ink-muted">{t.handoverIntro}</p>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0"><UserPlus aria-hidden="true" className="h-4 w-4" /> {t.handover}</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.handover}</DialogTitle>
            <DialogDescription>{t.handoverIntro}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <InputField field="delegateName" error={formErrors.delegateName && t.errors[formErrors.delegateName]} label={t.delegateName} value={form.fullName} onChange={(val) => setForm({ ...form, fullName: val })} placeholder="" icon={UserRound} required />
            <InputField field="delegateEmail" error={formErrors.delegateEmail && t.errors[formErrors.delegateEmail]} label={t.delegateEmail} value={form.email} onChange={(val) => setForm({ ...form, email: val })} placeholder="name@school.edu" icon={Mail} type="email" required />
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 text-sm leading-relaxed text-ink transition-colors hover:border-border-subtle-hover">
              <Checkbox className="mt-1 h-4 w-4" checked={form.canPurchaseSubscription} onChange={(e) => setForm({ ...form, canPurchaseSubscription: e.target.checked })} />
              {t.allowPurchase}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button onClick={() => void submit()} loading={busy}>{t.sendHandover}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.tempPasswordTitle}</DialogTitle>
            <DialogDescription>{fill(t.tempPasswordBody, issued?.email ?? "")}</DialogDescription>
          </DialogHeader>
          <p dir="ltr" className="break-all rounded-xl border border-border-subtle bg-surface-subtle p-3 text-center font-mono text-base font-bold tracking-wide text-ink-strong select-all" data-testid="temporary-password">{issued?.password}</p>
          <DialogFooter><Button onClick={() => setIssued(null)}>{t.done}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.revokeTitle}</DialogTitle>
            <DialogDescription>{fill(t.revokeBody, delegate?.fullName ?? "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(false)}>{t.cancel}</Button>
            <Button variant="destructive" onClick={() => void revoke()} loading={busy}>{t.revoke}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StepHeading({ refEl, icon: Icon, title, intro }: { refEl: React.RefObject<HTMLHeadingElement | null>; icon: LucideIcon; title: string; intro: string }) {
  return (
    <div className="flex items-start gap-4 sm:items-center">
      <div className="w-12 h-12 md:w-14 md:h-14 bg-brand-50 rounded-2xl flex items-center justify-center text-primary shrink-0 shadow-xs ring-1 ring-brand-200/70">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h1 id="step-heading" ref={refEl} tabIndex={-1} className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-strong leading-tight outline-none">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{intro}</p>
      </div>
    </div>
  );
}

/** A forward chevron that leans ahead on hover and points the reading direction in RTL. */
function ForwardArrow({ className = "w-4 h-4" }: { className?: string }) {
  // The nudge (transform) sits on the wrapper so it never composes with the RTL rotation.
  return (
    <span aria-hidden="true" className="sk-nudge inline-flex shrink-0">
      <ChevronRight className={`${className} rtl:rotate-180`} />
    </span>
  );
}

function StepActions({ t, onBack, onContinue, busy, disabled, disabledReason }: { t: OnboardingCopy; onBack?: () => void; onContinue: () => void; busy: boolean; disabled?: boolean; disabledReason?: string }) {
  const reasonId = useId();
  const showReason = Boolean(disabled && disabledReason && !busy);
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? <Button variant="outline" onClick={onBack} disabled={busy} className="gap-2"><ChevronLeft aria-hidden="true" className="w-4 h-4 rtl:rotate-180" /> {t.back}</Button> : <span />}
      <div className="flex flex-col gap-1.5 sm:items-end">
        <Button variant="dark" onClick={onContinue} disabled={busy || disabled} loading={busy} aria-describedby={showReason ? reasonId : undefined} className="sk-nudge-trigger gap-2">
          {t.continue} <ForwardArrow />
        </Button>
        {showReason && <p id={reasonId} className="text-xs text-ink-subtle sm:text-end">{disabledReason}</p>}
      </div>
    </div>
  );
}

function ChoiceCard({ name, checked, onSelect, title, desc }: { name: string; checked: boolean; onSelect: () => void; title: string; desc: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`sk-press flex cursor-pointer gap-3 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 ${checked ? "border-primary bg-surface-selected shadow-sm" : "border-brand-200 bg-white hover:border-border-subtle-hover hover:bg-surface-hover hover:shadow-xs"}`}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-strong">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-muted">{desc}</span>
      </span>
    </label>
  );
}

function StepNav({ t, icon: Icon, active, done, num, title, desc, disabled, onClick }: {
  t: OnboardingCopy; icon: LucideIcon; active: boolean; done: boolean; num: number; title: string; desc: string; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <Button aria-current={active ? "step" : undefined} variant="choice" type="button" disabled={disabled} onClick={onClick} className="relative w-full justify-start gap-3 p-3.5 text-start">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${active ? 'bg-primary text-white shadow-sm' : done ? 'bg-emerald-600 text-white' : 'bg-muted text-ink-subtle'}`} aria-hidden="true">
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-snug text-ink-strong">{num}. {title}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-ink-subtle">{desc}</span>
        <span className="sr-only">({done ? t.stepState.done : active ? t.stepState.current : disabled ? t.stepState.locked : ""})</span>
      </div>
    </Button>
  );
}

/** A field's validation message: an icon and the text, linked to its control by id. */
function FieldError({ id, live = true, children }: { id?: string; live?: boolean; children: React.ReactNode }) {
  return (
    <p id={id} role={live ? "alert" : undefined} className="sk-field-message flex items-start gap-1.5 text-sm font-medium leading-snug text-destructive">
      <AlertCircle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function InputField({ field, error, label, value, onChange, placeholder, icon: Icon, isArea, required, readonly, type = "text", inputMode, hint }: {
  field: string; error?: string; label: string; value: string; onChange: (val: string) => void; placeholder: string; icon: LucideIcon;
  isArea?: boolean; required?: boolean; readonly?: boolean; type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url' | 'search' | 'none' | 'decimal';
  /** Format, example or consequence, shown under the control and read after the error. */
  hint?: string;
}) {
  const id = `field-${field}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5" data-form-field={field}>
      <Label htmlFor={id} className="sk-field-label">
        {label} {required && <span className="text-destructive" aria-hidden="true">*</span>}
      </Label>
      <InputGroup>
        {type !== "date" && <Icon data-field-affix="start" className="h-4 w-4" />}
        {isArea ? (
          <SystemTextarea id={id} aria-required={required} aria-invalid={!!error} aria-describedby={describedBy}
            value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full min-h-[90px] resize-none" />
        ) : (
          <Input id={id} aria-required={required} aria-invalid={!!error} aria-describedby={describedBy}
            dir={["email", "tel", "url", "date"].includes(type) ? "ltr" : undefined}
            type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={readonly} inputMode={inputMode} className="w-full" />
        )}
      </InputGroup>
      {error && <FieldError id={`${id}-error`} live={false}>{error}</FieldError>}
      {hint && <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-subtle">{hint}</p>}
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value, ltr }: { icon: LucideIcon; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 md:p-4 bg-surface-subtle rounded-2xl border border-border-subtle min-w-0">
      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center text-primary shrink-0 shadow-xs ring-1 ring-border-subtle">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="sk-eyebrow mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-ink-strong break-words">{ltr ? <bdi dir="ltr">{value || '—'}</bdi> : (value || '—')}</p>
      </div>
    </div>
  );
}
