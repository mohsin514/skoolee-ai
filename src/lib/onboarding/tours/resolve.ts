/**
 * Pure tour resolver (SPEC §9.3). No React, no DOM, no server imports: unit-tested in tests/tour/resolve-tour.test.ts.
 * Visibility follows the navigation registry, so a step never points at a control the caller cannot see, and a step
 * that points at a sidebar control carries the sidebar's own name for it (§8.2 one name per concept).
 */
import { ROLE_NAV, isVisible, labelFor, leafForView, leaves, mobileLeaves, type ConsoleId, type ConsoleNav, type NavGroup, type NavLeaf } from "@/lib/navigation/role-nav";
import { translateUi } from "@/lib/locale/ui-messages";
import { TOUR_IDS, pendingStartKey, type Localized, type TourDef, type TourId, type TourStep } from "./types";

export const HELP_ANCHOR = "shell.header.help";
export const MOBILE_MORE_ANCHOR = "shell.mobile.more";

export const HELP_TITLE: Localized = ["Help is always here", "المساعدة هنا دائمًا", "مدد ہمیشہ یہاں ہے"];
/** The closing card added when fewer than three steps survive the access filters. */
export const CLOSING_TITLE: Localized = ["That's the essentials", "هذه هي الأساسيات", "بس یہی بنیادی باتیں ہیں"];
export const CLOSING_BODY: Localized = [
  "Open Help any time to replay this tour.",
  "افتح «المساعدة» في أي وقت لإعادة هذه الجولة.",
  "یہ تعارفی دورہ دوبارہ دیکھنے کے لیے کسی بھی وقت «مدد» کھولیں۔",
];
/** Mobile steps never open the navigation sheet; they point at More and say so. */
const UNDER_MORE: Localized = ["Under More: {0}", "ضمن «المزيد»: {0}", "«مزید» میں: {0}"];

export function helpStep(body: Localized): TourStep {
  return { id: "help", anchor: HELP_ANCHOR, title: HELP_TITLE, body };
}

/* ── Flagships (addendum 2026-10-22). AI Workflows and Exam Studio are what SkooleeAI is sold on, so every tour whose
   role may use them spotlights both the Today card (`<console>.today.flagship-ai|-exams`, rendered by the shared
   FlagshipCard through its `tourAnchor`) and the sidebar entry (`shell.nav.ai-workflows|exam-studio`, placed right
   after Today by the registry). Card steps carry `requires` (the card is only rendered with that access); nav steps
   follow the registry's own visibility and are titled from it like every nav step. Copy is truthful: an AI draft is
   reviewed and approved before anything applies. ── */
export const AI_WORKFLOWS_TITLE: Localized = ["AI Workflows", "مسارات الذكاء الاصطناعي", "اے آئی ورک فلوز"];
export const EXAM_STUDIO_TITLE: Localized = ["Exam Studio", "استوديو الاختبارات", "ایگزام اسٹوڈیو"];
const START_WITH_AI: Localized = ["Start with AI", "ابدأ بالذكاء الاصطناعي", "اے آئی سے آغاز کریں"];
const CREATE_AN_EXAM: Localized = ["Create an exam", "أنشئ اختبارًا", "امتحان بنائیں"];
const EXAM_STUDIO_BODY: Localized = [
  "AI-built assessments, secure online delivery, marking and learning recovery, all in one place.",
  "اختبارات يبنيها الذكاء الاصطناعي، وتقديم آمن عبر الإنترنت، وتصحيح، وتعويض لما فات من التعلّم، في مكان واحد.",
  "اے آئی سے تیار جائزے، محفوظ آن لائن امتحان، جانچ اور تعلیمی کمی کی تلافی، سب ایک جگہ۔",
];
/** The Exam Studio card's sentence for the academic roles (principal, teacher). */
export const EXAM_CARD_BODY: Localized = [
  "Create an exam with AI from your source material, review the paper, then deliver it securely and mark it.",
  "أنشئ اختبارًا بالذكاء الاصطناعي من موادك المرجعية، وراجع الورقة، ثم قدّمه بأمان وصحّحه.",
  "اپنے ماخذی مواد سے اے آئی کے ذریعے امتحان بنائیں، پرچے کا جائزہ لیں، پھر اسے محفوظ طریقے سے لیں اور جانچیں۔",
];

