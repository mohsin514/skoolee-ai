"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardCheck, FileText, Layers, ScanLine, ShieldCheck } from "lucide-react";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { studioShellCopy } from "./studio-shell-copy";
import styles from "./studio-shell.module.css";

export type StudioWorkspaceTab = "overview" | "sources" | "curriculum" | "examPlanning" | "history";

export function StudioOverview({ records, language, scopeReady, canReadSources, canReadPapers, onNavigate }: {
  records: AiWorkspaceRecord[]; language: Language; scopeReady: boolean; canReadSources: boolean; canReadPapers: boolean;
  onNavigate: (tab: StudioWorkspaceTab) => void;
}) {
  const t = studioShellCopy(language);
  const relevant = records.filter(record => ["SOURCE", "PAPER", "CURRICULUM"].includes(record.kind) && record.status !== "ARCHIVED");
  const papers = relevant.filter(record => record.kind === "PAPER");
  const counts = [
    { label: t.sourceCount, count: relevant.filter(record => record.kind === "SOURCE").length },
    { label: t.paperCount, count: papers.length },
    { label: t.reviewCount, count: papers.filter(record => record.status === "IN_REVIEW").length },
    { label: t.approvedCount, count: papers.filter(record => record.status === "APPROVED").length },
  ];
  const steps = [
    { title: t.evidence, description: t.evidenceHint, action: t.sourceAction, Icon: ScanLine, tab: "sources" as const, allowed: canReadSources },
    { title: t.author, description: t.authorHint, action: t.authorAction, Icon: Layers, tab: "curriculum" as const, allowed: canReadPapers },
    { title: t.deliver, description: t.deliverHint, action: t.deliverAction, Icon: BookOpen, href: "/ai/exams", allowed: canReadPapers },
    { title: t.improve, description: t.improveHint, action: t.improveAction, Icon: ClipboardCheck, href: "/ai/exams", allowed: canReadPapers },
  ];
  const statusLabel = (status: string) => ({ DRAFT: t.draft, APPROVED: t.approved, IN_REVIEW: t.inReview, REJECTED: t.rejected, PUBLISHED: t.published, ARCHIVED: t.archived }[status] || status);
  return <div className={styles.overview} data-studio-overview>
    <section aria-labelledby="studio-journey-heading">
      <h2 id="studio-journey-heading" className={styles.heading}>{t.journey}</h2>
      <p className={`${styles.hint} ${styles.journeyHint}`}>{t.journeyHint}</p>
      <div className={styles.journey}>
        {steps.map(({ title, description, action, Icon, tab, href, allowed }, index) => <article className={`sk-panel ${styles.step}`} key={title}>
          <div className={styles.stepTop}><span className={styles.stepIcon}><Icon className="size-5" aria-hidden="true" /></span><span className={styles.number}>{new Intl.NumberFormat(language, { minimumIntegerDigits: 2 }).format(index + 1)}</span></div>
          <h3>{title}</h3><p>{description}</p>
          {href && allowed ? <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>{action}<ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" /></Link> : <Button type="button" variant="ghost" size="sm" disabled={!allowed} onClick={() => tab && onNavigate(tab)}>{action}<ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" /></Button>}
        </article>)}
      </div>
    </section>
    <div className={styles.stats} aria-label={t.savedRecords}>
      {counts.map(item => <div key={item.label} className={`sk-panel ${styles.stat}`}><strong>{scopeReady ? new Intl.NumberFormat(language).format(item.count) : "—"}</strong><span>{item.label}</span></div>)}
    </div>
    <div className={styles.lower}>
      <section className={`sk-panel ${styles.recent}`}>
        <h2 className={styles.heading}>{t.recent}</h2><p className={styles.hint}>{t.recentHint}</p>
        {!scopeReady ? <div className="mt-5"><EmptyState size="sm" icon={Layers} title={t.chooseScope} /></div> : !relevant.length ? <div className="mt-5"><TaskFeedback kind="empty" title={t.noWork}><p>{t.noWorkHint}</p></TaskFeedback></div> : relevant.slice(0, 5).map(record => <div key={record.id} className={styles.record}>
          <span className={styles.stepIcon}><FileText className="size-4" aria-hidden="true" /></span>
          <div className={styles.recordBody}><bdi dir="auto" className={styles.recordTitle}>{record.title}</bdi><p className={styles.recordMeta}>{record.kind === "SOURCE" ? t.source : record.kind === "PAPER" ? t.paper : t.curriculumKind} · {t.version} <bdi>{record.version}</bdi></p></div>
          <Badge variant="outline">{statusLabel(record.status)}</Badge>
        </div>)}
        {scopeReady && relevant.length > 0 && <Button type="button" variant="outline" className="mt-3" onClick={() => onNavigate(papers.length ? "curriculum" : "sources")}>{t.recentAction}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>}
      </section>
      <aside className={styles.aside}>
        <section className={`sk-panel ${styles.note}`}><h3><ShieldCheck className="size-4 text-primary" aria-hidden="true" />{t.humanReview}</h3><p>{t.humanReviewHint}</p></section>
        <section className={`sk-panel ${styles.note}`}><h3><ScanLine className="size-4 text-primary" aria-hidden="true" />{t.camera}</h3><p>{t.cameraHint}</p></section>
      </aside>
    </div>
  </div>;
}
