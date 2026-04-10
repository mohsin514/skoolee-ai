import Link from "next/link";
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  GraduationCap, 
  Users, 
  BarChart3, 
  ShieldCheck,
  FileText,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-gray-950">
      {/* ─── Header ───────────────────────────────────── */}
      <header className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              SkooleeAI
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm font-medium text-gray-600 hover:text-primary dark:text-gray-400">Features</Link>
            <Link href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-primary dark:text-gray-400">How it Works</Link>
            <Link href="#pricing" className="text-sm font-medium text-gray-600 hover:text-primary dark:text-gray-400">Pricing</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-24">
        {/* ─── Hero Section ─────────────────────────────── */}
        <section className="relative overflow-hidden py-20 lg:py-32">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col items-center text-center">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
                The Next Generation of School Management
              </div>
              <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-6xl lg:text-7xl mb-6">
                Build a Smarter School with <span className="text-primary italic">AI-Powered</span> Reporting.
              </h1>
              <p className="max-w-2xl text-lg text-gray-600 dark:text-gray-400 mb-10">
                Automate your report card remarks, manage students across multiple campuses, and keep parents updated with automated WhatsApp alerts.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/sign-up">
                  <Button size="lg" className="h-14 px-8 text-lg rounded-full">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="#demo">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full">
                    Watch Demo
                  </Button>
                </Link>
              </div>

              {/* Stats / Proof */}
              <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-gray-100 dark:border-gray-800 pt-10">
                {[
                  { label: "Schools", val: "200+" },
                  { label: "AI Remarks Generated", val: "50k+" },
                  { label: "Time Saved", val: "70%" },
                  { label: "Parent Satisfaction", val: "99%" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.val}</p>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Features Grid ────────────────────────────── */}
        <section id="features" className="bg-gray-50 dark:bg-gray-900/50 py-24">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Everything Your School Needs</h2>
              <p className="text-gray-600 dark:text-gray-400">Complete multi-campus management with top-tier data isolation.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Multi-Tenant Isolation",
                  desc: "Each school gets its own dedicated database schema. Your data is always private and secure.",
                  icon: ShieldCheck,
                },
                {
                  title: "AI Remark Generator",
                  desc: "Generate personalized English & Urdu remarks based on marks in seconds.",
                  icon: Sparkles,
                },
                {
                  title: "Exam & Marks Entry",
                  desc: "Streamlined entry for teachers with beautiful, professional report card PDF generation.",
                  icon: ClipboardList,
                },
                {
                  title: "WhatsApp Integration",
                  desc: "Send results, attendance, and fee alerts directly to parents' WhatsApp automatically.",
                  icon: FileText,
                },
                {
                  title: "Analytics Dashboard",
                  desc: "Visual insights into student performing across campuses and classes.",
                  icon: BarChart3,
                },
                {
                  title: "Organization Switcher",
                  desc: "Teachers can easily switch between different schools with a single login.",
                  icon: Users,
                },
              ].map((feature, i) => (
                <div key={i} className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm transition-all hover:shadow-xl dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 dark:border-gray-800 py-12 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">© 2026 SkooleeAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

