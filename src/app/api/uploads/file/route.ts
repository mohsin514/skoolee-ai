import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { authorizePrivateUpload, readPrivateUploadBody, verifyPrivateUploadIntent } from "@/lib/storage/private-upload";
import { uploadPrivateObject } from "@/lib/storage/s3";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
import { checkRevocation } from "@/lib/auth/session-revocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("intent") ?? "";
    const user = await requireAuthUser();
    const intent = await verifyPrivateUploadIntent(token, user);
    await authorizePrivateUpload(user, intent);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== intent.contentType) throw new ApiError("The file type changed. Choose the file again.", 400);
    const bytes = await readPrivateUploadBody(request, intent.sizeBytes);
    // Permissions or membership may have changed while a slow connection sent the file.
    // Bypass the render/request memo: logout during receipt must also stop the write.
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken || await checkRevocation(hashSessionToken(sessionToken))) throw new ApiError("Your session is no longer valid. Please sign in again.", 401);
    const current = await requireAuthUser();
    await verifyPrivateUploadIntent(token, current);
    await authorizePrivateUpload(current, intent);
    try { await uploadPrivateObject(intent.storageKey, bytes, intent.contentType); }
    catch (error) {
      const status = error && typeof error === "object" && "$metadata" in error ? (error.$metadata as { httpStatusCode?: number })?.httpStatusCode : undefined;
      if (status === 412) throw new ApiError("This upload already completed. Choose the file again to start a new upload.", 409);
      throw new ApiError("The file could not be stored. Please try again.", 503);
    }
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = errorResponse(error, "Private upload unavailable");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
