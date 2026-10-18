"use client";

import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { useDocumentLocale } from "@/hooks/use-document-locale";
import { translateUi } from "@/lib/locale/ui-messages";
import { buttonVariants } from "./button";

/** The 404 view: says the address is wrong, not the reader, and offers the way back. */
export function NotFoundView({ homeHref = "/login" }: { homeHref?: string }) {
  const { language, dir } = useDocumentLocale();
  const t = (source: string) => translateUi(source, language);
  return (
    <main dir={dir} className="sk-app-canvas flex min-h-dvh items-center justify-center p-4 font-sans text-ink-strong sm:p-6">
      <section className="sk-panel relative isolate w-full max-w-md overflow-hidden px-6 py-10 text-center sm:px-10">
        <div aria-hidden="true" className="sk-grid-pattern pointer-events-none absolute inset-x-0 top-0 -z-10 h-48" />
        <p aria-hidden="true" className="sk-text-gradient mb-4 text-6xl font-extrabold leading-none tracking-tight">404</p>
        <div aria-hidden="true" className="sk-gradient-border mx-auto mb-5 grid size-14 place-items-center rounded-[20px] text-primary shadow-md">
          <Compass className="size-6" />
        </div>
        <h1 className="text-xl font-bold">{t("Page not found")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          {t("The page you're looking for doesn't exist or has been moved.")}
        </p>
        <Link href={homeHref} className={buttonVariants({ className: "mt-7" })}>
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          {t("Go to dashboard")}
        </Link>
      </section>
    </main>
  );
}
