// SKAI-1869: a single pending task that runs after a quiet period, can be flushed now (page hide, record change,
// unmount) or cancelled (saved, discarded). Draft persistence uses it so sessionStorage is not rewritten per keystroke.
export const DRAFT_PERSIST_DELAY = 400;

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
const browserTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createDebouncedTask(delay = DRAFT_PERSIST_DELAY, timers: Timers = browserTimers) {
  let handle: unknown = null;
  let pending: (() => void) | null = null;
  const stop = () => { if (handle !== null) timers.clear(handle); handle = null; };
  const run = () => { stop(); const task = pending; pending = null; task?.(); };
  return {
    schedule(task: () => void) { stop(); pending = task; handle = timers.set(run, delay); },
    flush: run,
    cancel() { stop(); pending = null; },
    get pending() { return pending !== null; },
  };
}
