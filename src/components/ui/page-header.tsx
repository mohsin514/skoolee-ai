"use client";

/**
 * The one page header (SPEC §4.3, rule R1). Every console view, framed route and path page opens with it:
 * exactly one heading (h1 by default), the registry label as the title, one sentence of description that
 * names the decider where relevant, at most ONE primary action at the top-end (full width under the title
 * below 640 px), up to two visible secondary actions with the rest in a "More actions" menu, a status row
 * for persistent state ("Managed by {group}", "Read only") and the view's tabs.
 *
 * Text props are EN UI keys and are translated here. `title` and `description` also take a node for data,
 * which is rendered exactly as given and never looked up in the UI dictionary: a person's name goes in as
 * `<bdi>{name}</bdi>` (R7), so a name that happens to equal a UI key is not translated and stays isolated in
 * RTL. Copy a module already translated with its own dictionary may be passed as a plain string.
 * Spotlight anchors: page.header · page.title · page.primary-action · page.actions · page.tabs
 * (ViewTabs adds page.tab.<id>). Each visible action button carries `data-page-action="<id>"`, so a screen
 * can find it again (e.g. to return focus after a dialog) without holding a ref.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "./button";
import { IconButton } from "./icon-button";
import { Menu } from "./menu";
import { Tooltip } from "./tooltip";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

export interface PageAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
  tone?: "default" | "danger";
  loading?: boolean;
}

export interface PageHeaderProps {
  /** EN UI key, or a node for data (e.g. `<bdi>{pupil.fullName}</bdi>`), rendered as given. */
  title: React.ReactNode;
  eyebrow?: string;
  /** EN UI key, or a node rendered as given. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  status?: React.ReactNode;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  tabs?: React.ReactNode;
  back?: { label: string; href: string };
  headingLevel?: 1 | 2;
  className?: string;
}

function ActionControl({ action, primary, anchor }: { action: PageAction; primary: boolean; anchor?: string }) {
  const t = useUiText();
  const Icon = action.icon;
  const label = t(action.label);
  const danger = action.tone === "danger";
  // Primary is the plum default; secondaries are outline. Destructive work is never painted as primary.
  const variant = primary && !danger ? "default" : "outline";
  const className = cn(primary && "w-full sm:w-auto", danger && "text-destructive");
  const blocked = Boolean(action.disabled);
  const content = <>{Icon && !action.loading ? <Icon aria-hidden="true" /> : null}<span className="[overflow-wrap:anywhere]">{label}</span></>;

  let control: React.ReactElement;
  if (action.href && !blocked) {
    control = <Link href={action.href} data-tour={anchor} data-page-action={action.id} className={cn(buttonVariants({ variant }), className)} onClick={action.onClick}>{content}</Link>;
  } else {
    control = (
      <Button
        type="button"
        variant={variant}
        data-tour={anchor}
        data-page-action={action.id}
        loading={action.loading}
        // A blocked action stays focusable so its reason can be read; it does nothing when pressed.
        aria-disabled={blocked || undefined}
        className={cn(className, blocked && "cursor-not-allowed opacity-60")}
        onClick={() => { if (!blocked) action.onClick?.(); }}
      >
        {content}
      </Button>
    );
  }
  if (blocked && action.disabledReason) return <Tooltip content={t(action.disabledReason)}>{control}</Tooltip>;
  return control;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  icon: Icon,
  status,
  primaryAction,
  secondaryActions = [],
  tabs,
  back,
  headingLevel = 1,
  className,
}: PageHeaderProps) {
  const t = useUiText();
  // Strings are UI keys; any other node is data and is rendered untouched.
  const text = (value: React.ReactNode) => (typeof value === "string" ? t(value) : value);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const visibleSecondaries = secondaryActions.slice(0, 2);
  const overflow = secondaryActions.slice(2);
  const hasActions = Boolean(primaryAction) || secondaryActions.length > 0;

  return (
    <header data-tour="page.header" className={cn("flex min-w-0 shrink-0 flex-col gap-3", className)}>
      {back ? (
        <Link href={back.href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit gap-1.5 px-2 text-ink-muted")}>
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />{t(back.label)}
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {Icon ? (
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-100">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? <p className="text-xs font-semibold leading-tight text-primary">{t(eyebrow)}</p> : null}
            <Heading data-tour="page.title" className={cn("break-words font-bold tracking-tight text-ink-strong", headingLevel === 1 ? "text-xl sm:text-2xl" : "text-lg sm:text-xl", eyebrow && "mt-1")}>
              {text(title)}
            </Heading>
            {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{text(description)}</p> : null}
          </div>
        </div>
        {hasActions ? (
          <div data-tour="page.actions" className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {visibleSecondaries.map((action) => <ActionControl key={action.id} action={action} primary={false} />)}
            {overflow.length > 0 ? (
              <Menu
                label="More actions"
                align="end"
                trigger={<IconButton label={t("More actions")} variant="outline"><MoreHorizontal aria-hidden="true" /></IconButton>}
                items={overflow.map((action) => ({
                  id: action.id,
                  label: action.label,
                  icon: action.icon,
                  href: action.disabled ? undefined : action.href,
                  onSelect: action.onClick,
                  disabled: action.disabled,
                  description: action.disabled ? action.disabledReason : undefined,
                  tone: action.tone,
                }))}
              />
            ) : null}
            {primaryAction ? (
              <div className="order-first w-full sm:order-none sm:w-auto">
                <ActionControl action={primaryAction} primary anchor="page.primary-action" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {status ? <div className="flex min-w-0 flex-wrap items-center gap-2">{status}</div> : null}
      {tabs ? <div data-tour="page.tabs" className="min-w-0">{tabs}</div> : null}
    </header>
  );
}
