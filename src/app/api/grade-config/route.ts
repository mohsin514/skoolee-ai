import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { normalizeWeightMode, type WeightConfig } from "@/lib/academic/grade-calculator";
import { assertPermission, canManageOperations } from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthUser();
    if (!session || !session.campusId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const config = await prisma.gradeWeightConfig.findUnique({
      where: { classId_academicYear: { classId, academicYear } },
    });

    if (!config) {
      return NextResponse.json({
        exists: false,
        config: {
          quizWeight: 10,
          classTestWeight: 20,
          midTermWeight: 30,
          finalWeight: 40,
          passingPercentage: 50,
          weightMode: "NORMALIZED",
          gradeAplus: 90,
          gradeA: 80,
          gradeB: 70,
          gradeC: 60,
          gradeD: 50,
        },
      });
    }

    return NextResponse.json({
      exists: true,
      config: {
        id: config.id,
        classId: config.classId,
        academicYear: config.academicYear,
        quizWeight: config.quizWeight,
        classTestWeight: config.classTestWeight,
        midTermWeight: config.midTermWeight,
        finalWeight: config.finalWeight,
        passingPercentage: config.passingPercentage,
        weightMode: normalizeWeightMode(config.weightMode),
        gradeAplus: config.gradeAplus,
        gradeA: config.gradeA,
        gradeB: config.gradeB,
        gradeC: config.gradeC,
        gradeD: config.gradeD,
        isActive: config.isActive,
      },
    });
  } catch (error: any) {
    console.error("GradeConfig GET error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthUser();
    if (!session || !session.campusId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Grading weights and the passing bar decide who passes the year, so only
    // the office may touch them. This route previously accepted any signed-in
    // user, which let a teacher — or a student — rewrite their own pass mark.
    if (!canManageOperations(session)) {
      return NextResponse.json({ error: "Only admins and principals can change grading rules" }, { status: 403 });
    }
    await assertPermission(session, "exams", "edit");

    const body = await request.json();
    const { classId, academicYear, quizWeight, classTestWeight, midTermWeight, finalWeight, passingPercentage, weightMode, gradeAplus, gradeA, gradeB, gradeC, gradeD } = body;

    if (!classId || !academicYear) {
      return NextResponse.json({ error: "classId and academicYear are required" }, { status: 400 });
    }

    const total = (quizWeight || 0) + (classTestWeight || 0) + (midTermWeight || 0) + (finalWeight || 0);
    if (total > 100) {
      return NextResponse.json({ error: "Total weight cannot exceed 100%" }, { status: 400 });
    }

    // Verify the class belongs to this campus
    const cls = await prisma.class.findFirst({
      where: { id: classId, campusId: session.campusId },
      select: { id: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found in your campus" }, { status: 404 });
    }

    const config = await prisma.gradeWeightConfig.upsert({
      where: { classId_academicYear: { classId, academicYear: Number(academicYear) } },
      update: {
        quizWeight: quizWeight ?? 10,
        classTestWeight: classTestWeight ?? 20,
        midTermWeight: midTermWeight ?? 30,
        finalWeight: finalWeight ?? 40,
        passingPercentage: passingPercentage ?? 50,
        weightMode: normalizeWeightMode(weightMode),
        gradeAplus: gradeAplus ?? 90,
        gradeA: gradeA ?? 80,
        gradeB: gradeB ?? 70,
        gradeC: gradeC ?? 60,
        gradeD: gradeD ?? 50,
      },
      create: {
        campusId: session.campusId,
        classId,
        academicYear: Number(academicYear),
        quizWeight: quizWeight ?? 10,
        classTestWeight: classTestWeight ?? 20,
        midTermWeight: midTermWeight ?? 30,
        finalWeight: finalWeight ?? 40,
        passingPercentage: passingPercentage ?? 50,
        weightMode: normalizeWeightMode(weightMode),
        gradeAplus: gradeAplus ?? 90,
        gradeA: gradeA ?? 80,
        gradeB: gradeB ?? 70,
        gradeC: gradeC ?? 60,
        gradeD: gradeD ?? 50,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error("GradeConfig POST error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
