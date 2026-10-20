"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import {
  BadgeCheck, CalendarClock, Clock3, FlaskConical, Handshake, Info, Landmark, Lock, Minus, Package, Plus, Sparkles, TrendingUp, type LucideIcon,
} from "lucide-react";
import { CapacityMeter } from "@/components/onboarding/CapacityMeter";
import { ConfirmedChoice } from "@/components/onboarding/ConfirmedChoice";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { PackageCard, packageIds, type PackageCardProps, type PackageMeter } from "@/components/onboarding/PackageCard";
import { PackageHandoff, PackageReceipt, type ReceiptLedgerRow } from "@/components/onboarding/PackageReceipt";
import { PackageVerdict } from "@/components/onboarding/PackageVerdict";
import { useCompactForm } from "@/components/onboarding/use-compact-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { ANNUAL_DISCOUNT, annualMonthlyPrice, type BillingPeriod } from "@/config/plans";
import { explainRecommendation, shortfalls, usage } from "@/lib/billing/recommend-plan";
import { fill, isRtlLanguage } from "@/app/onboarding/copy";
import { getPackageCopy } from "@/app/onboarding/package/copy";

/**
 * The package chooser ("Decision Desk"): one modal for picking or changing the
 * school's package from anywhere in setup. It replaced the /onboarding/package
 * page, which now redirects into the wizard with this open.
 *
 * - Size bar: campuses (from the setup), students (asked once, never invented)
 *   and the billing period. Every card's headroom and the recommendation follow
 *   them live (`explainRecommendation`: the cheapest package covering both; a
 *   paid current package that still fits is kept; nothing is upsold).
 * - Four cards on one subgrid, never reordered; the recommended card alone is
 *   ringed, ribboned and plum. Every card is chosen the same way ("Choose Pro")
 *   and says under its button what Choose will do before anyone clicks.
 * - Footer: Oolee speaks the verdict and mirrors the recommended action.
 * - After Choose: a hand-off panel when leaving for payment, otherwise an
 *   in-modal receipt. Nothing ever implies money moved when it did not.
 */
type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
type Plan = {
  type: PlanType; name: string; price: number | null; features: string[];
  maxStudents: number; maxTeachers: number; maxCampuses: number; aiCredits: number;
};
type Catalogue = {
  plans: Record<PlanType, Plan>;
  currentPlan: PlanType;
  checkoutMode?: "online" | "test" | "reserve";
  paymentMethods?: string[];
  catalogueVersion?: string;
};
type Bank = { bankName: string; accountTitle: string; accountNumber: string; iban: string | null };
type Pending = { intentId: string; plan: string; status: string; provider: string; billingPeriod: string; expectedCampuses?: number; expectedEnrollment?: number };

export type ReceiptData = {
  kind: "active" | "reserved" | "custom" | "bank" | "pending" | "deferred";
  plan: PlanType;
  period: BillingPeriod;
  intentId: string;
  amount?: number | null;
  currency?: string | null;
  bank?: Bank | null;
  /** The size the choice was made for (a receipt rebuilt from a pending choice keeps its own). */
  size?: { campuses: number; students: number | null };
};

