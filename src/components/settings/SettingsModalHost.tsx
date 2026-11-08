"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { EditableProfile } from "@/components/profile/editable-profile-card";
import { SettingsModal } from "./SettingsModal";
import { OPEN_SETTINGS_EVENT, SETTINGS_PARAM, parseSettingsSection, type SettingsSection } from "./settings-sections";

/** Only one host answers when a shell happens to mount two. */
let activeHost: symbol | null = null;

/**
 * Mounted once per signed-in shell (RoleHeader, /dashboard layout). Opens the
 * Settings modal on `openSettings(section)` or on a `?settings=<section>` deep
 * link — which is how /account/security lands here — and drops the param once
 * handled so a refresh or Back doesn't reopen it.
 */
export function SettingsModalHost(props: { onProfileSaved?: (profile: EditableProfile) => void }) {
  // useSearchParams needs a Suspense boundary so static parents still prerender.
  return <Suspense fallback={null}><Host {...props} /></Suspense>;
}

function Host({ onProfileSaved }: { onProfileSaved?: (profile: EditableProfile) => void }) {
  const [open, setOpen] = useState<SettingsSection | null>(null);
  const [owner, setOwner] = useState(false);
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = parseSettingsSection(params.get(SETTINGS_PARAM));

  useEffect(() => {
    if (activeHost) return;
    const id = Symbol("settings-host");
    activeHost = id;
    setOwner(true);
    return () => { if (activeHost === id) activeHost = null; };
  }, []);

  useEffect(() => {
    if (!owner) return;
    const onOpen = (event: Event) => setOpen(parseSettingsSection((event as CustomEvent<string>).detail) ?? "profile");
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, [owner]);

  useEffect(() => {
    if (!owner || !requested) return;
    setOpen(requested);
    const url = new URL(window.location.href);
    url.searchParams.delete(SETTINGS_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [owner, requested, pathname]);

  if (!owner || !open) return null;
  // Keyed so a deep link to another section while open starts there.
  return <SettingsModal key={open} initialSection={open} onClose={() => setOpen(null)} onProfileSaved={onProfileSaved} />;
}
