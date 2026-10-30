"use client";

import { UiText, useUiText, useLocale } from "@/components/locale/LocaleProvider";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, FileSearch, Menu, Pin, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { availableNavigation, isNavigationActive, searchNavigation } from "@/lib/navigation/items";
import { ModalSurface } from "@/components/ui/modal";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import SkooleeLogo from "@/components/SkooleeLogo";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Tooltip } from "@/components/ui/tooltip";
import { FlagshipChip } from "@/components/ui/flagship";
import { HelpMenu } from "./HelpMenu";
import type { UserRole } from "@/lib/roles";


export interface RoleNavItem {
  lang?: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  /** False when the current scope, permission or enabled-module policy denies this destination. */
  available?: boolean;
  module?: string | null;
  /** Stable registry id; anchors and React keys come from it, never from translated text. */
  id?: string;
  /** `data-tour` value for the desktop row (registry `shell.nav.<id>`). */
  tourAnchor?: string;
  /** Shorter label for the phone bar (registry `mobileLabel`, translated); the sidebar keeps `label`. */
  mobileLabel?: string;
  /** `data-tour` value when rendered in the mobile bar (`shell.mobile.<id>`). */
  mobileAnchor?: string;
  /** Count from GET /api/navigation/counts; shown when > 0. */
  badge?: number;
  /** A flagship surface (registry `flagship`): the row carries the shared FlagshipChip. */
  flagship?: boolean;
}
export interface RoleNavGroup {
  label: string;
  icon: LucideIcon;
  children: RoleNavItem[];
  available?: boolean;
  id?: string;
  tourAnchor?: string;
  zone?: "primary" | "more" | "owner" | "settings";
}
export type SidebarEntry = RoleNavItem | RoleNavGroup;
export function isNavGroup(entry: SidebarEntry): entry is RoleNavGroup {
  return "children" in entry;
}

interface RoleSidebarProps {
  tagline?: string;
  taglineLang?: string;
  /** Translated, access-filtered entries. Registry consoles pass registry entries; legacy callers their own. */
  items: SidebarEntry[];
  /** Legacy callers only. Registry consoles never inject links below the nav (SPEC §3.2). */
  bottomItems?: RoleNavItem[];
  /** The four mobile slots. Registry consoles pass `mobileLeaves`; legacy callers fall back to the first four items. */
  mobileItems?: RoleNavItem[];
  logoUrl?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Set while the sidebar is folded: hovering the rail opens it over the content until the pointer leaves. */
  peek?: { active: boolean; onChange: (open: boolean) => void };
  /** Registry `recordSearch` AND the caller's `recordSearch` capability (CA, ADMIN, PRINCIPAL, RECEPTIONIST). */
  recordSearch?: boolean;
  /** Role for the Help & tour row in the mobile sheet; omitted = no row. */
  helpRole?: UserRole;
  /** Framed route: the Help tour row reads "Tour my workspace". */
  framed?: boolean;
}

