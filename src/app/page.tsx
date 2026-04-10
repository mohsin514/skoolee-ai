import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Brain,
  FileText,
  MessageCircle,
  BarChart3,
  Shield,
  ArrowRight,
  Sparkles,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: GraduationCap,
    title: "Student Management",
    desc: "CRUD, bulk import, class assignments with blazing-fast search.",
  },
  {
    icon: Brain,
    title: "AI Report Remarks",
    desc: "Generate personalized remarks in Urdu & English using GPT-4o-mini.",
  },
  {
    icon: FileText,
    title: "PDF Report Cards",
    desc: "Beautiful, branded PDFs generated in bulk and stored in the cloud.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Delivery",
    desc: "Send results directly to parents via WhatsApp with one click.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    desc: "Track top/bottom students, class performance, and AI usage.",
  },
  {
    icon: Shield,
    title: "Multi-Tenant Security",
    desc: "Each school gets its own isolated database schema. Zero cross-tenant leaks.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ─── Nav ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">SkooleeAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">
                Get Started <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-20">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-r from-purple-400/20 via-violet-400/20 to-indigo-400/20 blur-3xl" />
        <div className="pointer-events-none absolute top-60 -right-40 h-[300px] w-[400px] rounded-full bg-gradient-to-l from-pink-400/15 to-purple-400/15 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1.5">
            <Zap className="h-3 w-3" />
            AI-Powered School Management
          </Badge>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Manage your school.
            <br />
            <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Let AI do the rest.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            SkooleeAI helps Pakistani schools enter marks in seconds, generate
            AI-powered report card remarks in{" "}
            <strong className="text-foreground">Urdu & English</strong>, and
            deliver results to parents via{" "}
            <strong className="text-foreground">WhatsApp</strong> — all from one
            dashboard.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="min-w-[180px] text-base">
                Start Free <ArrowRight />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline" className="min-w-[180px] text-base">
                See Features
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Features Grid ───────────────────────────────── */}
      <section id="features" className="py-24 bg-muted/30">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your school needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              From marks entry to WhatsApp delivery — one platform, zero hassle.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card
                key={f.title}
                className="group relative overflow-hidden border-border/60 bg-background transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {f.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to modernize your school?
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Start free — no credit card required. Upgrade when you&apos;re ready.
          </p>
          <Link href="/sign-up" className="mt-8 inline-block">
            <Button size="lg" className="min-w-[200px] text-base">
              Get Started Free <ArrowRight />
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-muted/30 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} SkooleeAI. Built for Pakistani schools
          with ❤️
        </div>
      </footer>
    </div>
  );
}
