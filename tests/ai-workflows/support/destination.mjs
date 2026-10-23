/** Only known disposable AI Workflows fixtures; never infer a target from dotenv. */
export function aiWorkflowsDestination(env = process.env) {
  const url = new URL(env.DATABASE_URL || "http://invalid");
  const isCi = url.port === "55421" && url.pathname === "/ai_workflows_test" && url.username === "postgres";
  const isLocal = url.port === "55438" && ["/postgres", "/ai_workflows_test"].includes(url.pathname) && /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(url.username);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.password || url.search || url.hash || (!isCi && !isLocal)) throw new Error("Known disposable AI Workflows database required (CI 55421/ai_workflows_test or local 55438/postgres or 55438/ai_workflows_test).");
  if (env.DIRECT_URL !== env.DATABASE_URL) throw new Error("DATABASE_URL and DIRECT_URL must be identical for AI Workflows database tests.");
  return { host: url.hostname, port: url.port, user: url.username, database: url.pathname.slice(1), url: url.toString() };
}
