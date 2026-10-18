import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SkooleeLogo from "@/components/SkooleeLogo";

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

// Skoolee is sold sales-led — there is no self-serve signup. Marketing
// CTAs open a demo request addressed to the sales inbox; the APP_OWNER
// provisions the school manually from /owner afterwards.
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skoolee.ai";

function demoMailto(context: string) {
  const subject = encodeURIComponent(`Demo request — ${context}`);
  const body = encodeURIComponent(
    [
      "Assalam-o-Alaikum Skoolee team,",
      "",
      "We would like to see a demo. Our details:",
      "",
      "School / group name:",
      "Contact person:",
      "Phone / WhatsApp:",
      "City:",
      "Number of campuses:",
      "Approximate students:",
      "",
      "Thank you.",
    ].join("\n")
  );
  return `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
}

export function ProductPage({ copy }: { copy: ProductPageCopy }) {
  return (
    <main className="min-h-screen bg-white text-ink-strong">
      <header className="border-b border-border-subtle bg-white/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-normal">
            <SkooleeLogo size="1.15rem" />
          </Link>
          <nav aria-label="Product navigation" className="flex w-full flex-wrap items-center gap-2 text-sm font-semibold sm:w-auto">
            <Link href="/privacy" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Trust
            </Link>
            <Link href="/pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Pricing
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Login
            </Link>
            <a href={demoMailto(copy.eyebrow)} className={buttonVariants({ size: "sm" })}>Book a demo</a>
          </nav>
        </div>
      </header>

      <section className="sk-hero-wash">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div className="sk-enter min-w-0">
            <p className="sk-eyebrow text-primary">{copy.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-ink-strong sm:text-4xl lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">{copy.description}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={demoMailto(copy.eyebrow)} className={buttonVariants({ className: "sk-nudge-trigger" })}>
                {copy.primaryCta || "Book a demo"}
                <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
              </a>
              <Link href="/security" className={buttonVariants({ variant: "outline" })}>
                {copy.secondaryCta || "Review security"}
              </Link>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {copy.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm font-medium text-ink">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-status-success-text" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card variant="featured" className="sk-enter-scale min-w-0 p-4" style={{ "--sk-delay": "120ms" } as CSSProperties}>
            <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-3">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ms-auto text-xs font-medium text-ink-subtle">Illustrative dashboard</span>
            </div>
            <Alert tone="warning" compact icon={false} live="off" className="mb-3 text-xs font-medium">
              Synthetic example data. This is not a customer result or measured outcome.
            </Alert>
            <div className="grid gap-3">
              <div className="rounded-xl bg-surface-subtle p-4">
                <p className="sk-eyebrow text-primary">AI remark draft</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
                  English and Urdu report card comments queued for principal review.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {["Students", "Fees", "Campuses"].map((label, index) => (
                  <div key={label} className="min-w-0 rounded-xl border border-border-subtle p-2.5 sm:p-3">
                    <p className="sk-eyebrow truncate text-ink-subtle">{label}</p>
                    <p className="mt-2 text-xl font-bold tabular-nums text-ink-strong">{[482, "91%", 4][index]}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2 rounded-xl border border-border-subtle p-3">
                {["WhatsApp sent", "PDF exported", "Human reviewed"].map((label) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 font-medium text-ink">{label}</span>
                    <Badge variant="success" size="sm" dot>OK</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="sk-stagger grid gap-5 md:grid-cols-3">
          {copy.sections.map((section) => (
            <article key={section.title} className="sk-panel min-w-0 p-5 sm:p-6">
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-primary ring-1 ring-brand-100">
                <section.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-ink-strong">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-status-success-border/60 bg-status-success-surface/60">
        <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3">
          {copy.proof.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm font-medium leading-relaxed text-status-success-text">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
