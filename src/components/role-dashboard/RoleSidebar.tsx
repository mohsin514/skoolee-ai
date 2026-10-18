"use client";

import { UiText } from "@/components/locale/LocaleProvider";

import { useUiText, useLocale } from "@/components/locale/LocaleProvider";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Wrench, ShieldCheck, Bus, Layers, Receipt, Plug, KeyRound, ClipboardCheck, Sparkles, BookOpen, ChevronDown, ChevronLeft, FileSearch, Menu, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { availableNavigation, isNavigationActive, searchNavigation } from "@/lib/navigation/items";
import { ModalSurface } from "@/components/ui/modal";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import SkooleeLogo from "@/components/SkooleeLogo";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";


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
}
export interface RoleNavGroup {
  label: string;
  icon: LucideIcon;
  children: RoleNavItem[];
  available?: boolean;
}
export type SidebarEntry = RoleNavItem | RoleNavGroup;
export function isNavGroup(entry: SidebarEntry): entry is RoleNavGroup {
  return "children" in entry;
}

interface RoleSidebarProps {
  tagline?: string;
  taglineLang?: string;
  items: SidebarEntry[];
  bottomItems?: RoleNavItem[];
  logoUrl?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** SKO-401: staff get a link to record search; families never do. */
  recordSearch?: boolean;
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

export function RoleSidebar({ tagline = "SkooleeAI", taglineLang, items: allItems, bottomItems: allBottomItems = [], logoUrl, collapsed = false, onToggleCollapse, recordSearch = false }: RoleSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const t = useUiText();
  const locale = useLocale();
  const pathname = usePathname();
  const access = useNavigationAccess();
  const visible = (item: RoleNavItem) => ({ ...item, label: t(item.label), lang: locale.language, available: item.available !== false && access.allows(item.module) && access.allowsHref(item.href) });
  const items = availableNavigation<SidebarEntry>(allItems.map((entry) => isNavGroup(entry) ? { ...entry, label: t(entry.label), children: entry.children.map(visible) } : visible(entry)));
  const hasAiLink = allItems.some(item => isNavGroup(item) ? item.children.some(child => child.href === "/ai") : item.href === "/ai");
  const aiItems: RoleNavItem[] = !hasAiLink && access.allows("schoolAi") ? [{ href: "/ai", label: locale.language === "ar" ? "مساحة المدرسة الذكية" : locale.language === "ur" ? "اسکول اے آئی ورک اسپیس" : "School AI workspace", icon: Sparkles, module: "ai" }] : [];
  const hasExamLink = [...allItems, ...allBottomItems].some(item => isNavGroup(item) ? item.children.some(child => child.href === "/ai/exams") : item.href === "/ai/exams");
  const examItems: RoleNavItem[] = !hasExamLink && access.allows("schoolAiExams") ? [{ href: "/ai/exams", label: locale.language === "ar" ? "اختباراتي الإلكترونية" : locale.language === "ur" ? "میرے آن لائن امتحانات" : "My online exams", icon: BookOpen }] : [];
  const bottomItems = availableNavigation([...aiItems, ...examItems, { href: "/corrections", label: locale.language === "ar" ? "تصحيحات السجلات" : locale.language === "ur" ? "ریکارڈ کی تصحیحات" : "Record corrections", icon: History, module: "corrections" }, ...(recordSearch ? [{ href: "/service-desk", label: "Service desk", icon: Wrench }, { href: "/care", label: "Confidential care", icon: ShieldCheck }, { href: "/transport", label: "Today's trips", icon: Bus }, { href: "/group-policy", label: "Group policy", icon: Layers }, { href: "/tax-packages", label: "Invoice tax packages", icon: Receipt }, { href: "/integrations", label: "Integrations", icon: Plug }, { href: "/identity", label: "Identity and roster", icon: KeyRound }, { href: "/improvement", label: "Improvement evidence", icon: ClipboardCheck }] : []), ...allBottomItems].map(visible));
  const shortcuts = items.filter((entry): entry is RoleNavItem => !isNavGroup(entry)).slice(0, 4);
  const directory = searchNavigation<SidebarEntry>([...items, ...bottomItems], query);

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

  const navigation = (rail = false, onNavigate?: () => void) => (
    <>
      {items.map((entry) => isNavGroup(entry)
        ? <NavGroup key={entry.label} group={entry} collapsed={rail} onExpand={onToggleCollapse} onNavigate={onNavigate} />
        : <NavigationItem key={entry.label} item={entry} collapsed={rail} onNavigate={onNavigate} />)}
      {bottomItems.length > 0 && <div className="mt-4 space-y-1 border-t border-border pt-3">
        {bottomItems.map((item) => <NavigationItem key={item.label} item={item} collapsed={rail} onNavigate={onNavigate} />)}
      </div>}
    </>
  );

  return (
    <>
      <aside className={cn("fixed inset-y-0 start-0 z-50 hidden flex-col border-e border-border/50 bg-card shadow-[4px_0_30px_-16px_rgba(129,39,207,0.18)] p-3 text-card-foreground md:flex", collapsed ? "w-[72px]" : "w-64")}>
        <div className="mb-6 flex min-h-11 items-center gap-3 px-1">
          <InstitutionBadge logoUrl={logoUrl} name={tagline} />
          {!collapsed && <div className="min-w-0"><SkooleeLogo size="1.2rem" /><p lang={taglineLang} className="mt-1 break-words text-xs text-ink-muted">{tagline}</p></div>}
        </div>
        <Button variant="outline" type="button" aria-label={t("Find a workspace")} aria-keyshortcuts="Alt+Shift+K" aria-haspopup="dialog" aria-expanded={mobileOpen} title={collapsed ? t("Find a workspace") : undefined} onClick={() => setMobileOpen(true)} className={cn("mb-3 min-h-11 gap-2", collapsed ? "px-0" : "justify-start px-3")}>
          <Search aria-hidden="true" className="h-4 w-4 shrink-0" />{!collapsed && <span className="min-w-0 text-start">{t("Find a workspace")}</span>}
        </Button>
        {recordSearch && <Link href="/search" aria-label={t("Search records")} title={collapsed ? t("Search records") : undefined} data-record-search-link className={cn(buttonVariants({ variant: "ghost" }), "mb-3 min-h-11 gap-2", collapsed ? "px-0" : "justify-start px-3")}>
          <FileSearch aria-hidden="true" className="h-4 w-4 shrink-0" />{!collapsed && <span className="min-w-0 text-start">{t("Search records")}</span>}
        </Link>}
        <nav aria-label={t("Primary navigation")} className="min-h-0 flex-1 space-y-1 overflow-y-auto">{navigation(collapsed)}</nav>
        {onToggleCollapse && <Button variant="outline" type="button" onClick={onToggleCollapse} aria-label={collapsed ? t("Expand sidebar") : t("Collapse sidebar")} aria-expanded={!collapsed} className="mt-3 flex min-h-11 items-center justify-center gap-2">
          <ChevronLeft aria-hidden="true" className={cn("h-4 w-4 rtl:rotate-180", collapsed && "rotate-180 rtl:rotate-0")} />
          {!collapsed && t("Collapse")}
        </Button>}
      </aside>
      <nav ref={mobileNavRef} aria-label={t("Mobile navigation")} className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-border bg-card px-[4px] py-[4px] safe-area-pb md:hidden">
        {shortcuts.map((item, index) => <NavigationItem key={item.label} item={item} mobile narrowHidden={index > 1} />)}
        <Button variant="ghost" type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-haspopup="dialog" className="flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-[4px] px-[4px] py-[6px] text-xs leading-tight [&>svg]:size-[20px]">
          <Menu aria-hidden="true" className="h-5 w-5" /><span><UiText>{"More"}</UiText></span>
        </Button>
      </nav>
      {mobileOpen && <ModalSurface onClose={() => setMobileOpen(false)} ariaLabel={t("Navigation")} initialFocusRef={searchRef} className="!max-h-[90dvh]">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-bold"><UiText>{"Navigation"}</UiText></h2>
          <Button variant="ghost" size="icon" type="button" aria-label={t("Close navigation")} onClick={() => setMobileOpen(false)} className="grid place-items-center [&>svg]:size-5"><X aria-hidden="true" className="h-5 w-5" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border p-4">
          <FormField name="workspace-search" label={t("Find a workspace")} hint={t("Only workspaces available to your current role and school are shown.")}>
            <Input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search workspaces")} autoComplete="off" />
          </FormField>
        </div>
        <nav aria-label={t("All navigation")} className="space-y-1 p-4">
          {directory.map(entry => isNavGroup(entry) ? <section key={entry.label} className="space-y-1"><h3 className="px-3 pt-3 text-xs font-semibold text-ink-muted">{entry.label}</h3>{entry.children.map(item => <NavigationItem key={item.label} item={item} onNavigate={() => setMobileOpen(false)} />)}</section> : <NavigationItem key={entry.label} item={entry} onNavigate={() => setMobileOpen(false)} />)}
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
  const Icon = group.icon;
  return <div>
    <Button variant="ghost" type="button" aria-label={group.label} title={collapsed ? group.label : undefined} aria-expanded={!collapsed && open}
      onClick={() => {
        if (collapsed) { setOpen(true); onExpand?.(); return; }
        // A group holding the current view stays open: RoleShell suppresses the
        // standalone section strip, so its children are the only route back to the
        // screen you are already on. Collapsing it would hide where you are.
        setOpen(active ? true : !open);
      }}
      className={cn("flex justify-start min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-semibold [&>svg:first-child]:size-5", collapsed && "justify-center", active ? "text-primary" : "text-ink")}>
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      {!collapsed && <><span className="flex-1">{group.label}</span><ChevronDown aria-hidden="true" className={cn("h-4 w-4", open && "rotate-180")} /></>}
    </Button>
    {open && !collapsed && <div className="ms-3 space-y-1 border-s border-border ps-2">{group.children.map((item) => <NavigationItem key={item.label} item={item} onNavigate={onNavigate} />)}</div>}
  </div>;
}

function NavigationItem({ item, collapsed, mobile, narrowHidden, onNavigate }: { item: RoleNavItem; collapsed?: boolean; mobile?: boolean; narrowHidden?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavigationActive(item, pathname);
  const Icon = item.icon;
  const className = cn("flex justify-start min-h-11 min-w-0 items-center gap-3 [&>svg]:size-5 rounded-xl px-3 py-2 text-start text-sm font-semibold transition-colors", active ? "bg-accent text-primary" : "text-ink hover:bg-muted", collapsed && "justify-center", mobile ? "min-h-[44px] flex-1 flex-col justify-center gap-[4px] px-[4px] py-[6px] text-center text-xs leading-tight [&>svg]:size-[20px]" : "w-full", mobile && narrowHidden && "max-[399px]:hidden");
  const content = <><Icon aria-hidden="true" className="h-5 w-5 shrink-0" />{!collapsed && <span lang={item.lang} className="min-w-0 max-w-full [overflow-wrap:anywhere]">{item.label}</span>}</>;
  // A route is a link (open-in-new-tab, copy address, keyboard semantics); a local view is a button.
  return item.href ? <Link href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} className={className} onClick={onNavigate}>{content}</Link>
    : <Button variant="ghost" size={collapsed ? "icon" : "default"} type="button" aria-label={item.label} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} className={className} onClick={() => { item.onClick?.(); onNavigate?.(); }}>{content}</Button>;
}
