"use client";
import * as React from "react";
import { ArrowRight, BadgeCheck, Inbox, Link2, ListChecks, Monitor, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/tooltip";
import { useUiText } from "@/components/locale/LocaleProvider";
import { consoleForRole, leafForPath, leafForView } from "@/lib/navigation/role-nav";
import type { UserRole } from "@/lib/roles";
import { errorWords, type Lang, type T } from "./run-copy";
import { ClassMark } from "./workflow-marks";
import { TimeAgo, useWorkflowFormat } from "./workflow-format";

export type Handoff = { id: string; kind: string; targetRoute: string; originRole: string; status: string; createdAt: string; expiresAt?: string | null };

const KINDS: Record<string, { icon: LucideIcon; label: T }> = {
  RECORD_APPROVAL: { icon: BadgeCheck, label: { en: "Approval", ar: "اعتماد", ur: "منظوری" } },
  DOMAIN_REQUEST: { icon: Inbox, label: { en: "Request", ar: "طلب", ur: "درخواست" } },
  DOMAIN_SCREEN: { icon: Monitor, label: { en: "Ready on a screen", ar: "جاهز على شاشة", ur: "اسکرین پر تیار" } },
  ROLE_TASK: { icon: ListChecks, label: { en: "Task for your role", ar: "مهمة لدورك", ur: "آپ کے کردار کا کام" } },
  DEEP_LINK: { icon: Link2, label: { en: "Link to a screen", ar: "رابط إلى شاشة", ur: "اسکرین کا لنک" } },
};
const FALLBACK_KIND = KINDS.ROLE_TASK;

export const CARD_WORDS = {
  from: { en: "From: {0}", ar: "من: {0}", ur: "از: {0}" },
  opens: { en: "Opens: {0}", ar: "يفتح: {0}", ur: "کھلتا ہے: {0}" },
  ownScreen: { en: "its own screen", ar: "شاشته الخاصة", ur: "اس کی اپنی اسکرین" },
  closes: { en: "Closes {0}", ar: "يُغلق {0}", ur: "بند ہوگا {0}" },
  opened: { en: "Opened", ar: "فُتح", ur: "کھولا گیا" },
  openedTip: { en: "Someone with your role opened this to decide. It stays here until it is decided or closes.", ar: "فتحه شخص بدورك ليقرر. يبقى هنا حتى يُقرَّر أو يُغلق.", ur: "آپ کے کردار کے کسی شخص نے فیصلے کے لیے اسے کھولا۔ فیصلہ ہونے یا بند ہونے تک یہ یہیں رہے گا۔" },
  openedLabel: { en: "About “Opened”", ar: "عن «فُتح»", ur: "«کھولا گیا» کے بارے میں" },
  claim: { en: "Open to decide", ar: "افتح لتقرر", ur: "فیصلے کے لیے کھولیں" },
  LEASED: { en: "A colleague has this open right now. Try again in a little while.", ar: "يفتحه زميل الآن. حاول مجددًا بعد قليل.", ur: "ایک ساتھی نے اسے ابھی کھولا ہوا ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔" },
  NOT_FOUND: { en: "This is no longer waiting. Someone may already have decided it.", ar: "لم يعد هذا بانتظارك. ربما قرّره أحدهم بالفعل.", ur: "یہ اب زیر التوا نہیں۔ ہو سکتا ہے کوئی اس کا فیصلہ کر چکا ہو۔" },
} satisfies Record<string, T>;

/** The nav label of the screen a hand-off opens, from the role's own console registry. */
function useScreenName(role: UserRole | undefined, route: string): string | null {
  const tr = useUiText();
  if (!role) return null;
  try {
    const url = new URL(route, "http://local");
    const id = consoleForRole(role);
    const view = url.searchParams.get("view");
    const leaf = (view ? leafForView(id, view) : undefined) ?? leafForPath(id, url.pathname);
    return leaf ? tr(leaf.label) : null;
  } catch { return null; }
}

/** One prepared hand-off: what it is, who it came from, when it closes, and the one action — open it to decide. */
export function InboxCard({ item, role, language, claiming, disabled, error, onClaim }: {
  item: Handoff; role?: UserRole; language: Lang; claiming: boolean; disabled: boolean; error: string | null; onClaim: (item: Handoff) => void;
}) {
  const format = useWorkflowFormat();
  const screen = useScreenName(role, item.targetRoute) ?? CARD_WORDS.ownScreen[language];
  const kind = KINDS[item.kind] ?? FALLBACK_KIND;
  const KindIcon = kind.icon;
  // Expiry is a fact from the server; its relative wording depends on "now", so it is computed after mount.
  const [expiry, setExpiry] = React.useState<{ text: string; soon: boolean } | null>(null);
  React.useEffect(() => {
    if (!item.expiresAt) return;
    const left = new Date(item.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(left)) return;
    setExpiry({ text: CARD_WORDS.closes[language].replace("{0}", format.relative(item.expiresAt)), soon: left < 48 * 3_600_000 });
  }, [item.expiresAt, language, format]);
  const errorText = error ? (claimErrorWords(error, language) ?? errorWords(error, language)) : null;

  return (
    <li
      data-ai-handoff={item.kind}
      data-ai-handoff-status={item.status}
      data-ai-handoff-expires={item.expiresAt ?? undefined}
      data-active={item.status === "OPEN" ? "true" : undefined}
      className="sk-quiz-card sk-enter p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="sk-quiz-num" aria-hidden="true"><KindIcon className="size-4" /></span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-ink-strong [overflow-wrap:anywhere]">{kind.label[language]}</h3>
              <ClassMark cls="C" language={language} />
              {item.status === "CLAIMED" ? (
                <span className="inline-flex items-center gap-1">
                  <Badge size="sm" variant="neutral">{CARD_WORDS.opened[language]}</Badge>
                  <InfoTip content={CARD_WORDS.openedTip[language]} label={CARD_WORDS.openedLabel[language]} />
                </span>
              ) : null}
              {expiry ? <Badge size="sm" variant={expiry.soon ? "warning" : "neutral"}><bdi>{expiry.text}</bdi></Badge> : null}
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span><bdi>{CARD_WORDS.from[language].replace("{0}", format.roles([item.originRole]))}</bdi></span>
              <TimeAgo iso={item.createdAt} />
              <span className="min-w-0 [overflow-wrap:anywhere]"><bdi>{CARD_WORDS.opens[language].replace("{0}", screen)}</bdi></span>
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="sk-nudge-trigger w-full sm:w-auto"
          loading={claiming}
          disabled={disabled && !claiming}
          onClick={() => onClaim(item)}
          data-ai-handoff-claim={item.id}
        >
          <span>{CARD_WORDS.claim[language]}</span>
          <ArrowRight aria-hidden="true" className="sk-nudge rtl:rotate-180" />
        </Button>
      </div>
      {errorText ? <Alert compact tone="warning" className="mt-3">{errorText}</Alert> : null}
    </li>
  );
}

export function claimErrorWords(code: string, language: Lang): string | null {
  return CARD_WORDS[code as "LEASED" | "NOT_FOUND"]?.[language] ?? null;
}
