import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
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
        <AppLoaderProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
              style: { fontFamily: "var(--font-plus-jakarta-sans)" },
            }}
          />
        </AppLoaderProvider>
      </body>
    </html>
  );
}
