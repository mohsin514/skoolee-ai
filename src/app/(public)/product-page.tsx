import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Languages, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SkooleeLogo from "@/components/SkooleeLogo";
import { SALES_EMAIL } from "@/lib/config/contact";
import { langHref } from "@/lib/legal/public-locale";
import { LANGUAGE_NATIVE_NAMES, directionFor } from "@/lib/locale/language-cookie";
import { LANGUAGES } from "@/lib/locale/package";
import { productLocale, type ProductPageId } from "@/lib/marketing/product-locale";
import { readPublicLanguage, type LangSearchParams } from "./public-lang";

/** SKAI-1002: localized title/description; SEO keywords and canonical stay per page. */
export async function productMetadata(id: ProductPageId, searchParams: LangSearchParams, extra: Metadata): Promise<Metadata> {
  const { lang } = await readPublicLanguage(searchParams);
  const page = productLocale(lang).pages[id];
  return { ...extra, title: page.metaTitle, description: page.metaDescription };
}

// Skoolee is sold sales-led — there is no self-serve signup. Marketing
// CTAs open a demo request addressed to the sales inbox; the APP_OWNER
// provisions the school manually from /owner afterwards.
// SALES_EMAIL is sourced from @/lib/config/contact (SKAI-948 / COM-08).

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

export async function ProductPage({ id, icons, searchParams }: { id: ProductPageId; icons: LucideIcon[]; searchParams: LangSearchParams }) {
  const { lang, carry } = await readPublicLanguage(searchParams);
  const { chrome: t, pages } = productLocale(lang);
  const copy = pages[id];
  // The demo email stays English: it goes to the sales inbox.
  const demoContext = productLocale("en").pages[id].eyebrow;
  return (
    <main lang={lang} dir={directionFor(lang)} className="min-h-screen text-ink-strong">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-normal">
            <SkooleeLogo size="1.15rem" />
          </Link>
          <nav aria-label={t.navLabel} className="flex w-full flex-wrap items-center gap-2 text-sm font-semibold sm:w-auto">
            <Link href={langHref("/privacy", carry)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t.trust}
            </Link>
            <Link href={langHref("/pricing", carry)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t.pricing}
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t.login}
            </Link>
            <a href={demoMailto(demoContext)} className={buttonVariants({ size: "sm" })}>{t.demo}</a>
            <span role="group" aria-label={t.languageLabel} className="flex items-center gap-1">
              <Languages aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
              {LANGUAGES.filter((code) => code !== lang).map((code) => (
                <Link key={code} href={langHref(`/${id}`, code)} hrefLang={code} lang={code} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {LANGUAGE_NATIVE_NAMES[code]}
                </Link>
              ))}
            </span>
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
              <a href={demoMailto(demoContext)} className={buttonVariants({ className: "sk-nudge-trigger" })}>
                {t.demo}
                <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
              </a>
              <Link href={langHref("/security", carry)} className={buttonVariants({ variant: "outline" })}>
                {t.security}
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
              <span className="ms-auto text-xs font-medium text-ink-subtle">{t.illustrative}</span>
            </div>
            <Alert tone="warning" compact icon={false} live="off" className="mb-3 text-xs font-medium">
              {t.synthetic}
            </Alert>
            <div className="grid gap-3">
              <div className="rounded-xl bg-surface-subtle p-4">
                <p className="sk-eyebrow text-primary">{t.remarkTitle}</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
                  {t.remarkBody}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {t.stats.map((label, index) => (
                  <div key={label} className="min-w-0 rounded-xl border border-border-subtle p-2.5 sm:p-3">
                    <p className="sk-eyebrow truncate text-ink-subtle">{label}</p>
                    <p className="mt-2 text-xl font-bold tabular-nums text-ink-strong">{[482, "91%", 4][index]}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2 rounded-xl border border-border-subtle p-3">
                {t.checks.map((label) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 font-medium text-ink">{label}</span>
                    <Badge variant="success" size="sm" dot>{t.ok}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="sk-stagger grid gap-5 md:grid-cols-3">
          {copy.sections.map((section, i) => {
            const Icon = icons[i % icons.length];
            return (
            <article key={section.title} className="sk-panel sk-hover-lift min-w-0 p-5 sm:p-6">
              <span aria-hidden="true" className="sk-page-icon">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-ink-strong">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{section.body}</p>
            </article>
            );
          })}
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
