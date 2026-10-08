"use client";
import { useUiText } from "@/components/locale/LocaleProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavigationActive } from "@/lib/navigation/items";
import { moduleForView } from "@/lib/navigation/modules";
import { useNavigationAccess } from "./NavigationAccess";

export function WorkspaceSubnav({ label, items, active, onSelect }: {
  label: string;
  items: { id: string; label: string; href?: string }[];
  active?: string;
  onSelect?: (id: string) => void;
}) {
  const t = useUiText();
  const access = useNavigationAccess();
  const pathname = usePathname();
  const visible = items.filter((item) => item.href ? access.allowsHref(item.href) : access.allows(moduleForView(item.id)));
  if (!visible.length) return null;
  return <nav aria-label={t(label)} className="flex min-w-0 shrink-0 flex-wrap gap-1 border-b border-border bg-card p-2">
    {visible.map((item) => {
      const selected = item.href ? isNavigationActive(item, pathname) : item.id === active;
      const className = cn('inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold', selected ? 'bg-accent text-primary' : 'text-ink hover:bg-muted');
      return item.href ? <Link key={item.id} href={item.href} aria-current={selected ? 'page' : undefined} className={className}>{t(item.label)}</Link>
        : <button key={item.id} type="button" aria-current={selected ? 'page' : undefined} className={className} onClick={() => onSelect?.(item.id)}>{t(item.label)}</button>;
    })}
  </nav>;
}
