import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { AppLoaderProvider } from "@/components/providers/app-loader-provider";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    url: "/ai-school-management-software",
    siteName: "SkooleeAI",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <AppLoaderProvider>
            {children}
            <Toaster
              position="top-right"
              richColors
              expand
              closeButton
              visibleToasts={4}
              toastOptions={{
                duration: 5000,
                style: { 
                  fontFamily: "var(--font-plus-jakarta-sans)",
                  borderRadius: "28px",
                  padding: "18px 20px",
                  fontSize: "13px",
                  fontWeight: "700",
                  letterSpacing: "0",
                  color: "#1f1a23",
                  border: "1px solid rgba(207, 194, 214, 0.36)",
                  boxShadow: "0 28px 70px -18px rgba(31, 26, 35, 0.28)",
                  background: "rgba(255, 255, 255, 0.96)",
                  backdropFilter: "blur(14px)",
                },
                className: "skoolee-toast",
              }}
            />
          </AppLoaderProvider>
        </Suspense>
      </body>
    </html>
  );
}
