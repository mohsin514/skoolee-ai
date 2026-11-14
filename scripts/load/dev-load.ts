/**
 * SKAI-1898: realistic concurrent-user load against the deployed dev site (or a local app).
 *
 *   npx tsx scripts/load/dev-load.ts --target https://dev.skooleeai.com --vus 25 --duration 120 [--ramp 30]
 *     [--think 1000-4000] [--roles teacher,guardian,student] [--credentials qa-credentials.json] [--shell-batch off] [--streams off]
 *
 * Read-only by construction: after one sign-in per synthetic QA-01 account it only sends GET requests along the
 * journeys a role's browser makes (scripts/load/load-core.ts). Sessions are shared by virtual users, so the run never
 * floods sign-in. Production hosts are refused; > 300 virtual users needs LOAD_ALLOW_HIGH=1; the run stops itself when
 * the target degrades. Credentials are never printed. Report: test-results/load/<run>.{json,md}; exit 1 on FAIL.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { assertAllowedTarget, checkVirtualUsers, hasFirstEvent, label, pageViewFor, report, shellBatched, shouldAbort, splitStreams, type Sample } from "./load-core";
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
/** Send the shell GETs as one /api/shell request, like the browser (SKAI-1949). `--shell-batch off` sends them one by one. */
const shellBatch = arg("shell-batch", "on") !== "off";
const holdStreams = arg("streams", "on") !== "off";
const STREAM_RETRY_MS = 5_000;
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
  /** 503 answers by the server's x-db-unavailable reason (SKAI-1948). */
  const unavailable = new Map<string, number>();
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + durationSec * 1000;
  let aborted: string | null = null;

  const streamTasks: Promise<void>[] = [];
  const streamControllers = new Set<AbortController>();

  /** One realtime stream held open until the run ends. Each connection is one sample: the time to its first event. */
  async function holdStream(cookie: string, path: string) {
    while (Date.now() < deadline && !aborted) {
      const controller = new AbortController();
      streamControllers.add(controller);
      const started = performance.now();
      let recorded = false;
      const record = (status: number) => {
        if (recorded) return;
        recorded = true;
        samples.push({ at: Date.now(), endpoint: label(path), ms: Math.round(performance.now() - started), status });
      };
      const noEvent = setTimeout(() => record(0), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${target}${path}`, { headers: { cookie, accept: "text/event-stream" }, signal: controller.signal });
        if (!res.ok || !res.body || res.status === 204) {
          await res.arrayBuffer().catch(() => undefined);
          record(res.status);
          if (res.status === 204) return; // realtime is off: the browser stops reconnecting too
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let text = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (recorded) continue;
            text += decoder.decode(value, { stream: true });
            if (hasFirstEvent(text)) record(res.status);
          }
        }
      } catch {
        // Aborted at the end of the run, or the connection dropped.
      } finally {
        clearTimeout(noEvent);
        streamControllers.delete(controller);
        if (!recorded && Date.now() < deadline && !aborted) record(0);
      }
      await sleep(STREAM_RETRY_MS);
    }
  }

  async function virtualUser(index: number) {
    await sleep((rampSec * 1000 * index) / vus);
    const session = sessions[index % sessions.length];
    const view = pageViewFor(session.role, today);
    const { requests, streams } = splitStreams(view.apis);
    const apis = shellBatch ? shellBatched(requests) : requests;
    const hit = async (path: string) => {
      const started = performance.now();
      let status = 0;
      try {
        const res = await fetch(`${target}${path}`, { headers: { cookie: session.cookie }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        await res.arrayBuffer();
        status = res.status;
        if (status === 503) unavailable.set(res.headers.get("x-db-unavailable") ?? "unlabelled", (unavailable.get(res.headers.get("x-db-unavailable") ?? "unlabelled") ?? 0) + 1);
      } catch { status = 0; }
      samples.push({ at: Date.now(), endpoint: label(path), ms: Math.round(performance.now() - started), status });
    };
    // SKAI-1957: like a browser tab, open each realtime stream once and keep it open (reconnecting as EventSource does).
    if (holdStreams) for (const path of streams) streamTasks.push(holdStream(session.cookie, path));
    // A page view as a browser makes it: the page, then the dashboard's requests together; then the person reads.
    while (Date.now() < deadline && !aborted) {
      await hit(view.home);
      if (Date.now() >= deadline || aborted) return;
      await Promise.all(apis.map(hit));
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
  for (const controller of streamControllers) controller.abort();
  await Promise.all(streamTasks);
  clearInterval(watchdog);

  const meta = { target, vus, durationSec, rampSec, thinkMs: [thinkMin, thinkMax] as [number, number], startedAt, finishedAt: new Date().toISOString(), aborted,
    sessions: sessions.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.role]: (acc[s.role] ?? 0) + 1 }), {}), skipped };
  const result = report(meta, samples);
  mkdirSync("test-results/load", { recursive: true });
  const base = `test-results/load/${startedAt.replace(/[:.]/g, "-")}`;
  writeFileSync(`${base}.json`, JSON.stringify({ meta, overall: result.overall, endpoints: result.endpoints }, null, 2));
  writeFileSync(`${base}.md`, result.markdown);
  const reasons = [...unavailable.entries()].map(([k, v]) => `${k}×${v}`).join(" ");
  console.log(`\n${result.markdown}\n${reasons ? `\n503 reasons: ${reasons}\n` : ""}\nReport: ${base}.md`);
  if (!result.passed) process.exitCode = 1;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
