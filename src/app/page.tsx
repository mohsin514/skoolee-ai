"use client";

import SplashScreen from "@/components/SplashScreen";

export default function EntryPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* 
        This is the single entry point of the app. 
        The SplashScreen component handles the 8-second 
        branding animation and the auto-redirect to /login.
      */}
      <SplashScreen />
    </main>
  );
}
