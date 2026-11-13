// SKAI-1949: the workspace-shell GETs the browser may group into one /api/shell call. Shared by the fetch interceptor
// (client) and the /api/shell route (server); a path outside this list is never batched and the server refuses it.
export const SHELL_BATCH_PATHS: readonly string[] = [
  "/api/auth/session",
  "/api/auth/welcome",
  "/api/auth/tour",
  "/api/profile",
  "/api/notifications",
  "/api/chat/unread",
  "/api/chat/conversations",
  "/api/navigation/access",
  "/api/navigation/counts",
  "/api/academic-cycle",
  "/api/ai-workflows/questionnaire",
];

export const SHELL_BATCH_MAX = 16;
