"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode, type HTMLAttributes } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, type LucideIcon } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { MaximizeBackdrop, MaximizeButton, useMaximize } from "./maximize";

/**
 * Panels inside a group can act as an accordion (opening one folds the rest) and share Expand all / Collapse all.
 * `command` counts each bulk action so every panel applies it once.
 */
type GroupState = { accordion: boolean; openId: string | null; setOpenId: (id: string | null) => void; command: { kind: "expand" | "collapse"; n: number } | null };
const PanelGroupContext = createContext<GroupState | null>(null);

export function CollapsiblePanelGroup({ accordion = false, toolbar = true, className, children }: { accordion?: boolean; toolbar?: boolean; className?: string; children: ReactNode }) {
  const t = useUiText();
  const [openId, setOpenId] = useState<string | null>(null);
  const [command, setCommand] = useState<GroupState["command"]>(null);
  const run = (kind: "expand" | "collapse") => setCommand((current) => ({ kind, n: (current?.n ?? 0) + 1 }));
  return (
    <PanelGroupContext.Provider value={{ accordion, openId, setOpenId, command }}>
      <div data-panel-group className={cn("space-y-4", className)}>
        {toolbar ? (
          <div className="flex justify-end gap-2">
            {accordion ? null : <Button size="sm" variant="ghost" onClick={() => run("expand")}><ChevronsUpDown aria-hidden="true" />{t("Expand all")}</Button>}
            <Button size="sm" variant="ghost" onClick={() => { setOpenId(null); run("collapse"); }}><ChevronsDownUp aria-hidden="true" />{t("Collapse all")}</Button>
          </div>
        ) : null}
        {children}
      </div>
    </PanelGroupContext.Provider>
  );
}

interface CollapsiblePanelProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled when defined (e.g. a disclosure that must stay open while it holds an error); uncontrolled otherwise. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show a button that opens the panel full screen. Default true. */
  maximizable?: boolean;
  children: ReactNode;
}

export function CollapsiblePanel({
  icon: Icon,
  title,
  subtitle,
  headerRight,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  maximizable = true,
  className,
  children,
  ...props
}: CollapsiblePanelProps) {
  const group = useContext(PanelGroupContext);
  const id = useId();
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const inAccordion = Boolean(group?.accordion) && !controlled;
  const open = controlled ? openProp : inAccordion ? group?.openId === id : innerOpen;
  const { ref: maxRef, maximized, toggle: toggleMax, close: closeMax } = useMaximize<HTMLDivElement>();

  // An accordion starts with its first default-open panel open.
  useEffect(() => {
    if (inAccordion && defaultOpen && group && group.openId === null) group.setOpenId(id);
    // Only on mount: later the user decides what is open.
  }, []);
  useEffect(() => {
    if (!group?.command || controlled || inAccordion) return;
    setInnerOpen(group.command.kind === "expand");
    onOpenChange?.(group.command.kind === "expand");
    // Apply each bulk command once, when it arrives.
  }, [group?.command]);

  const toggle = () => {
    if (inAccordion) group?.setOpenId(open ? null : id);
    else if (!controlled) setInnerOpen((current) => !current);
    onOpenChange?.(!open);
  };
  const showBody = open || maximized;

  return (
    <>
      {maximized ? <MaximizeBackdrop onClose={closeMax} /> : null}
      <div ref={maxRef} data-maximized={maximized || undefined} role={maximized ? "region" : undefined} aria-label={maximized ? title : undefined}
        className={cn("sk-panel overflow-hidden", className)} {...props}>
        {/* A native <button> can't legally contain `headerRight`, which is
            sometimes itself a button (e.g. BrandButton) — nested interactive
            controls are invalid HTML and trigger a hydration mismatch. This
            div reproduces button semantics/keyboard behavior without that
            constraint, matching the accessible-div pattern used elsewhere
            (e.g. StatCard's onClick variant). */}
        <div
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
          className="group flex w-full cursor-pointer flex-col gap-4 p-5 text-start transition-colors hover:bg-surface-subtle sm:flex-row sm:items-center sm:justify-between sm:p-6"
          aria-expanded={showBody}
        >
          <div className="flex items-start gap-3 sm:items-center sm:justify-start">
            <div className="sk-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-ink-strong">{title}</p>
              {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {headerRight ? <div onClick={(e) => e.stopPropagation()}>{headerRight}</div> : null}
            {maximizable ? <MaximizeButton maximized={maximized} onToggle={toggleMax} className="sk-reveal-on-hover" /> : null}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-ink-subtle transition-transform duration-200 group-hover:text-primary",
                showBody && "rotate-180"
              )}
            />
          </div>
        </div>
        {showBody ? <div className="sk-fade-in border-t border-border-subtle p-5 sm:p-6">{children}</div> : null}
      </div>
    </>
  );
}
