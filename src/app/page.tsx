import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SplashScreen from "@/components/SplashScreen";
import { LANGUAGE_COOKIE, directionFor, parseLanguage } from "@/lib/locale/language-cookie";
import { resolveShowcaseEntry } from "@/lib/onboarding/showcase-entry";

export const metadata: Metadata = {
  title: "SkooleeAI - AI School Management Software",
  description:
    "Sign in to SkooleeAI — AI school management software for report cards, fees, WhatsApp parent updates, campuses, and analytics.",
  robots: { index: false, follow: false },
};

export default async function EntryPage() {
  // SPEC §6.3 / F20: `/` is session-aware. A signed-in account goes straight to its own next step
  // (first-login, onboarding, the suspended screen, or its console) — the resolver the showcase uses, so
  // there is one answer. Guests (no session, or an expired one) still get the splash, which hands over to /login.
  // A failed lookup (database briefly unavailable) is not an error page: the guest splash still works.
  const entry = await resolveShowcaseEntry().catch(() => null);
  if (entry && (entry.mode === "workspace" || entry.mode === "onboarding")) redirect(entry.href); // outside try/catch

  // The pre-login language cookie decides the splash's language and direction
  // on the server, exactly as the (auth) layout does for /login, so the
  // hand-over never flips direction mid-beat.
  const language = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) ?? "en";
  return (
    // Transparent: the shared body canvas (lilac glow and dot grid) is the
    // ground of both the splash and /login, so there is no flash between them.
    // Scrolls rather than clips if the column ever outgrows the screen (200% text in a landscape phone).
    <main
      lang={language}
      dir={directionFor(language)}
      className="fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto"
    >
      <SplashScreen language={language} />
    </main>
  );
}
