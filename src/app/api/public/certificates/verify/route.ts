import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";

// SKO-469: anyone holding the printed link can check a document. The answer is the same for every viewer,
// signed in or not, and carries only what is printed on the document's face plus its current state —
// never the pupil's record, the template or who issued it.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return Response.json({ success: false, error: "Unknown document" }, { status: 404 });
  const issue = await runUnscoped("public certificate verification by exact unguessable token", () => prisma.certificateIssue.findUnique({
    where: { verifyToken: token },
    select: { serial: true, title: true, status: true, issuedAt: true, revokedAt: true, school: { select: { name: true } }, successors: { where: { status: "ISSUED" }, select: { serial: true } } },
  }));
  if (!issue || !issue.issuedAt || !["ISSUED", "REVOKED", "SUPERSEDED"].includes(issue.status)) return Response.json({ success: false, error: "Unknown document" }, { status: 404 });
  return Response.json({
    success: true,
    data: {
      serial: issue.serial, title: issue.title, school: issue.school.name, issuedOn: issue.issuedAt.toISOString().slice(0, 10),
      state: issue.status === "ISSUED" ? "VALID" : issue.status,
      ...(issue.status === "REVOKED" && issue.revokedAt ? { revokedOn: issue.revokedAt.toISOString().slice(0, 10) } : {}),
      ...(issue.status === "SUPERSEDED" && issue.successors[0] ? { replacedBy: issue.successors[0].serial } : {}),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
