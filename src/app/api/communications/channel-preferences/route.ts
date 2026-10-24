import type { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError, readBoundedJson } from "@/lib/school-ai/http";
import { listChannelPreferences, saveChannelPreference } from "@/lib/school-ai/announcement-preferences-service";
export async function GET(request: NextRequest) { try { const user = await requireAuthUser(); return Response.json({ preferences: await listChannelPreferences(user, request.nextUrl.searchParams.get("campusId")) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireAuthUser(); return Response.json(await saveChannelPreference(user, await readBoundedJson(request, 8000))); } catch (error) { return schoolAiError(error); } }
