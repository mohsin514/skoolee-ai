import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { assignAsset, closeService, createBudget, decideRequest, purchasingOverview, receiveGoods, recordInvoice, resolveInvoice, returnToSupplier, saveRequest, scheduleService, submitRequest } from "@/lib/purchasing/service";

// SKO-435: budgets, purchase requests and orders, deliveries, invoices, assets and maintenance.
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try { return Response.json({ success: true, data: await purchasingOverview(await requireAuthUser()) }, { headers }); }
  catch (error) { return errorResponse(error, "[purchasing] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["budget", "save", "submit", "decide", "receive", "return", "invoice", "resolve-invoice", "assign", "schedule", "close-service"]), id: z.string().min(1).max(120).optional(), version: z.number().int().positive().optional(), data: z.unknown() }).strict().parse(await request.json().catch(() => ({})));
    const id = body.id ?? "";
    const run = (): Promise<unknown> => {
      switch (body.action) {
        case "budget": return createBudget(user, body.data);
        case "save": return saveRequest(user, body.data, body.id, body.version);
        case "submit": return submitRequest(user, id, body.version ?? 0);
        case "decide": return decideRequest(user, id, body.data);
        case "receive": return receiveGoods(user, id, body.data);
        case "return": return returnToSupplier(user, id, body.data);
        case "invoice": return recordInvoice(user, id, body.data);
        case "resolve-invoice": return resolveInvoice(user, id, body.data);
        case "assign": return assignAsset(user, id, body.data);
        case "schedule": return scheduleService(user, id, body.data);
        default: return closeService(user, id, body.data);
      }
    };
    return Response.json({ success: true, data: await run() }, { headers });
  } catch (error) { return errorResponse(error, "[purchasing] POST failed"); }
}
