import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { addCopies, decideCharge, deskOverview, issueCopy, lookup, markLost, previewReturn, renewLoan, reserveTitle, returnCopy, saveRules } from "@/lib/library/desk";

// SKO-436: copy-level lending desk — scan, issue, return, renew, reserve, lost copies, charges and rules.
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser();
    const params = new URL(request.url).searchParams;
    const code = params.get("code"), preview = params.get("preview");
    const data = code ? await lookup(user, code) : preview ? await previewReturn(user, preview, params.get("on") ?? undefined) : await deskOverview(user);
    return Response.json({ success: true, data }, { headers });
  } catch (error) { return errorResponse(error, "[library/desk] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["issue", "return", "renew", "reserve", "copies", "lost", "charge", "rules"]), data: z.unknown() }).strict().parse(await request.json().catch(() => ({})));
    const handlers: Record<typeof body.action, (u: typeof user, d: unknown) => Promise<unknown>> = { issue: issueCopy, return: returnCopy, renew: renewLoan, reserve: reserveTitle, copies: addCopies, lost: markLost, charge: decideCharge, rules: saveRules };
    return Response.json({ success: true, data: await handlers[body.action](user, body.data) }, { headers });
  } catch (error) { return errorResponse(error, "[library/desk] POST failed"); }
}
