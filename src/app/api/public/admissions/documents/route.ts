import { NextRequest } from "next/server";
import { uploadFamilyDocument } from "@/lib/admissions/service";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { rateLimit } from "@/lib/rate-limit";

// SKO-398: a family attaches a document to its own draft (multipart: reference, key, file; X-Resume-Key header).
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`admissions:upload:${ip}`, { limit: 30, windowMs: 60_000 }).ok) throw new ApiError("Too many uploads. Wait a minute and try again.", 429);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Choose a file to upload.", 400);
    return Response.json({ success: true, data: await uploadFamilyDocument(String(form.get("reference") ?? ""), request.headers.get("x-resume-key") ?? "", String(form.get("key") ?? ""), file) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[admissions/public] upload failed");
  }
}
