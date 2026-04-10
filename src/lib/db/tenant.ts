// ===========================================
// SkooleeAI - Tenant Schema Management
// ===========================================
// Per-schema multi-tenancy: each school gets a
// separate PostgreSQL schema (school_{id}).

import { prisma } from "./prisma";

// Cache tenant Prisma clients to avoid re-creation
const tenantClients = new Map<string, any>();

/**
 * Build the connection URL for a tenant's schema by appending
 * `?schema=school_{id}` to the base DATABASE_URL.
 */
export function getTenantDbUrl(schoolId: string): string {
  const baseUrl = process.env.DATABASE_URL || "";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}schema=school_${schoolId}`;
}

/**
 * Get or create a PrismaClient wired to a tenant schema.
 * Uses a cache so we don't create a new client per request.
 */
export function getTenantClient(schemaName: string): any {
  if (tenantClients.has(schemaName)) {
    return tenantClients.get(schemaName)!;
  }
  // We use $executeRawUnsafe to set search_path instead of
  // separate connection strings (simpler with connection pooling)
  const client = prisma;
  tenantClients.set(schemaName, client);
  return client;
}

/**
 * Execute a callback within a tenant's schema context.
 * Sets the PostgreSQL search_path before running and resets after.
 */
export async function withTenant<T>(
  schemaName: string,
  callback: (query: typeof tenantQuery) => Promise<T>
): Promise<T> {
  await prisma.$executeRawUnsafe(
    `SET search_path TO "${schemaName}", public`
  );
  try {
    const result = await callback(tenantQuery);
    return result;
  } finally {
    await prisma.$executeRawUnsafe(`SET search_path TO public`);
  }
}

/**
 * Execute a raw SQL query scoped to the current search_path.
 * Use inside `withTenant()`.
 */
export async function tenantQuery<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T> {
  return prisma.$queryRawUnsafe(sql, ...params) as Promise<T>;
}

/**
 * Execute a raw write (INSERT/UPDATE/DELETE) within tenant context.
 */
export async function tenantExec(
  sql: string,
  params: unknown[] = []
): Promise<number> {
  return prisma.$executeRawUnsafe(sql, ...params);
}

/**
 * Resolve a tenant slug or ID to the schema name and tenant record.
 */
export async function resolveTenant(slugOrId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ slug: slugOrId }, { id: slugOrId }],
    },
  });
  return tenant;
}

/**
 * Auth helper: get the tenant for the current request
 * by reading the x-tenant-slug header or looking up by Clerk user.
 */
export async function getTenantFromHeaders(
  headers: Headers
): Promise<{ id: string; schemaName: string; slug: string } | null> {
  const slug = headers.get("x-tenant-slug");
  if (!slug) return null;
  const tenant = await resolveTenant(slug);
  if (!tenant) return null;
  return { id: tenant.id, schemaName: tenant.schemaName, slug: tenant.slug };
}

/**
 * Get the tenant for a Clerk user by looking up their tenantId.
 */
export async function getTenantForUser(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { tenant: true },
  });
  if (!user?.tenant) return null;
  return {
    id: user.tenant.id,
    schemaName: user.tenant.schemaName,
    slug: user.tenant.slug,
    role: user.role,
    userId: user.id,
  };
}

// ─── Schema Provisioning ─────────────────────────────────

/**
 * Creates a new PostgreSQL schema for a tenant with all tables.
 * Called during school onboarding.
 */
export async function createTenantSchema(schemaName: string): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".classes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      section TEXT,
      grade_level INT NOT NULL,
      academic_year TEXT NOT NULL,
      teacher_id TEXT,
      capacity INT DEFAULT 40,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name, section, academic_year)
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".students (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_no TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth DATE,
      gender TEXT CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
      guardian_name TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      guardian_whatsapp TEXT,
      address TEXT,
      photo_url TEXT,
      class_id TEXT REFERENCES "${schemaName}".classes(id),
      status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".subjects (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      max_marks INT DEFAULT 100,
      passing_marks INT DEFAULT 33,
      is_optional BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".class_subjects (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id TEXT REFERENCES "${schemaName}".classes(id) ON DELETE CASCADE,
      subject_id TEXT REFERENCES "${schemaName}".subjects(id) ON DELETE CASCADE,
      teacher_id TEXT,
      UNIQUE(class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".exams (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      type TEXT CHECK (type IN ('MONTHLY', 'MIDTERM', 'FINAL', 'UNIT_TEST', 'CUSTOM')),
      academic_year TEXT NOT NULL,
      term TEXT,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'PUBLISHED')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".marks (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id TEXT REFERENCES "${schemaName}".students(id) ON DELETE CASCADE,
      subject_id TEXT REFERENCES "${schemaName}".subjects(id) ON DELETE CASCADE,
      exam_id TEXT REFERENCES "${schemaName}".exams(id) ON DELETE CASCADE,
      marks_obtained DECIMAL(5,2),
      max_marks DECIMAL(5,2) DEFAULT 100,
      grade TEXT,
      remarks TEXT,
      ai_remark_en TEXT,
      ai_remark_ur TEXT,
      entered_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, subject_id, exam_id)
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".report_cards (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id TEXT REFERENCES "${schemaName}".students(id) ON DELETE CASCADE,
      exam_id TEXT REFERENCES "${schemaName}".exams(id) ON DELETE CASCADE,
      total_marks DECIMAL(7,2),
      obtained_marks DECIMAL(7,2),
      percentage DECIMAL(5,2),
      grade TEXT,
      rank INT,
      overall_remark_en TEXT,
      overall_remark_ur TEXT,
      pdf_url TEXT,
      status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'GENERATED', 'SENT')),
      sent_via TEXT CHECK (sent_via IN ('WHATSAPP', 'EMAIL', 'BOTH')),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".notifications (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id TEXT REFERENCES "${schemaName}".students(id),
      type TEXT CHECK (type IN ('WHATSAPP', 'EMAIL', 'SMS')),
      recipient TEXT NOT NULL,
      message TEXT,
      attachment_url TEXT,
      status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'READ')),
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_students_class ON "${schemaName}".students(class_id);
    CREATE INDEX IF NOT EXISTS idx_marks_student ON "${schemaName}".marks(student_id);
    CREATE INDEX IF NOT EXISTS idx_marks_exam ON "${schemaName}".marks(exam_id);
    CREATE INDEX IF NOT EXISTS idx_report_cards_student ON "${schemaName}".report_cards(student_id);
    CREATE INDEX IF NOT EXISTS idx_report_cards_exam ON "${schemaName}".report_cards(exam_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_student ON "${schemaName}".notifications(student_id);
  `);
}

/**
 * Delete a tenant's schema and all its data. Destructive!
 */
export async function dropTenantSchema(schemaName: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`
  );
}
