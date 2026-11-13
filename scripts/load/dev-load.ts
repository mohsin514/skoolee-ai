/**
 * SKAI-1898: realistic concurrent-user load against the deployed dev site (or a local app).
 *
 *   npx tsx scripts/load/dev-load.ts --target https://dev.skooleeai.com --vus 25 --duration 120 [--ramp 30]
 *     [--think 1000-4000] [--roles teacher,guardian,student] [--credentials qa-credentials.json]
 *
 * Read-only by construction: after one sign-in per synthetic QA-01 account it only sends GET requests along the
 * journeys a role's browser makes (scripts/load/load-core.ts). Sessions are shared by virtual users, so the run never
 * floods sign-in. Production hosts are refused; > 300 virtual users needs LOAD_ALLOW_HIGH=1; the run stops itself when
 * the target degrades. Credentials are never printed. Report: test-results/load/<run>.{json,md}; exit 1 on FAIL.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { assertAllowedTarget, checkVirtualUsers, label, pageViewFor, report, shouldAbort, type Sample } from "./load-core";
import { ROLE_JOURNEYS } from "./role-journeys";

// Node 24's bundled undici can throw `setTypeOfService EINVAL` from inside its socket handling on macOS when a socket is
// already closing; under thousands of concurrent requests that otherwise kills the run. Only that error is ignored.
process.on("uncaughtException", (error: NodeJS.ErrnoException) => {
  if (error?.syscall === "setTypeOfService") return;
  console.error(error);
  process.exit(1);
});

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const target = assertAllowedTarget(arg("target", "https://dev.skooleeai.com")).origin;
const vus = Number(arg("vus", "10"));
checkVirtualUsers(vus, process.env.LOAD_ALLOW_HIGH === "1");
const durationSec = Number(arg("duration", "60"));
const rampSec = Math.min(durationSec, Number(arg("ramp", String(Math.min(30, Math.ceil(durationSec / 4))))));
const [thinkMin, thinkMax] = arg("think", "1000-4000").split("-").map(Number);
const roles = arg("roles", Object.keys(ROLE_JOURNEYS).join(",")).split(",").map((r) => r.trim());
const credentialsFile = arg("credentials", process.env.LOAD_CREDENTIALS_FILE ?? "qa-credentials.json");
const REQUEST_TIMEOUT_MS = 30_000;

type Account = { email: string; password: string; role: string; school: string };
type Session = { role: string; cookie: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

async function signIn(account: Account): Promise<Session | null> {
  const res = await fetch(`${target}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: target },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { mfaRequired?: boolean };
  const jar = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (res.ok && body.mfaRequired) {
    // Privileged synthetic accounts sign in like a person choosing "Do it later" (only possible before enrolling).
    const ticket = jar.find((c) => c.startsWith("skoolee-mfa="));
    if (!ticket) return null;
    const deferred = await fetch(`${target}/api/auth/mfa`, {
      method: "POST", headers: { "content-type": "application/json", origin: target, cookie: ticket },
      body: JSON.stringify({ action: "defer" }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const cookie = deferred.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("skoolee_token="));
    return deferred.ok && cookie ? { role: account.role, cookie } : null;
  }
  const cookie = jar.find((c) => c.startsWith("skoolee_token="));
  return res.ok && cookie ? { role: account.role, cookie } : null;
}

async function main() {
  const accounts = (JSON.parse(readFileSync(credentialsFile, "utf8")).accounts as Account[]).filter((a) => roles.includes(a.role));
  if (accounts.length === 0) throw new Error(`No accounts for roles ${roles.join(", ")} in ${credentialsFile}.`);

  // One sign-in per account, spaced out, so the run never trips the sign-in rate limits.
  const sessions: Session[] = [];
  const skipped: string[] = [];
  for (const account of accounts) {
    const session = await signIn(account).catch(() => null);
    if (session) sessions.push(session);
    else skipped.push(`${account.school}/${account.role}`);
    await sleep(700);
  }
  if (sessions.length === 0) throw new Error("No account could sign in (MFA-only roles are skipped). Check the credentials file and target.");
  console.log(`signed in ${sessions.length} accounts${skipped.length ? `, skipped ${skipped.join(", ")}` : ""}; ramping ${vus} virtual users over ${rampSec}s`);

  const samples: Sample[] = [];
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + durationSec * 1000;
  let aborted: string | null = null;

  async function virtualUser(index: number) {
    await sleep((rampSec * 1000 * index) / vus);
    const session = sessions[index % sessions.length];
    const view = pageViewFor(session.role, today);
    const hit = async (path: string) => {
      const started = performance.now();
      let status = 0;
      try {
        const res = await fetch(`${target}${path}`, { headers: { cookie: session.cookie }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        await res.arrayBuffer();
        status = res.status;
      } catch { status = 0; }
      samples.push({ at: Date.now(), endpoint: label(path), ms: Math.round(performance.now() - started), status });
    };
    // A page view as a browser makes it: the page, then the dashboard's requests together; then the person reads.
    while (Date.now() < deadline && !aborted) {
      await hit(view.home);
      if (Date.now() >= deadline || aborted) return;
      await Promise.all(view.apis.map(hit));
      await sleep(thinkMin + Math.random() * (thinkMax - thinkMin));
    }
  }

  const watchdog = setInterval(() => {
    const recent = samples.filter((s) => s.at > Date.now() - 30_000);
    aborted ??= shouldAbort(recent);
    const done = Math.round((durationSec * 1000 - (deadline - Date.now())) / 1000);
    console.log(`t+${done}s requests=${samples.length} last30s=${recent.length}${aborted ? ` ABORTING: ${aborted}` : ""}`);
  }, 10_000);

  await Promise.all(Array.from({ length: vus }, (_, i) => virtualUser(i)));
  clearInterval(watchdog);

  const meta = { target, vus, durationSec, rampSec, thinkMs: [thinkMin, thinkMax] as [number, number], startedAt, finishedAt: new Date().toISOString(), aborted,
    sessions: sessions.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.role]: (acc[s.role] ?? 0) + 1 }), {}), skipped };
  const result = report(meta, samples);
  mkdirSync("test-results/load", { recursive: true });
  const base = `test-results/load/${startedAt.replace(/[:.]/g, "-")}`;
  writeFileSync(`${base}.json`, JSON.stringify({ meta, overall: result.overall, endpoints: result.endpoints }, null, 2));
  writeFileSync(`${base}.md`, result.markdown);
  console.log(`\n${result.markdown}\n\nReport: ${base}.md`);
  if (!result.passed) process.exitCode = 1;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