export type FlagshipConsole = "super" | "admin" | "principal" | "teacher";
/** The Today card of a flagship; `prep` is the console's landing (`view` for view consoles, `route` for path ones). */
export function flagshipCardStep(console: FlagshipConsole, kind: "ai" | "exams", body: Localized, prep: Pick<TourStep, "view" | "route">, requires: string[] = []): TourStep {
  return {
    id: kind === "ai" ? "flagship-ai" : "flagship-exams",
    anchor: `${console}.today.flagship-${kind}`,
    title: kind === "ai" ? START_WITH_AI : CREATE_AN_EXAM,
    body,
    requires: [kind === "ai" ? "schoolAi" : "schoolAiExams", ...requires],
    ...prep,
  };
}
/** The AI Workflows entry for the roles that review and run drafts on a campus (admin, principal). */
const AI_WORKFLOWS_BODY: Localized = [
  "Every AI draft waiting for your review, and the runs that apply approved ones, live here.",
  "هنا كل مسودة ذكاء اصطناعي تنتظر مراجعتك، والتشغيلات التي تطبّق المعتمد منها.",
  "آپ کے جائزے کے منتظر اے آئی کے تمام مسودے، اور منظور شدہ مسودوں کو لاگو کرنے والے عمل، یہیں ہیں۔",
];
/** The AI Workflows sidebar entry (title from the registry at resolve time). */
export function aiWorkflowsStep(body: Localized = AI_WORKFLOWS_BODY): TourStep {
  return { id: "ai-workflows", anchor: "shell.nav.ai-workflows", title: AI_WORKFLOWS_TITLE, body };
}
/** The Exam Studio sidebar entry (title from the registry at resolve time). */
export function examStudioStep(body: Localized = EXAM_STUDIO_BODY): TourStep {
  return { id: "exam-studio", anchor: "shell.nav.exam-studio", title: EXAM_STUDIO_TITLE, body };
}

export function localize(value: Localized, language: string): string {
  return language === "ar" ? value[1] : language === "ur" ? value[2] : value[0];
}

const underMore = (title: Localized): Localized => [
  UNDER_MORE[0].replace("{0}", title[0]),
  UNDER_MORE[1].replace("{0}", title[1]),
  UNDER_MORE[2].replace("{0}", title[2]),
];

/** admin → admin-school for the standalone owner (two hats), admin-campus otherwise; every other console has one tour. */
export function tourForConsole(console: ConsoleId, access: Record<string, boolean>): TourId {
  if (console === "admin") return access.standaloneOwner === true ? "admin-school" : "admin-campus";
  return console;
}

export type NavRef = { kind: "leaf"; id: string } | { kind: "group"; id: string };
export function navRefOf(anchor: string): NavRef | null {
  const leaf = /^shell\.nav\.([a-z0-9-]+)$/.exec(anchor);
  if (leaf) return { kind: "leaf", id: leaf[1] };
  const group = /^shell\.nav-group\.([a-z0-9-]+)$/.exec(anchor);
  return group ? { kind: "group", id: group[1] } : null;
}

function groupOf(nav: ConsoleNav, id: string): NavGroup | undefined {
  return nav.entries.find((e): e is NavGroup => e.kind === "group" && e.id === id);
}

function leafOf(nav: ConsoleNav, id: string): NavLeaf | undefined {
  return leaves(nav).find((l) => l.id === id);
}

/**
 * The title of a step anchored on a sidebar control: exactly what the sidebar shows — the registry label for this
 * access (`labelWhen`), translated with translateUi as RoleShell translates it — so the card and the control it rings
 * never name one thing twice (§8.2, R11). Null when the registry has no such entry.
 */
export function navTitle(nav: ConsoleNav, ref: NavRef, access: Record<string, boolean>): Localized | null {
  const entry = ref.kind === "group" ? groupOf(nav, ref.id) : leafOf(nav, ref.id);
  if (!entry) return null;
  const label = labelFor(entry, access);
  return [label, translateUi(label, "ar"), translateUi(label, "ur")];
}

/** Leaf visible in the sidebar (its group visible too); group visible with at least one visible child. */
function navVisible(nav: ConsoleNav, ref: NavRef, access: Record<string, boolean>): boolean {
  if (ref.kind === "group") {
    const group = groupOf(nav, ref.id);
    return Boolean(group && isVisible(group.visible, access) && group.children.some((c) => isVisible(c.visible, access) && !c.hiddenInNav));
  }
  const leaf = leafOf(nav, ref.id);
  if (!leaf || leaf.hiddenInNav || !isVisible(leaf.visible, access)) return false;
  const group = leaf.group ? groupOf(nav, leaf.group) : undefined;
  return !group || isVisible(group.visible, access);
}

/**
 * Drops steps whose `requires`/`unless`/`mobile.skip` fail or whose registry control is hidden for this access,
 * applies the first matching variant and the mobile anchor, and resolves the group to reveal. When fewer than three
 * steps remain, the tour closes on the Help menu with "That's the essentials".
 */
