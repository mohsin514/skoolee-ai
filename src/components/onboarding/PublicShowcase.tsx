"use client";

import { useRouter } from "next/navigation";
import type { Language } from "@/lib/locale/package";
import { GuideShowcase } from "./GuideShowcase";
import styles from "./launch-guide.module.css";

export function PublicShowcase({ language }: { language: Language }) {
  const router = useRouter();
  return <main className={styles.publicShowcase}>
    <GuideShowcase language={language} publicView onReturn={() => router.push("/register")} />
  </main>;
}
