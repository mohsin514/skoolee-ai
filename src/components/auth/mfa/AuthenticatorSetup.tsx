"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MfaCopy } from "./mfa-copy";

type SetupCopy = Pick<MfaCopy, "scanTitle" | "apps" | "qrAlt" | "qrUnavailable" | "manualTitle" | "manualHint" | "copyKey" | "copied">;

/** QR + grouped manual key for a new authenticator entry. The QR is drawn in the browser, so the secret never leaves it. */
export function AuthenticatorSetup({ secret, uri, t, onCopy, copied = false, idPrefix = "mfa" }: {
  secret: string;
  uri: string;
  t: SetupCopy;
  onCopy: () => void;
  copied?: boolean;
  idPrefix?: string;
}) {
  const [qr, setQr] = useState<{ uri: string; url?: string; failed?: boolean }>({ uri: "" });

  useEffect(() => {
    if (!uri) return;
    let active = true;
    QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 400, color: { dark: "#1f1a23", light: "#ffffff" } })
      .then(url => { if (active) setQr({ uri, url }); })
      .catch(() => { if (active) setQr({ uri, failed: true }); });
    return () => { active = false; };
  }, [uri]);

  const keyGroups = secret.match(/.{1,4}/g)?.join(" ") ?? "";

  return <>
    <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <div className="mx-auto rounded-[26px] bg-gradient-to-br from-primary via-brand-400 to-fuchsia-300 p-[3px] shadow-[0_18px_40px_-20px_rgba(129,39,207,0.6)]">
        {/* Fixed pixel size: a scannable QR must not grow with the text size. */}
        <div className="flex size-[176px] items-center justify-center rounded-[23px] bg-white p-2.5">
          {qr.uri === uri && qr.url ? <img src={qr.url} alt={t.qrAlt} width={160} height={160} className="size-full [image-rendering:pixelated]" />
            : uri && !(qr.uri === uri && qr.failed) ? <Skeleton className="size-full rounded-xl" />
              : <p className="text-center text-xs font-bold text-ink-muted">{t.qrUnavailable}</p>}
        </div>
      </div>
      <div className="min-w-0 text-center sm:text-start">
        <h2 className="flex items-center justify-center gap-2 text-base font-bold text-ink-strong sm:justify-start"><span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-white">1</span>{t.scanTitle}</h2>
        <p className="mt-1.5 text-sm font-semibold leading-relaxed text-ink-muted">{t.apps}</p>
      </div>
    </div>

    <div className="mt-5 rounded-2xl border border-dashed border-field-border bg-surface-subtle p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t.manualTitle}</p>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
        <bdi dir="ltr" className="min-w-0 flex-1">
          <code id={`${idPrefix}-secret`} className="block font-mono text-md font-bold tracking-[0.12em] text-ink-strong [overflow-wrap:anywhere] select-all">{keyGroups}</code>
        </bdi>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t.copied : t.copyKey}
        </Button>
      </div>
      <p className="mt-2.5 text-xs font-semibold leading-relaxed text-ink-subtle">{t.manualHint}</p>
    </div>
  </>;
}
