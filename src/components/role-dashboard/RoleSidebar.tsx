"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion, MotionConfig } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import SkooleeLogo from "@/components/SkooleeLogo";

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
    <MotionConfig reducedMotion="user">
      <aside className="hidden md:flex w-64 bg-white/70 backdrop-blur-xl border-r border-[#cfc2d6]/25 flex-col p-6 fixed h-full z-50 shadow-[12px_0_40px_rgba(129,39,207,0.05)]">
        <div className="mb-10">
          <div className="mb-1.5">
            <SkooleeLogo size="1.5rem" />
          </div>
          <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-wider">
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
    </MotionConfig>
  );
}

function SidebarButton({ item }: { item: RoleNavItem }) {
  const Icon = item.icon;
  const router = useRouter();
  const pathname = usePathname();

  const hrefPath = item.href?.split("?")[0] ?? item.href;
  const isActive = item.active ?? (hrefPath ? pathname === hrefPath || (!["/teacher", "/student", "/parent"].includes(hrefPath) && pathname.startsWith(hrefPath)) : false);

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
        "relative isolate w-full flex cursor-pointer items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 font-semibold text-sm hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30 focus-visible:ring-offset-1",
        isActive
          ? "text-[#8127cf] font-bold"
          : "text-[#4d4354] hover:bg-white/70 hover:text-[#1f1a23] hover:shadow-sm"
      )}
    >
      {isActive && (
        <motion.span
          layoutId="sidebar-active-pill"
          transition={{ type: "spring", stiffness: 500, damping: 34, mass: 0.9 }}
          className="absolute inset-0 z-0 rounded-2xl bg-gradient-to-r from-white to-[#fbf0fe] shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]"
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-full bg-gradient-to-b from-[#8127cf] to-[#9c48ea] sk-glow" />
        </motion.span>
      )}
      <span className="relative z-10 flex items-center gap-4 min-w-0">
        <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-[#8127cf]" : "text-[#4d4354]/60")} />
        <span className="truncate">{item.label}</span>
      </span>
    </button>
  );
}
