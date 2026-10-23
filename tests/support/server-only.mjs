// CI test runs load app modules with plain Node (`node --import tsx`). Next.js supplies `server-only` itself when it
// bundles the app, but the package is not installed, so outside Next it cannot be resolved. For test processes only
// (loaded with `--import ./tests/support/server-only.mjs` in the workflows), resolve it to an empty module; the app
// build is unaffected.
import Module, { register } from "node:module";
import { fileURLToPath } from "node:url";

const empty = fileURLToPath(new URL("./server-only-empty.cjs", import.meta.url));
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? empty : resolveFilename.call(this, request, ...rest);
};
register(`data:text/javascript,export async function resolve(specifier, context, next) { return specifier === "server-only" ? { url: ${JSON.stringify(new URL("./server-only-empty.cjs", import.meta.url).href)}, shortCircuit: true } : next(specifier, context); }`);
