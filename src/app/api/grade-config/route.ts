import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { normalizeWeightMode } from "@/lib/academic/grade-calculator";
import { assertPermission, canManageOperations } from "@/lib/api/scope";

/**
 * Grading rules are a property of a CLASS, not of a section (§80).
 *
 * The table is keyed on (classId, academicYear), and `Class` in this schema is
 * really a section — "Class 5" exists once per section, as 5-A, 5-B and 5-C.
 * So the old screen let 5-A pass at 50% while 5-B passed at 40%, purely
 * because someone edited one row and not the others. Two children in the same
 * year, same syllabus, same paper, different pass mark.
 *
 * Nothing about the storage changes — every section keeps its own row, which
 * is what every reader already expects. What changes is the write: setting the
 * rules for "Class 5" writes the same values to every section of Class 5, so
 * the rows cannot drift apart in the first place.
 *
 * GET  ?classId=&academicYear=   → one section's config (unchanged)
 * GET  ?scope=all&academicYear=  → every class, grouped by name, with a flag
 *                                  saying whether its sections disagree
 * POST { classId | className, ... }
 *      → writes every section of that class
 */

const DEFAULTS = {
  quizWeight: 10,
  classTestWeight: 20,
  midTermWeight: 30,
  finalWeight: 40,
  passingPercentage: 50,
  weightMode: "NORMALIZED" as const,
  gradeAplus: 90,
  gradeA: 80,
  gradeB: 70,
  gradeC: 60,
  gradeD: 50,
};

type ConfigShape = typeof DEFAULTS;

const NUMERIC_KEYS = [
  "quizWeight",
  "classTestWeight",
  "midTermWeight",
  "finalWeight",
  "passingPercentage",
  "gradeAplus",
  "gradeA",
  "gradeB",
  "gradeC",
  "gradeD",
] as const;

function shapeOf(config: Record<string, unknown> | null): ConfigShape {
  if (!config) return { ...DEFAULTS };
  const out = { ...DEFAULTS } as ConfigShape;
  for (const key of NUMERIC_KEYS) {
    const v = Number(config[key]);
    if (Number.isFinite(v)) (out[key] as number) = v;
  }
  out.weightMode = normalizeWeightMode(config.weightMode as string) as "NORMALIZED";
  return out;
}

