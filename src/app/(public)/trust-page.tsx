import Link from "next/link";
import {
  ArrowLeft, Sparkles, ShieldCheck, Lock, Eye, Database, CheckCircle2,
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
    <main className="min-h-screen bg-[#fff7fe] text-[#1f1a23] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <style>{`
        @keyframes skDrift {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          33%     { transform: translate3d(4%,-6%,0) scale(1.12); }
          66%     { transform: translate3d(-5%,4%,0) scale(0.95); }
        }
        .sk-blob { animation: skDrift 22s ease-in-out infinite; will-change: transform; }
        .sk-blob-2 { animation-duration: 28s; animation-delay: -8s; }
        .sk-blob-3 { animation-duration: 34s; animation-delay: -16s; }
        @media (prefers-reduced-motion: reduce) {
          .sk-blob { animation: none !important; }
        }
      `}</style>

      {/* ─── HERO ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487]">
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div className="sk-blob absolute -top-1/4 -left-1/5 h-[72%] w-[72%] rounded-full bg-[#9c48ea] opacity-70 blur-[90px]" />
          <div className="sk-blob sk-blob-2 absolute top-1/4 -right-1/4 h-[68%] w-[68%] rounded-full bg-[#b073f0] opacity-45 blur-[100px]" />
          <div className="sk-blob sk-blob-3 absolute -bottom-1/3 left-1/5 h-[62%] w-[62%] rounded-full bg-[#fbf0fe] opacity-[0.14] blur-[110px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 py-8 lg:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/ai-school-management-software">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/90 backdrop-blur transition-colors hover:bg-white/20">
                <ArrowLeft className="h-3.5 w-3.5" />
                Product
              </span>
            </Link>

            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-[#e9d5ff]" />
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">
                Skoolee Trust
              </span>
            </span>
          </div>

          <h1 className="mt-6 text-3xl font-black leading-tight tracking-[-0.03em] text-white lg:text-4xl">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] font-semibold leading-7 text-white/85 lg:text-base">
            {copy.description}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-bold text-white/75">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Encrypted at rest &amp; in transit
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4" /> Role-scoped access
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Human-reviewed AI
            </span>
          </div>
        </div>

        <div className="relative z-10 h-4 bg-gradient-to-b from-transparent to-[#fff7fe]" />
      </section>

      {/* ─── SECTIONS ─────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="grid gap-4 pt-12">
          {copy.sections.map((section, i) => {
            const Icon = SECTION_ICONS[i % SECTION_ICONS.length];
            return (
              <div
                key={section.title}
                className="flex gap-5 rounded-2xl border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_24px_60px_-32px_rgba(129,39,207,0.25)] transition-shadow hover:shadow-[0_28px_70px_-32px_rgba(129,39,207,0.4)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">{section.title}</h2>
                  <p className="mt-1.5 text-[15px] leading-7 text-ink">{section.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cross-navigation between the trust pages */}
        <div className="mt-8 rounded-2xl border border-[#cfc2d6]/25 bg-white p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8127cf]">
            Continue reading
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {NAV.map((nav) => (
              <Link
                key={nav.href}
                href={nav.href}
                className="group rounded-xl border border-[#cfc2d6]/20 p-4 transition-colors hover:border-[#8127cf]/30 hover:bg-[#fbf0fe]"
              >
                <p className="text-sm font-black text-[#1f1a23] transition-colors group-hover:text-[#8127cf]">
                  {nav.label}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-ink-muted">
                  {nav.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/ai-school-management-software"
            className="text-sm font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]"
          >
            Back to Skoolee AI
          </Link>
        </div>
      </section>
    </main>
  );
}
