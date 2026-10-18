import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";

export const runtime = "nodejs";

// SKO-446: the enabled school sign-in options for a school slug — names only, nothing about configuration.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("school") ?? "";
  const rows = slug ? await runUnscoped("sso: list enabled connections for a school slug", async () => {
    const school = await prisma.school.findFirst({ where: { slug }, select: { id: true, name: true } });
    if (!school) return null;
    return { school: school.name, connections: await prisma.identityConnection.findMany({ where: { schoolId: school.id, status: "ENABLED" }, select: { id: true, name: true } }) };
  }) : null;
  return Response.json({ success: true, data: rows ?? { school: null, connections: [] } }, { headers: { "Cache-Control": "no-store" } });
}