export type PackageChooserProps = {
  onClose(): void;
  /** After a choice that stays in setup (the wizard refreshes its view). */
  onChosen(receipt: ReceiptData): void;
  /** The wizard's language: the dialog's direction never flips mid-open. */
  language: string;
  /** The wizard step to come back to after an external payment. */
  returnStep: string;
  /** Campuses the setup plans (at least 1). */
  campuses: number;
  /** Expected students; null/undefined = not answered (campuses alone decide). */
  students?: number | null;
  onStudentsChange?(students: number | null): void;
  period?: BillingPeriod;
  onPeriodChange?(period: BillingPeriod): void;
  /** Whether the owner has chosen a package yet (until then nothing reads as "kept"). */
  hasChoice?: boolean;
  /** A package already chosen but not active (reserved, requested, checkout started). */
  pending?: Pending | null;
  /** Where the team will write (the institution's contact email). */
  contactEmail?: string;
  /** Persists an edited setup before leaving for payment, so the unsaved-changes guard cannot block it. */
  beforeLeave?(): Promise<boolean>;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

type Phase = { kind: "choose" } | { kind: "pay"; plan: PlanType } | { kind: "handoff"; plan: PlanType; url: string; test: boolean } | { kind: "receipt"; receipt: ReceiptData };
type ChooseError = { title: string; body: string; intentId?: string; retry: PlanType };

const ORDER: PlanType[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];
/** Catalogue features that only restate a meter or tile (students, teachers, campuses, AI credits). */
const LIMIT_FEATURE = /^(up to [\d,]+|unlimited|[\d,]+)\s+(students?|teachers?|teacher accounts?|campus(es)?|ai credits)/i;
const number = (value: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value);
const pkr = (value: number) => `PKR ${number(value)}`;
/** A fresh idempotency key (randomUUID needs a secure context; the fallback keeps plain-http previews working). */
function newSelectionKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PackageChooser({
  onClose, onChosen, language, returnStep, campuses: initialCampuses, students: initialStudents, onStudentsChange,
  period: initialPeriod, onPeriodChange, pending, hasChoice = true, contactEmail, beforeLeave, returnFocusRef,
}: PackageChooserProps) {
  const copy = getPackageCopy(language);
  const c = copy.chooser;
  const rtl = isRtlLanguage(language);
  const compact = useCompactForm();
  const reduced = useReducedMotion() ?? false;
  const verdictId = useId();
  const periodLabelId = useId();
  const bodyId = useId();

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loadError, setLoadError] = useState("");
  const [campuses, setCampuses] = useState(Math.max(1, initialCampuses));
  const [students, setStudentsState] = useState<number | null>(initialStudents ?? null);
  const [period, setPeriodState] = useState<BillingPeriod>(initialPeriod ?? "monthly");
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [busyPlan, setBusyPlan] = useState<PlanType | null>(null);
  const [error, setError] = useState<ChooseError | null>(null);
  const [errorSeq, setErrorSeq] = useState(0);
  const [openRows, setOpenRows] = useState<Set<PlanType> | null>(null);
  // The card the owner clicked: it is highlighted and the footer continues with it.
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  // Idempotency keys per distinct selection (state, not a ref, so handlers stay plain render values).
  const [keys, setKeys] = useState<Record<string, string>>({});
  const stageRef = useRef<HTMLElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const handoffRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const setStudents = (next: number | null) => { setStudentsState(next); onStudentsChange?.(next); };
  const setPeriod = (next: BillingPeriod) => { setPeriodState(next); onPeriodChange?.(next); };

  // Dependency-free so the effect fetches once; the message falls back to the localized copy at render.
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/onboarding/package", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "");
      setCatalogue(data as Catalogue);
    } catch (e) {
      setLoadError(e instanceof Error && e.message ? e.message : "failed");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const plans = useMemo(() => (catalogue ? ORDER.map((type) => catalogue.plans[type]).filter(Boolean) : []), [catalogue]);
  const currentPlan = catalogue?.currentPlan ?? "FREE";
  const verdict = useMemo(() => explainRecommendation(plans, { campuses, students }, currentPlan), [plans, campuses, students, currentPlan]);
  const rec = verdict?.plan ?? null;
  const mode = catalogue?.checkoutMode ?? "online";
  const nameOf = (type: string) => copy.planNames[type as PlanType] ?? type;

  // Focus follows the phase: the receipt or hand-off panel when it appears, the packages when coming back.
  const firstPhase = useRef(true);
  useEffect(() => {
    if (firstPhase.current) { firstPhase.current = false; return; }
    if (phase.kind === "receipt") receiptRef.current?.focus();
    else if (phase.kind === "handoff" || phase.kind === "pay") handoffRef.current?.focus();
    else stageRef.current?.focus();
  }, [phase.kind]);

  // A failed choice moves focus to the error (the pressed button may have been disabled meanwhile).
  useEffect(() => { if (errorSeq) errorRef.current?.focus(); }, [errorSeq]);

  // ── Copy built from the live size ──
  const campusesText = c.campusCount(campuses);
  const studentsText = students == null ? "" : c.studentCount(students);

  const priceParts = (plan: Plan): PackageCardProps["price"] => {
    if (plan.price == null) return { amount: c.customPrice, note: c.customNote, periodKey: period, short: { amount: c.customPrice } };
    if (plan.price === 0) return { amount: copy.free, note: c.noCard, periodKey: period, short: { amount: copy.free } };
    if (period === "monthly") {
      return { amount: number(plan.price), currency: "PKR", unit: c.unitMonth, note: c.billedMonthly, periodKey: period, short: { amount: pkr(plan.price), unit: c.unitMonth, ltr: true } };
    }
    const total = Math.round(plan.price * (1 - ANNUAL_DISCOUNT) * 12);
    const monthly = annualMonthlyPrice(plan.price) ?? plan.price;
    return {
      amount: number(monthly), currency: "PKR", unit: c.unitMonth, was: number(plan.price), wasSr: fill(c.wasSr, pkr(plan.price)),
      note: <><span>{fill(c.billedYearly, pkr(total))}</span><span className="sk-save-chip">{fill(c.saveYearly, pkr(plan.price * 12 - total))}</span></>,
      periodKey: period, short: { amount: pkr(monthly), unit: c.unitMonth, ltr: true },
    };
  };
  const priceLine = (plan: Plan, billing: BillingPeriod = period) => {
    if (plan.price == null) return fill(c.verdict.price, c.customPrice, c.customNote);
    if (plan.price === 0) return fill(c.verdict.price, copy.free, c.noCard);
    if (billing === "monthly") return fill(c.verdict.price, `${pkr(plan.price)}${c.unitMonth}`, c.billedMonthly);
    return fill(c.verdict.price, `${pkr(annualMonthlyPrice(plan.price) ?? plan.price)}${c.unitMonth}`, fill(c.billedYearly, pkr(Math.round(plan.price * (1 - ANNUAL_DISCOUNT) * 12))));
  };

  const sentence = (() => {
    if (!verdict) return "";
    const name = nameOf(verdict.plan.type);
    const base = verdict.kind === "beyond" ? fill(c.verdict.beyond, name)
      : verdict.kind === "campusesOnly" ? fill(c.verdict.campusesOnly, name, campusesText)
      : verdict.kind === "tight" ? fill(c.verdict.tight, name, campusesText, studentsText, c.studentCount(verdict.plan.maxStudents))
        + (verdict.roomToGrow ? ` ${fill(c.verdict.tightAlt, nameOf(verdict.roomToGrow.type))}` : "")
      : verdict.kind === "current" ? fill(c.verdict.current, name, campusesText, studentsText)
      : verdict.plan.maxStudents < 0 || students == null ? fill(c.verdict.fit, name, campusesText, studentsText)
      : fill(c.verdict.roomy, name, campusesText, studentsText, c.studentCount(verdict.plan.maxStudents - students));
    const why = verdict.whyNot
      ? ` ${verdict.whyNot.limit === "campuses"
        ? fill(c.verdict.whyNotCampuses, nameOf(verdict.whyNot.plan.type), c.campusCount(verdict.whyNot.value))
        : fill(c.verdict.whyNotStudents, nameOf(verdict.whyNot.plan.type), c.studentCount(verdict.whyNot.value))}`
      : "";
    return base + why;
  })();
  const announcement = verdict && phase.kind === "choose" ? fill(c.verdict.announce, nameOf(verdict.plan.type), sentence) : "";

  // One polite announcement after 600ms of quiet; the visible bubble is not live.
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setAnnounce(announcement), 600);
    return () => window.clearTimeout(id);
  }, [announcement]);

  // ── Choose ──
  const pendingFor = (type: PlanType) => (pending && pending.plan === type ? pending : null);
  const waitsOnTeam = (p: Pending | null) => Boolean(p && (p.provider === "SALES_ASSISTED" || p.status === "CUSTOM_QUOTE"));
  /** Chosen earlier with "pay later": choosing it again leads to the payment step, not a status page. */
  const isDeferred = (p: Pending | null) => Boolean(p && p.provider === "PAY_LATER");
  const receiptFromPending = (p: Pending): ReceiptData => ({
    kind: p.status === "CUSTOM_QUOTE" ? "custom" : "reserved",
    plan: p.plan as PlanType, period: p.billingPeriod === "annual" ? "annual" : "monthly", intentId: p.intentId,
    size: p.expectedCampuses ? { campuses: p.expectedCampuses, students: p.expectedEnrollment || null } : undefined,
  });
  /** A free package cannot replace an active paid one here (moving down happens from Billing after setup). */
  const downgradeBlocked = (plan: Plan) => plan.price === 0 && currentPlan !== "FREE";
  /** Opens an order's status page, saving an edited setup first so the leave guard cannot block it. */
  const openStatus = async (intentId: string) => {
    if (busyPlan) return;
    if (beforeLeave && !(await beforeLeave())) {
      setError({ title: c.failTitle, body: c.saveFirstFailed, retry: rec?.type ?? "FREE" });
      setErrorSeq((n) => n + 1);
      return;
    }
    router.push(`/onboarding/package/status?intentId=${encodeURIComponent(intentId)}`);
  };

  const choose = async (plan: Plan, opts: { confirmed?: boolean; payLater?: boolean } = {}) => {
    if (busyPlan) return;
    // Keeping a paid (or custom) package that is already active needs no request.
    if (plan.type === currentPlan && plan.price !== 0) { onClose(); return; }
    if (downgradeBlocked(plan)) return;
    const waiting = pendingFor(plan.type);
    if (waiting && waitsOnTeam(waiting)) {
      setPhase({ kind: "receipt", receipt: receiptFromPending(waiting) });
      return;
    }
    // An order already waiting on payment for this package: its status page, never a second checkout.
    if (waiting && !isDeferred(waiting)) { void openStatus(waiting.intentId); return; }
    // A paid package: first the payment step (pay now / reserve, or skip and pay later).
    if ((plan.price ?? 0) > 0 && !opts.confirmed) {
      setError(null);
      setSelectedPlan(plan.type);
      setPhase({ kind: "pay", plan: plan.type });
      return;
    }
    setError(null);
    setBusyPlan(plan.type);
    if ((plan.price ?? 0) > 0 && mode !== "reserve" && !opts.payLater && beforeLeave && !(await beforeLeave())) {
      setError({ title: c.failTitle, body: c.saveFirstFailed, retry: plan.type });
      setErrorSeq((n) => n + 1);
      setBusyPlan(null);
      return;
    }
    // One idempotency key per distinct selection, so a double click or a retry reuses the same intent.
    const selection = `${plan.type}|${period}|${campuses}|${students ?? 0}|${opts.payLater ? "later" : "now"}`;
    try {
      const idempotencyKey = keys[selection] ?? newSelectionKey();
      if (!keys[selection]) setKeys((prev) => ({ ...prev, [selection]: idempotencyKey }));
      const response = await fetch("/api/onboarding/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.type, billingPeriod: period, expectedCampuses: campuses, expectedEnrollment: students ?? 0, returnStep, idempotencyKey, payLater: opts.payLater || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) setKeys((prev) => { const next = { ...prev }; delete next[selection]; return next; });
        // Server errors are English-only: always show the localized copy.
        setError({ title: c.failTitle, body: c.failBody, intentId: typeof data.intentId === "string" ? data.intentId : undefined, retry: plan.type });
        setErrorSeq((n) => n + 1);
        setBusyPlan(null);
        return;
      }
      if (typeof data.url === "string" && data.url) {
        setPhase({ kind: "handoff", plan: plan.type, url: data.url, test: mode === "test" });
        window.setTimeout(() => window.location.assign(data.url), reduced ? 250 : 450);
        return;
      }
      const receipt: ReceiptData = {
        kind: (data.status === "FREE_SELECTED" && currentPlan === "FREE") || data.status === "SETTLED" ? "active"
          : data.deferred ? "deferred"
          : data.status === "CUSTOM_QUOTE" ? "custom"
          : data.reserved ? "reserved"
          : data.bank ? "bank"
          : "pending",
        plan: plan.type, period, intentId: String(data.intentId ?? ""), size: { campuses, students },
        amount: typeof data.amount === "number" ? data.amount : null,
        currency: typeof data.currency === "string" ? data.currency : null,
        bank: data.bank ?? null,
      };
      setBusyPlan(null);
      setPhase({ kind: "receipt", receipt });
      onChosen(receipt);
    } catch {
      setError({ title: c.failTitle, body: c.failBody, retry: plan.type });
      setErrorSeq((n) => n + 1);
      setBusyPlan(null);
    }
  };

  // ── Card view models ──
  const nextNote = (plan: Plan): PackageCardProps["next"] => {
    const over = plan.maxCampuses >= 0 && campuses > plan.maxCampuses ? c.nextDrafts(campuses - plan.maxCampuses) : undefined;
    const waiting = pendingFor(plan.type);
    const note = (icon: LucideIcon, text: string) => ({ icon, text, extra: over });
    if (downgradeBlocked(plan)) return note(Info, fill(c.next.downgrade, nameOf(currentPlan)));
    if (plan.price === 0) return note(Sparkles, c.next.free);
    if (plan.type === currentPlan) return note(BadgeCheck, c.next.current);
    if (waiting && isDeferred(waiting)) return note(Clock3, c.next.pendingDeferred);
    if (waiting) return note(Clock3, waiting.status === "CUSTOM_QUOTE" ? c.next.pendingCustom : waiting.provider === "SALES_ASSISTED" ? c.next.pendingReserved : c.next.pendingCheckout);
    if (plan.price == null) return note(Handshake, c.next.custom);
    if (mode === "test") return note(FlaskConical, c.next.test);
    if (mode === "reserve") return note(CalendarClock, c.next.reserve);
    const methods = catalogue?.paymentMethods ?? [];
    if (methods.includes("stripe") || methods.includes("safepay")) return note(Lock, c.next.online);
    return note(Landmark, c.next.bank);
  };

  const actionFor = (plan: Plan, place: "card" | "footer"): ReactNode => {
    const ids = packageIds(plan.type);
    const name = nameOf(plan.type);
    const recommended = rec?.type === plan.type;
    const describedBy = place === "card" ? `${ids.fit} ${ids.next}${recommended ? ` ${verdictId}` : ""}` : undefined;
    const waiting = pendingFor(plan.type);
    if (waiting && isDeferred(waiting)) {
      return (
        <Button type="button" variant="default" onClick={() => void choose(plan)} disabled={Boolean(busyPlan)} aria-describedby={describedBy} className="gap-2">
          {c.payNow} <ForwardArrow />
        </Button>
      );
    }
    if (waiting && !waitsOnTeam(waiting)) {
      return (
        <Button type="button" variant="outline" onClick={() => void openStatus(waiting.intentId)} disabled={Boolean(busyPlan)} aria-describedby={describedBy}>
          {c.viewStatus}
        </Button>
      );
    }
    const view = waitsOnTeam(waiting);
    const keepPaid = plan.type === currentPlan && plan.price !== 0;
    const label = view ? (waiting?.status === "CUSTOM_QUOTE" ? c.viewRequest : c.viewReservation)
      : plan.type === currentPlan && hasChoice ? fill(c.keep, name)
      : fill(c.choose, name);
    const variant = view ? "secondary" : keepPaid ? (recommended ? "default" : "secondary") : recommended ? "default" : "outline";
    return (
      <Button
        type="button"
        variant={variant}
        onClick={() => void choose(plan)}
        disabled={Boolean(busyPlan) || downgradeBlocked(plan)}
        loading={busyPlan === plan.type}
        aria-describedby={describedBy}
        className="gap-2"
      >
        {label}{recommended && !view ? <ForwardArrow /> : null}
      </Button>
    );
  };

  const cardFor = (plan: Plan, index: number) => {
    const name = nameOf(plan.type);
    const recommended = rec?.type === plan.type;
    const short = shortfalls(plan, { campuses, students });
    const studentsMeter: PackageMeter = students == null
      ? { label: copy.students, value: plan.maxStudents < 0 ? copy.unlimited : fill(c.upTo, number(plan.maxStudents)), usage: plan.maxStudents < 0 ? null : 0, over: false, unknown: plan.maxStudents >= 0 }
      : { label: copy.students, value: plan.maxStudents < 0 ? copy.unlimited : fill(c.meterOf, number(students), number(plan.maxStudents)), usage: usage(students, plan.maxStudents), over: plan.maxStudents >= 0 && students > plan.maxStudents };
    const campusesMeter: PackageMeter = {
      label: copy.branches,
      value: plan.maxCampuses < 0 ? copy.unlimited : fill(c.meterOf, number(campuses), number(plan.maxCampuses)),
      usage: usage(campuses, plan.maxCampuses),
      over: plan.maxCampuses >= 0 && campuses > plan.maxCampuses,
      graphic: <CapacityMeter planned={campuses} limit={plan.maxCampuses} max={5} />,
    };
    const fit: PackageCardProps["fit"] = short[0] === "campuses"
      ? { tone: "warning", label: c.campusDrafts(campuses - plan.maxCampuses), short: c.tooSmall }
      : short[0] === "students"
        ? { tone: "warning", label: fill(c.studentsOver, c.studentCount((students ?? 0) - plan.maxStudents)), short: c.tooSmall }
        : students == null ? { tone: "neutral", label: c.fitsCampuses, short: c.fitShort } : { tone: "success", label: c.fitsYou, short: c.fitShort };
    const lower = index > 0 ? plans[index - 1] : null;
    const own = plan.features.filter((feature) => !LIMIT_FEATURE.test(feature));
    const items = (lower ? own.filter((feature) => !lower.features.includes(feature)) : own).map((feature) => (
      <span key={feature} lang={copy.featureNames[feature] ? language : "en"} dir="auto">{copy.featureNames[feature] ?? feature}</span>
    ));
    const waiting = pendingFor(plan.type);
    const tags: NonNullable<PackageCardProps["tags"]> = [];
    if (plan.type === currentPlan && hasChoice) tags.push({ label: copy.current, tone: "success", icon: BadgeCheck });
    if (waiting && isDeferred(waiting)) tags.push({ label: c.eyebrows.deferred, tone: "info", icon: Clock3 });
    else if (waiting) tags.push({ label: waiting.status === "CUSTOM_QUOTE" ? c.tagRequested : waiting.provider === "SALES_ASSISTED" ? c.tagReserved : c.tagCheckout, tone: "info", icon: Clock3 });
    if (verdict?.roomToGrow?.type === plan.type) tags.push({ label: c.tagRoom, tone: "brand", icon: TrendingUp });
    const open = openRows ? openRows.has(plan.type) : recommended;
    return (
      <PackageCard
        key={plan.type}
        plan={plan.type}
        name={name}
        tags={tags}
        recommended={recommended ? { label: verdict?.kind === "beyond" ? c.ribbonBeyond : c.recommended } : undefined}
        price={{ ...priceParts(plan), emphasis: recommended }}
        why={recommended ? (students == null ? fill(c.reasonCampuses, campusesText) : fill(c.reason, campusesText, studentsText)) : c.tagline[plan.type]}
        meters={[studentsMeter, campusesMeter]}
        fit={fit}
        limits={[
          { label: copy.teachers, value: plan.maxTeachers < 0 ? copy.unlimited : number(plan.maxTeachers) },
          { label: copy.aiCredits, value: plan.aiCredits < 0 ? copy.unlimited : number(plan.aiCredits) },
        ]}
        features={{ heading: lower ? fill(c.plusHeading, nameOf(lower.type)) : c.includes, items }}
        action={actionFor(plan, "card")}
        next={nextNote(plan)}
        current={plan.type === currentPlan}
        busy={busyPlan === plan.type}
        compact={compact}
        open={open}
        onSelect={busyPlan || downgradeBlocked(plan) ? undefined : () => setSelectedPlan(plan.type)}
        selected={selectedPlan === plan.type ? { label: c.selected } : undefined}
        onToggle={() => setOpenRows((prev) => {
          // Until the first toggle the open row follows the recommendation; after that only the user moves rows.
          const next = new Set(prev ?? (rec ? [rec.type] : []));
          if (next.has(plan.type)) next.delete(plan.type); else next.add(plan.type);
          return next;
        })}
      />
    );
  };

  // ── Receipt ──
  const receiptView = (receipt: ReceiptData) => {
    const plan = catalogue?.plans[receipt.plan];
    const name = nameOf(receipt.plan);
    const ledger: ReceiptLedgerRow[] = [
      { label: copy.package, value: name },
      { label: c.ledgerBilling, value: receipt.period === "annual" ? copy.annual : copy.monthly },
    ];
    const size = receipt.size ?? { campuses, students };
    if (receipt.kind === "bank") {
      if (receipt.amount != null) ledger.push({ label: copy.savedAmount, value: `${receipt.currency ?? "PKR"} ${number(receipt.amount)}`, ltr: true });
      if (receipt.bank) {
        ledger.push({ label: copy.bank, value: receipt.bank.bankName });
        ledger.push({ label: copy.accountTitle, value: receipt.bank.accountTitle });
        ledger.push({ label: copy.accountNumber, value: receipt.bank.accountNumber, ltr: true, copy: { label: fill(c.copyValue, copy.accountNumber), text: receipt.bank.accountNumber } });
        if (receipt.bank.iban) ledger.push({ label: copy.iban, value: receipt.bank.iban, ltr: true, copy: { label: fill(c.copyValue, copy.iban), text: receipt.bank.iban } });
      }
    } else {
      ledger.push({ label: c.ledgerSize, value: fill(c.sizeValue, c.campusCount(size.campuses), size.students == null ? c.studentsNotSet : c.studentCount(size.students)) });
    }
    if (receipt.intentId) ledger.push({ label: copy.orderReference, value: receipt.intentId, ltr: true, copy: { label: fill(c.copyValue, copy.orderReference), text: receipt.intentId } });
    const steps = c.steps[receipt.kind].map((label, index) => ({ label: fill(label, name), state: (index === 0 ? "done" : index === 1 ? "current" : "pending") as "done" | "current" | "pending" }));
    const currentLimit = catalogue?.plans[currentPlan]?.maxCampuses ?? -1;
    const meanwhile = receipt.kind !== "active" && currentLimit >= 0 && size.campuses > currentLimit ? fill(c.meanwhile, c.campusCount(currentLimit), name) : undefined;
    return (
      <PackageReceipt
        focusRef={receiptRef}
        bodyId={bodyId}
        body={fill(c.bodies[receipt.kind], name)}
        label={fill(c.titles[receipt.kind], name)}
        head={{ title: name, description: plan ? priceLine(plan, receipt.period) : "", tag: c.tags[receipt.kind] }}
        ledger={ledger}
        steps={steps}
        stepsLabel={c.stepsLabel}
        stepStates={c.stepState}
        meanwhile={meanwhile}
        contact={(receipt.kind === "reserved" || receipt.kind === "custom") && contactEmail ? fill(c.contactAt, contactEmail) : undefined}
        copied={c.copied}
      />
    );
  };

  // ── Header and footer per phase ──
  const receipt = phase.kind === "receipt" ? phase.receipt : null;
  const payPlan = phase.kind === "pay" ? catalogue?.plans[phase.plan] ?? null : null;
  const header = phase.kind === "pay"
    ? { icon: Lock, tone: "violet" as const, eyebrow: c.payEyebrow, title: fill(c.payTitle, nameOf(phase.plan)), subtitle: undefined }
    : phase.kind === "handoff"
    ? { icon: Lock, tone: "violet" as const, eyebrow: c.eyebrow, title: phase.test ? c.handoffTestTitle : c.handoffTitle, subtitle: undefined }
    : receipt
      ? { icon: receipt.kind === "active" ? BadgeCheck : Clock3, tone: receipt.kind === "active" ? "emerald" as const : "violet" as const, eyebrow: c.eyebrows[receipt.kind], title: fill(c.titles[receipt.kind], nameOf(receipt.plan)), subtitle: undefined }
      : { icon: Package, tone: "violet" as const, eyebrow: c.eyebrow, title: c.title, subtitle: c.subtitle };

  const signals = {
    thinking: Boolean(busyPlan),
    error: errorSeq || null,
    success: Boolean(receipt && receipt.kind !== "active"),
    celebrate: receipt?.kind === "active",
    glance: rec && phase.kind === "choose" ? `[data-plan="${rec.type}"] h3` : null,
  };

  const footer = phase.kind === "handoff" ? undefined : (
    <PackageVerdict
      id={verdictId}
      text={receipt || phase.kind === "pay" ? undefined : catalogue ? sentence : c.verdict.loading}
      price={!receipt && phase.kind !== "pay" && rec ? priceLine(rec) : undefined}
      announce={receipt ? undefined : announce}
      signals={signals}
      actions={phase.kind === "pay" ? (
        <Button type="button" variant="ghost" onClick={() => { setError(null); setPhase({ kind: "choose" }); }} disabled={Boolean(busyPlan)}>{c.changeChoice}</Button>
      ) : receipt ? (
        <>
          {receipt.kind !== "active" ? (
            <Button type="button" variant="ghost" onClick={() => { setError(null); setPhase({ kind: "choose" }); }}>{c.changeChoice}</Button>
          ) : null}
          <Button type="button" onClick={onClose} className="gap-2">{c.continueSetup} <ForwardArrow /></Button>
        </>
      ) : (
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={Boolean(busyPlan)}>{c.notNow}</Button>
          {/* Keyed by plan: a recommendation that changes under the pointer remounts the button, so no click lands on the new plan. */}
          {selectedPlan && catalogue?.plans[selectedPlan] ? (
            <Button key={`footer-selected-${selectedPlan}`} type="button" onClick={() => void choose(catalogue.plans[selectedPlan])} disabled={Boolean(busyPlan) || downgradeBlocked(catalogue.plans[selectedPlan])} loading={busyPlan === selectedPlan} className="gap-2">
              {fill(c.continueWith, nameOf(selectedPlan))} <ForwardArrow />
            </Button>
          ) : rec ? <span key={`footer-${rec.type}`} className="contents">{actionFor(rec, "footer")}</span> : null}
        </>
      )}
    />
  );

  return (
    <Modal
      onClose={onClose}
      size="xl"
      dir={rtl ? "rtl" : "ltr"}
      lang={language}
      icon={header.icon}
      tone={header.tone}
      eyebrow={header.eyebrow}
      title={header.title}
      subtitle={header.subtitle}
      bodyClassName="p-0 sm:p-0"
      dismissible={!busyPlan && phase.kind !== "handoff"}
      initialFocusRef={stageRef}
      returnFocusRef={returnFocusRef}
      describedBy={phase.kind === "choose" ? verdictId : phase.kind === "receipt" ? bodyId : undefined}
      footer={footer}
    >
      <div className="sk-chooser">
        {phase.kind === "choose" ? (
          <section className="sk-chooser-bar" aria-label={c.sizeLabel}>
            <Stepper id="chooser-campuses" label={copy.campuses} value={campuses} min={1} max={1000} step={1} required disabled={Boolean(busyPlan)}
              decreaseLabel={c.fewerCampuses} increaseLabel={c.moreCampuses} onChange={(next) => setCampuses(next ?? 1)} />
            <Stepper id="chooser-students" label={c.studentsLabel} hint={c.perStudentHint} placeholder={c.studentsPlaceholder} value={students} min={0} max={1000000} step={50} disabled={Boolean(busyPlan)}
              decreaseLabel={c.fewerStudents} increaseLabel={c.moreStudents} onChange={setStudents} />
            <div className="sk-chooser-period">
              <p id={periodLabelId} className="sk-field-label">{copy.billingPeriod}</p>
              <div role="group" aria-labelledby={periodLabelId} className="sk-period-toggle" data-period={period}>
                <span className="sk-period-thumb" aria-hidden="true" />
                {(["monthly", "annual"] as const).map((choice) => (
                  <Button key={choice} type="button" variant="ghost" size="sm" aria-pressed={period === choice} onClick={() => setPeriod(choice)} disabled={Boolean(busyPlan)} className="aria-pressed:text-brand-800">
                    {choice === "monthly" ? copy.monthly : copy.annual}
                    {choice === "annual" ? <span className="sk-save-chip">{fill(c.save, Math.round(ANNUAL_DISCOUNT * 100))}</span> : null}
                  </Button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {phase.kind === "choose" && (mode === "test" || mode === "reserve" || error) ? (
          <div className="sk-chooser-notices">
            {mode === "test" ? <Alert compact tone="warning" icon={FlaskConical} live="off" title={c.modeTestTitle}>{c.modeTest}</Alert> : null}
            {mode === "reserve" ? <Alert compact tone="info" icon={Info} live="off">{c.modeReserve}</Alert> : null}
            {error ? (
              <div ref={errorRef} tabIndex={-1} className="outline-none">
                <Alert
                  tone="danger"
                  title={error.title}
                  actions={(
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        const plan = catalogue?.plans[error.retry];
                        stageRef.current?.focus();
                        if (plan) void choose(plan);
                      }}>{c.retry}</Button>
                      {error.intentId ? <Button type="button" variant="link" size="sm" onClick={() => void openStatus(error.intentId!)}>{c.viewStatus}</Button> : null}
                    </>
                  )}
                >
                  {error.body}
                </Alert>
              </div>
            ) : null}
          </div>
        ) : null}

        <section ref={stageRef} tabIndex={-1} aria-label={c.packagesLabel} aria-busy={Boolean(busyPlan) || (!catalogue && !loadError)} className="sk-chooser-stage">
          {phase.kind === "pay" && payPlan ? (
            <div ref={handoffRef} tabIndex={-1} className="sk-pay-step">
              <ConfirmedChoice
                title={nameOf(payPlan.type)}
                description={priceLine(payPlan)}
                tag={c.payEyebrow}
                art={<Package aria-hidden="true" />}
              />
              <p className="sk-receipt-body">{fill(c.payBody, nameOf(payPlan.type))}</p>
              {error ? <Alert tone="danger" title={error.title}>{error.body}</Alert> : null}
              <div className="sk-pay-actions">
                <Button type="button" onClick={() => void choose(payPlan, { confirmed: true })} disabled={Boolean(busyPlan)} loading={busyPlan === payPlan.type && !error} className="gap-2">
                  <Lock aria-hidden="true" className="size-4" />{mode === "reserve" ? fill(c.reserveNow, nameOf(payPlan.type)) : mode === "test" ? c.payNowTest : c.payNow}
                </Button>
                <Button type="button" variant="outline" onClick={() => void choose(payPlan, { confirmed: true, payLater: true })} disabled={Boolean(busyPlan)}>
                  {c.payLater}
                </Button>
              </div>
            </div>
          ) : phase.kind === "handoff" ? (
            <PackageHandoff focusRef={handoffRef} text={fill(phase.test ? c.handoffTestBody : c.handoffBody, nameOf(phase.plan))} url={phase.url} fallbackLabel={c.handoffFallback} />
          ) : receipt ? (
            receiptView(receipt)
          ) : loadError && !catalogue ? (
            <ErrorState title={c.loadFailed} description={loadError === "failed" ? undefined : loadError} onRetry={() => void load()} retryLabel={c.retry} />
          ) : !catalogue ? (
            <SkeletonRegion label={c.loading} className="sk-package-grid">
              {ORDER.map((type, index) => (
                <div key={type} className="sk-package-card animate-skeleton-in" style={{ animationDelay: `${index * 70}ms` }}>
                  <Skeleton className="h-5 w-24" /><Skeleton className="h-9 w-36" /><Skeleton className="h-4 w-full" />
                  <Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full" /><Skeleton className="h-11 w-full rounded-2xl" />
                </div>
              ))}
            </SkeletonRegion>
          ) : (
            <>
              <div className="sk-package-grid sk-stagger">{plans.map(cardFor)}</div>
              <p className="sk-chooser-fineprint">
                {copy.pricesAndTerms}
                {catalogue.catalogueVersion ? <> · {copy.catalogue} <bdi dir="ltr">{catalogue.catalogueVersion}</bdi></> : null}
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

/**
 * A number with − / + on one field surface (an InputGroup whose affixes are the buttons). Typing keeps a
 * local string and commits after 300ms of quiet or on blur (clamped); − and + commit at once. Empty means
 * "not answered" unless `required`.
 */
function Stepper({ id, label, hint, placeholder, value, min, max, step, required, disabled, decreaseLabel, increaseLabel, onChange }: {
  id: string; label: string; hint?: string; placeholder?: string; value: number | null; min: number; max: number; step: number;
  required?: boolean; disabled?: boolean; decreaseLabel: string; increaseLabel: string; onChange(next: number | null): void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const commit = (raw: string) => {
    window.clearTimeout(timer.current);
    setDraft(null);
    if (raw.trim() === "") { onChange(required ? min : null); return; }
    const parsed = Number(raw);
    onChange(Number.isFinite(parsed) ? clamp(parsed) : required ? min : null);
  };
  const shown = draft ?? (value == null ? "" : String(value));
  return (
    <div className="sk-stepper">
      <Label htmlFor={id} className="sk-field-label">{label}</Label>
      <InputGroup className="sk-stepper-field">
        <IconButton data-field-affix="start" label={decreaseLabel} tooltip={false} size="md" variant="ghost" disabled={disabled || value == null || value <= min}
          onClick={() => {
            setDraft(null);
            const next = value == null ? null : clamp(value - step);
            onChange(next);
            // Reaching the bound disables this button under the pointer/keyboard: keep focus in the field.
            if (next != null && next <= min) document.getElementById(id)?.focus();
          }}><Minus aria-hidden="true" /></IconButton>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={shown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => commit(raw), 300);
          }}
          onBlur={(event) => { if (draft !== null) commit(event.target.value); }}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="sk-stepper-input tabular-nums"
        />
        <IconButton data-field-affix="end" label={increaseLabel} tooltip={false} size="md" variant="ghost" disabled={disabled || (value != null && value >= max)}
          onClick={() => {
            setDraft(null);
            const next = clamp((value ?? 0) + step);
            onChange(next);
            if (next >= max) document.getElementById(id)?.focus();
          }}><Plus aria-hidden="true" /></IconButton>
      </InputGroup>
      {hint ? <p id={`${id}-hint`} className="sk-stepper-hint">{hint}</p> : null}
    </div>
  );
}
