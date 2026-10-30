import { useState } from "react";
import { Mail, UserPlus, UserRound } from "lucide-react";
import { assignOnboardingDelegate, revokeOnboardingDelegate } from "@/app/actions/completeOnboarding";
import type { SetupView } from "@/lib/onboarding/setup-service";
import type { StepErrors } from "@/lib/onboarding/setup-state";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fill, type OnboardingCopy } from "../copy";
import { InputField } from "./fields";

export function HandoverPanel({ t, view, onChange }: { t: OnboardingCopy; view: SetupView; onChange: (view: SetupView) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", canPurchaseSubscription: false });
  const [formErrors, setFormErrors] = useState<StepErrors>({});
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const delegate = view.delegate;

  const submit = async () => {
    setBusy(true);
    setFormErrors({});
    const res = await assignOnboardingDelegate(form);
    setBusy(false);
    if (!res.ok) {
      if (res.errors) setFormErrors(res.errors); else toast.error(res.message);
      return;
    }
    onChange(res.view);
    setOpen(false);
    setIssued({ email: res.email, password: res.temporaryPassword });
    setForm({ fullName: "", email: "", canPurchaseSubscription: false });
  };

  const revoke = async () => {
    setBusy(true);
    const res = await revokeOnboardingDelegate();
    setBusy(false);
    setConfirmRevoke(false);
    if (res.ok) { onChange(res.view); toast.success(t.revoked); } else toast.error(res.message);
  };

  return (
    <section className="sk-panel sk-handover flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5" aria-labelledby="handover-title" data-testid="handover-panel">
      <span aria-hidden="true" className="sk-icon-tile flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60">
        <UserPlus className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="handover-title" className="text-base font-bold text-ink-strong">{t.handoverTitle}</h2>
        {delegate ? (
          <p className="min-w-0 text-sm leading-relaxed text-ink break-words">
            <span className="font-semibold text-ink-strong">{t.delegateLabel}:</span> {delegate.fullName} (<bdi dir="ltr">{delegate.email}</bdi>) · {delegate.canPurchaseSubscription ? t.canBuy : t.cannotBuy}
            {delegate.pendingFirstSignIn ? <> · <Badge variant="warning" size="sm" dot className="align-middle">{t.pendingFirstSignIn}</Badge></> : ""}
          </p>
        ) : (
          <p className="min-w-0 text-sm leading-relaxed text-ink-muted">{t.handoverIntro}</p>
        )}
      </div>
      {delegate ? (
        <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(true)} className="shrink-0 self-start sm:self-center">{t.revoke}</Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0 self-start sm:self-center"><UserPlus aria-hidden="true" className="h-4 w-4" /> {t.handover}</Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.handover}</DialogTitle>
            <DialogDescription>{t.handoverIntro}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <InputField field="delegateName" error={formErrors.delegateName && t.errors[formErrors.delegateName]} label={t.delegateName} value={form.fullName} onChange={(val) => setForm({ ...form, fullName: val })} placeholder="" icon={UserRound} required />
            <InputField field="delegateEmail" error={formErrors.delegateEmail && t.errors[formErrors.delegateEmail]} label={t.delegateEmail} value={form.email} onChange={(val) => setForm({ ...form, email: val })} placeholder="name@school.edu" icon={Mail} type="email" required />
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 text-sm leading-relaxed text-ink transition-colors hover:border-border-subtle-hover">
              <Checkbox className="mt-1 h-4 w-4" checked={form.canPurchaseSubscription} onChange={(e) => setForm({ ...form, canPurchaseSubscription: e.target.checked })} />
              {t.allowPurchase}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button onClick={() => void submit()} loading={busy}>{t.sendHandover}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.tempPasswordTitle}</DialogTitle>
            <DialogDescription>{fill(t.tempPasswordBody, issued?.email ?? "")}</DialogDescription>
          </DialogHeader>
          <p dir="ltr" className="break-all rounded-xl border border-border-subtle bg-surface-subtle p-3 text-center font-mono text-base font-bold tracking-wide text-ink-strong select-all" data-testid="temporary-password">{issued?.password}</p>
          <DialogFooter><Button onClick={() => setIssued(null)}>{t.done}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.revokeTitle}</DialogTitle>
            <DialogDescription>{fill(t.revokeBody, delegate?.fullName ?? "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(false)}>{t.cancel}</Button>
            <Button variant="destructive" onClick={() => void revoke()} loading={busy}>{t.revoke}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
