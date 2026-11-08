import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { addAdjustment, approveRun, createCorrection, payrollOverview, prepareRun, recordProviderResult, savePolicy, saveProvider, setEmployee, submitRun, voidAdjustment } from "@/lib/payroll-runs/service";
import { readJsonBody } from "@/lib/api/validate";

// SKO-434: payroll policies, provider mappings, run versions, approval, export and provider results.
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json({ success: true, data: await payrollOverview(await requireAuthUser(), { year: Number(params.get("year")), month: Number(params.get("month")) }) }, { headers });
  } catch (error) { return errorResponse(error, "[payroll/runs] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["policy", "provider", "employee", "adjust", "void-adjustment", "prepare", "approve", "submit", "result", "correct"]), id: z.string().min(1).max(120).optional(), data: z.unknown().optional(), reason: z.string().max(500).optional() }).strict().parse(await readJsonBody(request));
    const id = body.id ?? "";
    const run = (): Promise<unknown> => {
      switch (body.action) {
        case "policy": return savePolicy(user, body.data);
        case "provider": return saveProvider(user, body.data);
        case "employee": return setEmployee(user, id, body.data);
        case "adjust": return addAdjustment(user, body.data);
        case "void-adjustment": return voidAdjustment(user, id);
        case "prepare": return prepareRun(user, body.data);
        case "approve": return approveRun(user, id, body.reason);
        case "submit": return submitRun(user, id);
        case "result": return recordProviderResult(user, id, body.data);
        default: return createCorrection(user, id);
      }
    };
    return Response.json({ success: true, data: await run() }, { headers });
  } catch (error) { return errorResponse(error, "[payroll/runs] POST failed"); }
}
