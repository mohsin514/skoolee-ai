"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import SkooleeLogo from "@/components/SkooleeLogo";

export interface RoleNavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

export interface RoleNavGroup {
  label: string;
  icon: LucideIcon;
  children: RoleNavItem[];
}

export type SidebarEntry = RoleNavItem | RoleNavGroup;

export function isNavGroup(entry: SidebarEntry): entry is RoleNavGroup {
  return "children" in entry;
}

function hasActiveChild(group: RoleNavGroup): boolean {
  return group.children.some((c) => c.active);
}

interface RoleSidebarProps {
  tagline?: string;
  items: SidebarEntry[];
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
        <div className="mb-6 shrink-0">
          <div className="mb-1.5">
            <SkooleeLogo size="1.5rem" />
          </div>
          <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-wider">
            {tagline}
          </p>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
          {items.map((entry) =>
            isNavGroup(entry) ? (
              <NavGroup key={entry.label} group={entry} />
            ) : (
              <SidebarButton key={entry.label} item={entry} />
            )
          )}
        </nav>

        {bottomItems.length > 0 && (
          <div className="pt-4 border-t border-[#cfc2d6]/20 space-y-1 shrink-0">
            {bottomItems.map((item) => (
              <SidebarButton key={item.label} item={item} />
            ))}
          </div>
        )}
      </aside>
    </MotionConfig>
  );
}

function NavGroup({ group }: { group: RoleNavGroup }) {
  const active = hasActiveChild(group);
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const Icon = group.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all duration-200 text-[13px] font-bold tracking-wide cursor-pointer",
          active
            ? "text-[#8127cf]"
            : "text-[#1f1a23]/70 hover:text-[#1f1a23] hover:bg-white/50"
        )}
      >
        <Icon className={cn("w-[18px] h-[18px] shrink-0", active ? "text-[#8127cf]" : "text-[#4d4354]/60")} />
        <span className="flex-1 text-left truncate">{group.label}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pl-3 space-y-0.5 pt-0.5 pb-1">
              {group.children.map((item) => (
                <SidebarButton key={item.label} item={item} compact />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarButton({ item, compact }: { item: RoleNavItem; compact?: boolean }) {
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
        "relative isolate w-full flex cursor-pointer items-center gap-3 rounded-2xl transition-all duration-300 font-semibold hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30 focus-visible:ring-offset-1",
        compact ? "px-3 py-2.5 text-[13px]" : "px-4 py-3 text-sm",
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
      <span className="relative z-10 flex items-center gap-3 min-w-0">
        <Icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-[#8127cf]" : "text-[#4d4354]/60")} />
        <span className="truncate">{item.label}</span>
      </span>
    </button>
  );
}
