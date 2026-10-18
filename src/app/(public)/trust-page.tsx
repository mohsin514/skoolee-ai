import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  ArrowLeft, ArrowRight, Sparkles, ShieldCheck, Lock, Eye, Database, CheckCircle2,
} from "lucide-react";

export interface TrustPageCopy {
  title: string;
  description: string;
  sections: {
    title: string;
    body: string;
  }[];
}

const SECTION_ICONS = [ShieldCheck, Lock, Eye, Database];

const NAV = [
  { label: "Privacy", href: "/privacy", desc: "Who can see each school record" },
  { label: "Security", href: "/security", desc: "How access and data are protected" },
  { label: "AI Governance", href: "/ai-governance", desc: "How AI assists and is reviewed" },
  { label: "Human Review Policy", href: "/human-review-policy", desc: "How drafts are approved before sharing" },
];

export function TrustPage({ copy }: { copy: TrustPageCopy }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Skoolee AI",
    url: "https://skooleeai.com/",
    description:
      "AI school management software for students, staff, fees, campuses, report cards, WhatsApp updates, and analytics.",
  };

  return (
    <main className="min-h-screen font-sans text-ink-strong">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* The drifting blobs use the shared .sk-blob rules in globals.css,
          which already stop under prefers-reduced-motion. */}

      {/* ─── HERO ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-brand-700 to-brand-800">
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div className="sk-blob absolute -top-1/4 -start-1/5 h-[72%] w-[72%] rounded-full bg-brand-400 opacity-70 blur-[90px]" />
          <div className="sk-blob sk-blob-2 absolute top-1/4 -end-1/4 h-[68%] w-[68%] rounded-full bg-brand-300 opacity-45 blur-[100px]" />
          <div className="sk-blob sk-blob-3 absolute -bottom-1/3 start-1/5 h-[62%] w-[62%] rounded-full bg-brand-50 opacity-[0.14] blur-[110px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/ai-school-management-software" className={buttonVariants({ variant: "outline", size: "sm", className: "focus-on-dark" })}>
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
              Product
            </Link>

            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-brand-200" />
              <span className="sk-eyebrow text-brand-200">
                Skoolee Trust
              </span>
            </span>
          </div>

          <div className="sk-enter">
            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-2xl text-md font-normal leading-relaxed text-white/85 lg:text-base">
              {copy.description}
            </p>
          </div>

          <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-white/80">
            <li className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" /> Encrypted at rest &amp; in transit
            </li>
            <li className="flex items-center gap-1.5">
              <Lock aria-hidden="true" className="h-4 w-4 shrink-0" /> Role-scoped access
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" /> Human-reviewed AI
            </li>
          </ul>
        </div>

        <div className="relative z-10 h-4 bg-gradient-to-b from-transparent to-brand-50" />
      </section>

      {/* ─── SECTIONS ─────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <div className="sk-stagger grid gap-4 pt-12">
          {copy.sections.map((section, i) => {
            const Icon = SECTION_ICONS[i % SECTION_ICONS.length];
            return (
              <article
                key={section.title}
                className="sk-panel flex flex-col gap-4 p-5 sm:flex-row sm:gap-5 sm:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 text-white shadow-brand">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-ink-strong">{section.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted sm:text-md">{section.body}</p>
                </div>
              </article>
            );
          })}
        </div>

        {/* Cross-navigation between the trust pages */}
        <div className="sk-panel mt-8 p-5 sm:p-6">
          <h2 className="sk-eyebrow text-primary">
            Continue reading
          </h2>
          <nav aria-label="Trust policies" className="mt-4 grid gap-3 sm:grid-cols-2">
            {NAV.map((nav) => (
              <Link
                key={nav.href}
                href={nav.href}
                aria-current={nav.label === copy.title ? "page" : undefined}
                className="sk-panel sk-hover-lift sk-nudge-trigger group flex items-start justify-between gap-3 p-4 aria-[current=page]:border-primary aria-[current=page]:bg-surface-selected"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-strong transition-colors group-hover:text-primary">
                    {nav.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                    {nav.desc}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="sk-nudge mt-0.5 h-4 w-4 shrink-0 text-ink-subtle transition-colors group-hover:text-primary rtl:rotate-180" />
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/ai-school-management-software"
            className={buttonVariants({ variant: "ghost" })}
          >
            Back to Skoolee AI
          </Link>
        </div>
      </section>
    </main>
  );
}
