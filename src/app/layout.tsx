import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { AppLoaderProvider } from "@/components/providers/app-loader-provider";
import { NetworkProvider } from "@/components/providers/network-provider";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
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
      className={`${plusJakartaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <AppLoaderProvider>
            <NetworkProvider>{children}</NetworkProvider>
            {/*
              Bottom-centre, collapsed.

              Top-right put the stack directly over the close button of every
              centred dialog — elementFromPoint confirmed the toast, not the
              button, received the click. Bottom-right was no better: a toast is
              ~356px wide and the wide dialogs are 896px, so at any viewport the
              toast overhangs their bottom-right corner, which is exactly where
              the primary action sits. Bottom-centre is the one corner-free
              position: the dialog footers put their buttons hard left and hard
              right, so a centred toast clears both.
            */}
            <Toaster
              position="bottom-center"
              richColors
              closeButton
              visibleToasts={3}
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
