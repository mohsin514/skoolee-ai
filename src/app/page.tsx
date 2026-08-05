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
    <main className="min-h-screen bg-white">
      {/* 
        Single entry point of the app. The SplashScreen handles the branding
        animation and redirects to /login. Keeping this as a lightweight
        server component lets the route carry its own metadata.
      */}
      <SplashScreen />
    </main>
  );
}