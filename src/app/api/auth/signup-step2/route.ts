import { NextRequest } from "next/server";
import { completeSignupStep2, signupError } from "@/lib/auth/register";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    const { ok } = rateLimit(`signup2:${ip}`, { limit: 5, windowMs: 300_000 });
    if (!ok) {
      return Response.json({ success: false, error: "Too many attempts. Please try again later." }, { status: 429 });
    }
    const body = await parseBody(req, jsonObjectBody, { preserve: ["password"] });
    const result = await completeSignupStep2(body as Parameters<typeof completeSignupStep2>[0]);
    // The account id is not returned: a new and an existing address must read identically (SKO-457).
    if (result.success) return Response.json({ success: true, ...(result.warning ? { warning: result.warning } : {}) });
    return Response.json(result, { status: 400 });
  } catch (error: any) {
    console.error("[api/signup-step2]", error);
    if (error?.code === "P2002") {
      return Response.json(
        { success: false, error: "This registration already exists. Try logging in or use a different email/Reg ID." },
        { status: 409 }
      );
    }
    return Response.json({ success: false, error: signupError(error) }, { status: 400 });
  }
}
