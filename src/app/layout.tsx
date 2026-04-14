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
  title: "SkooleeAI — AI-Powered School Management",
  description:
    "Manage students, enter marks, generate AI-powered report card remarks in Urdu & English, and send results to parents via WhatsApp.",
  keywords: ["school management", "AI report cards", "Pakistan", "Urdu", "WhatsApp"],
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
              toastOptions={{
                duration: 5000,
                style: { 
                  fontFamily: "var(--font-plus-jakarta-sans)",
                  borderRadius: "24px",
                  padding: "16px 20px",
                  fontSize: "13px",
                  fontWeight: "700",
                  letterSpacing: "-0.01em",
                  border: "1px solid rgba(207, 194, 214, 0.3)",
                  boxShadow: "0 25px 50px -12px rgba(31, 26, 35, 0.1)",
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(8px)",
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
