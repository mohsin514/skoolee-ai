import { NextRequest } from "next/server";
import { completeSignupStep2, signupError } from "@/lib/auth/register";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await completeSignupStep2(body);
    return Response.json(result, { status: result.success ? 200 : 400 });
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
