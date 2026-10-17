import { NextRequest } from "next/server";
import { familyRespond, loadApplication, publicForm, saveApplication, startApplication, submitFamilyApplication } from "@/lib/admissions/service";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { rateLimit } from "@/lib/rate-limit";

// SKO-398 family application (no account). The form is found by its unguessable link token; a family's own
// application by its reference plus the resume key it was given (sent in the X-Resume-Key header, never in
// a URL). Families see their answers, stage and messages for them, never office notes.
// GET  ?form=<token>                         → the published form
// GET  ?reference=<APP-…>  + X-Resume-Key    → the family's own application
// POST {action: start, form, answers}        → { reference, resumeKey }
// POST {action: save|submit|accept|decline, reference, answers?, consent?} + X-Resume-Key

function limit(request: NextRequest, bucket: string, max: number) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`admissions:${bucket}:${ip}`, { limit: max, windowMs: 60_000 }).ok) throw new ApiError("Too many attempts. Wait a minute and try again.", 429);
}

export async function GET(request: NextRequest) {
  try {
    limit(request, "read", 60);
    const params = request.nextUrl.searchParams;
    const token = params.get("form");
    if (token) return Response.json({ success: true, data: await publicForm(token) }, { headers: { "Cache-Control": "no-store" } });
    const reference = params.get("reference");
    if (reference) return Response.json({ success: true, data: await loadApplication(reference, request.headers.get("x-resume-key") ?? "") }, { headers: { "Cache-Control": "no-store" } });
    throw new ApiError("Unknown request", 400);
  } catch (error) {
    return errorResponse(error, "[admissions/public] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (JSON.stringify(body).length > 100_000) throw new ApiError("This application is too large to save.", 413);
    const key = request.headers.get("x-resume-key") ?? "";
    const reference = String(body.reference ?? "");
    switch (body.action) {
      case "start": limit(request, "start", 10); return Response.json({ success: true, data: await startApplication(String(body.form ?? ""), body) }, { status: 201 });
      case "save": limit(request, "write", 60); return Response.json({ success: true, data: await saveApplication(reference, key, body) });
      case "submit": limit(request, "write", 60); return Response.json({ success: true, data: await submitFamilyApplication(reference, key, body) });
      case "accept": case "decline": limit(request, "write", 60); return Response.json({ success: true, data: await familyRespond(reference, key, body.action === "accept") });
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) {
    return errorResponse(error, "[admissions/public] POST failed");
  }
}
