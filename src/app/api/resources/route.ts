import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createResource, listResources } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value));
    return Response.json({ success: true, ...(await listResources(user, params)) }, { headers: noStore });
  } catch (error) {
    const response = (error instanceof ZodError ? Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 }) : errorResponse(error, "[resources] GET failed"));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, ...(await createResource(user, await req.json())) }, { status: 201, headers: noStore });
  } catch (error) {
    return (error instanceof ZodError ? Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 }) : errorResponse(error, "[resources] POST failed"));
  }
}
