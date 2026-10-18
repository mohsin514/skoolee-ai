import { authenticate, listStudents } from "@/lib/integrations/service";
import { respond } from "@/lib/integrations/http";

export const runtime = "nodejs";

// SKO-445: GET /api/public/v1/students?campusId=&cursor=&limit= — roster.read, cursor-paginated, campus-scoped.
export async function GET(request: Request) {
  return respond(request, async setCaller => {
    const caller = await authenticate(request, "roster.read", "v1"); setCaller(caller);
    return { body: await listStudents(caller, new URL(request.url).searchParams) };
  });
}
