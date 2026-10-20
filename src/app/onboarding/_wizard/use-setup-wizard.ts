import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { useStepMorph } from "@/components/auth/use-step-morph";
import type { AuthMascotSignals } from "@/components/auth/AuthMascot";
import { clearDeviceDrafts } from "@/lib/drafts/store";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import {
  finishOnboarding,
  getOnboardingSession,
  saveOnboardingStep,
} from "@/app/actions/completeOnboarding";
import type { SetupView } from "@/lib/onboarding/setup-service";
import {
  campusesForCompletion,
  reachableSteps,
  resumeStep,
  setupFlow,
  splitByCapacity,
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
import { logout } from "@/app/actions/auth/logout";
import { toast } from "@/components/ui/toast";
import { dashboardPathForRole } from "@/lib/roles";
import { resolveMediaUrl } from "@/lib/storage/s3";
import type { Language } from "@/lib/locale/package";
import { fill, isRtlLanguage, onboardingCopy, type OnboardingCopy } from "../copy";
import { WEEK_DAYS, emptyCampus, timezoneOptions, fieldStep, generateId, sessionLabelFor, toLanguage, type CampusForm } from "./helpers";
import { localCopy, type LocalCopy } from "./local-copy";
import type { CoverData, LoadState, WizardSealState } from "./types";

// ─────────────────────────────────────────────────────────────────
// The wizard renders the server's setup state (SKO-391). Every Continue
// saves to the institution's setup record, so progress follows the owner
// across sign-out, devices, checkout and an authorised handover. The step
// list comes from the saved institution *type*, never from the role.
// ─────────────────────────────────────────────────────────────────

/** Values that exist only once the saved setup has landed (`view` and `draft` are both set). */
export type SetupWizardReady = {
  v: SetupView;
  d: SetupDraft;
  s: SchoolDraft;
  isGroup: boolean;
  limit: number;
  planned: CampusDraft[];
  split: { activate: CampusDraft[]; drafts: CampusDraft[] };
  overLimit: boolean;
  offDays: number[];
  workingDays: number[];
  thisYear: number;
  typeChanged: boolean;
  failed: boolean;
  listSeparator: string;
  logoSrc: string | null;
  /** The uploaded logo for the desk (identity crest, review head): `next/image`, alt = t.logo; null without a logo. */
  logoPreview: ReactNode | null;
  toggleWorkingDay: (day: number) => void;
  setAcademicYear: (raw: string) => void;
  errorEntries: [string, string][];
  focusError: (field: string) => void;
  /** Error-summary jump: focuses the field, moving to the step that owns it first when needed (spec §8.4). */
  jumpToError: (field: string) => void;
  /** Steps that need attention, in flow order: a FAILED setup's failed step, plus the steps owning current errors. */
  attention: SetupStepId[];
  /** The seal: success → pressed, activating → pending, a FAILED setup → failed, otherwise open. */
  sealState: WizardSealState;
  /** What the decorative cover may draw (never campus names). */
  coverData: CoverData;
};

export type SetupWizard = {
  load: LoadState;
  reload: () => Promise<void>;
  t: OnboardingCopy;
  local: LocalCopy;
  language: string;
  /** `language` mapped to the shell's three (en/ar/ur). */
  lang: Language;
  rtl: boolean;
  view: SetupView | null;
  draft: SetupDraft | null;
  /** Adopts a server-acknowledged view (also used by the handover panel). */
  applyView: (next: SetupView, requested?: string | null) => void;
  type: InstitutionType;
  setType: (type: InstitutionType) => void;
  mode: AdoptionMode | null;
  /** Picks the adoption mode and clears the step errors. */
  setMode: (mode: AdoptionMode) => void;
  step: SetupStepId;
  flow: SetupStepId[];
  completed: SetupStepId[];
  reachable: SetupStepId[];
  stepIndex: number;
  saving: boolean;
  activating: boolean;
  /** Local state differs from the saved setup (drives saving before navigation, exit and activation). */
  dirty: boolean;
  /** The owner changed something not yet saved (the save state and the leave warning; ignores the time-zone guess). */
  edited: boolean;
  errors: StepErrors;
  banner: string | null;
  saveFailed: boolean;
  deleteError: string | null;
  success: { activated: number; drafts: number } | null;
  logoUploading: boolean;
  handleLogoFile: (file?: File) => Promise<void>;
  newCampus: CampusForm;
  setNewCampus: (campus: CampusForm) => void;
  campusErrors: StepErrors;
  editingKey: string | null;
  savingCampus: boolean;
  campusToDelete: CampusDraft | null;
  setCampusToDelete: (campus: CampusDraft | null) => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  summaryRef: RefObject<HTMLDivElement | null>;
  setSchool: (patch: Partial<SchoolDraft>) => void;
  continueFrom: (current: SetupStepId) => Promise<void>;
  goTo: (target: SetupStepId) => Promise<void>;
  goBack: () => void;
  saveAndExit: () => Promise<void>;
  handleLogout: () => Promise<void>;
  /**
   * The package chooser modal (PackageChooser): open state, whether an old link opened it, and the size and
   * period the owner set there (kept for the session so reopening keeps them).
   */
  packages: {
    open: boolean; fromLink: boolean;
    students: number | null; setStudents: (students: number | null) => void;
    period: "monthly" | "annual"; setPeriod: (period: "monthly" | "annual") => void;
    show: () => void; hide: () => void;
  };
  /** Saves an edited setup before leaving for payment (so the unsaved-changes guard cannot block the redirect). */
  beforeLeave: () => Promise<boolean>;
  /** Re-reads the saved setup without the loading skeleton (after a package choice). */
  refreshView: () => Promise<void>;
  saveCampus: () => Promise<void>;
  editCampus: (campus: CampusDraft) => void;
  cancelCampusEdit: () => void;
  confirmDeleteCampus: () => Promise<void>;
  handleActivate: () => Promise<void>;
  /** Oolee's signals for the SetupBar face (spec §8.3). */
  signals: AuthMascotSignals;
  /** Non-null only when the saved setup has landed (`view && draft`). */
  ready: SetupWizardReady | null;
};

export function useSetupWizard(): SetupWizard {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [view, setView] = useState<SetupView | null>(null);
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [type, setType] = useState<InstitutionType>("STANDALONE");
  const [mode, setMode] = useState<AdoptionMode | null>(null);
  const [step, setStep] = useState<SetupStepId>("structure");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
  // Armed once the saved setup has landed: the step it resumes at is the page's arrival, not a step change.
  const focusArmed = useRef(false);
  // A field the error summary asked for on another step: focused instead of the h1 once that step lands.
  const pendingFocusRef = useRef<string | null>(null);
  // While a jump lands, the re-validated errors do not pull focus back to the summary.
  const jumpingRef = useRef(false);
  const morph = useStepMorph();
  const [errorSeq, setErrorSeq] = useState(0);
  const [savedPulse, setSavedPulse] = useState(false);
  const [glance, setGlance] = useState<string | null>(null);
  const bumpError = useCallback(() => setErrorSeq((n) => n + 1), []);

  const [savingCampus, setSavingCampus] = useState(false);
  // Package chooser: `?packages=open` (the old /onboarding/package link) opens it on arrival.
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [packagesFromLink, setPackagesFromLink] = useState(false);
  const [packagesStudents, setPackagesStudents] = useState<number | null>(null);
  const [packagesPeriod, setPackagesPeriod] = useState<"monthly" | "annual">("monthly");

  const language = view?.language || "en";
  const lang = toLanguage(language);
  const t = onboardingCopy(language);
  const local = localCopy(language);
  const rtl = isRtlLanguage(language);

  const applyView = useCallback((next: SetupView, requested?: string | null) => {
    setView(next);
    const nextDraft = { ...next.draft, school: { ...next.draft.school } };
    // The browser's zone is only an opening guess for a brand-new setup.
    if (!nextDraft.school.timezone) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      nextDraft.school.timezone = timezoneOptions().some((z) => z.value === detected) ? detected : "Asia/Karachi";
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
        const query = new URLSearchParams(window.location.search);
        applyView(res.view, query.get("step"));
        setLoad({ kind: "ready" });
        if (query.get("packages") === "open") {
          const students = Number(query.get("students"));
          setPackagesStudents(Number.isSafeInteger(students) && students > 0 ? students : null);
          setPackagesFromLink(true);
          setPackagesOpen(true);
          query.delete("packages");
          query.delete("students");
          window.history.replaceState(null, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`);
        }
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

  /** After a package choice: adopt the fresh view (plan, pending package) on the current step, no skeleton. */
  const refreshView = useCallback(async () => {
    try {
      const res = await getOnboardingSession();
      // Only the package fields: adopting the new version without the new draft would let a stale local draft
      // save over another tab's change (the version check is what catches that).
      if ("view" in res) setView((prev) => (prev ? { ...prev, plan: res.view.plan, pendingPackage: res.view.pendingPackage, selectedPackage: res.view.selectedPackage } : res.view));
    } catch {
      // The next save or reload picks the change up.
    }
  }, []);

  const flow = useMemo(() => setupFlow(type), [type]);
  const completed = view?.completedSteps ?? [];
  const reachable = useMemo(() => reachableSteps(flow, completed), [flow, completed]);
  const stepIndex = Math.max(0, flow.indexOf(step));

  // Local edits not yet acknowledged by the server.
  const dirty = Boolean(view && draft) && JSON.stringify({ draft, type, mode }) !== JSON.stringify({ draft: view!.draft, type: view!.institutionType, mode: view!.adoptionMode });
  // Edits the owner made. The browser's time-zone guess for a setup with no saved zone is not one: it is still
  // saved with the next step (`dirty` drives persistence), but it neither warns on leaving nor shows as unsaved.
  const edited = dirty && (view!.draft.school.timezone
    ? true
    : JSON.stringify({ draft: { ...draft!, school: { ...draft!.school, timezone: view!.draft.school.timezone } }, type, mode })
      !== JSON.stringify({ draft: view!.draft, type: view!.institutionType, mode: view!.adoptionMode }));
  useUnsavedGuard(edited && !success);

  // Move focus to the new step's heading so screen readers announce it (not on arrival or resume).
  const landed = view !== null;
  useEffect(() => {
    if (!landed) return;
    if (!focusArmed.current) { focusArmed.current = true; return; }
    // An error-summary jump focuses its field instead of the heading (jumpToError).
    const pending = pendingFocusRef.current;
    if (pending) {
      pendingFocusRef.current = null;
      requestAnimationFrame(() => focusFieldById(pending));
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step, landed]);

  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    // A jump to another step's field keeps the focus on that field, not on the summary.
    if (hasErrors && !jumpingRef.current) summaryRef.current?.focus();
  }, [hasErrors, errors]);
  // Oolee's concerned glance: new errors, a new banner, a FAILED view.
  useEffect(() => { if (hasErrors) bumpError(); }, [hasErrors, errors, bumpError]);
  useEffect(() => { if (banner) bumpError(); }, [banner, bumpError]);
  const failedNow = Boolean(view?.status === "FAILED" && view?.lastError);
  const failedMessage = failedNow ? view?.lastError ?? null : null;
  useEffect(() => { if (failedMessage) bumpError(); }, [failedMessage, bumpError]);
  useEffect(() => {
    if (!savedPulse) return;
    const id = window.setTimeout(() => setSavedPulse(false), 700);
    return () => window.clearTimeout(id);
  }, [savedPulse]);

  const setSchool = (patch: Partial<SchoolDraft>) => setDraft((prev) => prev ? { ...prev, school: { ...prev.school, ...patch } } : prev);

  /** Saves to the institution's setup record. Returns the acknowledged state or null. */
  const persist = async (opts: { step: SetupStepId; complete: boolean; nextStep?: SetupStepId; draft?: SetupDraft; type?: InstitutionType; mode?: AdoptionMode | null }) => {
    if (!view || !draft) return null;
    setSaving(true);
    setSaveFailed(false);
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
        const requested = opts.nextStep ?? opts.step;
        const target = resumeStep(res.view.flow, res.view.completedSteps, res.view.currentStep, requested);
        if (target !== step) {
          const direction = res.view.flow.indexOf(target) > res.view.flow.indexOf(step) ? "forward" : "back";
          morph(direction, () => {
            applyView(res.view, requested);
            setErrors({});
            scrollDeskToTop();
          });
        } else {
          applyView(res.view, requested);
          setErrors({});
        }
        return res.view;
      }
      setSaveFailed(true);
      if (res.errors) setErrors(res.errors);
      if (res.view) { applyView(res.view); setBanner(t.conflict); }
      else setBanner(res.denied ? t.denied : res.message);
      return null;
    } catch {
      setSaveFailed(true);
      setBanner(local.saveFailed);
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
    const saved = await persist({ step: current, complete: true, nextStep: next });
    if (saved) setSavedPulse(true);
  };

  const goTo = async (target: SetupStepId) => {
    if (!reachable.includes(target) || target === step) return;
    setErrors({});
    if (dirty) await persist({ step, complete: false, nextStep: target });
    else morph(flow.indexOf(target) > stepIndex ? "forward" : "back", () => { setStep(target); scrollDeskToTop(); });
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
    if (!editingKey) setGlance(overLimitNow ? `[data-mascot-anchor="capacity"]` : `#campus-${CSS.escape(key)}`);
    setEditingKey(null);
    setNewCampus(prefilledCampus(saved.draft.school.city));
  };

  const editCampus = (campus: CampusDraft) => {
    const { key, ...rest } = campus;
    setNewCampus(rest);
    setEditingKey(key);
    setCampusErrors({});
    document.getElementById("field-campusName")?.focus();
  };

  const cancelCampusEdit = () => { setEditingKey(null); setNewCampus(prefilledCampus(draft?.school.city)); setCampusErrors({}); };

  // Entering the campuses step with a pristine form prefills the institution's city (never saved until Add).
  const institutionCity = draft?.school.city ?? "";
  const formPristine = !editingKey && newCampus.autoId
    && JSON.stringify({ ...newCampus, city: "", regId: "" }) === JSON.stringify({ ...emptyCampus(), city: "", regId: "" });
  const [prefillFor, setPrefillFor] = useState<string | null>(null);
  const prefillKey = step === "campuses" ? institutionCity : null;
  if (prefillKey !== prefillFor) {
    // Adjust-state-during-render: runs once per arrival (or city change) on the campuses step.
    setPrefillFor(prefillKey);
    if (prefillKey !== null && formPristine && newCampus.city !== institutionCity) setNewCampus({ ...newCampus, city: institutionCity });
  }

  const confirmDeleteCampus = async () => {
    if (!draft || !campusToDelete || saving) return;
    const removed = campusToDelete;
    setDeleteError(null);
    const saved = await persist({ step: "campuses", complete: false, draft: { ...draft, campuses: draft.campuses.filter((c) => c.key !== removed.key) } });
    if (!saved) { setDeleteError(local.deleteFailed); return; }
    setCampusToDelete(null);
    toast.success(fill(t.campusDeleted, removed.name));
    // The dialog restored focus to the row's delete button, which is now gone; keep focus in the composer.
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.getElementById("field-campusName")?.focus({ preventScroll: true });
    });
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
        const reduced = prefersReducedMotion();
        // Bring the charter head (the sealed line, the success alert) into view.
        requestAnimationFrame(() => document.querySelector("[data-step-card]")?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }));
        setTimeout(() => { window.location.href = target; }, reduced ? 1200 : 1600);
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

  let ready: SetupWizardReady | null = null;
  if (view && draft) {
    const v = view;
    const d = draft;
    const s = d.school;
    const isGroup = type === "GROUP";
    const limit = v.plan.maxCampuses;
    const planned = campusesForCompletion(type, d);
    const split = splitByCapacity(planned, limit);
    const overLimit = split.drafts.length > 0;
    const offDays = WEEK_DAYS.filter((day) => s.weekends.includes(day));
    const workingDays = WEEK_DAYS.filter((day) => !s.weekends.includes(day));
    const thisYear = new Date().getFullYear();
    const typeChanged = type !== v.institutionType;
    const failed = Boolean(v.status === "FAILED" && v.lastError);
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
    const logoSrc = resolveMediaUrl(s.logoUrl);
    const logoImage = (alt: string, size: number) => (logoSrc
      ? createElement(Image, { src: logoSrc, alt, width: size, height: size, className: "w-full h-full object-cover", unoptimized: true })
      : null);

    // Attention: the step a FAILED activation names (when it is in this flow) and every step owning a current error.
    const flagged = new Set<SetupStepId>();
    if (failed && v.failedStep && flow.includes(v.failedStep as SetupStepId)) flagged.add(v.failedStep as SetupStepId);
    for (const field of Object.keys(errors)) {
      const owner = fieldStep(field);
      if (owner && flow.includes(owner)) flagged.add(owner);
    }
    const attention = flow.filter((id) => flagged.has(id));
    const sealState: WizardSealState = success ? "pressed" : activating ? "pending" : failed ? "failed" : "open";

    const coverData: CoverData = {
      type,
      mode,
      name: s.name,
      tagline: s.tagline,
      city: s.city,
      establishedYear: s.establishedYear,
      website: s.website,
      logoPreview: logoImage("", 40),
      regId: isGroup ? s.regId : s.primaryCampusRegId,
      idLabel: isGroup ? t.schoolId : t.campusId,
      planName: v.plan.name,
      limit,
      campusNodes: planned.map((campus, index) => ({ key: campus.key, state: index < split.activate.length ? "active" : "draft" })),
      sessionLabel: s.sessionLabel,
      academicYear: s.academicYear,
      sessionStart: s.sessionStart,
      sessionEnd: s.sessionEnd,
      timezone: s.timezone,
      weekends: s.weekends,
    };
    const focusError = focusFieldById;
    const jumpToError = (field: string) => {
      const owner = fieldStep(field);
      if (!owner || owner === step || !reachable.includes(owner)) { focusError(field); return; }
      pendingFocusRef.current = field;
      jumpingRef.current = true;
      const nextErrors = validateStep(owner, { institutionType: type, adoptionMode: mode, draft: d });
      void goTo(owner).then(() => {
        setErrors(nextErrors);
        window.setTimeout(() => { jumpingRef.current = false; }, 400);
      });
    };

    ready = {
      v, d, s, isGroup, limit, planned, split, overLimit, offDays, workingDays, thisYear, typeChanged,
      failed, listSeparator, logoSrc, logoPreview: logoImage(t.logo, 72), toggleWorkingDay, setAcademicYear, errorEntries, focusError, jumpToError,
      attention, sealState, coverData,
    };
  }

  return {
    load, reload, t, local, language, lang, rtl, view, draft, applyView,
    type, setType: (next: InstitutionType) => { setType(next); setGlance(`[data-option="${next}"]`); },
    mode, setMode: (next: AdoptionMode) => { setMode(next); setErrors({}); setGlance(`[data-option="${next}"]`); },
    step, flow, completed, reachable, stepIndex,
    saving, activating, dirty, edited, errors, banner, success,
    logoUploading, handleLogoFile,
    newCampus, setNewCampus, campusErrors, editingKey, savingCampus, campusToDelete,
    saveFailed, deleteError, setCampusToDelete: (campus) => { if (!saving) { setDeleteError(null); setCampusToDelete(campus); } },
    headingRef, summaryRef,
    setSchool, continueFrom, goTo, goBack, saveAndExit, handleLogout,
    packages: {
      open: packagesOpen, fromLink: packagesFromLink,
      students: packagesStudents, setStudents: setPackagesStudents,
      period: packagesPeriod, setPeriod: setPackagesPeriod,
      show: () => { setPackagesFromLink(false); setPackagesOpen(true); },
      hide: () => setPackagesOpen(false),
    },
    beforeLeave: async () => (dirty ? Boolean(await persist({ step, complete: false })) : true),
    refreshView,
    saveCampus, editCampus, cancelCampusEdit, confirmDeleteCampus, handleActivate,
    signals: {
      thinking: saving || activating,
      error: errorSeq || null,
      success: savedPulse,
      celebrate: Boolean(success),
      glance,
    },
    ready,
  };
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** After a step change, bring the desk back to the top when the card's head scrolled away. */
function scrollDeskToTop() {
  const card = document.querySelector("[data-step-card]");
  if (card && card.getBoundingClientRect().top < 0) window.scrollTo({ top: 0, behavior: "instant" });
}

function prefilledCampus(city?: string | null): CampusForm {
  return { ...emptyCampus(), city: city ?? "" };
}

/** Focuses an errored field (`campus:<key>` → the roster row) and centres it. */
function focusFieldById(field: string) {
  const campusKey = field.startsWith("campus:") ? field.slice(7) : null;
  const target = campusKey ? document.getElementById(`campus-${campusKey}`) : document.getElementById(`field-${field}`);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "center" });
}
