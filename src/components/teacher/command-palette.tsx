"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialogBehaviour } from "@/components/ui/modal";
import { useRouter } from "next/navigation";
import { CalendarCheck, CornerDownLeft, GraduationCap, Search, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEACHER_NAV } from "@/components/teacher/teacher-page";
import { classLabel } from "@/components/teacher/teacher-components";
import { TEACHER_PALETTE_EVENT } from "@/components/teacher/palette-bus";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
    };
    // The subnav's affordance opens it for anyone who never learns the chord.
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(TEACHER_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(TEACHER_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) { setQuery(""); setCursor(0); }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const classHubs: any[] = data?.classHubs || [];
    const students: any[] = data?.students || [];

    const nav: Command[] = TEACHER_NAV.map((item) => ({
      id: `nav:${item.href}`,
      label: item.label,
      sub: item.group,
      group: "Go to",
      icon: item.icon,
      href: item.href,
    }));

    // Class actions carry the class through, the same way the class cards do,
    // so the destination opens on the class the teacher named.
    const classActions: Command[] = classHubs.flatMap((cls) => {
      const name = classLabel(cls);
      return [
        { id: `att:${cls.id}`, label: `Attendance — ${name}`, sub: "Mark today", group: "Classes", icon: CalendarCheck, href: `/teacher/attendance?classId=${encodeURIComponent(cls.id)}`, keywords: `${name} attendance mark present absent` },
        { id: `mrk:${cls.id}`, label: `Marks — ${name}`, sub: "Enter marks", group: "Classes", icon: Star, href: `/teacher/marks?classId=${encodeURIComponent(cls.id)}`, keywords: `${name} marks grades exam` },
        { id: `stu:${cls.id}`, label: `Students — ${name}`, sub: "Class roster", group: "Classes", icon: GraduationCap, href: `/teacher/students?classId=${encodeURIComponent(cls.id)}`, keywords: `${name} students roster` },
      ];
    });

    // The roster only earns its place once the teacher is actually looking for
    // a person — otherwise two hundred names bury the twelve sections.
    const studentCommands: Command[] = query.trim().length >= 2
      ? students.slice(0, 400).map((st) => ({
          id: `person:${st.id}`,
          label: st.fullName,
          sub: `${st.rollNo || "No roll"} · ${classLabel(st.class)}`,
          group: "Students",
          icon: Users,
          href: `/teacher/students?classId=${encodeURIComponent(st.class?.id || "")}&q=${encodeURIComponent(st.fullName || "")}`,
          keywords: `${st.fullName} ${st.rollNo || ""} ${st.guardianName || ""}`,
        }))
      : [];

    return [...nav, ...classActions, ...studentCommands];
  }, [data, query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => c.group !== "Students").slice(0, 20);
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
    if (!cmd) return;
    setOpen(false);
    router.push(cmd.href);
  };

  /* The palette kept the page scrolling behind it and picked `z-[200]` by hand,
     which put it under the account menus at `z-[999]`. It also never trapped
     focus, so Tab out of the search field walked the dashboard underneath. */
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { z } = useDialogBehaviour(panelRef, { onClose: close, active: open });

  if (!open) return null;

  return (
    <div
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-start justify-center bg-[#1f1a23]/50 p-4 pt-[12vh] backdrop-blur-md animate-backdrop-enter"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        className="animate-modal-enter w-full max-w-xl overflow-hidden rounded-[26px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.35)] focus:outline-none"
      >
        <div className="flex items-center gap-3 border-b border-[#cfc2d6]/15 px-4">
          <Search className="h-4 w-4 shrink-0 text-[#8127cf]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(results[cursor]); }
            }}
            placeholder="Jump to a section, class or student…"
            aria-label="Search sections, classes and students"
            className="h-14 w-full bg-transparent text-sm font-bold text-[#1d1b20] outline-none placeholder:font-semibold placeholder:text-ink-subtle"
          />
          <kbd className="hidden shrink-0 rounded-md border border-[#cfc2d6]/40 px-1.5 py-0.5 text-[10px] font-black text-ink-subtle sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="custom-scrollbar max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm font-semibold text-ink-subtle">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((cmd, i) => {
              const Icon = cmd.icon;
              const newGroup = i === 0 || results[i - 1].group !== cmd.group;
              return (
                <div key={cmd.id}>
                  {newGroup ? (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                      {cmd.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => run(cmd)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      cursor === i ? "bg-[#fbf0fe]" : "hover:bg-[#fbf0fe]/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        cursor === i ? "bg-[#8127cf] text-white" : "bg-[#fbf0fe] text-[#8127cf]",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-[#1d1b20]">{cmd.label}</span>
                      {cmd.sub ? (
                        <span className="block truncate text-[11px] font-semibold text-ink-subtle">{cmd.sub}</span>
                      ) : null}
                    </span>
                    {cursor === i ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#8127cf]" /> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-[#cfc2d6]/15 bg-[#faf7fc] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span className="ml-auto">Type 2+ letters to search students</span>
        </div>
      </div>
    </div>
  );
}
