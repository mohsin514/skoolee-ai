import { authenticate, getStudent } from "@/lib/integrations/service";
import { respond } from "@/lib/integrations/http";

export const runtime = "nodejs";

// SKO-445: GET /api/public/v1/students/:id — out-of-scope ids look exactly like missing ones.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(request, async setCaller => {
    const caller = await authenticate(request, "roster.read", "v1"); setCaller(caller);
    return { body: { data: await getStudent(caller, (await params).id) } };
  });
}
