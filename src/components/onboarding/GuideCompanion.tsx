import type { Language } from "@/lib/locale/package";
import type { UserRole } from "@/lib/roles";
import { AiGuide } from "./AiGuide";
import { launchCopy } from "./launch-copy";
import styles from "./launch-guide.module.css";

export function GuideCompanion({ language, role, title, hint, ready = false }: { language: Language; role?: UserRole; title?: string; hint?: string; ready?: boolean }) {
  const c = launchCopy(language);
  return <aside className={styles.companion} aria-label={c.guide}>
    <AiGuide role={role} compact pose={ready ? "ready" : "think"} />
    <div><strong>{title || c.guide}</strong><p>{hint || c.draftHint}</p></div>
  </aside>;
}
