/** Application boundary only: this cannot restrict other apps, tabs or the OS. */
export type CandidateExamBoundary = { attemptId: string; assignmentId: string; deadlineAt: Date };

export function canonicalExamPath(pathname: string): string | null {
  try {
    let path = pathname;
    for (let i = 0; i < 3 && path.includes("%"); i++) path = decodeURIComponent(path);
    if (path.includes("%") || /[\u0000-\u001f?#]/u.test(path)) return null;
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    }
    return `/${parts.join("/")}`;
  } catch { return null; }
}

export function candidateExamUrl(assignmentId: string) { return `/ai/exams/${encodeURIComponent(assignmentId)}`; }

/** Exact routes/methods, not an exam-prefix allowlist that also exposes staff APIs. */
export function allowedDuringCandidateExam(pathname: string, method: string, assignmentId: string): boolean {
  const path = canonicalExamPath(pathname);
  if (!path) return false;
  const read = method === "GET" || method === "HEAD";
  if (read && (path.startsWith("/_next/static/") || path === "/_next/image" || ["/favicon.ico", "/favicon.svg", "/icon.png", "/apple-icon.png"].includes(path))) return true;
  if (path === "/api/auth/session") return read;
  if (path === "/api/auth/logout") return method === "POST";
  if (path === candidateExamUrl(assignmentId)) return read;
  const base = `/api/school-ai/exams/${encodeURIComponent(assignmentId)}`;
  if (path === base) return read;
  if (path === `${base}/attempt`) return read || method === "POST" || method === "PATCH";
  if (path === `${base}/proctor`) return read || method === "POST" || method === "PATCH";
  if (path === `${base}/integrity`) return method === "POST";
  if (read && path.startsWith(`${base}/proctor/clips/`)) return /^[^/]+$/u.test(path.slice(`${base}/proctor/clips/`.length));
  if (method === "POST" && path.startsWith(`${base}/proctor/sessions/`)) return /^[^/]+\/clips$/u.test(path.slice(`${base}/proctor/sessions/`.length));
  return false;
}
