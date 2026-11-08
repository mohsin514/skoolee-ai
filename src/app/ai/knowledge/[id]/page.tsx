import Link from "next/link";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { readKnowledge } from "@/lib/rag/service";
import { SchoolAiError } from "@/lib/school-ai/access";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function KnowledgeSourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const user = await requirePageSession(), { id } = await params, { version } = await searchParams;
  let document;
  try { document = await readKnowledge(user, id, version ? z.coerce.number().int().positive().parse(version) : undefined); }
  catch (error) { if (!(error instanceof SchoolAiError || error instanceof z.ZodError)) throw error; }
  return <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} chatDock={false}><main className="mx-auto max-w-4xl space-y-5 p-6"><Link className="text-primary underline" href="/ai/knowledge">Knowledge library</Link>{document ? <article className="space-y-4 rounded-2xl border bg-card p-6"><h1 className="text-2xl font-semibold">{document.title}</h1><p className="text-sm text-muted-foreground">Version {document.version} · {document.status}</p><p dir="auto" className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{document.content}</p></article> : <p role="alert">This source is unavailable, has changed, or is outside your current access. Ask again to use the current published version.</p>}</main></RoleFrame>;
}
