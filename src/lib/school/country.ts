import "server-only";
import { prisma } from "@/lib/db/prisma";

const ISO = /^[A-Z]{2}$/;

const record = (value: unknown) =>
  (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;

/**
 * The exact country captured at registration (ISO alpha-2): the school-scope
 * locale policy's `countryIso`, else its billing `country` when that is a real
 * market. "" when only "OTHER" was stored.
 */
export async function registeredSchoolCountry(schoolId: string): Promise<string> {
  const policy = await prisma.localePolicy.findFirst({
    where: { schoolId, campusId: null, scopeKey: "school" },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    select: { settings: true },
  });
  const settings = record(policy?.settings);
  const iso = typeof settings.countryIso === "string" ? settings.countryIso : typeof settings.country === "string" ? settings.country : "";
  return ISO.test(iso) ? iso : "";
}

/**
 * The school's country for campus-level choices (exam boards, phone codes):
 * the country the owner confirmed in setup, else the registered one, else "".
 * Must run inside the school's tenant context.
 */
export async function schoolCountry(schoolId: string): Promise<string> {
  const setup = await prisma.institutionSetup.findUnique({ where: { schoolId }, select: { draft: true } });
  const fromSetup = record(record(setup?.draft).school).country;
  if (typeof fromSetup === "string" && ISO.test(fromSetup)) return fromSetup;
  return registeredSchoolCountry(schoolId);
}
