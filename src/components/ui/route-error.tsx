"use client";

/**
 * The shared route error view. Every role segment's error.tsx had its own
 * copy of the same card (twelve files, three divergent versions, English
 * only). Retry re-fetches the segment (`unstable_retry`) where Next provides
 * it, falling back to `reset`.
 */

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useDocumentLocale } from "@/hooks/use-document-locale";
import { translateUi } from "@/lib/locale/ui-messages";
import { buttonVariants } from "./button";
import { ErrorState } from "./error-state";
import { cn } from "@/lib/utils";

export interface RouteErrorProps {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
  /** Where "Back to dashboard" leads; /login routes a signed-in user to their own console. */
  homeHref?: string;
  /** Fill the viewport (root boundary) instead of the workspace area. */
  fullPage?: boolean;
}

export function RouteError({ error, unstable_retry, reset, homeHref = "/login", fullPage = false }: RouteErrorProps) {
  const { language, dir } = useDocumentLocale();
  const t = (source: string) => translateUi(source, language);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error("[RouteError]", error);
  }, [error]);

  const retry = unstable_retry ?? reset;
  return (
    <div dir={dir} className={cn("flex items-center justify-center p-4 sm:p-6", fullPage ? "sk-app-canvas min-h-dvh" : "min-h-[60vh] flex-1")}>
      <ErrorState
        variant="page"
        error={error}
        title={t("This page couldn't load")}
        description={t("Your data is safe. Try again, or go back to your dashboard.")}
        onRetry={retry}
        retryLabel={t("Try again")}
        action={
          <Link href={homeHref} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
            {t("Back to dashboard")}
          </Link>
        }
      />
    </div>
  );
}
