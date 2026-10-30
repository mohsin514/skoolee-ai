"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StudioIntro } from "@/components/school-ai/exam-studio/studio-intro";

/**
 * The client half of the Studio_Intro probe. See `page.tsx` — temporary, removed by task 3.2.
 *
 * Three things are real rather than mocked, because Requirement 20 makes claims about them:
 *
 * - the workspace data fetch is a genuine request to the existing workspace route, started in the
 *   mount effect beside the intro, so R20.13 is observable as "this request was in flight while the
 *   overlay was on screen" rather than as a comment;
 * - the action is the shared `Button`, so "the intro exposes no focusable element" (R20.12) is
 *   checkable as "the only tabbable control on the page is the workspace's"; and
 * - `onComplete` moves focus, so "hands interaction to Studio_Workspace at completion" (R20.2) has
 *   a visible consequence.
 */
export function StudioIntroProbe({ suppressed }: { suppressed: boolean }) {
  const [workspace, setWorkspace] = useState<"loading" | "ready" | "error">("loading");
  const [owner, setOwner] = useState<"intro" | "studio">("intro");
  const action = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // R20.13. On mount, in parallel with the intro — never chained to its completion.
    let active = true;
    const settle = (next: "ready" | "error") => {
      if (active) setWorkspace(next);
    };
    fetch("/api/school-ai/workspace", { headers: { Accept: "application/json" } })
      .then((response) => settle(response.ok ? "ready" : "error"))
      .catch(() => settle("error"));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="relative min-h-screen p-8">
      <StudioIntro
        suppressed={suppressed}
        onComplete={() => {
          setOwner("studio");
          action.current?.focus();
        }}
      />
      <h1 data-probe="title" className="text-heading font-bold text-ink">
        Exam Studio
      </h1>
      <p data-probe="workspace" data-workspace-state={workspace} className="mt-4 text-sm text-ink-muted">
        Workspace data: {workspace}
      </p>
      <p data-probe="owner" data-interaction-owner={owner} className="mt-1 text-sm text-ink-muted">
        Interaction: {owner}
      </p>
      <Button ref={action} data-probe="action" className="mt-6">
        Start
      </Button>
    </main>
  );
}
