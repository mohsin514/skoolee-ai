"use client";

import { useEffect, useRef, useState } from "react";
import { clearDeviceDrafts, conflictingFields, draftKey, DRAFT_PREFIX, DRAFT_TTL, mergeDraft, permittedValues, readDraft, sameValue, type DraftRecord, type DraftValues } from "@/lib/drafts/store";
import { useNavGuard, useUnsavedGuard } from "./use-unsaved-guard";

interface Options<T extends DraftValues> {
  record: string;
  schema: number;
  values: T;
  baseline: T;
  fields: readonly string[];
  enabled?: boolean;
  section?: string;
  apply: (values: T, section?: string) => void;
  current?: () => Promise<T>;
}

export function useFormDraft<T extends DraftValues>({ record, schema, values, baseline, fields, enabled = true, section, apply, current }: Options<T>) {
  const [scope, setScope] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<DraftRecord | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [confirmedValues, setConfirmedValues] = useState<string | null>(null);
  const [reviewBaseline, setReviewBaseline] = useState<T | null>(null);
  const suspended = useRef(false);
  const key = scope && enabled ? draftKey(scope, record, schema) : null;
  const confirmed = confirmedValues === JSON.stringify(values);
  const dirty = enabled && !confirmed && !sameValue(values, reviewBaseline ?? baseline);
  useUnsavedGuard(dirty);
  const guard = useNavGuard(dirty, "You have changes that the server has not saved. Leave this form? Eligible fields remain in this tab for up to 24 hours.");

  useEffect(() => {
    let active = true;
    let previousScope: string | null = null;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const result = await res.json();
        if (!active) return;
        const next = res.ok && typeof result.user?.draftScope === "string" ? result.user.draftScope : null;
        if (!next || (previousScope && next !== previousScope)) {
          suspended.current = true;
          clearDeviceDrafts();
          setRecovery(null); setScope(null);
          // A cookie/account change must also remove already-rendered protected input.
          window.location.replace("/login?reason=session-changed");
          return;
        }
        // Clear inaccessible prior-login drafts even when another account was
        // installed by a second tab or an external sign-in route.
        try {
          const prefix = `${DRAFT_PREFIX}${encodeURIComponent(next)}:`;
          for (const storedKey of Object.keys(sessionStorage)) {
            if (storedKey.startsWith(DRAFT_PREFIX) && !storedKey.startsWith(prefix)) sessionStorage.removeItem(storedKey);
          }
        } catch { setStorageError(true); }
        previousScope = next;
        setScope(next);
      } catch { if (active) setStorageError(true); }
    };
    const clear = () => { suspended.current = true; setRecovery(null); setSavedAt(null); setScope(null); };
    void check();
    window.addEventListener("focus", check);
    window.addEventListener("skoolee:drafts-cleared", clear);
    return () => { active = false; window.removeEventListener("focus", check); window.removeEventListener("skoolee:drafts-cleared", clear); };
  }, []);

  const fieldSignature = JSON.stringify(fields);
  useEffect(() => {
    if (!key) { setCheckedKey(null); setRecovery(null); setReviewBaseline(null); return; }
    setReviewBaseline(null);
    setRecovery(null);
    try {
      const stored = readDraft(sessionStorage, key, schema, JSON.parse(fieldSignature));
      setRecovery(stored); setSavedAt(stored?.savedAt ?? null); setCheckedKey(key); setConfirmedValues(null);
    } catch { setStorageError(true); setCheckedKey(key); }
  }, [key, schema, fieldSignature]);

  const valuesJson = JSON.stringify(permittedValues(values, fields));
  const baselineJson = JSON.stringify(permittedValues(reviewBaseline ?? baseline, fields));
  useEffect(() => {
    if (!key || checkedKey !== key || recovery || suspended.current || confirmed) return;
    try {
      if (!dirty) { sessionStorage.removeItem(key); setSavedAt(null); return; }
      const time = Date.now();
      const draft: DraftRecord = { schema, savedAt: time, expiresAt: time + DRAFT_TTL,
        values: JSON.parse(valuesJson), baseline: JSON.parse(baselineJson), section };
      sessionStorage.setItem(key, JSON.stringify(draft));
      setSavedAt(time); setStorageError(false);
    } catch { setStorageError(true); }
  }, [key, checkedKey, recovery, confirmed, dirty, valuesJson, baselineJson, schema, section]);

  const discard = () => {
    if (key) { try { sessionStorage.removeItem(key); } catch { setStorageError(true); } }
    setRecovery(null); setSavedAt(null);
  };
  const prepareReview = async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await response.json();
    if (!response.ok || session.user?.draftScope !== scope) { clearDeviceDrafts(); window.location.replace("/login?reason=session-changed"); throw new Error("Your session changed."); }
    if (current) {
      try { setReviewBaseline(await current()); }
      catch (error) {
        if (error instanceof Error && error.message === "Access revoked") { discard(); throw new Error("Access to this record was revoked. The protected draft was discarded."); }
        throw new Error("The server could not be reached. Your draft is retained; try again when connected.");
      }
    }
  };
  const accept = async (choices: Record<string, "draft" | "server">) => {
    if (!recovery || !key || recovery.expiresAt <= Date.now()) { discard(); return; }
    // Recheck session immediately before disclosing/applying recovered values.
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const result = await res.json();
    if (!res.ok || result.user?.draftScope !== scope) { clearDeviceDrafts(); window.location.replace("/login?reason=session-changed"); return; }
    let latest = reviewBaseline ?? baseline;
    if (current) {
      try { latest = await current(); }
      catch (error) {
        if (error instanceof Error && error.message === "Access revoked") { discard(); throw new Error("Access to this record was revoked. The protected draft was discarded."); }
        throw new Error("The server could not be reached. Your draft is retained; try again when connected.");
      }
      if (!sameValue(permittedValues(latest, fields), permittedValues(reviewBaseline ?? baseline, fields))) {
        setReviewBaseline(latest);
        throw new Error("The server record changed again. Review the current values and resolve the conflicts before applying.");
      }
    }
    apply(mergeDraft(recovery, latest, choices) as T, recovery.section);
    setRecovery(null);
  };
  const reviewCurrent = async () => {
    if (!current) return;
    const latest = await current();
    const time = Date.now();
    setReviewBaseline(latest);
    setRecovery({ schema, savedAt: time, expiresAt: time + DRAFT_TTL, baseline: permittedValues(baseline, fields), values: permittedValues(values, fields), section });
  };
  const markSaved = () => { discard(); setConfirmedValues(JSON.stringify(values)); };
  return { dirty, guard, recovery, conflicts: recovery ? conflictingFields(recovery, reviewBaseline ?? baseline) : [], baseline: reviewBaseline ?? baseline, savedAt, storageError,
    ready: !!key && key === checkedKey, accept, discard, markSaved, reviewCurrent, prepareReview };
}
