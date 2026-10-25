import { requirePageSession } from "@/lib/auth/require-page-session";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { KnowledgeLibrary } from "@/components/rag/knowledge-library";
import { listKnowledge } from "@/lib/rag/service";
export const metadata = { title: "Knowledge library" };
export const dynamic = "force-dynamic";
export default async function KnowledgePage() {
  const user = await requirePageSession();
  const { canManage } = await listKnowledge(user);
  return <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} chatDock={false}><KnowledgeLibrary canManage={canManage} role={user.role} campusId={user.campusId} /></RoleFrame>;
}
