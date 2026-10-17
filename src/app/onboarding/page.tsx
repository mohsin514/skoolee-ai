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
import { toast } from 'sonner';
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

  const language = view?.language || "en";
  const t = onboardingCopy(language);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
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
    const saved = await persist({ step: "campuses", complete: false, draft: nextDraft });
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
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#fff7fe] gap-4" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 text-[#8127cf] animate-spin" aria-hidden="true" />
        <p className="text-xs font-bold text-ink">{t.loading}</p>
      </div>
    );
  }
  if (load.kind === "noAccess" || load.kind === "error") {
    const copy = onboardingCopy(typeof document !== "undefined" ? document.documentElement.lang : "en");
    return (
      <main className="min-h-screen bg-[#fff7fe] flex items-center justify-center p-6">
        <div className="sk-panel max-w-md w-full p-8 space-y-4 text-center">
          <Lock className="mx-auto h-8 w-8 text-[#8127cf]" aria-hidden="true" />
          <h1 className="text-xl font-black text-ink">{load.kind === "noAccess" ? copy.noAccessTitle : copy.retry}</h1>
          <p className="text-sm text-ink-muted">{load.kind === "noAccess" ? copy.noAccessBody : copy.loadFailed}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {load.kind === "error" && <Button onClick={() => void reload()}>{copy.retry}</Button>}
            <Button variant="outline" onClick={handleLogout}><LogOut className="h-4 w-4" /> {copy.signOut}</Button>
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
    <div lang={language} dir={rtl ? "rtl" : "ltr"} className="min-h-screen bg-[#fff7fe] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">

      {/* ─── SIDEBAR (desktop) ─── */}
      <aside className="w-72 bg-white/50 backdrop-blur-md border-e border-[#cfc2d6]/30 hidden lg:flex flex-col p-8 fixed h-full z-50 overflow-y-auto">
        <div className="mb-8">
          <SkooleeLogo size="1.4rem" />
          <p className="text-[10px] font-bold text-ink-muted uppercase tracking-normal leading-none mt-1">{t.wizard}</p>
        </div>
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">{fill(t.stepOf, stepIndex + 1, flow.length)}</span>
            <span className="text-[10px] font-black text-[#8127cf]">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#cfc2d6]/25" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <nav aria-label={t.wizard}>
          <ol className="flex-1 space-y-3">
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
        <Button variant="destructive" onClick={handleLogout} className="mt-auto items-center gap-4 justify-start">
          <LogOut className="w-5 h-5" /> <span>{t.signOut}</span>
        </Button>
      </aside>

      <main className="flex-1 lg:ms-72 min-h-screen min-w-0 flex flex-col bg-[#fbf0fe]/50">
        {/* ─── MOBILE STEP BAR ─── */}
        <div className="lg:hidden px-4 pt-5 pb-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <SkooleeLogo size="1.2rem" />
            <span className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">{fill(t.stepOf, stepIndex + 1, flow.length)}</span>
          </div>
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[#cfc2d6]/25" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
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

        <header className="px-4 md:px-10 py-4 flex flex-wrap items-center justify-between gap-3 bg-white/50 backdrop-blur-md sticky top-0 z-40 border-b border-[#cfc2d6]/10">
          {/* Structure stays visible for the whole journey. */}
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-black text-[#8127cf]" data-testid="structure-summary">
            <School className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t.types[type].short}{mode ? ` · ${t.modes[mode].short}` : ""}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-ink-muted" role="status" aria-live="polite">
              {saving ? t.saving : !dirty ? <><CheckCircle2 className="inline h-3 w-3 text-emerald-600" aria-hidden="true" /> {t.savedAt}</> : null}
            </span>
            <Button variant="outline" size="sm" onClick={() => void saveAndExit()} disabled={saving || activating}>{t.saveExit}</Button>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={handleLogout}>{t.signOut}</Button>
          </div>
        </header>

        <div className="p-4 md:p-10 flex-1 flex flex-col items-center">
          <div className="w-full max-w-4xl space-y-5">
            {v.actor.kind === "delegate" && (
              <p role="note" className="rounded-2xl border border-[#cfc2d6]/40 bg-white p-4 text-sm font-semibold text-ink">
                <ShieldCheck className="me-2 inline h-4 w-4 text-[#8127cf]" aria-hidden="true" />
                {t.delegateBanner} {v.actor.canPurchase ? t.delegateBannerBuy : t.delegateBannerNoBuy}
              </p>
            )}
            {banner && (
              <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{banner}</p>
            )}
            {errorEntries.length > 0 && (
              <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-status-error-text outline-none focus-visible:ring-2 focus-visible:ring-destructive">
                <p id="error-summary-title" className="flex items-center gap-1.5 text-sm font-bold"><AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />{t.errorSummary(errorEntries.length)}</p>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {errorEntries.map(([field, code]) => (
                    <li key={field}>
                      <button type="button" onClick={() => focusError(field)} className="min-h-6 text-start text-sm font-semibold underline underline-offset-2">
                        {field.startsWith("campus:") ? `${d.campuses.find((c) => `campus:${c.key}` === field)?.name || t.campusName}: ` : ""}{t.errors[code] ?? code}
                      </button>
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
                  <legend className="mb-3 text-sm font-black text-ink">{t.modeQuestion}</legend>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(["EXAM_STUDIO", "FULL_OPERATIONS"] as const).map((option) => (
                      <ChoiceCard key={option} name="adoptionMode" checked={mode === option} onSelect={() => { setMode(option); setErrors({}); }}
                        title={t.modes[option].label} desc={t.modes[option].desc} />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="mb-3 text-sm font-black text-ink">{t.typeQuestion}</legend>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(["STANDALONE", "GROUP"] as const).map((option) => (
                      <ChoiceCard key={option} name="institutionType" checked={type === option} onSelect={() => setType(option)}
                        title={t.types[option].label} desc={t.types[option].example} />
                    ))}
                  </div>
                </fieldset>
                {typeChanged && (
                  <div role="status" className="rounded-2xl border border-[#cfc2d6]/50 bg-[#fbf0fe] p-4 text-sm text-ink space-y-1" data-testid="shape-preview">
                    <p className="font-black">{fill(t.shapePreviewTitle, t.types[type].label)}</p>
                    <p>{type === "STANDALONE" ? fill(t.shapeToStandalone, d.campuses.length) : t.shapeToGroup}</p>
                    <p>{fill(t.shapeCapacity, t.campusCount(limit))}</p>
                    <p>{t.shapeReopen}</p>
                  </div>
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
                    <div className="bg-white rounded-[24px] border-2 border-dashed border-[#8127cf]/25 p-5 flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#fbf0fe] overflow-hidden flex items-center justify-center shrink-0">
                        {resolveMediaUrl(s.logoUrl)
                          ? <Image src={resolveMediaUrl(s.logoUrl)!} alt={t.logo} width={64} height={64} className="w-full h-full object-cover" unoptimized />
                          : <ImageIcon className="w-7 h-7 text-[#8127cf]/40" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black text-ink-muted uppercase mb-1">{t.logo} <span className="font-semibold normal-case">({t.optional})</span></p>
                        <p className="text-[11px] font-semibold text-ink-subtle mb-3">{t.logoHint}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className={buttonVariants({ size: "sm", className: logoUploading ? "cursor-wait opacity-60" : "cursor-pointer" })}>
                            {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
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
                    <InputField field="email" label={t.contactEmail} value={s.email} onChange={() => undefined} placeholder="" icon={Mail} type="email" readonly />
                    <div className="bg-[#fbf0fe] p-5 rounded-[24px] border border-[#cfc2d6]/20">
                      <div className="flex items-center justify-between mb-4 gap-3">
                        <Label htmlFor="field-regId" className="text-[11px] font-black text-[#8127cf] uppercase">{isGroup ? t.schoolId : t.campusId}</Label>
                        <div className="bg-white rounded-lg p-1 flex gap-1 border border-[#cfc2d6]/10" role="group" aria-label={isGroup ? t.schoolId : t.campusId}>
                          <Button size="sm" aria-pressed={isGroup ? s.autoId : s.primaryCampusAutoId} variant="choice" onClick={() => isGroup ? setSchool({ autoId: true, regId: generateId('SKL') }) : setSchool({ primaryCampusAutoId: true, primaryCampusRegId: generateId('BR') })}>{t.auto}</Button>
                          <Button size="sm" aria-pressed={isGroup ? !s.autoId : !s.primaryCampusAutoId} variant="choice" onClick={() => isGroup ? setSchool({ autoId: false }) : setSchool({ primaryCampusAutoId: false })}>{t.manual}</Button>
                        </div>
                      </div>
                      <Input id="field-regId" dir="ltr" aria-invalid={!!errors.regId} aria-describedby="regId-hint"
                        value={isGroup ? s.regId : s.primaryCampusRegId}
                        onChange={(e) => isGroup ? setSchool({ regId: e.target.value.toUpperCase() }) : setSchool({ primaryCampusRegId: e.target.value.toUpperCase() })}
                        readOnly={isGroup ? s.autoId : s.primaryCampusAutoId}
                        className="text-center" />
                      <p id="regId-hint" className="text-[11px] text-ink-subtle mt-3 font-bold">{isGroup ? t.idHintGroup : t.idHintCampus}</p>
                      {errors.regId && <p role="alert" className="text-sm text-destructive mt-1">{t.errors[errors.regId]}</p>}
                    </div>
                    {!isGroup && (
                      <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-[12px] font-bold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t.primaryCampusNote}
                      </p>
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
                  <p role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{fill(t.overLimit, split.drafts.length)}</p>
                )}
                <p className="text-sm text-ink-muted">{v.actor.canPurchase ? t.noPaymentNeeded : t.purchaseNotDelegated}</p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" onClick={goBack} className="gap-2"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /> {t.back}</Button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {v.actor.canPurchase && (
                      <Link href={comparePackagesHref} className={buttonVariants({ variant: "outline" })}>{t.comparePackages}</Link>
                    )}
                    <Button variant="dark" onClick={() => void continueFrom("package")} disabled={saving} className="gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{fill(t.continueWith, v.plan.name)} <ChevronRight className="w-4 h-4 rtl:rotate-180" />
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
                          <div className="flex justify-between items-center gap-2">
                            <Label htmlFor="field-campusRegId" className="sk-field-label">{t.campusId}</Label>
                            <div className="flex gap-1" role="group" aria-label={t.campusId}>
                              <Button size="sm" aria-pressed={newCampus.autoId} variant="choice" onClick={() => setNewCampus({ ...newCampus, autoId: true, regId: generateId('BR') })}>{t.auto}</Button>
                              <Button size="sm" aria-pressed={!newCampus.autoId} variant="choice" onClick={() => setNewCampus({ ...newCampus, autoId: false })}>{t.manual}</Button>
                            </div>
                          </div>
                          <Input id="field-campusRegId" dir="ltr" aria-invalid={!!campusErrors.campusRegId} value={newCampus.regId} readOnly={newCampus.autoId}
                            onChange={(e) => setNewCampus({ ...newCampus, regId: e.target.value.toUpperCase() })} placeholder="BR-XXXX" className="text-center" />
                          {campusErrors.campusRegId && <p role="alert" className="text-sm text-destructive">{t.errors[campusErrors.campusRegId]}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        {editingKey && <Button variant="secondary" onClick={() => { setEditingKey(null); setNewCampus(emptyCampus()); setCampusErrors({}); }}>{t.cancel}</Button>}
                        <Button onClick={() => void saveCampus()} disabled={saving} className="gap-2">
                          {editingKey ? <><CheckCircle2 className="w-4 h-4" /> {t.updateCampus}</> : <><Plus className="w-4 h-4" /> {t.addCampus}</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <StepActions t={t} onBack={goBack} onContinue={() => void continueFrom("campuses")} busy={saving} disabled={d.campuses.length === 0} />
                </div>

                <div className="lg:col-span-2">
                  <div className="sk-panel sk-rise p-5 md:p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50 gap-2">
                      <h3 className="text-[11px] font-black uppercase flex items-center gap-2"><Users className="w-4 h-4 text-[#8127cf]" aria-hidden="true" /> {t.yourCampuses}</h3>
                      <span className="text-[10px] font-black text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-full">{fill(t.added, d.campuses.length)}</span>
                    </div>
                    {overLimit && (
                      <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                        <p>{fill(t.overLimit, split.drafts.length)}</p>
                        {v.actor.canPurchase && <Link href={comparePackagesHref} className={buttonVariants({ variant: "link", className: "mt-1 h-auto min-h-0 p-0" })}>{t.comparePackages}</Link>}
                      </div>
                    )}
                    <ul className="space-y-3" aria-label={t.yourCampuses}>
                      {d.campuses.map((c, i) => {
                        const isDraft = limit >= 0 && i >= limit;
                        return (
                          <li key={c.key} id={`campus-${c.key}`} tabIndex={-1} className={`p-4 rounded-[18px] border flex items-start justify-between gap-3 ${editingKey === c.key ? 'bg-[#8127cf]/10 border-[#8127cf]/30' : 'bg-[#fbf0fe]/50 border-transparent'} ${errors[`campus:${c.key}`] ? 'border-destructive' : ''}`}>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-ink leading-tight break-words">{c.name}</p>
                              <p className="text-[11px] font-bold text-ink-subtle mt-1"><span>{c.city}</span> · <bdi dir="ltr">{c.regId}</bdi></p>
                              <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isDraft ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{isDraft ? t.draftBadge : t.activateBadge}</span>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button variant="secondary" size="icon" onClick={() => editCampus(c)} aria-label={`${t.editCampus}: ${c.name}`} disabled={editingKey === c.key}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="outline" size="icon" onClick={() => setCampusToDelete(c)} aria-label={`${t.deleteCampus}: ${c.name}`}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {d.campuses.length === 0 && (
                      <div className="flex flex-col items-center justify-center text-center text-ink-subtle py-12">
                        <Building className="w-10 h-10 mb-2" aria-hidden="true" />
                        <p className="text-xs font-black">{t.noCampuses}</p>
                      </div>
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
                    <p className="flex items-center gap-2 text-[11px] font-black uppercase text-[#8127cf]"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {t.currentSession}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField field="academicYear" error={errors.academicYear && t.errors[errors.academicYear]} label={t.academicYear} value={s.academicYear} onChange={setAcademicYear} placeholder={String(thisYear)} icon={CalendarDays} inputMode="numeric" required />
                      <div className="space-y-1.5">
                        <Label htmlFor="field-sessionLabel" className="sk-field-label">{t.sessionName} <span className="text-rose-500">*</span></Label>
                        <InputGroup>
                          <Tag data-field-affix="start" className="h-4 w-4" />
                          <Input id="field-sessionLabel" aria-required aria-invalid={!!errors.sessionLabel} value={s.sessionLabel} onChange={(e) => setSchool({ sessionLabel: e.target.value })} placeholder={sessionLabelFor(thisYear)} className="w-full" />
                          <FieldAction data-field-affix="end" type="button" aria-label={t.resetSessionName} onClick={() => setSchool({ sessionLabel: sessionLabelFor(Number(s.academicYear) || thisYear) })}>
                            <RefreshCw className="w-3.5 h-3.5" />
                          </FieldAction>
                        </InputGroup>
                        {errors.sessionLabel && <p role="alert" className="text-sm text-destructive">{t.errors[errors.sessionLabel]}</p>}
                      </div>
                    </div>
                    <p className="flex items-start gap-2 rounded-2xl bg-[#fbf0fe] px-4 py-3 text-[11px] font-bold text-ink-muted">
                      <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[#8127cf]" aria-hidden="true" />
                      {fill(t.sessionHint, sessionLabelFor(Number(s.academicYear) || thisYear), Number(s.academicYear) || thisYear)}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField field="sessionStart" label={t.sessionStarts} type="date" icon={CalendarDays} value={s.sessionStart} placeholder="" onChange={(val) => setSchool({ sessionStart: val })} />
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
                      <p id="timezone-hint" className="text-[11px] font-bold text-ink-subtle">{t.timezoneHint}</p>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <p className="flex items-center gap-2 text-[11px] font-black uppercase text-[#8127cf]"><CalendarRange className="w-3.5 h-3.5" aria-hidden="true" /> {t.workingWeek}</p>
                    <p className="text-[12px] font-semibold text-ink-muted">{t.workingWeekHint}</p>
                    <div className="grid grid-cols-7 gap-1.5" id="field-weekends" tabIndex={-1}>
                      {WEEK_DAYS.map((day) => {
                        const off = s.weekends.includes(day);
                        return (
                          <Button variant="choice" key={day} type="button" onClick={() => toggleWorkingDay(day)} aria-pressed={!off}
                            aria-label={`${weekdayName(day, language, "long")} — ${off ? t.dayClosed : t.dayWorking}`}
                            className="min-w-0 flex-col px-0.5 py-3">
                            <span className="text-[10px] font-black">{weekdayName(day, language, "short")}</span>
                            <span className={`h-1.5 w-1.5 rounded-full ${off ? "bg-[#cfc2d6]" : "bg-[#8127cf]"}`} aria-hidden="true" />
                          </Button>
                        );
                      })}
                    </div>
                    <div className="rounded-[24px] border border-[#cfc2d6]/20 bg-[#fbf0fe] p-5 space-y-2">
                      <p className="text-[11px] font-black text-[#8127cf]">{t.workingDays(workingDays.length)}</p>
                      <p className="text-[12px] font-bold text-ink">{t.open}: {workingDays.map((day) => weekdayName(day, language, "short")).join(listSeparator) || "—"}</p>
                      <p className="text-[12px] font-bold text-ink-muted">{t.closed}: {offDays.map((day) => weekdayName(day, language, "long")).join(listSeparator) || t.noWeekend}</p>
                      <p className="border-t border-[#cfc2d6]/20 pt-2 text-[11px] font-bold text-ink-subtle">{t.appliedTo}</p>
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
                    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                      <p className="font-black">{t.successTitle}</p>
                      <p className="text-sm">{fill(t.successBody, success.activated, success.drafts)} {t.openingWorkspace}</p>
                    </div>
                  )}
                  {failed && !success && (
                    <div role="alert" className="rounded-2xl border border-status-error-border bg-status-error-surface p-4 text-status-error-text space-y-2" data-testid="setup-failure">
                      <p className="font-black">{t.failedTitle}</p>
                      <p className="text-sm">{v.lastError}</p>
                      <p className="text-sm">{t.failedBody}</p>
                      {v.failedStep && v.failedStep !== "review" && flow.includes(v.failedStep as SetupStepId) && (
                        <Button variant="outline" size="sm" onClick={() => void goTo(v.failedStep as SetupStepId)}>{fill(t.goToStep, t.steps[v.failedStep as SetupStepId].title)}</Button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SummaryItem icon={Layers} label={t.institutionType} value={t.types[type].label} />
                    <SummaryItem icon={Sparkles} label={t.adoptionMode} value={mode ? t.modes[mode].short : "—"} />
                    <SummaryItem icon={Package} label={t.currentPackage} value={v.plan.name} />
                    <SummaryItem icon={Building} label={t.activatedCapacity} value={fill(t.capacityValue, split.activate.length, limit < 0 ? "∞" : limit)} />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black text-[#8127cf] uppercase mb-3">{t.identity}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SummaryItem icon={Building} label={isGroup ? t.groupName : t.schoolName} value={s.name} />
                      <SummaryItem icon={Hash} label={isGroup ? t.schoolId : t.campusId} value={isGroup ? s.regId : s.primaryCampusRegId} ltr />
                      <SummaryItem icon={MapPin} label={t.city} value={s.city} />
                      <SummaryItem icon={Mail} label={t.contactEmail} value={s.email} ltr />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black text-[#8127cf] uppercase mb-3">{t.academicDefaults}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SummaryItem icon={CalendarRange} label={t.session} value={`${s.sessionLabel} (${s.academicYear})`} ltr />
                      <SummaryItem icon={Clock} label={t.timezone} value={s.timezone} ltr />
                      <SummaryItem icon={CalendarDays} label={t.sessionDates} value={s.sessionStart ? `${s.sessionStart}${s.sessionEnd ? ` → ${s.sessionEnd}` : ''}` : t.startsToday} ltr={Boolean(s.sessionStart)} />
                      <SummaryItem icon={CheckCircle2} label={t.weeklyOff} value={offDays.map((day) => weekdayName(day, language, "short")).join(listSeparator) || t.none} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black text-[#8127cf] uppercase mb-3">{t.campuses}</h3>
                    <ul className="grid gap-2 sm:grid-cols-2" data-testid="review-campuses">
                      {planned.map((c, i) => {
                        const isDraft = i >= split.activate.length;
                        return (
                          <li key={c.key} className="flex items-start justify-between gap-3 rounded-xl bg-[#fbf0fe]/60 p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black break-words">{isGroup ? c.name : t.primaryCampus}</p>
                              <p className="text-[11px] font-bold text-ink-subtle">{c.city} · <bdi dir="ltr">{c.regId}</bdi></p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isDraft ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{isDraft ? t.draftBadge : t.activateBadge}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-[#cfc2d6]/30 p-4">
                    <h3 className="text-[11px] font-black text-[#8127cf] uppercase mb-2">{t.authoritative}</h3>
                    <p className="text-sm text-ink">{mode === "EXAM_STUDIO" ? t.authoritativeExam : t.authoritativeFull}</p>
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black text-[#8127cf] uppercase mb-2">{t.unresolved}</h3>
                    <ul className="list-disc ps-5 text-sm text-ink-muted space-y-1" data-testid="optional-work">
                      {unresolvedOptionalWork(type, mode, d).map((key) => <li key={key}>{t.optionalWork[key]}</li>)}
                    </ul>
                  </div>
                </div>
                {overLimit && (
                  <p id="launch-capacity-note" role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    {fill(t.activateNote, split.activate.length, split.drafts.length)}
                  </p>
                )}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  <Button variant="outline" onClick={goBack} disabled={activating || Boolean(success)} className="gap-2"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /> {t.back}</Button>
                  {overLimit && v.actor.canPurchase && (
                    <Link href={comparePackagesHref} className={buttonVariants({ variant: "outline" })}>{t.changePackage}</Link>
                  )}
                  <Button size="lg" onClick={() => void handleActivate()} disabled={activating || saving || Boolean(success)} aria-describedby={overLimit ? "launch-capacity-note" : undefined} className="flex-1 gap-3">
                    {activating ? <><Loader2 className="w-5 h-5 animate-spin" /> {t.activating}</> : <>{overLimit ? t.activateEligible : t.activate} <ChevronRight className="w-5 h-5 rtl:rotate-180" /></>}
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
      <h2 id="handover-title" className="flex items-center gap-2 text-sm font-black text-ink"><UserPlus className="h-4 w-4 text-[#8127cf]" aria-hidden="true" /> {t.handoverTitle}</h2>
      {delegate ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            <span className="font-bold">{t.delegateLabel}:</span> {delegate.fullName} (<bdi dir="ltr">{delegate.email}</bdi>) · {delegate.canPurchaseSubscription ? t.canBuy : t.cannotBuy}
            {delegate.pendingFirstSignIn ? ` · ${t.pendingFirstSignIn}` : ""}
          </p>
          <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(true)}>{t.revoke}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">{t.handoverIntro}</p>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> {t.handover}</Button>
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
            <label className="flex items-start gap-3 text-sm text-ink">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={form.canPurchaseSubscription} onChange={(e) => setForm({ ...form, canPurchaseSubscription: e.target.checked })} />
              {t.allowPurchase}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t.sendHandover}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.tempPasswordTitle}</DialogTitle>
            <DialogDescription>{fill(t.tempPasswordBody, issued?.email ?? "")}</DialogDescription>
          </DialogHeader>
          <p dir="ltr" className="rounded-xl bg-[#fbf0fe] p-3 text-center font-mono text-base font-bold select-all" data-testid="temporary-password">{issued?.password}</p>
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
            <Button variant="destructive" onClick={() => void revoke()} disabled={busy}>{t.revoke}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StepHeading({ refEl, icon: Icon, title, intro }: { refEl: React.RefObject<HTMLHeadingElement | null>; icon: LucideIcon; title: string; intro: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 md:w-14 md:h-14 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf] shrink-0">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h1 id="step-heading" ref={refEl} tabIndex={-1} className="text-xl md:text-3xl font-black text-ink leading-tight outline-none">{title}</h1>
        <p className="text-ink-muted font-semibold text-sm mt-1">{intro}</p>
      </div>
    </div>
  );
}

function StepActions({ t, onBack, onContinue, busy, disabled }: { t: OnboardingCopy; onBack?: () => void; onContinue: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? <Button variant="outline" onClick={onBack} disabled={busy} className="gap-2"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /> {t.back}</Button> : <span />}
      <Button variant="dark" onClick={onContinue} disabled={busy || disabled} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t.continue} <ChevronRight className="w-4 h-4 rtl:rotate-180" />
      </Button>
    </div>
  );
}

function ChoiceCard({ name, checked, onSelect, title, desc }: { name: string; checked: boolean; onSelect: () => void; title: string; desc: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${checked ? "border-[#8127cf] bg-[#f6ecff]" : "border-[#e3d5f0] bg-white hover:border-[#cdb2e6]"}`}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 h-4 w-4 accent-[#8127cf]" />
      <span className="min-w-0">
        <span className="block text-sm font-black text-ink">{title}</span>
        <span className="mt-1 block text-[12px] font-semibold text-ink-muted">{desc}</span>
      </span>
    </label>
  );
}

function StepNav({ t, icon: Icon, active, done, num, title, desc, disabled, onClick }: {
  t: OnboardingCopy; icon: LucideIcon; active: boolean; done: boolean; num: number; title: string; desc: string; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <Button aria-current={active ? "step" : undefined} variant="choice" type="button" disabled={disabled} onClick={onClick} className="relative w-full justify-start gap-3 p-4 text-start">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${active ? 'bg-[#8127cf] text-white' : done ? 'bg-emerald-600 text-white' : 'bg-[#f3f4f9] text-ink-subtle'}`} aria-hidden="true">
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="min-w-0">
        <span className="block text-sm font-black text-ink leading-none mb-1 truncate">{num}. {title}</span>
        <span className="block text-[11px] font-bold text-ink-muted truncate">{desc}</span>
        <span className="sr-only">({done ? t.stepState.done : active ? t.stepState.current : disabled ? t.stepState.locked : ""})</span>
      </div>
    </Button>
  );
}

function InputField({ field, error, label, value, onChange, placeholder, icon: Icon, isArea, required, readonly, type = "text", inputMode }: {
  field: string; error?: string; label: string; value: string; onChange: (val: string) => void; placeholder: string; icon: LucideIcon;
  isArea?: boolean; required?: boolean; readonly?: boolean; type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url' | 'search' | 'none' | 'decimal';
}) {
  const id = `field-${field}`;
  return (
    <div className="space-y-1.5" data-form-field={field}>
      <Label htmlFor={id} className="sk-field-label">
        {label} {required && <span className="text-rose-500" aria-hidden="true">*</span>}
      </Label>
      <InputGroup>
        {type !== "date" && <Icon data-field-affix="start" className="h-4 w-4" />}
        {isArea ? (
          <SystemTextarea id={id} aria-required={required} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full min-h-[90px] resize-none" />
        ) : (
          <Input id={id} aria-required={required} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            dir={["email", "tel", "url", "date"].includes(type) ? "ltr" : undefined}
            type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={readonly} inputMode={inputMode} className="w-full" />
        )}
      </InputGroup>
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value, ltr }: { icon: LucideIcon; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 md:p-4 bg-[#fbf0fe]/50 rounded-[20px] border border-white/50 min-w-0">
      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center text-[#8127cf] shrink-0">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black text-ink-subtle uppercase mb-0.5">{label}</p>
        <p className="text-sm font-black text-ink break-words">{ltr ? <bdi dir="ltr">{value || '—'}</bdi> : (value || '—')}</p>
      </div>
    </div>
  );
}
