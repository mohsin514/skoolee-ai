import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { createResource, listResources } from "@/lib/resources/service";
import { readJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value));
    // SKAI-1984: the list answers on the envelope; a bad filter is a VALIDATION_FAILED with fields.
    return ok(await listResources(user, params), { headers: noStore });
  } catch (error) {
    const response = await failFrom(error, "[resources] GET failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    return ok(await createResource(user, await readJsonBody(req)), { status: 201, headers: noStore });
  } catch (error) {
    // SKAI-1212: create answers on the envelope like the action route; the client reads { data: { resource, uploadUrl } }.
    return failFrom(error, "[resources] POST failed");
  }
}
