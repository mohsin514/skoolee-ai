import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const loginUrl = new URL("/login", req.url);

  if (!id) {
    loginUrl.searchParams.set("error", "Invalid verification link");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      loginUrl.searchParams.set("error", "User not found");
      return NextResponse.redirect(loginUrl);
    }

    // Activate the user securely in the database
    await prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    loginUrl.pathname = "/verify-success";
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error("[VERIFY ERROR]", error);
    loginUrl.searchParams.set("error", "Verification failed");
    return NextResponse.redirect(loginUrl);
  }
}
