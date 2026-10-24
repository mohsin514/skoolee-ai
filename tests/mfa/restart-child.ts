/**
 * A "restarted server": a fresh Node process that imports the MFA route with
 * only the environment the parent passes (no .env loading), loads the stored
 * user state, runs a scenario and prints the results as one JSON line.
 *
 * stdin: { state, now, userId, steps: [{ op: "signIn" } | { op: "get" } | { op: "post", body } | { op: "tick", ms }] }
 * stdout: { results: CallResult[], state, logs: string[] }
 */
import { mock } from "node:test";
import { format } from "node:util";
import { createFakePrisma, deserializeState, serializeState } from "./fake-prisma";
import { loadMfa, type CallResult } from "./harness";

type Step = { op: "signIn" } | { op: "get" } | { op: "post"; body: unknown } | { op: "tick"; ms: number };

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

void (async () => {
  const input = JSON.parse(await readStdin()) as { state: string; now: number; userId: string; steps: Step[] };
  const logs: string[] = [];
  for (const level of ["log", "warn", "error", "info"] as const) console[level] = (...args: unknown[]) => { logs.push(format(...args)); };

  mock.timers.enable({ apis: ["Date"], now: input.now });
  const fake = createFakePrisma(deserializeState(input.state));
  (globalThis as { prisma?: unknown }).prisma = fake;
  const { call, signIn } = await loadMfa();

  const results: CallResult[] = [];
  let cookie = "";
  for (const step of input.steps) {
    if (step.op === "signIn") cookie = await signIn(fake, input.userId);
    else if (step.op === "tick") mock.timers.tick(step.ms);
    else if (step.op === "get") results.push(await call("GET", cookie));
    else results.push(await call("POST", cookie, step.body));
  }
  process.stdout.write(`${JSON.stringify({ results, state: serializeState(fake.state), logs })}\n`);
})().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