function InstitutionBadge({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
  const t = useUiText();
  const resolved = resolveMediaUrl(logoUrl);
  return resolved ? (
    <img src={resolved} alt={t("Institution logo")} className="h-10 w-10 shrink-0 rounded-xl border border-border object-cover" />
  ) : (
    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-700 to-brand-500 shadow-lg shadow-primary/20 text-sm font-bold text-primary-foreground">
      {Array.from(name.trim())[0] || "S"}
    </span>
  );
}

const keyOf = (entry: SidebarEntry) => entry.id ?? entry.label;

/** Tablet (md up to lg): the sidebar is always the 72px icon rail so the page keeps its width. */
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1023.98px)";
function subscribeTablet(listener: () => void) {
  const query = window.matchMedia(TABLET_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const tabletSnapshot = () => window.matchMedia(TABLET_QUERY).matches;
const serverTablet = () => false;
function useTabletRail(): boolean {
  return useSyncExternalStore(subscribeTablet, tabletSnapshot, serverTablet);
}

export function RoleSidebar({ tagline = "SkooleeAI", taglineLang, items: allItems, bottomItems: allBottomItems = [], mobileItems, logoUrl, collapsed = false, onToggleCollapse, peek, recordSearch = false, helpRole, framed = false }: RoleSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const t = useUiText();
  const locale = useLocale();
  const pathname = usePathname();
  const access = useNavigationAccess();
  // Legacy entries still carry module ids and raw labels; registry entries arrive filtered and translated.
  const visible = (item: RoleNavItem) => item.id ? { ...item, lang: locale.language } : ({ ...item, label: t(item.label), lang: locale.language, available: item.available !== false && access.allows(item.module) && access.allowsHref(item.href) });
  const items = availableNavigation<SidebarEntry>(allItems.map((entry) => isNavGroup(entry) ? { ...entry, label: entry.id ? entry.label : t(entry.label), children: entry.children.map(visible) } : visible(entry)));
  const bottomItems = availableNavigation(allBottomItems.map(visible));
  const shortcuts = (mobileItems ? availableNavigation(mobileItems.map(visible)) : items.filter((entry): entry is RoleNavItem => !isNavGroup(entry))).slice(0, 4);
  const directory = searchNavigation<SidebarEntry>([...items, ...bottomItems], query);
  const tablet = useTabletRail();
  const rail = collapsed || tablet;
  const asideRef = useRef<HTMLElement>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  const schedulePeek = (open: boolean) => {
    if (!peek || tablet) return;
    window.clearTimeout(peekTimer.current);
    // A short intent delay: crossing the rail on the way to the page never flings the sidebar open.
    peekTimer.current = window.setTimeout(() => peek.onChange(open), open ? 220 : 160);
  };
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const allLeaves = [...items.flatMap((entry) => isNavGroup(entry) ? entry.children : [entry]), ...bottomItems];
  // "More" lights up when the current screen is not one of the four slots, so the bar always shows where you are.
  const activeInSlot = shortcuts.some((item) => isNavigationActive(item, pathname));
  const activeKey = allLeaves.find((item) => isNavigationActive(item, pathname))?.id ?? pathname;
  // A console whose every destination already has a slot (e.g. the library) needs no More button.
  const needsMore = allLeaves.length > shortcuts.length || recordSearch;

  // After a navigation the active row scrolls into view (an open group can push it below the fold).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      asideRef.current?.querySelector<HTMLElement>('nav [aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeKey, rail]);

  useEffect(() => {
    const nav = mobileNavRef.current;
    const shell = nav?.closest<HTMLElement>('[data-role-shell]');
    if (!nav || !shell) return;
    // Labels grow with text zoom and locale. Reserve the measured bar height
    // instead of assuming a fixed bottom inset that can cover the last task.
    const measure = () => shell.style.setProperty('--mobile-nav-height', `${nav.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(nav); measure();
    return () => { observer.disconnect(); shell.style.removeProperty('--mobile-nav-height'); };
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => { if (!mobileOpen) setQuery(""); }, [mobileOpen]);
  useEffect(() => {
    const openDirectory = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.code !== "KeyK" || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return;
      if (access.status !== "ready") return;
      event.preventDefault(); setMobileOpen(true);
    };
    window.addEventListener("keydown", openDirectory);
    return () => window.removeEventListener("keydown", openDirectory);
  }, [access.status]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (query.matches) setMobileOpen(false); };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);

  // The flagship rows (AI Workflows, Exam Studio) follow the landing row; a hairline closes the pair off from the
  // everyday destinations below, so the two read as one featured block.
  const closesFlagships = (index: number) => {
    const entry = items[index];
    const next = items[index + 1];
    return !isNavGroup(entry) && Boolean(entry.flagship) && Boolean(next) && (isNavGroup(next) || !next.flagship);
  };
  const navigation = (rail = false, onNavigate?: () => void) => (
    <>
      {items.map((entry, index) => isNavGroup(entry)
        ? <NavGroup key={keyOf(entry)} group={entry} collapsed={rail} onExpand={tablet && !collapsed ? () => setMobileOpen(true) : onToggleCollapse} onNavigate={onNavigate} />
        : closesFlagships(index)
          ? <div key={keyOf(entry)} className="mb-2 border-b border-border-subtle pb-2"><NavigationItem item={entry} collapsed={rail} onNavigate={onNavigate} /></div>
          : <NavigationItem key={keyOf(entry)} item={entry} collapsed={rail} onNavigate={onNavigate} />)}
      {bottomItems.length > 0 && <div className="mt-4 space-y-1 border-t border-border pt-3">
        {bottomItems.map((item) => <NavigationItem key={keyOf(item)} item={item} collapsed={rail} onNavigate={onNavigate} />)}
      </div>}
    </>
  );

  return (
    <>
      <aside ref={asideRef} data-sidebar-peek={peek?.active || undefined} onMouseEnter={() => schedulePeek(true)} onMouseLeave={() => schedulePeek(false)}
        className={cn("sk-sidebar fixed inset-y-0 start-0 z-50 hidden flex-col border-e border-border/50 bg-card p-3 shadow-sm text-card-foreground md:flex", collapsed ? "w-[72px]" : "w-[72px] lg:w-64")}>
        <div className="mb-6 flex min-h-11 items-center gap-3 px-1">
          <InstitutionBadge logoUrl={logoUrl} name={tagline} />
          {!rail && <div className="min-w-0"><SkooleeLogo size="1.2rem" /><p lang={taglineLang} className="mt-1 truncate text-xs text-ink-muted" title={tagline}>{tagline}</p></div>}
        </div>
        <Tooltip content={t("Find a workspace")} describe={false} disabled={!rail}>
        <Button variant="outline" type="button" data-tour="shell.sidebar.find" aria-label={t("Find a workspace")} aria-keyshortcuts="Alt+Shift+K" aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className={cn("mb-3 min-h-11 gap-2", rail ? "px-0" : "justify-start px-3")}>
          <Search aria-hidden="true" className="h-4 w-4 shrink-0" />{!rail && <span className="min-w-0 text-start">{t("Find a workspace")}</span>}
        </Button>
        </Tooltip>
        {recordSearch && <Tooltip content={t("Search records")} describe={false} disabled={!rail}><Link href="/search" aria-label={t("Search records")} data-record-search-link data-tour="shell.sidebar.search-records" className={cn(buttonVariants({ variant: "ghost" }), "mb-3 min-h-11 gap-2", rail ? "px-0" : "justify-start px-3")}>
          <FileSearch aria-hidden="true" className="h-4 w-4 shrink-0" />{!rail && <span className="min-w-0 text-start">{t("Search records")}</span>}
        </Link></Tooltip>}
        <nav aria-label={t("Primary navigation")} className="min-h-0 flex-1 space-y-1 overflow-y-auto">{navigation(rail)}</nav>
        {onToggleCollapse && <Button variant="outline" type="button" data-tour="shell.sidebar.collapse" onClick={onToggleCollapse} aria-label={peek?.active ? t("Keep sidebar open") : collapsed ? t("Expand sidebar") : t("Collapse sidebar")} aria-expanded={!rail} className="mt-3 flex min-h-11 items-center justify-center gap-2">
          {peek?.active ? <Pin aria-hidden="true" className="h-4 w-4" /> : <ChevronLeft aria-hidden="true" className={cn("h-4 w-4 rtl:rotate-180", collapsed && "rotate-180 rtl:rotate-0")} />}
          {!collapsed && t(peek?.active ? "Keep open" : "Collapse")}
        </Button>}
      </aside>
      <nav ref={mobileNavRef} aria-label={t("Mobile navigation")} className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-border bg-card px-[4px] py-[4px] safe-area-pb md:hidden">
        {shortcuts.map((item) => <NavigationItem key={keyOf(item)} item={item} mobile />)}
        {needsMore ? <Button variant="ghost" type="button" data-tour="shell.mobile.more" data-active={!activeInSlot || undefined} aria-label={t("More")} onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-haspopup="dialog" className={cn("flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-[4px] rounded-xl px-[4px] py-[6px] text-2xs font-semibold leading-tight [&>svg]:size-[20px]", !activeInSlot ? "bg-accent text-primary" : "text-ink")}>
          <Menu aria-hidden="true" className="h-5 w-5" /><span className="block max-w-full truncate whitespace-nowrap break-normal max-[359px]:sr-only"><UiText>{"More"}</UiText></span>
        </Button> : null}
      </nav>
      {mobileOpen && <ModalSurface onClose={() => setMobileOpen(false)} ariaLabel={t("Navigation")} initialFocusRef={searchRef} className="!max-h-[90dvh]">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-bold"><UiText>{"Navigation"}</UiText></h2>
          <Button variant="ghost" size="icon" type="button" aria-label={t("Close navigation")} onClick={() => setMobileOpen(false)} className="grid place-items-center [&>svg]:size-5"><X aria-hidden="true" className="h-5 w-5" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        {helpRole ? <div className="border-b border-border px-4 py-2"><HelpMenu role={helpRole} framed={framed} variant="row" onAction={() => setMobileOpen(false)} /></div> : null}
        <div className="border-b border-border p-4">
          <FormField name="workspace-search" label={t("Find a workspace")} hint={t("Only workspaces available to your current role and school are shown.")}>
            <Input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search workspaces")} autoComplete="off" />
          </FormField>
        </div>
        <nav aria-label={t("All navigation")} className="space-y-1 p-4">
          {recordSearch && !query && <Link href="/search" className={cn(buttonVariants({ variant: "ghost" }), "w-full min-h-11 justify-start gap-3 px-3")} onClick={() => setMobileOpen(false)}><FileSearch aria-hidden="true" className="h-5 w-5 shrink-0" />{t("Search records")}</Link>}
          {directory.map(entry => isNavGroup(entry) ? <section key={keyOf(entry)} className="space-y-1"><h3 className="px-3 pt-3 text-xs font-semibold text-ink-muted">{entry.label}</h3>{entry.children.map(item => <NavigationItem key={keyOf(item)} item={item} directory onNavigate={() => setMobileOpen(false)} />)}</section> : <NavigationItem key={keyOf(entry)} item={entry} directory onNavigate={() => setMobileOpen(false)} />)}
          {!directory.length && <div className="space-y-3 p-3"><p role="status" className="text-sm text-ink-muted">{t("No available workspaces match your search.")}</p><Button variant="outline" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>{t("Clear search")}</Button></div>}
        </nav>
        </div>
      </ModalSurface>}
    </>
  );
}

function NavGroup({ group, collapsed, onExpand, onNavigate }: { group: RoleNavGroup; collapsed?: boolean; onExpand?: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = group.children.some((item) => isNavigationActive(item, pathname));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  // The spotlight tour opens the group that holds the control it is about to explain.
  useEffect(() => {
    if (!group.id) return;
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<{ groupId?: string }>).detail;
      if (detail?.groupId === group.id) setOpen(true);
    };
    window.addEventListener("skoolee:reveal-nav", reveal);
    return () => window.removeEventListener("skoolee:reveal-nav", reveal);
  }, [group.id]);
  const Icon = group.icon;
  // A group holding the current view stays open: its children are the only
  // route back to the screen you are already on. Collapsing it would hide where you are.
  const toggleGroup = () => {
    if (collapsed) { setOpen(true); onExpand?.(); return; }
    setOpen(active ? true : !open);
  };
  return <div className={cn(group.zone === "owner" && "mt-2 border-t border-border pt-2")}>
    <Tooltip content={group.label} describe={false} disabled={!collapsed}>
    <Button variant="ghost" type="button" data-tour={group.tourAnchor} aria-label={group.label} aria-expanded={!collapsed && open}
      onClick={toggleGroup}
      className={cn("flex justify-start min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-semibold [&>svg:first-child]:size-5", collapsed && "justify-center", active ? "text-primary" : "text-ink")}>
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      {!collapsed && <><span className="flex-1">{group.label}</span><ChevronDown aria-hidden="true" className={cn("h-4 w-4", open && "rotate-180")} /></>}
    </Button>
    </Tooltip>
    {open && !collapsed && <div className="ms-3 space-y-1 border-s border-border ps-2">{group.children.map((item) => <NavigationItem key={keyOf(item)} item={item} onNavigate={onNavigate} />)}</div>}
  </div>;
}

function NavigationItem({ item, collapsed, mobile, directory, onNavigate }: { item: RoleNavItem; collapsed?: boolean; mobile?: boolean; directory?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavigationActive(item, pathname);
  const Icon = item.icon;
  const badge = item.badge && item.badge > 0 ? (item.badge > 99 ? "99+" : String(item.badge)) : null;
  // Only the visible sidebar row and mobile slot carry the anchor; the directory copy would duplicate it.
  const anchor = directory ? undefined : mobile ? item.mobileAnchor : item.tourAnchor;
  const className = cn("relative flex justify-start min-h-11 min-w-0 items-center gap-3 [&>svg]:size-5 rounded-xl px-3 py-2 text-start text-sm font-semibold transition-colors", active ? "bg-accent text-primary" : "text-ink hover:bg-muted", collapsed && "justify-center", mobile ? "h-[52px] min-h-0 flex-1 flex-col justify-center gap-[4px] px-[4px] py-[6px] text-center text-2xs leading-tight [&>svg]:size-[20px]" : "w-full");
  const content = <>
    <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
    {!collapsed && (mobile
      ? <span lang={item.lang} className="block min-w-0 max-w-full truncate whitespace-nowrap break-normal max-[359px]:sr-only">{item.mobileLabel ?? item.label}</span>
      : <span lang={item.lang} className="min-w-0 max-w-full break-words">{item.label}</span>)}
    {item.flagship && !collapsed && !mobile ? <FlagshipChip className="ms-auto shrink-0" /> : null}
    {badge && !collapsed && !mobile ? <span className="ms-auto grid min-w-6 place-items-center rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-foreground"><bdi>{badge}</bdi></span> : null}
    {badge && (collapsed || mobile) ? <span aria-hidden="true" className="absolute end-2 top-1.5 size-2 rounded-full bg-primary ring-2 ring-card" /> : null}
  </>;
  const name = badge ? `${item.label} (${badge})` : item.label;
  // A route is a link (open-in-new-tab, copy address, keyboard semantics); a local view is a button.
  const control = item.href ? <Link href={item.href} data-tour={anchor} aria-label={name} aria-current={active ? "page" : undefined} className={className} onClick={() => { item.onClick?.(); onNavigate?.(); }}>{content}</Link>
    : <Button variant="ghost" size={collapsed ? "icon" : "default"} type="button" data-tour={anchor} aria-label={name} aria-current={active ? "page" : undefined} className={className} onClick={() => { item.onClick?.(); onNavigate?.(); }}>{content}</Button>;
  return <Tooltip content={item.label} describe={false} disabled={!collapsed}>{control}</Tooltip>;
}
