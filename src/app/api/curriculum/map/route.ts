import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { listCurricula, objectiveMap, recordMapping } from "@/lib/curriculum/service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value));
    if (!params.recordId) return Response.json({ success: true, curricula: await listCurricula(user) }, { headers: noStore });
    return Response.json({ success: true, ...(await objectiveMap(user, params)) }, { headers: noStore });
  } catch (error) {
    const response = (error instanceof ZodError ? Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 }) : errorResponse(error, "[curriculum-map] GET failed"));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { op, ...input } = await req.json();
    if (op !== "mapping") throw new ApiError("Unknown curriculum action.", 400);
    return Response.json({ success: true, mapping: await recordMapping(user, input) }, { status: 201, headers: noStore });
  } catch (error) {
    return (error instanceof ZodError ? Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 }) : errorResponse(error, "[curriculum-map] POST failed"));
  }
}
