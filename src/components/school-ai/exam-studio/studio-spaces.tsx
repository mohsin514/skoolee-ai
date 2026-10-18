"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord, WorkspaceCapabilities } from "@/lib/school-ai/types";
import { studioShellSpaceCopy } from "@/lib/school-ai/exam-studio-copy-shell";
import { studioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import { STUDIO_SPACES, STUDIO_SPACE_IDS, loadStudioSpace, studioSpace, type StudioSpaceComponent, type StudioSpaceId, type StudioTool } from "./studio-space-registry";
import type { StudioScopeSelection } from "./studio-scope";
import { SpaceStateRegion } from "./space-state";
import { PendingSpace } from "./spaces/pending-space";
import { Button } from "@/components/ui/button";

/**
 * The seven-space rail (SKO-408 task 3.5). It mounts the frozen registry: each entry resolves its
 * own module and a space that has not landed renders the stated `PendingSpace`, which hands the
 * reader to the existing full editor instead of a blank panel. The open space lives in the URL
 * fragment, so reload and back return to it.
 */
const PENDING_TOOL: Partial<Record<StudioSpaceId, StudioTool | "exams">> = { blueprint: "curriculum", rehearsal: "curriculum", "exam-room": "exams", "control-room": "exams" };

function spaceFromHash(): StudioSpaceId | null {
  const match = /(?:^#|&)space=([a-z-]+)/.exec(typeof window === "undefined" ? "" : window.location.hash);
  return match && (STUDIO_SPACE_IDS as readonly string[]).includes(match[1]) ? match[1] as StudioSpaceId : null;
}

export function StudioSpaces({ language, scope, capabilities, records, reload, openTool, children }: {
  language: Language; scope: StudioScopeSelection; capabilities: WorkspaceCapabilities; records: readonly AiWorkspaceRecord[];
  reload: () => void; openTool: (tool: StudioTool) => void; children: ReactNode;
}) {
  const shell = studioShellSpaceCopy(language), t = studioSpacesCopy(language);
  const [active, setActive] = useState<StudioSpaceId | null>(null);
  const [loaded, setLoaded] = useState<{ id: StudioSpaceId; component: StudioSpaceComponent | null } | null>(null);
  useEffect(() => {
    const sync = () => setActive(spaceFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void loadStudioSpace(studioSpace(active)).then(component => { if (live) setLoaded({ id: active, component }); });
    return () => { live = false; };
  }, [active]);
  const open = (id: StudioSpaceId | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `space=${id}` : "";
    window.history.pushState(null, "", url);
    setActive(id);
  };
  const entry = active ? studioSpace(active) : null;
  const current = loaded && loaded.id === active ? loaded : null;
  const Space = current?.component;
  const leave = entry ? PENDING_TOOL[entry.id] : undefined;
  return <div className="space-y-5" data-studio-spaces>
    <nav aria-label={shell.rail} className="sk-panel overflow-x-auto p-2">
      <ol className="flex min-w-max gap-1 lg:grid lg:min-w-0 lg:grid-cols-8">
        <li><Button variant="ghost" type="button" onClick={() => open(null)} aria-current={active === null ? "page" : undefined} className={cn("flex h-full w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-semibold transition-colors", active === null ? "bg-primary text-primary-foreground" : "hover:bg-surface-hover")}>
          <Home className="size-4 shrink-0" aria-hidden="true" />{t.home}
        </Button></li>
        {STUDIO_SPACES.map(space => {
          const Icon = space.icon, selected = active === space.id;
          return <li key={space.id}><Button variant="ghost" type="button" onClick={() => open(space.id)} aria-current={selected ? "page" : undefined} data-space={space.id}
            className={cn("flex h-full w-full items-start gap-2 rounded-xl px-3 py-2 text-start transition-colors", selected ? "bg-primary text-primary-foreground" : "hover:bg-surface-hover")}>
            <span className="mt-0.5 text-xs font-bold tabular-nums opacity-70">{new Intl.NumberFormat(language).format(space.position)}</span>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold leading-tight">{shell[space.nameKey]}</span>
          </Button></li>;
        })}
      </ol>
    </nav>
    {!entry ? children : <section aria-labelledby="studio-space-title" className="space-y-4">
      <header><h2 id="studio-space-title" className="text-xl font-bold">{shell[entry.nameKey]}</h2><p className="text-sm text-ink-subtle">{shell[entry.hintKey]}</p></header>
      {!current ? <SpaceStateRegion state={{ kind: "loading" }} language={language}>{() => null}</SpaceStateRegion>
        : Space ? <Space language={language} scope={scope} capabilities={capabilities} records={records} reload={reload} openTool={openTool} />
          : <PendingSpace name={shell[entry.nameKey]} language={language} leaveLabel={leave ? leave === "exams" ? shell.examsLink : t.openEditor : undefined}
            onLeave={leave ? () => { if (leave === "exams") window.location.assign("/ai/exams"); else { open(null); openTool(leave); } } : undefined} />}
    </section>}
  </div>;
}
