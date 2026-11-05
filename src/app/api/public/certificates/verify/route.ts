import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { clientAddress, verifyCertificate, verifySelect } from "@/lib/certificates/verify";

// SKO-469 / SKAI-529: anyone holding the printed link can check a document; see lib/certificates/verify.
export async function GET(request: NextRequest) {
  const outcome = await verifyCertificate(request.nextUrl.searchParams.get("token") ?? "", clientAddress(request.headers), token =>
    runUnscoped("public certificate verification by exact unguessable token", () => prisma.certificateIssue.findUnique({ where: { verifyToken: token }, select: verifySelect })));
  if (outcome.kind === "limited") return Response.json({ success: false, error: "Too many checks. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
  if (outcome.kind === "unknown") return Response.json({ success: false, error: "Unknown document" }, { status: 404 });
  return Response.json({ success: true, data: outcome.data }, { headers: { "Cache-Control": "no-store" } });
}
