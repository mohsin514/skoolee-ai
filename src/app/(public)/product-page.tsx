import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProductPageCopy {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta?: string;
  secondaryCta?: string;
  highlights: string[];
  sections: {
    title: string;
    body: string;
    icon: LucideIcon;
  }[];
  proof: string[];
}

export function ProductPage({ copy }: { copy: ProductPageCopy }) {
  return (
    <main className="min-h-screen bg-white text-[#1f1a23]">
      <header className="border-b border-[#e8e0ed] bg-white/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-black tracking-normal">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8127cf] text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            SkooleeAI
          </Link>
          <nav className="flex items-center gap-3 text-sm font-semibold">
            <Link href="/privacy" className="hidden text-[#4d4354]/70 hover:text-[#8127cf] sm:block">
              Trust
            </Link>
            <Link href="/login" className="text-[#4d4354]/70 hover:text-[#8127cf]">
              Login
            </Link>
            <Link href="/register">
              <Button size="sm">Start free</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-[#fbf0fe]/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-[#8127cf]">{copy.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4d4354]/75">{copy.description}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/register">
                <Button>
                  {copy.primaryCta || "Start free"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/security">
                <Button variant="outline">{copy.secondaryCta || "Review security"}</Button>
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {copy.highlights.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold text-[#4d4354]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#e8e0ed] bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center gap-2 border-b border-[#f0e8f5] pb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-auto text-xs font-bold text-[#4d4354]/45">Live school dashboard</span>
            </div>
            <div className="grid gap-3">
              <div className="rounded-lg bg-[#f6f8fb] p-4">
                <p className="text-xs font-bold uppercase tracking-normal text-[#8127cf]">AI remark draft</p>
                <p className="mt-2 text-sm font-semibold leading-6">
                  English and Urdu report card comments queued for principal review.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["Students", "Fees", "Campuses"].map((label, index) => (
                  <div key={label} className="rounded-lg border border-[#e8e0ed] p-3">
                    <p className="text-[10px] font-bold uppercase text-[#4d4354]/45">{label}</p>
                    <p className="mt-2 text-xl font-black">{[482, "91%", 4][index]}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-lg border border-[#e8e0ed] p-3">
                {["WhatsApp sent", "PDF exported", "Human reviewed"].map((label) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{label}</span>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">OK</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-5 md:grid-cols-3">
          {copy.sections.map((section) => (
            <article key={section.title} className="rounded-lg border border-[#e8e0ed] bg-white p-5 shadow-sm">
              <section.icon className="h-6 w-6 text-[#8127cf]" />
              <h2 className="mt-4 text-lg font-bold tracking-normal">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#4d4354]/75">{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e8e0ed] bg-[#f7faf8]">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 md:grid-cols-3">
          {copy.proof.map((item) => (
            <p key={item} className="text-sm font-bold text-[#315f49]">{item}</p>
          ))}
        </div>
      </section>
    </main>
  );
}
