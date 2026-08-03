"use client";

import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RoleNavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

interface RoleSidebarProps {
  tagline?: string;
  items: RoleNavItem[];
  bottomItems?: RoleNavItem[];
}

export function RoleSidebar({
  tagline = "The Joyful Architect",
  items,
  bottomItems = [],
}: RoleSidebarProps) {
  return (
    <aside className="hidden md:flex w-64 bg-white/70 backdrop-blur-xl border-r border-[#cfc2d6]/25 flex-col p-6 fixed h-full z-50 shadow-[12px_0_40px_rgba(129,39,207,0.05)]">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-black text-xl tracking-wider text-[#8127cf]">Skoolee AI</h1>
        </div>
        <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-wider pl-11">
          {tagline}
        </p>
      </div>

      <nav className="flex-1 space-y-2">
        {items.map((item) => (
          <SidebarButton key={item.label} item={item} />
        ))}
      </nav>

      {bottomItems.length > 0 && (
        <div className="pt-6 border-t border-[#cfc2d6]/20 space-y-2">
          {bottomItems.map((item) => (
            <SidebarButton key={item.label} item={item} />
          ))}
        </div>
      )}
    </aside>
  );
}

function SidebarButton({ item }: { item: RoleNavItem }) {
  const Icon = item.icon;
  const router = useRouter();
  const pathname = usePathname();

  const isActive = item.active ?? (item.href ? pathname === item.href || (!["/teacher", "/student"].includes(item.href) && pathname.startsWith(item.href)) : false);

  const handleClick = () => {
    if (item.href) {
      router.push(item.href);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={item.label}
      className={cn(
        "w-full flex cursor-pointer items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 font-semibold text-sm hover:-translate-y-0.5 active:scale-[0.98]",
        isActive
          ? "bg-white text-[#8127cf] shadow-xl shadow-[#8127cf]/10 font-bold"
          : "text-[#4d4354] hover:bg-white/70 hover:text-[#1f1a23] hover:shadow-sm"
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-[#8127cf]" : "text-[#4d4354]/60")} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
