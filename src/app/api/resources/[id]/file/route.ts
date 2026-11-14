import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom } from "@/lib/api/envelope";
import { resolveDownload } from "@/lib/resources/service";
import { privateDownloadResponse } from "@/lib/storage/private-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every request re-checks membership and audience; there is no stored or long-lived file URL.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const raw = req.nextUrl.searchParams.get("version");
    const target = await resolveDownload(user, id, raw ? Number(raw) : undefined);
    if (target.link) return Response.redirect(target.link, 302);
    return privateDownloadResponse(target.storageKey!, target.fileName, { contentType: target.contentType });
  } catch (error) {
    // SKAI-1984: a failed download answers on the envelope (the success path streams the file itself).
    const response = await failFrom(error, "[resources] download failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
