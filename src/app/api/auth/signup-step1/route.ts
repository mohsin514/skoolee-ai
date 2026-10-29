import { NextRequest } from "next/server";
import { saveSignupStep1, signupError } from "@/lib/auth/register";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    const { ok } = rateLimit(`signup:${ip}`, { limit: 5, windowMs: 300_000 });
    if (!ok) {
      return Response.json({ success: false, error: "Too many attempts. Please try again later." }, { status: 429 });
    }
    const body = await parseBody(req, jsonObjectBody);
    const result = await saveSignupStep1(body as Parameters<typeof saveSignupStep1>[0]);
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[api/signup-step1]", error);
    return Response.json({ success: false, error: signupError(error, "Could not start registration") }, { status: 400 });
  }
}
