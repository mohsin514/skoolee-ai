import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import SplashScreen from "@/components/SplashScreen";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          <SplashScreen />
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
              style: { fontFamily: "var(--font-sans)" },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
