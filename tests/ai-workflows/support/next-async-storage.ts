// Next's server installs AsyncLocalStorage on globalThis at boot; a route handler called from a plain Node test
// needs the same before any next/dist request-scope module loads. Import this first.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