export function resolveTour(def: TourDef, ctx: { access: Record<string, boolean>; mobile: boolean }): TourStep[] {
  const nav = ROLE_NAV[def.console];
  const { access, mobile } = ctx;
  const slots = new Set(mobileLeaves(nav, access).map((l) => l.id));
  const steps: TourStep[] = [];
  for (const step of def.steps) {
    if (step.requires && !step.requires.every((k) => access[k] === true)) continue;
    if (step.unless && step.unless.some((k) => access[k] === true)) continue;
    if (mobile && step.mobile?.skip) continue;
    const ref = navRefOf(step.anchor);
    if (ref && !navVisible(nav, ref, access)) continue;
    if (step.view) {
      const viewLeaf = leafForView(def.console, step.view);
      if (viewLeaf && !navVisible(nav, { kind: "leaf", id: viewLeaf.id }, access)) continue;
    }
    const variant = step.variants?.find((v) => access[v.when] === true);
    let title = (ref ? navTitle(nav, ref, access) : null) ?? variant?.title ?? step.title;
    const body = variant?.body ?? step.body;
    let anchor = step.anchor;
    let revealGroup = step.revealGroup;
    if (mobile) {
      revealGroup = undefined;
      if (step.mobile?.anchor) anchor = step.mobile.anchor;
      else if (ref?.kind === "leaf" && slots.has(ref.id)) anchor = `shell.mobile.${ref.id}`;
      else if (ref) { anchor = MOBILE_MORE_ANCHOR; title = underMore(title); }
    } else if (!revealGroup && ref?.kind === "leaf") {
      revealGroup = leafOf(nav, ref.id)?.group;
    }
    const resolved: TourStep = { ...step, anchor, title, body, revealGroup };
    delete resolved.variants;
    steps.push(resolved);
  }
  if (steps.length < 3) {
    const last = steps[steps.length - 1];
    if (last && last.anchor === HELP_ANCHOR) steps[steps.length - 1] = { ...last, id: "essentials", title: CLOSING_TITLE };
    else steps.push({ id: "essentials", anchor: HELP_ANCHOR, title: CLOSING_TITLE, body: CLOSING_BODY });
  }
  return steps;
}

const IGNORED_PARAM = (key: string) => key === "lang" || key === "tour" || key.startsWith("utm_");

/**
 * The auto-start location (§9.1): path consoles on their base path; view consoles on the base with `view` absent or
 * the default view. `lang`, `utm_*` and `tour` are ignored; any other parameter or a hash other than
 * `#workspace-content` is a deep link and never interrupted.
 */
export function isConsoleLanding(nav: ConsoleNav, pathname: string, search: string, hash = ""): boolean {
  if (pathname !== nav.base) return false;
  if (hash && hash !== "#" && hash !== "#workspace-content") return false;
  for (const [key, value] of new URLSearchParams(search)) {
    if (IGNORED_PARAM(key)) continue;
    if (nav.mode === "view" && key === "view" && (value === "" || value === nav.defaultView)) continue;
    return false;
  }
  return true;
}

/** Inside the console's own routes (not a framed module route such as /messages, /care or /ai). */
export function isInsideConsole(nav: ConsoleNav, pathname: string): boolean {
  if (nav.mode === "view") return pathname === nav.base;
  return pathname === nav.base || pathname.startsWith(`${nav.base}/`);
}

/** "Tour this page": from the landing, the whole tour; elsewhere the first step whose view or route matches where the
 *  user is, else the first step. */
export function startIndexFor(steps: TourStep[], nav: ConsoleNav, pathname: string, search: string): number {
  if (isConsoleLanding(nav, pathname, search)) return 0;
  const params = new URLSearchParams(search);
  const view = nav.mode === "view" ? params.get("view") || nav.defaultView || null : null;
  const index = steps.findIndex((s) => (s.view && pathname === nav.base && s.view === view) || (s.route && s.route === pathname));
  return index < 0 ? 0 : index;
}

/** The console a tour runs in (admin has two variants). */
export function tourConsole(id: TourId): ConsoleId {
  return id === "admin-school" || id === "admin-campus" ? "admin" : id;
}

/* ── Framed-route hand-off (§9.1): the frame stores the tour id, the console's provider consumes it once. ── */
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
/** The key lives in ./types (dependency-free) so the global welcome can check it without this module. */
export { pendingStartKey };

/** Returns false when storage is unavailable (private window, blocked site data); the caller then deep-links ?tour=. */
export function writePendingStart(storage: StorageLike | null, userId: string, tourId: TourId): boolean {
  if (!storage) return false;
  try { storage.setItem(pendingStartKey(userId), tourId); return true; } catch { return false; }
}

/** Reads and clears the pending start; only a tour of this console is returned. */
export function consumePendingStart(storage: StorageLike | null, userId: string, console: ConsoleId): TourId | null {
  if (!storage) return null;
  let value: string | null;
  try {
    value = storage.getItem(pendingStartKey(userId));
    if (value !== null) storage.removeItem(pendingStartKey(userId));
  } catch { return null; }
  if (!value || !(TOUR_IDS as readonly string[]).includes(value)) return null;
  return tourConsole(value as TourId) === console ? (value as TourId) : null;
}

/**
 * "Never while a form is dirty" (§9.1). Every unsaved-work guard in the app (useUnsavedGuard, the exam player, the
 * application form) listens for beforeunload and cancels it while there is unsaved work, and nothing else listens for
 * it. A synthetic, cancelable beforeunload therefore asks them all without side effects: a script-dispatched event
 * never shows the browser's leave prompt.
 */
export function probeUnsavedWork(target: EventTarget): boolean {
  try {
    const probe = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(probe);
    return probe.defaultPrevented;
  } catch { return false; }
}
