"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * SKAI-1022/1031/1032/1024: a role console whose optional widgets failed still renders; the failed ones show their
 * empty state, and this one quiet notice says so and offers Retry, instead of the whole console failing.
 */
export function DegradedNotice({ degraded, onRetry }: { degraded?: readonly string[] | null; onRetry?: () => void }) {
  const ui = useUiText();
  if (!degraded?.length) return null;
  return (
    <Alert
      tone="warning"
      live="polite"
      compact
      data-degraded-widgets={degraded.join(" ")}
      actions={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>{ui("Try again")}</Button> : undefined}
    >
      {ui("Some parts of this page couldn't load and are shown as empty.")}
    </Alert>
  );
}
