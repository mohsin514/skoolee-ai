import { prisma } from "./prisma";

/**
 * Provisions a new isolated schema for a school and creates all 12 academic/billing tables.
 * This is used for "Path A" (School groups) and "Path B" (Standalone campuses).
 */
export async function createTenantSchema(schemaName: string, schoolId: string) {
  // 1. Create the schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // 2. Define all tables as individual SQL snippets
  const tables = [
    // 1. CAMPUSES
    `CREATE TABLE IF NOT EXISTS "${schemaName}".campuses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      board TEXT,
      logo_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,

    // 2. USERS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT,
      school_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      username TEXT UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'TEACHER',
      phone TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,

    // 3. CLASSES
    `CREATE TABLE IF NOT EXISTS "${schemaName}".classes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      name TEXT NOT NULL,
      section TEXT,
      class_teacher_id TEXT,
      academic_year INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,

    // 4. STUDENTS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".students (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      parent_user_id TEXT,
      full_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      gender TEXT NOT NULL,
      date_of_birth TIMESTAMP WITH TIME ZONE,
      phone TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campus_id, roll_no)
    )`,

    // 5. SUBJECTS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".subjects (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      name TEXT NOT NULL,
      teacher_id TEXT,
      total_marks INTEGER DEFAULT 100,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,

    // 6. EXAMS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".exams (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      term TEXT NOT NULL,
      academic_year INTEGER NOT NULL,
      is_locked BOOLEAN DEFAULT false,
      locked_by TEXT,
      locked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,

    // 7. MARKS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".marks (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      marks_obtained INTEGER NOT NULL,
      grade TEXT,
      entered_by TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(exam_id, student_id, subject_id)
    )`,

    // 8. REPORT_CARDS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".report_cards (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      remarks_en TEXT,
      remarks_ur TEXT,
      pdf_url TEXT,
      is_sent BOOLEAN DEFAULT false,
      generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, exam_id)
    )`,

    // 9. ATTENDANCE
    `CREATE TABLE IF NOT EXISTS "${schemaName}".attendance (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      date DATE NOT NULL,
      status TEXT NOT NULL,
      marked_by TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, date)
    )`,

    // 10. FEE_STRUCTURES
    `CREATE TABLE IF NOT EXISTS "${schemaName}".fee_structures (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      term TEXT NOT NULL,
      tuition_monthly INTEGER NOT NULL,
      exam_fee INTEGER DEFAULT 0,
      annual_fee INTEGER DEFAULT 0,
      months_count INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(class_id, term)
    )`,

    // 11. INVOICES
    `CREATE TABLE IF NOT EXISTS "${schemaName}".invoices (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      campus_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      term TEXT NOT NULL,
      academic_year INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      due_date TIMESTAMP WITH TIME ZONE NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      challan_url TEXT,
      generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,

    // 12. PAYMENTS
    `CREATE TABLE IF NOT EXISTS "${schemaName}".payments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id TEXT NOT NULL,
      amount_paid INTEGER NOT NULL,
      method TEXT NOT NULL,
      receipt_no TEXT,
      paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      recorded_by TEXT
    )`,
  ];

  // 3. Execute each table creation individually to bypass "multiple commands" limitation
  for (const sql of tables) {
    await prisma.$executeRawUnsafe(sql);
  }

  return schemaName;
}

/**
 * NEW: Resolves the tenant schema name for the current logged-in user.
 * With custom auth, we pull schoolId from the JWT.
 */
import { getAuthUser } from "../auth";

export async function getTenantForUser(userId: string) {
  const user = await getAuthUser();
  if (!user || user.userId !== userId) return null;
  
  // The schema name is derived from the schoolId to ensure uniqueness
  // Sync logic with /api/auth/register
  return { 
    schemaName: `school_${user.schoolId.replace(/-/g, "_")}`,
    schoolId: user.schoolId 
  };
}

/**
 * NEW: Executes a callback in the context of a specific tenant schema.
 */
export async function withTenant<T>(
  schemaName: string, 
  cb: (query: <R>(sql: string, params?: any[]) => Promise<R>) => Promise<T>
): Promise<T> {
  const query = async <R>(sql: string, params: any[] = []) => {
    // 1. Switch session to the tenant schema
    await prisma.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);
    // 2. Execute the raw SQL
    return prisma.$queryRawUnsafe(sql, ...params) as Promise<R>;
  };
  return cb(query);
}

/**
 * NEW: Executes a non-returning statement in a specific tenant schema context.
 */
export async function tenantExec(
  schemaName: string, 
  sql: string, 
  params: any[] = []
): Promise<number> {
  await prisma.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);
  return prisma.$executeRawUnsafe(sql, ...params);
}

