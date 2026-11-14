import bcrypt from "bcryptjs";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

/**
 * SKAI-1972: bcrypt work runs off the request thread.
 *
 * bcryptjs is pure JavaScript, so every compare/hash (~100-400 ms at cost 10-12)
 * used to run on the same thread that serves every other request: a burst of
 * logins stalled the whole instance. Here the same bcryptjs code runs in a
 * small worker_threads pool. Hashes, costs and the $2a$/$2b$ formats are
 * unchanged, so existing hashes keep verifying and new ones stay compatible.
 * If a worker cannot start (or dies mid-task) the call falls back to the
 * in-thread bcryptjs path, which is the previous behaviour.
 */

type Job = { op: "compare"; password: string; hash: string } | { op: "hash"; password: string; cost: number };
type Pending = { job: Job; resolve: (value: unknown) => void; reject: (error: unknown) => void };
type Slot = { worker: Worker; busy: Pending | null };

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const bcrypt = require(workerData.bcryptPath);
parentPort.on("message", (job) => {
  try {
    const value = job.op === "compare" ? bcrypt.compareSync(job.password, job.hash) : bcrypt.hashSync(job.password, job.cost);
    parentPort.postMessage({ ok: true, value });
  } catch (error) {
    parentPort.postMessage({ ok: false, message: error && error.message ? error.message : String(error) });
  }
});
`;

const poolSize = (): number => {
  const configured = Number(process.env.PASSWORD_HASH_WORKERS);
  if (Number.isInteger(configured) && configured >= 0) return Math.min(configured, 8);
  return Math.max(1, Math.min(4, availableParallelism()));
};

let slots: Slot[] = [];
const queue: Pending[] = [];
let workersDisabled = false;
let bcryptPath: string | null | undefined;

const runInThread = (job: Job): Promise<unknown> =>
  job.op === "compare" ? bcrypt.compare(job.password, job.hash) : bcrypt.hash(job.password, job.cost);

function resolveBcryptPath(): string | null {
  if (bcryptPath !== undefined) return bcryptPath;
  try {
    // Resolved at runtime from the app root so the bundler leaves it alone.
    bcryptPath = createRequire(path.join(process.cwd(), "noop.js")).resolve("bcryptjs");
  } catch {
    bcryptPath = null;
  }
  return bcryptPath;
}

function dispatch(slot: Slot) {
  const next = queue.shift();
  // A busy worker holds the process open until its answer arrives; an idle one never does.
  if (!next) return void slot.worker.unref();
  slot.busy = next;
  slot.worker.ref();
  slot.worker.postMessage(next.job);
}

function retire(slot: Slot, error: unknown) {
  slots = slots.filter((s) => s !== slot);
  const task = slot.busy;
  slot.busy = null;
  if (slots.length === 0) workersDisabled = true;
  console.error("[password-hash] worker stopped; using in-thread bcrypt", error instanceof Error ? error.message : error);
  if (task) runInThread(task.job).then(task.resolve, task.reject);
  // Nothing left to serve the queue: drain it on the request thread.
  if (workersDisabled) for (const pending of queue.splice(0)) runInThread(pending.job).then(pending.resolve, pending.reject);
}

function spawn(): Slot | null {
  const target = resolveBcryptPath();
  if (!target) return null;
  try {
    const worker = new Worker(/* turbopackIgnore: true */ WORKER_SOURCE, { eval: true, execArgv: [], workerData: { bcryptPath: target } });
    const slot: Slot = { worker, busy: null };
    worker.on("message", (msg: { ok: boolean; value?: unknown; message?: string }) => {
      const task = slot.busy;
      slot.busy = null;
      if (task) {
        if (msg.ok) task.resolve(msg.value);
        else task.reject(new Error(msg.message));
      }
      dispatch(slot);
    });
    worker.on("error", (error) => retire(slot, error));
    worker.on("exit", (code) => { if (slots.includes(slot)) retire(slot, new Error(`exit ${code}`)); });
    return slot;
  } catch (error) {
    console.error("[password-hash] worker could not start; using in-thread bcrypt", error instanceof Error ? error.message : error);
    return null;
  }
}

function run(job: Job): Promise<unknown> {
  if (workersDisabled) return runInThread(job);
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject });
    const idle = slots.find((s) => !s.busy);
    if (idle) return dispatch(idle);
    if (slots.length < poolSize()) {
      const slot = spawn();
      if (slot) {
        slots.push(slot);
        return dispatch(slot);
      }
    }
    if (slots.length === 0) {
      workersDisabled = true;
      for (const pending of queue.splice(0)) runInThread(pending.job).then(pending.resolve, pending.reject);
    }
    // Otherwise every worker is busy; the job waits for the next free one.
  });
}

/** Same result as bcryptjs.compare, computed off the request thread. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await run({ op: "compare", password, hash })) === true;
}

/** Same digest format as bcryptjs.hash at the given cost, computed off the request thread. */
export async function hashPassword(password: string, cost: number): Promise<string> {
  return String(await run({ op: "hash", password, cost }));
}

/** Test seam: how many workers are running (0 means the in-thread fallback is in use). */
export function passwordWorkerCount(): number {
  return slots.length;
}
