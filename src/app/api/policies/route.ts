import { z } from "zod";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { addEvalCase, approvePolicy, archivePolicy, askPolicy, escalatePolicyQuestion, listPolicies, myPolicyQuestions, newPolicyVersion, officeQueue, policyFeedback, resolveEscalation, runEvaluation, savePolicyDraft } from "@/lib/policies/service";

// SKO-429: school policy assistant — cited answers for families and staff, and policy management,
// office queue and evaluation for school leaders.
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser();
    const view = new URL(request.url).searchParams.get("view");
    const result = await runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, async () =>
      view === "manage" ? { policies: await listPolicies(user), queue: await officeQueue(user) } : { questions: await myPolicyQuestions(user) });
    return ok(result, { headers });
  } catch (error) { return failFrom(error, "[policies] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["ask", "feedback", "escalate", "save", "version", "approve", "archive", "resolve", "eval-add", "eval-run"]), id: z.string().min(1).max(120).optional(), data: z.unknown() }).strict().parse(await request.json().catch(() => ({})));
    const id = body.id ?? "";
    const result = await runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, (): Promise<unknown> => {
      switch (body.action) {
        case "ask": return askPolicy(user, body.data);
        case "feedback": return policyFeedback(user, id, body.data);
        case "escalate": return escalatePolicyQuestion(user, id, body.data);
        case "save": return savePolicyDraft(user, body.data, body.id);
        case "version": return newPolicyVersion(user, id);
        case "approve": return approvePolicy(user, id);
        case "archive": return archivePolicy(user, id);
        case "resolve": return resolveEscalation(user, id, body.data);
        case "eval-add": return addEvalCase(user, body.data);
        default: return runEvaluation(user);
      }
    });
    return ok(result, { headers });
  } catch (error) { return failFrom(error, "[policies] POST failed"); }
}
