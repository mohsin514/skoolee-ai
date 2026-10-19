import type { Metadata } from "next";
import { cookies } from "next/headers";
import SplashScreen from "@/components/SplashScreen";
import { LANGUAGE_COOKIE, directionFor, parseLanguage } from "@/lib/locale/language-cookie";

export const metadata: Metadata = {
  title: "SkooleeAI - AI School Management Software",
  description:
    "Sign in to SkooleeAI — AI school management software for report cards, fees, WhatsApp parent updates, campuses, and analytics.",
  robots: { index: false, follow: false },
};

export default async function EntryPage() {
  // The pre-login language cookie decides the splash's language and direction
  // on the server, exactly as the (auth) layout does for /login, so the
  // hand-over never flips direction mid-beat.
  const language = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) ?? "en";
  return (
    // Transparent: the shared body canvas (lilac glow and dot grid) is the
    // ground of both the splash and /login, so there is no flash between them.
    <main lang={language} dir={directionFor(language)} className="min-h-dvh">
      {/*
        Single entry point of the app. The SplashScreen handles the branding
        animation and redirects to /login. Keeping this as a lightweight
        server component lets the route carry its own metadata.
      */}
      <SplashScreen language={language} />
    </main>
  );
}
