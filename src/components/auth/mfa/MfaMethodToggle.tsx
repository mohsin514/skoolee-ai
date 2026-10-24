import { LifeBuoy, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MfaCopy } from "./mfa-copy";

/** Authenticator vs recovery code: two pressed-state buttons in one labelled group. */
export function MfaMethodToggle({ recovery, onChange, disabled, t }: {
  recovery: boolean;
  onChange: (recovery: boolean) => void;
  disabled?: boolean;
  t: Pick<MfaCopy, "method" | "methodApp" | "methodRecovery">;
}) {
  return (
    <div role="group" aria-label={t.method} className="grid grid-cols-2 gap-1 rounded-2xl border border-border-subtle bg-surface-subtle p-1">
      {([false, true] as const).map(option => (
        <Button key={String(option)} type="button" variant="choice" aria-pressed={recovery === option} disabled={disabled} onClick={() => onChange(option)}
          className="border-transparent bg-transparent px-2 text-ink-muted aria-pressed:border-brand-200 aria-pressed:bg-white aria-pressed:text-brand-700 aria-pressed:shadow-[0_6px_14px_-8px_rgba(129,39,207,0.45)]">
          {option ? <LifeBuoy aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
          {option ? t.methodRecovery : t.methodApp}
        </Button>
      ))}
    </div>
  );
}
