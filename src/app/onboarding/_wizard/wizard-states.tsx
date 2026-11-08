import { Lock, LogOut } from "lucide-react";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { AuthShell } from "@/components/auth/AuthShell";
import { CoverMasthead } from "@/components/auth/AuthCover";
import { SealSlot } from "@/components/onboarding/SealSlot";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { onboardingCopy, type OnboardingCopy } from "../copy";
import { toLanguage } from "./helpers";
import { localCopy } from "./local-copy";

/**
 * The studio's own shape while the saved setup loads (spec §5.5): the charter
 * cover (masthead, a dashed plate, seven ledger rules and an open seal) and on
 * the desk a SetupBar, six rail dots and a StepCard-shaped skeleton. The
 * markup is deterministic and text-free in the cover, so it is hydration-safe.
 */
export function WizardSkeleton({ t }: { t: OnboardingCopy }) {
  return (
    <AuthShell
      language="en"
      layout="studio"
      cover={(
        <>
          <CoverMasthead />
          <div className="mt-8 aspect-[16/11] w-full max-w-[34rem] rounded-2xl border border-dashed border-white/10" />
          <div className="sk-charter-ledger mt-8">
            <dl className="sk-charter-rows">
              {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                <div key={index} className="sk-charter-row">
                  <dt><span className="inline-block h-2.5 w-16 rounded-full bg-white/10 align-middle" /></dt>
                  <span aria-hidden="true" className="sk-leader" />
                  <dd><span className="inline-block h-2.5 w-20 rounded-full bg-white/10 align-middle" /></dd>
                </div>
              ))}
            </dl>
            <div className="sk-charter-seal" data-state="open"><SealSlot state="open" tone="cover" size={48} /></div>
          </div>
        </>
      )}
    >
      <div role="status" aria-busy="true" className="contents">
        <span className="sr-only">{t.loading}</span>
        <div aria-hidden="true" className="sk-setup-bar">
          <AuthMascot size="min(1.5rem, 7vw)" rule={false} signals={{ thinking: true }} />
          <Skeleton className="h-7 w-40 rounded-full" />
          <span className="flex-1" />
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-10 rounded-xl" />
        </div>
        <div aria-hidden="true" className="flex items-center justify-between gap-2 px-1 py-2">
          {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} delay={index * 40} className="size-7 shrink-0 rounded-full" />)}
        </div>
        <div aria-hidden="true" className="sk-panel sk-step-card animate-skeleton-in">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-2/3 max-w-sm" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
          {[0, 1].map((block) => (
            <div key={block} className="mt-8 grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => <Skeleton key={index} delay={(block * 4 + index) * 50} className="h-14 w-full rounded-2xl" />)}
            </div>
          ))}
          <div className="mt-8 flex justify-between border-t border-border-subtle pt-4">
            <Skeleton className="h-11 w-24 rounded-2xl" />
            <Skeleton className="h-11 w-36 rounded-2xl" />
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

// The saved setup never loaded, so these read the language the document was served in.
const pageLanguage = () => (typeof document !== "undefined" ? document.documentElement.lang : "en");

export function WizardLoadError({ onRetry, onSignOut }: { onRetry: () => void; onSignOut: () => void }) {
  const language = pageLanguage();
  const copy = onboardingCopy(language);
  return (
    <AuthShell language={toLanguage(language)} layout="center">
      <div className="flex flex-col items-center gap-6">
        <AuthMascot signals={{ error: "load" }} />
        <ErrorState
          variant="page"
          className="sk-enter-scale shadow-lg"
          title={localCopy(language).loadFailedTitle}
          description={copy.loadFailed}
          onRetry={onRetry}
          retryLabel={copy.retry}
          action={<Button variant="outline" onClick={onSignOut}><LogOut aria-hidden="true" className="h-4 w-4 rtl:rotate-180" /> {copy.signOut}</Button>}
        />
      </div>
    </AuthShell>
  );
}

export function WizardNoAccess({ onSignOut }: { onSignOut: () => void }) {
  const language = pageLanguage();
  const copy = onboardingCopy(language);
  return (
    <AuthShell language={toLanguage(language)} layout="center">
      <div className="flex flex-col items-center gap-6">
        <AuthMascot />
        <div className="sk-panel sk-gradient-border sk-enter-scale w-full max-w-md space-y-4 px-6 py-10 text-center sm:px-10">
          <span aria-hidden="true" className="sk-icon-tile mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60">
            <Lock className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-ink-strong">{copy.noAccessTitle}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">{copy.noAccessBody}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button variant="outline" onClick={onSignOut}><LogOut aria-hidden="true" className="h-4 w-4 rtl:rotate-180" /> {copy.signOut}</Button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
