"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clearDeviceDrafts, conflictingFields, draftKey, DRAFT_PREFIX, DRAFT_TTL, mergeDraft, permittedValues, readDraft, sameValue, type DraftRecord, type DraftValues, type DraftStructures } from "@/lib/drafts/store";
import { useLocale } from "@/components/locale/LocaleProvider";
import { draftCopy } from "@/lib/drafts/messages";
import { useNavGuard, useUnsavedGuard } from "./use-unsaved-guard";

interface Options<T extends DraftValues> {
  record: string;
  schema: number;
  values: T;
  baseline: T;
  fields: readonly string[];
  structures?: DraftStructures;
  enabled?: boolean;
  section?: string;
  apply: (values: T, section?: string) => void;
  current?: () => Promise<T>;
}

export function useFormDraft<T extends DraftValues>({ record, schema, values, baseline, fields, structures = {}, enabled = true, section, apply, current }: Options<T>) {
  const { language } = useLocale();
  const copy = draftCopy(language);
  const [expired, setExpired] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<DraftRecord | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [confirmedValues, setConfirmedValues] = useState<string | null>(null);
  const [reviewBaseline, setReviewBaseline] = useState<T | null>(null);
  const suspended = useRef(false);
  const key = scope && enabled ? draftKey(scope, record, schema) : null;
  // Fence asynchronous checks before a different record can receive their result.
  const operation = useRef(0);
  const live = useRef({ key, values });
  useLayoutEffect(() => { operation.current++; live.current = { key, values }; }, [key]);
  useLayoutEffect(() => { live.current.values = values; }, [values]);
  useEffect(() => () => { operation.current++; }, []);
  const activeRecovery = checkedKey === key ? recovery : null;
  const activeBaseline = checkedKey === key ? reviewBaseline : null;
  const confirmed = checkedKey === key && confirmedValues === JSON.stringify(values);
  const dirty = enabled && !confirmed && !sameValue(values, activeBaseline ?? baseline);
  useUnsavedGuard(dirty);
  const guard = useNavGuard(dirty, copy.leave);

  useEffect(() => {
    let active = true;
    let previousScope: string | null = null;
    let request = 0;
    const check = async () => {
      const version = ++request;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const result = await res.json();
        if (!active || version !== request) return;
        if (!res.ok && res.status !== 401 && res.status !== 403) { setStorageError(true); return; }
        const next = res.ok && typeof result.user?.draftScope === "string" ? result.user.draftScope : null;
        if (!next || (previousScope && next !== previousScope)) {
          operation.current++; suspended.current = true;
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
    const clear = () => { operation.current++; suspended.current = true; setRecovery(null); setSavedAt(null); setScope(null); };
    void check();
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("skoolee:drafts-cleared", clear);
    return () => { active = false; window.removeEventListener("focus", check); window.removeEventListener("pageshow", check); window.removeEventListener("skoolee:drafts-cleared", clear); };
  }, []);

  const fieldSignature = JSON.stringify(fields);
  const structureSignature = JSON.stringify(structures);
  useEffect(() => {
    if (!key) { setCheckedKey(null); setRecovery(null); setReviewBaseline(null); return; }
    setReviewBaseline(null);
    setRecovery(null); setSavedAt(null); setExpired(false);
    try {
      const stored = readDraft(sessionStorage, key, schema, JSON.parse(fieldSignature), Date.now(), JSON.parse(structureSignature));
      setRecovery(stored); setSavedAt(stored?.savedAt ?? null); setCheckedKey(key); setConfirmedValues(null);
    } catch { setStorageError(true); setCheckedKey(key); }
  }, [key, schema, fieldSignature, structureSignature]);

  const valuesJson = JSON.stringify(permittedValues(values, fields, structures));
  const baselineJson = JSON.stringify(permittedValues(activeBaseline ?? baseline, fields, structures));
  useEffect(() => {
    if (!key || checkedKey !== key || recovery || suspended.current || confirmed) return;
    try {
      if (!dirty) { sessionStorage.removeItem(key); setSavedAt(null); return; }
      // Re-renders and section visits must not falsely announce a new save or
      // indefinitely renew an untouched draft's retention window.
      const existing = readDraft(sessionStorage, key, schema, fields, Date.now(), structures);
      if (existing && sameValue(existing.values, JSON.parse(valuesJson)) && sameValue(existing.baseline, JSON.parse(baselineJson)) && existing.section === section) return;
      const time = Date.now();
      const draft: DraftRecord = { schema, savedAt: time, expiresAt: time + DRAFT_TTL,
        values: JSON.parse(valuesJson), baseline: JSON.parse(baselineJson), section };
      sessionStorage.setItem(key, JSON.stringify(draft));
      setSavedAt(time); setStorageError(false); setExpired(false);
    } catch { setStorageError(true); }
  }, [key, checkedKey, recovery, confirmed, dirty, valuesJson, baselineJson, schema, section]);

  useEffect(() => {
    if (!key || !savedAt) return;
    const timeout = window.setTimeout(() => {
      try { sessionStorage.removeItem(key); } catch { setStorageError(true); }
      setRecovery(null); setSavedAt(null); setExpired(true);
    }, Math.max(0, savedAt + DRAFT_TTL - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [key, savedAt]);

  const discard = () => {
    operation.current++;
    if (key) { try { sessionStorage.removeItem(key); } catch { setStorageError(true); } }
    setRecovery(null); setSavedAt(null);
  };
  const beginCheck = () => {
    const version = ++operation.current;
    const origin = key;
    return () => {
      if (!origin || live.current.key !== origin || operation.current !== version || suspended.current) throw new Error(copy.outdated);
    };
  };
  const verifySession = async (assertCurrent: () => void) => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await response.json();
    assertCurrent();
    if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error(copy.unavailable);
    if (!response.ok || session.user?.draftScope !== scope) {
      clearDeviceDrafts(); window.location.replace("/login?reason=session-changed"); throw new Error(copy.changed);
    }
  };
  const readCurrent = async (assertCurrent: () => void) => {
    try { const latest = current ? await current() : baseline; assertCurrent(); return latest; }
    catch (error) {
      assertCurrent();
      if (error instanceof Error && error.message === "Access revoked") { discard(); throw new Error(copy.revoked); }
      throw new Error(copy.unavailable);
    }
  };
  const prepareReview = async () => {
    const assertCurrent = beginCheck();
    await verifySession(assertCurrent);
    const latest = await readCurrent(assertCurrent);
    setReviewBaseline(latest);
  };
  const accept = async (choices: Record<string, "draft" | "server">) => {
    if (!activeRecovery || !key || activeRecovery.expiresAt <= Date.now()) { discard(); return; }
    const assertCurrent = beginCheck();
    await verifySession(assertCurrent);
    const latest = await readCurrent(assertCurrent);
    if (!sameValue(permittedValues(latest, fields, structures), permittedValues(activeBaseline ?? baseline, fields, structures))) {
      setReviewBaseline(latest);
      throw new Error(copy.conflict);
    }
    // Re-sanitize stored input at the final apply boundary as well as on read.
    const safe = { ...activeRecovery, values: permittedValues(activeRecovery.values, fields, structures), baseline: permittedValues(activeRecovery.baseline, fields, structures) };
    apply(mergeDraft(safe, latest, choices) as T, safe.section);
    setReviewBaseline(latest); setRecovery(null); setExpired(false);
  };
  const reviewCurrent = async () => {
    const assertCurrent = beginCheck();
    await verifySession(assertCurrent);
    const latest = await readCurrent(assertCurrent);
    const time = Date.now();
    setReviewBaseline(latest);
    setRecovery({ schema, savedAt: time, expiresAt: time + DRAFT_TTL, baseline: permittedValues(activeBaseline ?? baseline, fields, structures), values: permittedValues(live.current.values, fields, structures), section });
  };
  const markSaved = () => {
    if (live.current.key !== key) return;
    // A late acknowledgement cannot erase edits made while the save was in flight.
    if (!sameValue(live.current.values, values)) { setReviewBaseline(values); return; }
    discard(); setConfirmedValues(JSON.stringify(values));
  };
  return { dirty, guard, recovery: activeRecovery, conflicts: activeRecovery ? conflictingFields(activeRecovery, activeBaseline ?? baseline) : [], baseline: activeBaseline ?? baseline, savedAt: checkedKey === key ? savedAt : null, storageError, expired, acknowledged: confirmed,
    record, schema, ready: !!key && key === checkedKey, accept, discard, markSaved, reviewCurrent, prepareReview };
}
