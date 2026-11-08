import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { resolveSubmissionFile } from "@/lib/assignments/service";
import { privateDownloadResponse } from "@/lib/storage/private-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-authorised on every request: the learner who submitted it or staff of the class. No stored URLs.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id, versionId } = await params;
    const target = await resolveSubmissionFile(user, id, versionId);
    return privateDownloadResponse(target.storageKey, target.fileName, { contentType: target.contentType });
  } catch (error) {
    const response = errorResponse(error, "[assignments] download failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
