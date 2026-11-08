"use client";
import { useUiText } from "@/components/locale/LocaleProvider";
import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavigationActive } from "@/lib/navigation/items";
import { moduleForView } from "@/lib/navigation/modules";
import { useNavigationAccess } from "./NavigationAccess";
import { Button, buttonVariants } from "@/components/ui/button";


// RoleShell owns desktop and mobile navigation; standalone pages retain their strip.
export const SidebarNavigationContext = createContext(false);

export function WorkspaceSubnav({ label, items, active, onSelect }: {
  label: string;
  items: { id: string; label: string; href?: string }[];
  active?: string;
  onSelect?: (id: string) => void;
}) {
  const sidebarOwnsNavigation = useContext(SidebarNavigationContext);
  const t = useUiText();
  const access = useNavigationAccess();
  const pathname = usePathname();
  const visible = items.filter((item) => item.href ? access.allowsHref(item.href) : access.allows(moduleForView(item.id)));
  if (sidebarOwnsNavigation || !visible.length) return null;
  return <nav aria-label={t(label)} className="flex min-w-0 shrink-0 flex-wrap gap-1 border-b border-border bg-card p-2">
    {visible.map((item) => {
      const selected = item.href ? isNavigationActive(item, pathname) : item.id === active;
      const className = buttonVariants({ variant: "choice", size: "sm" });
      return item.href ? <Link data-selected={selected} key={item.id} href={item.href} aria-current={selected ? 'page' : undefined} className={className}>{t(item.label)}</Link>
        : <Button variant="choice" data-selected={selected} key={item.id} type="button" aria-current={selected ? 'page' : undefined} className={className} onClick={() => onSelect?.(item.id)}>{t(item.label)}</Button>;
    })}
  </nav>;
}
