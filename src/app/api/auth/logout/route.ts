import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  
  // Clear the auth cookie
  cookieStore.set("skoolee_token", "", {
    maxAge: 0,
    path: "/",
  });

  return NextResponse.json({ success: true, message: "Logged out successfully" });
}
