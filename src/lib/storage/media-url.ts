// SKAI-1004: browser-safe media URL helper. It used to live only in s3.ts, so
// every client page that showed a logo or avatar shipped the AWS S3 SDK
// (~70 KB gzip on /login). s3.ts re-exports it for server callers.
const S3_KEY_PREFIXES = ["profile-images/", "logos/", "student-docs/", "staff-docs/", "chat/", "reports/", "resources/", "submissions/"];

export function isS3Key(value: string): boolean {
  return S3_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isS3Key(value)) return `/api/media/${value}`;
  return value;
}
