import type { Metadata } from "next";
import SplashScreen from "@/components/SplashScreen";

export const metadata: Metadata = {
  title: "SkooleeAI - AI School Management Software",
  description:
    "Sign in to SkooleeAI — AI school management software for report cards, fees, WhatsApp parent updates, campuses, and analytics.",
  robots: { index: false, follow: false },
};

export default function EntryPage() {
  return (
    // The background matches the splash and /login exactly. It was #ffffff,
    // which meant any frame where the overlay was not painted showed pure white
    // between two off-white screens — the flash people were seeing.
    <main className="min-h-screen bg-[#fff7fe]">
      {/*
        Single entry point of the app. The SplashScreen handles the branding
        animation and redirects to /login. Keeping this as a lightweight
        server component lets the route carry its own metadata.
      */}
      <SplashScreen />
    </main>
  );
}