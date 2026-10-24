import { Button } from "@/components/ui/button";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioShellSpaceCopy } from "@/lib/school-ai/exam-studio-copy-shell";
import type { Language } from "@/lib/locale/package";
import { StudioStatus } from "../studio-status";

/**
 * The space a slice has not shipped yet.
 *
 * Six of the seven spaces land in later slices, and the shell must stay usable in the meantime. The
 * registry's loader resolves to `null` for a module that does not exist, and the shell renders this
 * instead: the space is named, the reason is plain, and the reader is told that nothing is lost and
 * the other spaces are open. It is a *stated* absence, which is the same discipline `NOT_MEASURED`
 * applies to an unmeasured figure — never a blank panel and never a crash.
 *
 * It lives inside `./spaces/` for a second reason: the registry resolves a space module through a
 * computed specifier, so the directory has to contain at least one real module before any slice has
 * added its own. It is deliberately **not** a registry entry — no entry names `pending-space` — so
 * it never shadows a space that does land.
 *
 * The space name is interface copy already resolved in the reader's language, so it needs no `<bdi>`
 * isolation: it runs in the same direction as the shell around it. Authored text, identifiers and
 * maths are the values R22.4 isolates, and none of them appear here.
 *
 * Directive-free — no state, no handlers, no browser API — so it costs the client bundle nothing
 * beyond its markup, per
 * `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
 */
export function PendingSpace({ name, language, onLeave, leaveLabel }: { name: string; language: Language; onLeave?: () => void; leaveLabel?: string }) {
  const t = studioShellSpaceCopy(language);
  return <div data-studio-space-pending className="space-y-4">
    <StudioStatus token="NOT_MEASURED" language={language} presentation="task" />
    <TaskFeedback
      kind="empty"
      title={fillStudioCopy(t.pendingTitle, [name])}
      action={onLeave && leaveLabel ? <Button variant="outline" onClick={onLeave}>{leaveLabel}</Button> : undefined}
    >
      <p>{t.pendingBody}</p>
    </TaskFeedback>
  </div>;
}
