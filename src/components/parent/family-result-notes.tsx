"use client";

import { useFetch } from "@/hooks";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { MessageSquareText } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";

type Note = { id: string; examTitle: string | null; language: string; sentence: string; sentAt: string };

/**
 * SKO-504: the one-sentence notes teachers sent after results. Each sentence was written in this
 * guardian's language, so it carries its own `lang` and direction rather than the page's.
 */
export function FamilyResultNotes({ studentId }: { studentId: string | null }) {
  const ui = useUiText();
  const { data: notes, failure, isLoading, refetch } = useFetch<Note[]>(`/api/parent/result-notes${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`, { collection: true });
  if (isLoading) return <SkeletonList rows={2} label={ui("Loading…")} />;
  if (failure) return <ErrorState error={failure} onRetry={refetch} />;
  if (!notes?.length) return null;
  return <section aria-labelledby="family-result-notes" className="sk-panel space-y-3 p-4" data-family-notes>
    <h2 id="family-result-notes" className="flex items-center gap-2 text-base font-bold text-ink-strong"><MessageSquareText aria-hidden="true" className="size-4" />{ui("Notes from teachers")}</h2>
    <ul className="space-y-2">{notes.map(note => <li key={note.id} className="rounded-xl border border-border p-3" data-family-note>
      {note.examTitle && <p className="text-xs font-semibold text-ink-subtle [overflow-wrap:anywhere]"><bdi>{note.examTitle}</bdi></p>}
      <p lang={note.language} dir={note.language === "en" ? "ltr" : "rtl"} className="mt-1 text-sm text-ink-strong [overflow-wrap:anywhere]">{note.sentence}</p>
    </li>)}</ul>
  </section>;
}
