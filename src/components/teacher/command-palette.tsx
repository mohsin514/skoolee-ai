"use client";
import { InputGroup } from "@/components/ui/input-group";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialogBehaviour } from "@/components/ui/modal";
import { useRouter } from "next/navigation";
import { CalendarCheck, CornerDownLeft, GraduationCap, Search, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEACHER_NAV } from "@/components/teacher/teacher-page";
import { classLabel } from "@/components/teacher/teacher-components";
import { TEACHER_PALETTE_EVENT } from "@/components/teacher/palette-bus";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { useUiText } from "@/components/locale/LocaleProvider";


/**
 * ⌘K / Ctrl+K quick switcher for the teacher console.
 *
 * Twelve sections, plus a class list, plus a roster that is routinely two
 * hundred names — reaching any of it meant a sidebar click, then a page load,
 * then a filter. This collapses all three into one keystroke and gives the
 * teacher's real vocabulary ("5A attendance", a student's name) somewhere to go.
 *
 * Deliberately unstyled as a modal dialog rather than a `<dialog>`: it has to
 * sit above the existing `z-[120]` modals without inheriting their padding.
 */

type Command = {
  id: string;
  label: string;
  sub?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  keywords?: string;
};

export function TeacherCommandPalette({ data }: { data: any }) {
  const router = useRouter();
  const t = useUiText();
  const { status, allowsHref } = useNavigationAccess();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (status === "ready" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
    };
    // The subnav's affordance opens it for anyone who never learns the chord.
    const onOpen = () => { if (status === "ready") setOpen(true); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(TEACHER_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(TEACHER_PALETTE_EVENT, onOpen);
    };
  }, [status]);

  useEffect(() => {
    if (!open) { setQuery(""); setCursor(0); }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (status !== "ready") return [];
    const classHubs: any[] = data?.classHubs || [];
    const students: any[] = allowsHref("/teacher/students") ? data?.students || [] : [];

    const nav: Command[] = TEACHER_NAV.filter(item => allowsHref(item.href)).map((item) => ({
      id: `nav:${item.href}`,
      label: t(item.label),
      sub: t(item.group),
      group: t("Go to"),
      icon: item.icon,
      href: item.href,
    }));

    // Class actions carry the class through, the same way the class cards do,
    // so the destination opens on the class the teacher named.
    const classActions: Command[] = classHubs.flatMap((cls) => {
      const name = classLabel(cls);
      return [
        { id: `att:${cls.id}`, label: `${t("Attendance")} — ${name}`, sub: t("Mark today"), group: t("Classes"), icon: CalendarCheck, href: `/teacher/attendance?classId=${encodeURIComponent(cls.id)}`, keywords: `${name} attendance mark present absent` },
        { id: `mrk:${cls.id}`, label: `${t("Marks")} — ${name}`, sub: t("Enter marks"), group: t("Classes"), icon: Star, href: `/teacher/marks?classId=${encodeURIComponent(cls.id)}`, keywords: `${name} marks grades exam` },
        { id: `stu:${cls.id}`, label: `${t("Students")} — ${name}`, sub: t("Class roster"), group: t("Classes"), icon: GraduationCap, href: `/teacher/students?classId=${encodeURIComponent(cls.id)}`, keywords: `${name} students roster` },
      ];
    });

    // The roster only earns its place once the teacher is actually looking for
    // a person — otherwise two hundred names bury the twelve sections.
    const studentCommands: Command[] = query.trim().length >= 2
      ? students.slice(0, 400).map((st) => ({
          id: `person:${st.id}`,
          label: st.fullName,
          sub: `${st.rollNo || t("No roll")} · ${classLabel(st.class)}`,
          group: t("Students"),
          icon: Users,
          href: `/teacher/students?classId=${encodeURIComponent(st.class?.id || "")}&q=${encodeURIComponent(st.fullName || "")}`,
          keywords: `${st.fullName} ${st.rollNo || ""} ${st.guardianName || ""}`,
        }))
      : [];

    return [...nav, ...classActions, ...studentCommands].filter(command => allowsHref(command.href));
  }, [data, query, status, allowsHref, t]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => !c.id.startsWith("person:")).slice(0, 20);
    const scored = commands
      .map((c) => {
        const hay = `${c.label} ${c.sub || ""} ${c.keywords || ""}`.toLowerCase();
        const idx = hay.indexOf(q);
        if (idx === -1) return null;
        // A hit at the very start of the label reads as what you meant.
        return { c, score: c.label.toLowerCase().startsWith(q) ? 0 : idx + 1 };
      })
      .filter(Boolean) as { c: Command; score: number }[];
    return scored.sort((a, b) => a.score - b.score).slice(0, 24).map((s) => s.c);
  }, [commands, query]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const run = (cmd?: Command) => {
    if (!cmd || status !== "ready" || !allowsHref(cmd.href)) return;
    setOpen(false);
    router.push(cmd.href);
  };

  /* The palette kept the page scrolling behind it and picked `z-[200]` by hand,
     which put it under the account menus at `z-[999]`. It also never trapped
     focus, so Tab out of the search field walked the dashboard underneath. */
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { z } = useDialogBehaviour(panelRef, { onClose: close, active: open && status === "ready" });

  if (!open || status !== "ready") return null;

  return (
    <div
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-start justify-center bg-ink-strong/50 p-4 pt-[12vh] backdrop-blur-md animate-backdrop-enter"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Quick switcher")}
        className="animate-modal-enter w-full max-w-xl overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_34px_90px_rgba(120,70,180,0.35)]"
      >
        <InputGroup className="my-2">
          <Search data-field-affix="start" className="h-4 w-4 shrink-0 text-primary" />
          <SystemInput
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.max(0, Math.min(c + 1, results.length - 1))); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(results[cursor]); }
            }}
            placeholder={t("Jump to a section, class or student…")}
            aria-label={t("Search sections, classes and students")}
            className="h-14 w-full"
          />
          <kbd data-field-affix="end" data-field-action="text" className="hidden shrink-0 rounded-md border border-edge/40 px-1.5 py-0.5 text-2xs font-bold text-ink-subtle sm:block">
            ESC
          </kbd>
        </InputGroup>

        <div ref={listRef} className="custom-scrollbar max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Search}
              title={t("Nothing matches your search.")}
              description={t("Try a student name, roll number or page name.")}
            />
          ) : (
            results.map((cmd, i) => {
              const Icon = cmd.icon;
              const newGroup = i === 0 || results[i - 1].group !== cmd.group;
              return (
                <div key={cmd.id}>
                  {newGroup ? (
                    <p className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                      {cmd.group}
                    </p>
                  ) : null}
                  <Button variant="ghost"
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => run(cmd)}
                    className={cn(
                      "sk-row-interactive flex justify-start w-full items-center gap-3 text-start",
                      cursor === i ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        cursor === i ? "bg-primary text-primary-foreground" : "bg-accent text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{cmd.label}</span>
                      {cmd.sub ? (
                        <span className="block truncate text-2xs font-semibold text-ink-subtle">{cmd.sub}</span>
                      ) : null}
                    </span>
                    {cursor === i ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge/15 bg-surface-subtle px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
          <span>↑↓ {t("Navigate")}</span>
          <span>↵ {t("Open")}</span>
          <span className="ms-auto">{t("Type 2+ letters to search students")}</span>
        </div>
      </div>
    </div>
  );
}
