import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { StudioIntroProbe } from "./studio-intro-probe";

/**
 * A non-production probe surface for the Studio_Intro (R20).
 *
 * **Temporary, and task 3.2 removes it.** `studio-intro.tsx` is rendered by
 * `exam-studio-shell.tsx` in the shipped product (R20.7), and that shell does not exist yet, so
 * `tests/school-ai/exam-studio-intro.browser.spec.ts` would have nothing to drive. This page gives
 * the sequence one real route, behind the same session and School AI access gate as `/ai`, and
 * `notFound()` in production so it can never become a shipped half-surface. Once the shell mounts
 * the intro, delete this directory and point the spec's `openStudio()` helper at the Exam Studio
 * entry instead — the assertions do not change.
 *
 * It is deliberately *not* a stand-in for the workspace's content. It carries only what Requirement
 * 20 makes claims about: a focusable control so the tab order can be checked against R20.12, a
 * workspace data fetch started on mount so R20.13 can be observed, and the account-preference input
 * of R20.6 as a search param, which the shell will resolve from the reader's settings record.
 */
export default async function StudioIntroProbePage({ searchParams }: { searchParams: Promise<{ suppressed?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const user = await requirePageSession();
  try {
    await assertSchoolAiAccess(user, "view");
  } catch (error) {
    if (error instanceof AccessDenied || (error instanceof SchoolAiError && error.status === 403)) notFound();
    throw error;
  }
  // Next.js 16: `searchParams` is a promise and must be awaited.
  return <StudioIntroProbe suppressed={(await searchParams).suppressed === "1"} />;
}
