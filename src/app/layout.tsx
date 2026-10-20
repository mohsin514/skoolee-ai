import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import { AppToaster } from "@/components/ui/app-toaster";
import { Suspense } from "react";
import { AppLoaderProvider } from "@/components/providers/app-loader-provider";
import BootSplash from "@/components/BootSplash";
import { NetworkProvider } from "@/components/providers/network-provider";
import { CandidateExamGuard } from "@/components/providers/candidate-exam-guard";
import { FirstRunGuide } from "@/components/onboarding/FirstRunGuide";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  // latin-ext covers Turkish, Polish, Czech, Vietnamese-adjacent names that
  // international schools enter for staff, guardians and learners.
  subsets: ["latin", "latin-ext"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

// Arabic and Urdu glyphs. Not preloaded: its @font-face carries the Arabic
// unicode-range, so an English-only session never downloads it.
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-arabic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "SkooleeAI - AI School Management Software",
    template: "%s | SkooleeAI",
  },
  description:
    "AI school management software for students, teachers, campuses, fees, Urdu and English report cards, WhatsApp updates, and performance analytics.",
  keywords: [
    "AI school management software",
    "AI report cards in Urdu and English",
    "WhatsApp report card software",
    "multi-campus school ERP",
    "school fee management software",
    "AI student performance analytics",
  ],
  openGraph: {
    title: "SkooleeAI - AI School Management Software",
    description:
      "Manage school operations, AI report cards, WhatsApp parent updates, fees, campuses, and analytics in one SaaS platform.",
    url: "/",
    siteName: "SkooleeAI",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Skoolee AI - AI School Management Software",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SkooleeAI - AI School Management Software",
    description:
      "Manage school operations, AI report cards, WhatsApp parent updates, fees, campuses, and analytics in one SaaS platform.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#8127CF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${notoSansArabic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* Brand splash on every hard load (not "/", which has its own); then the route's skeleton. */}
        <BootSplash />
        <Suspense fallback={null}>
          <AppLoaderProvider>
            <NetworkProvider><CandidateExamGuard>{children}<FirstRunGuide /></CandidateExamGuard></NetworkProvider>
            <AppToaster />
          </AppLoaderProvider>
        </Suspense>
      </body>
    </html>
  );
}
