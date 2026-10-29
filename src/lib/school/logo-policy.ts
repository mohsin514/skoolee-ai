/**
 * The one rule set for school and campus logos (crests), shared by the file
 * pickers, the presign route and the details writes.
 *
 * SVG is refused rather than sanitised: an SVG can carry script and external
 * references, and the crest prints on PDFs and emails where a raster is safer.
 */
export const LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const LOGO_ACCEPT = LOGO_CONTENT_TYPES.join(",");
export const LOGO_MAX_BYTES = 1_500_000; // 1.5 MB

export type LogoFileProblem = "type" | "size" | null;

/** Why a picked file cannot be a logo, or null when it can. */
export function logoFileProblem(contentType: string, sizeBytes: number): LogoFileProblem {
  if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(contentType.trim().toLowerCase())) return "type";
  if (!(sizeBytes > 0) || sizeBytes > LOGO_MAX_BYTES) return "size";
  return null;
}

/** Where a stored logo key may point: the school's own prefix, or one of its campuses'. */
export type LogoScope = { schoolId: string; campusId?: string };

/**
 * True when an uploaded logo key belongs to this tenant. A school logo lives
 * under logos/school/{schoolId}/; a campus logo under
 * logos/campus/{schoolId}/{campusId}/. Anything else (another school's key, a
 * traversal) is refused, so one tenant cannot point its crest at another's file.
 */
export function logoKeyInScope(key: string, scope: LogoScope): boolean {
  if (key.includes("..") || /\s/.test(key)) return false;
  const prefix = scope.campusId ? `logos/campus/${scope.schoolId}/${scope.campusId}/` : `logos/school/${scope.schoolId}/`;
  return key.startsWith(prefix) && key.length > prefix.length;
}
