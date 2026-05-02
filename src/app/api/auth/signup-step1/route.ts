import { NextRequest } from "next/server";
import { saveSignupStep1, signupError } from "@/lib/auth/register";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await saveSignupStep1(body);
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[api/signup-step1]", error);
    return Response.json({ success: false, error: signupError(error, "Could not start registration") }, { status: 400 });
  }
}