/** Do these sections' rules actually agree? */
function configsMatch(a: ConfigShape, b: ConfigShape) {
  return (
    NUMERIC_KEYS.every((k) => a[k] === b[k]) && a.weightMode === b.weightMode
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthUser();
    if (!session || !session.campusId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();

    // ── Every class, grouped by name — what the Grading Rules screen loads ──
    if (searchParams.get("scope") === "all") {
      const classes = await prisma.class.findMany({
        where: { campusId: session.campusId, academicYear, status: "ACTIVE" },
        orderBy: [{ name: "asc" }, { section: "asc" }],
        select: {
          id: true,
          name: true,
          section: true,
          _count: { select: { students: true, subjects: true } },
        },
      });

      const configs = await prisma.gradeWeightConfig.findMany({
        where: { classId: { in: classes.map((c) => c.id) }, academicYear },
      });
      const byClassId = new Map(configs.map((c) => [c.classId, c]));

      const groups = new Map<
        string,
        {
          className: string;
          sections: { id: string; section: string | null; students: number; hasConfig: boolean }[];
          config: ConfigShape;
          /** True when the sections were saved with different rules. */
          drifted: boolean;
          configured: boolean;
          students: number;
          subjects: number;
        }
      >();

      for (const cls of classes) {
        const key = cls.name.trim().toLowerCase();
        const raw = byClassId.get(cls.id);
        const shape = shapeOf(raw as Record<string, unknown> | null);

        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, {
            className: cls.name,
            sections: [
              { id: cls.id, section: cls.section, students: cls._count.students, hasConfig: !!raw },
            ],
            config: shape,
            drifted: false,
            configured: !!raw,
            students: cls._count.students,
            subjects: cls._count.subjects,
          });
          continue;
        }

        existing.sections.push({
          id: cls.id,
          section: cls.section,
          students: cls._count.students,
          hasConfig: !!raw,
        });
        existing.students += cls._count.students;
        existing.subjects = Math.max(existing.subjects, cls._count.subjects);
        // A section with no row at all is not drift — it is simply unset, and
        // the first configured section is the one worth showing.
        if (raw) {
          if (!existing.configured) {
            existing.config = shape;
            existing.configured = true;
          } else if (!configsMatch(existing.config, shape)) {
            existing.drifted = true;
          }
        }
      }

      return NextResponse.json({
        success: true,
        academicYear,
        data: [...groups.values()].sort((a, b) =>
          a.className.localeCompare(b.className, undefined, { numeric: true }),
        ),
      });
    }

    // ── One section, for the report-card and marks paths ────────────────
    const classId = searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const config = await prisma.gradeWeightConfig.findUnique({
      where: { classId_academicYear: { classId, academicYear } },
    });

    if (!config) {
      return NextResponse.json({ exists: false, config: { ...DEFAULTS } });
    }

    return NextResponse.json({
      exists: true,
      config: {
        id: config.id,
        classId: config.classId,
        academicYear: config.academicYear,
        ...shapeOf(config as unknown as Record<string, unknown>),
        isActive: config.isActive,
      },
    });
  } catch (error: unknown) {
    console.error("GradeConfig GET error:", error);
    return NextResponse.json({ error: "Failed to load grading rules" }, { status: 500 });
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
      return NextResponse.json(
        { error: "Only admins and principals can change grading rules" },
        { status: 403 },
      );
    }
    await assertPermission(session, "exams", "edit");

    const body = await request.json();
    const academicYear = Number(body.academicYear);
    if (!academicYear) {
      return NextResponse.json({ error: "academicYear is required" }, { status: 400 });
    }

    const incoming = shapeOf(body);

    const weightTotal =
      incoming.quizWeight + incoming.classTestWeight + incoming.midTermWeight + incoming.finalWeight;
    if (Math.round(weightTotal) !== 100) {
      return NextResponse.json(
        { error: `Weights must add up to 100% — they currently add up to ${Math.round(weightTotal)}%` },
        { status: 400 },
      );
    }
    if (incoming.passingPercentage < 0 || incoming.passingPercentage > 100) {
      return NextResponse.json({ error: "The pass mark must be between 0 and 100" }, { status: 400 });
    }

    // Grade boundaries have to descend, or a student can qualify for two
    // grades at once and which one they get depends on comparison order.
    const ladder: [string, number][] = [
      ["A+", incoming.gradeAplus],
      ["A", incoming.gradeA],
      ["B", incoming.gradeB],
      ["C", incoming.gradeC],
      ["D", incoming.gradeD],
    ];
    for (let i = 1; i < ladder.length; i++) {
      if (ladder[i][1] >= ladder[i - 1][1]) {
        return NextResponse.json(
          {
            error: `Grade ${ladder[i][0]} starts at ${ladder[i][1]}%, which is not below grade ${ladder[i - 1][0]} at ${ladder[i - 1][1]}%. Each grade must start lower than the one above it.`,
          },
          { status: 400 },
        );
      }
    }

    // Resolve which sections this write covers. Either a class name directly,
    // or a section id whose name we look up — both end at "every section of
    // this class", which is the whole point.
    let className: string | null = body.className ? String(body.className).trim() : null;
    if (!className) {
      const classId = String(body.classId ?? "");
      if (!classId) {
        return NextResponse.json({ error: "classId or className is required" }, { status: 400 });
      }
      const cls = await prisma.class.findFirst({
        where: { id: classId, campusId: session.campusId },
        select: { name: true },
      });
      if (!cls) {
        return NextResponse.json({ error: "Class not found in your campus" }, { status: 404 });
      }
      className = cls.name;
    }

    const sections = await prisma.class.findMany({
      where: {
        campusId: session.campusId,
        name: { equals: className, mode: "insensitive" },
        academicYear,
        status: "ACTIVE",
      },
      select: { id: true, section: true },
    });
    if (sections.length === 0) {
      return NextResponse.json(
        { error: `No active sections of "${className}" in ${academicYear}` },
        { status: 404 },
      );
    }

    const values = {
      quizWeight: incoming.quizWeight,
      classTestWeight: incoming.classTestWeight,
      midTermWeight: incoming.midTermWeight,
      finalWeight: incoming.finalWeight,
      passingPercentage: incoming.passingPercentage,
      weightMode: normalizeWeightMode(incoming.weightMode),
      gradeAplus: incoming.gradeAplus,
      gradeA: incoming.gradeA,
      gradeB: incoming.gradeB,
      gradeC: incoming.gradeC,
      gradeD: incoming.gradeD,
    };

    await prisma.$transaction(
      sections.map((s) =>
        prisma.gradeWeightConfig.upsert({
          where: { classId_academicYear: { classId: s.id, academicYear } },
          update: values,
          create: { campusId: session.campusId!, classId: s.id, academicYear, ...values },
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      className,
      academicYear,
      sectionsUpdated: sections.length,
      sections: sections.map((s) => s.section).filter(Boolean),
      config: values,
    });
  } catch (error: unknown) {
    console.error("GradeConfig POST error:", error);
    return NextResponse.json({ error: "Failed to save grading rules" }, { status: 500 });
  }
}
