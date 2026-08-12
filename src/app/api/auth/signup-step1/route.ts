import { NextRequest } from "next/server";
import { saveSignupStep1, signupError } from "@/lib/auth/register";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok } = rateLimit(`signup:${ip}`, { limit: 5, windowMs: 300_000 });
    if (!ok) {
      return Response.json({ success: false, error: "Too many attempts. Please try again later." }, { status: 429 });
    }
    const body = await req.json();
    const result = await saveSignupStep1(body);
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[api/signup-step1]", error);
    return Response.json({ success: false, error: signupError(error, "Could not start registration") }, { status: 400 });
  }
}
