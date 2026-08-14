"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { ChevronDown, Menu, X as XIcon, type LucideIcon } from "lucide-react";
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
  logoUrl?: string | null;
}

/** First letters of the institution/campus name, e.g. "Main Campus · Lahore" → "MC". */
function initialsOf(name?: string | null) {
  const words = (name ?? "")
    .split(/[·|,–-]/)[0]
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) return "S";
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function InstitutionBadge({
  logoUrl,
  name,
  className,
}: {
  logoUrl?: string | null;
  name?: string | null;
  className?: string;
}) {
  const base = className ?? "h-11 w-11 shrink-0 rounded-2xl border border-[#cfc2d6]/25";

  if (logoUrl) {
    return <img src={logoUrl} alt="Institution logo" className={cn(base, "object-cover")} />;
  }

  // No uploaded logo: a compact monogram tile. Never the wordmark — it sits
  // right next to the Skoolee wordmark and would render the brand twice.
  return (
    <span
      aria-hidden="true"
      className={cn(
        base,
        "grid place-items-center bg-gradient-to-br from-[#8127cf] to-[#b10e6b] text-white font-bold tracking-tight",
        "text-[13px] shadow-[0_4px_12px_rgba(129,39,207,0.25)]"
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function RoleSidebar({
  tagline = "The Joyful Architect",
  items,
  bottomItems = [],
  logoUrl,
}: RoleSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const topFiveItems = items.filter((e): e is RoleNavItem => !isNavGroup(e)).slice(0, 5);

  return (
    <MotionConfig reducedMotion="user">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-white/70 backdrop-blur-xl border-r border-[#cfc2d6]/25 flex-col p-6 fixed h-full z-50 shadow-[12px_0_40px_rgba(129,39,207,0.05)]">
        <div className="mb-6 shrink-0 flex items-center gap-3">
          <InstitutionBadge logoUrl={logoUrl} name={tagline} />
          <div className="min-w-0">
            <SkooleeLogo size="1.2rem" />
            <p className="text-[9px] font-bold text-[#b10e6b] uppercase tracking-wider truncate">
              {tagline}
            </p>
          </div>
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

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-[#cfc2d6]/25 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex items-center justify-around px-1 py-1 safe-area-pb">
        {topFiveItems.slice(0, 4).map((item) => (
          <MobileTabButton key={item.label} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-[#4d4354]/60 text-[10px] font-semibold"
        >
          <Menu className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile slide-out drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[130] bg-[#1f1a23]/45 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="md:hidden fixed inset-y-0 left-0 z-[131] w-72 bg-white flex flex-col p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <InstitutionBadge
                  logoUrl={logoUrl}
                  name={tagline}
                  className="h-10 w-10 shrink-0 rounded-2xl border border-[#cfc2d6]/25"
                />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-xl text-[#4d4354]/60 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
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
            </motion.aside>
          </>
        )}
      </AnimatePresence>
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
        aria-expanded={open}
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

function MobileTabButton({ item }: { item: RoleNavItem }) {
  const Icon = item.icon;
  const router = useRouter();
  const pathname = usePathname();
  const hrefPath = item.href?.split("?")[0] ?? item.href;
  const isActive = item.active ?? (hrefPath ? pathname === hrefPath || (!["/teacher", "/student", "/parent"].includes(hrefPath) && pathname.startsWith(hrefPath)) : false);

  return (
    <button
      type="button"
      onClick={() => {
        if (item.href) router.push(item.href);
        else item.onClick?.();
      }}
      className={cn(
        "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-semibold transition-colors min-w-0",
        isActive ? "text-[#8127cf]" : "text-[#4d4354]/60"
      )}
    >
      <Icon className={cn("w-5 h-5", isActive && "text-[#8127cf]")} />
      <span className="truncate max-w-[56px]">{item.label}</span>
    </button>
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
      aria-current={isActive ? "page" : undefined}
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
