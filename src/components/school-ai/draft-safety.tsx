"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useNavGuard, useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import { ConfirmAction, NavGuardPrompt } from "@/components/ui/confirm-action";
import { useLocale } from "@/components/locale/LocaleProvider";
import { schoolAICopy } from "@/lib/school-ai/copy";

interface DraftSafety { register: (id: string, dirty: boolean) => void; run: (action: () => void) => void }
const DraftContext = createContext<DraftSafety>({ register: () => {}, run: action => action() });

export function WorkspaceDraftBoundary({ children }: { children: ReactNode }) {
  const { language } = useLocale();
  const c = schoolAICopy(language);
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dirty = Object.values(drafts).some(Boolean);
  const navigation = useNavGuard(dirty, c.unsavedDescription);
  useUnsavedGuard(dirty);
  const register = useCallback((id: string, value: boolean) => setDrafts(previous => {
    if (Boolean(previous[id]) === value) return previous;
    if (!value) { const next = { ...previous }; delete next[id]; return next; }
    return { ...previous, [id]: true };
  }), []);
  const run = useCallback((action: () => void) => { if (dirty) setPending(() => action); else action(); }, [dirty]);
  const context = useMemo(() => ({ register, run }), [register, run]);
  return <DraftContext.Provider value={context}>{children}<NavGuardPrompt {...navigation} /><ConfirmAction open={Boolean(pending)} title={c.unsavedTitle} description={c.unsavedDescription} confirmLabel={c.discard} cancelLabel={c.keepEditing} tone="warning" onCancel={() => setPending(null)} onConfirm={() => { const action = pending; setPending(null); action?.(); }} /></DraftContext.Provider>;
}

export function useWorkspaceDraft(dirty: boolean) {
  const id = useId();
  const { register } = useContext(DraftContext);
  useEffect(() => { register(id, dirty); return () => register(id, false); }, [id, dirty, register]);
}
export function useWorkspaceDraftNavigation() { return useContext(DraftContext).run; }
