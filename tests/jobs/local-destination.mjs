/** Only the isolated SKO-386 database is eligible; never load dotenv or reset another fixture. */
export function jobsDestination(env = process.env) {
  const url = new URL(env.DATABASE_URL || "http://invalid");
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/sko386_test" || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(url.username) || url.password || url.search || url.hash || env.DIRECT_URL !== env.DATABASE_URL) throw new Error("Explicit isolated SKO-386 database required");
  return { host: url.hostname, port: url.port, user: url.username, database: url.pathname.slice(1), url: url.toString() };
}
