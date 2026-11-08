/** Only known disposable local fixtures; never infer a target from dotenv. */
export function outboxDestination(env = process.env) {
  const url = new URL(env.DATABASE_URL || "http://invalid");
  const isCi = url.port === "55420" && url.pathname === "/sko220_test" && url.username === "postgres";
  const isLocal = url.port === "55439" && url.pathname === "/sko382_test" && /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(url.username);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.password || url.search || url.hash || (!isCi && !isLocal)) throw new Error("Known disposable outbox database required");
  const redis = isCi ? "redis://127.0.0.1:56420" : "redis://127.0.0.1:56439";
  if (env.REDIS_URL !== redis) throw new Error("Matching disposable Redis required");
  return { host: url.hostname, port: url.port, user: url.username, database: url.pathname.slice(1), redis, url: url.toString() };
}
