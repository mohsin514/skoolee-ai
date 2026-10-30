import { ZodError, z } from "zod";
import { paperDataSchema, questionSchema, type PaperData, type Question } from "./assessment";

/**
 * The generation frame grammar (SKO-408, Requirement 5; R24.10, R26.9).
 *
 * Pure module: zod and `./assessment` only. No Prisma, no provider call, no `process.env` read, no
 * clock read and no `node:` import, so it runs under `npm run test:school-ai` *and* inside the
 * browser component that consumes the stream. Every timestamp is supplied by the caller, which is
 * the only way an authoritative timestamp (R5.12) can reach a module that must not read a clock.
 *
 * **Why a frame grammar exists at all.** The installed Next.js 16.2.3 documents the constraint this
 * whole design turns on: once the first chunk of a streamed response is sent, the status code and
 * the headers are fixed. A generation that fails after the first item has already been shipped
 * cannot become a 4xx. So the failure has to be sayable *inside the body*, under an already-sent
 * `200`, and the client has to be able to tell a recorded failure from a severed connection. That
 * is what this grammar is: the part of the HTTP contract that the status line can no longer carry.
 *
 * Five things are structural here rather than conventional.
 *
 * 1. **A terminal frame is guaranteed or the decoder raises.** `complete`, `error` and `cancelled`
 *    are terminal. `encodeFrames` stops at the first one, and appends `INCOMPLETE_STREAM` if the
 *    producer ends without one; `decodeFrames` refuses a stream that ends at a line boundary with
 *    no terminal frame (`MISSING_TERMINAL_FRAME`) and one cut mid-line (`TRUNCATED_LINE`). A
 *    truncated `200` therefore cannot be mistaken for success, which is the only way the client can
 *    be honest about a status code it is no longer allowed to trust.
 * 2. **A provider body and a stack trace are unrepresentable, not filtered.** The `error` frame has
 *    exactly three fields — `type`, `reason`, `retained` — and `reason` is a closed code set, not
 *    free text. There is no field in which a body, a cause, a database message or a file path could
 *    be written, and no string a caller could smuggle one through. `generationErrorReason` is the
 *    only path from a thrown cause to the wire and its range *is* the closed set, so nothing
 *    derived from a provider response can reach a client or a log (R5.9, R24.10, R26.9).
 * 3. **The bytes on the wire are schema output, never caller input.** `encodeFrame` serializes
 *    `generationFrameSchema.parse(frame)`, so an unknown key is refused rather than forwarded, and
 *    provider output reaches a client only through `questionSchema`/`paperDataSchema` bounds
 *    (R26.3).
 * 4. **`retained` is counted by the encoder, not reported by the producer.** It is the number of
 *    `item` frames already on the wire, which is exactly what the client holds, so "retain every
 *    item produced before the failure" (R5.9) cannot drift from what the client actually received.
 * 5. **Cancelling the read stops the producer.** `encodeFrames` calls the source iterator's
 *    `return()` on a terminal frame and on stream cancellation, so the producer's `finally` runs
 *    and the provider stops being consumed when the client disconnects (R5.12).
 *
 * Authorization, credits, the rate limit and blueprint validation are *not* here. They run before
 * the first chunk, where a 4xx is still available, and that ordering belongs to the route handler.
 */

/* ------------------------------------------------------------------ vocabulary */

/** The stages R5.1 requires the workspace to display, in the order the handler passes through them. */
export const GENERATION_STAGES = ["BLUEPRINT", "ITEMS", "KEYS", "REVIEW"] as const;
export const generationStageSchema = z.enum(GENERATION_STAGES);
export type GenerationStage = z.infer<typeof generationStageSchema>;

/**
 * Every failure a generation stream may report, closed.
 *
 * A closed set is the whole point: the design's `z.string().max(400)` bounds *how much* text could
 * leak, and a bound alone still admits the first 400 characters of a stack trace or a provider
 * body. An enum admits none, so R5.9, R24.10 and R26.9 hold by construction instead of by a
 * reviewer remembering to redact. Each code is a stable identifier the trilingual copy module keys
 * its message off; the code itself is never rendered.
 *
 * `PROVIDER_UNAVAILABLE` covers both an unconfigured or unapproved provider (R5.10, R26.8) and a
 * provider whose own API quota is exhausted — from the author's seat they are the same event, and
 * naming the difference would say something about the provider account.
 */
export const GENERATION_ERROR_REASONS = [
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_FAILED",
  "PROVIDER_TIMED_OUT",
  "PROVIDER_OUTPUT_REFUSED",
  "OUT_OF_SCOPE_OUTPUT",
  "PAPER_CHECKS_FAILED",
  "CURRICULUM_CHANGED",
  "CREDITS_EXHAUSTED",
  "CANCELLED",
  "INCOMPLETE_STREAM",
  "INTERNAL",
] as const;
export const generationErrorReasonSchema = z.enum(GENERATION_ERROR_REASONS);
export type GenerationErrorReason = z.infer<typeof generationErrorReasonSchema>;

/** The design's bound on the reason string. Every admitted code sits far inside it; the constant is
 * kept so the bound stays checkable rather than implied. */
export const GENERATION_REASON_MAX_LENGTH = 400;

const count = z.number().int().min(0);

/* ------------------------------------------------------------------ the five frames */

/** Progress: produced and requested counts plus the current stage (R5.1). */
export const stageFrameSchema = z.object({
  type: z.literal("stage"),
  stage: generationStageSchema,
  produced: count,
  requested: count,
}).strict();

/** One generated item, shipped before the request completes (R5.2). */
export const itemFrameSchema = z.object({
  type: z.literal("item"),
  item: questionSchema,
}).strict();

/** A failure after the first chunk, under an already-sent `200`. Three fields, one of them a closed
 * code: there is no field here for a provider body, a cause chain or a stack (R5.9, R26.9). */
export const errorFrameSchema = z.object({
  type: z.literal("error"),
  reason: generationErrorReasonSchema,
  retained: count,
}).strict();

/** An author cancellation, recorded with the authoritative timestamp the caller supplies (R5.12). */
export const cancelledFrameSchema = z.object({
  type: z.literal("cancelled"),
  retained: count,
  at: z.string().datetime(),
}).strict();

/** The assembled paper. Terminal and sent once. */
export const completeFrameSchema = z.object({
  type: z.literal("complete"),
  paper: paperDataSchema,
}).strict();

/**
 * Strict discriminated union over `type`.
 *
 * Unknown kind refused by the discriminator; a field borrowed from another kind refused by
 * `.strict()`. So `{ type: "error", reason: "PROVIDER_FAILED", retained: 0, stack: "..." }` and
 * `{ type: "stage", ..., item: {...} }` are both rejected rather than quietly carried.
 */
export const generationFrameSchema = z.discriminatedUnion("type", [
  stageFrameSchema,
  itemFrameSchema,
  errorFrameSchema,
  cancelledFrameSchema,
  completeFrameSchema,
]);

export type GenerationFrame = z.infer<typeof generationFrameSchema>;
export type StageFrame = z.infer<typeof stageFrameSchema>;
export type ItemFrame = z.infer<typeof itemFrameSchema>;
export type ErrorFrame = z.infer<typeof errorFrameSchema>;
export type CancelledFrame = z.infer<typeof cancelledFrameSchema>;
export type CompleteFrame = z.infer<typeof completeFrameSchema>;

/** The frame kinds after which nothing may follow. The type and the predicate are both derived from
 * this list, so a sixth frame kind cannot be added as terminal in one place and not the other. */
export const TERMINAL_FRAME_TYPES = ["error", "cancelled", "complete"] as const;
export type TerminalFrame = Extract<GenerationFrame, { type: (typeof TERMINAL_FRAME_TYPES)[number] }>;

export function isTerminalFrame(frame: GenerationFrame): frame is TerminalFrame {
  return (TERMINAL_FRAME_TYPES as readonly string[]).includes(frame.type);
}

/* ------------------------------------------------------------------ constructors */

/** Each constructor parses, so a frame that could not travel is refused where it is built rather
 * than where it is serialized. */
export const stageFrame = (stage: GenerationStage, produced: number, requested: number): StageFrame =>
  stageFrameSchema.parse({ type: "stage", stage, produced, requested });

export const itemFrame = (item: Question): ItemFrame => itemFrameSchema.parse({ type: "item", item });

export const errorFrame = (reason: GenerationErrorReason, retained: number): ErrorFrame =>
  errorFrameSchema.parse({ type: "error", reason, retained });

/** `at` is the caller's authoritative timestamp; this module reads no clock. */
export const cancelledFrame = (retained: number, at: string): CancelledFrame =>
  cancelledFrameSchema.parse({ type: "cancelled", retained, at });

export const completeFrame = (paper: PaperData): CompleteFrame => completeFrameSchema.parse({ type: "complete", paper });

/* ------------------------------------------------------------------ failure classification */

const field = (cause: unknown, key: string): unknown =>
  typeof cause === "object" && cause !== null ? (cause as Record<string, unknown>)[key] : undefined;

/**
 * The single path from a thrown cause to a wire reason.
 *
 * Its range is the closed code set, so no message, stack, cause chain, provider body or file path
 * can reach a frame however the throw is shaped (R5.9, R26.9). Classification reads `name`, `code`
 * and `status` — shapes that survive a minified server bundle — and never the message text. The
 * server error classes are deliberately *not* imported: this module stays loadable in a browser,
 * and importing them would drag Prisma and the provider client in with them.
 *
 * `PROVIDER_FAILED`, `OUT_OF_SCOPE_OUTPUT`, `PAPER_CHECKS_FAILED` and `CURRICULUM_CHANGED` are not
 * produced here. A handler that detects those knows which one it found and says so explicitly; this
 * function is the fallback for a throw nobody anticipated, and its default is `INTERNAL`.
 */
export function generationErrorReason(cause: unknown): GenerationErrorReason {
  // Provider output that failed a bounded schema (R26.3, R26.4), including a refused frame.
  if (cause instanceof ZodError) return "PROVIDER_OUTPUT_REFUSED";
  const name = typeof field(cause, "name") === "string" ? (field(cause, "name") as string) : "";
  const code = typeof field(cause, "code") === "string" ? (field(cause, "code") as string) : "";
  const status = typeof field(cause, "status") === "number" ? (field(cause, "status") as number) : 0;
  // `AbortSignal.timeout()` rejects with a TimeoutError; undici names its own timeouts.
  if (name === "TimeoutError" || code === "ETIMEDOUT" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") return "PROVIDER_TIMED_OUT";
  // An abort that reached here instead of a recorded `cancelled` frame: the client is already gone.
  if (name === "AbortError" || code === "ABORT_ERR") return "CANCELLED";
  if (code === "AI_QUOTA_EXHAUSTED" || status === 503) return "PROVIDER_UNAVAILABLE";
  if (status === 402) return "CREDITS_EXHAUSTED";
  return "INTERNAL";
}

/* ------------------------------------------------------------------ the wire */

/** NDJSON, newline-delimited, one frame per line. */
export const GENERATION_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/**
 * The headers a streamed generation response must carry, frozen so the route and any later consumer
 * cannot drift apart.
 *
 * `X-Accel-Buffering: no` and `no-transform` are load-bearing rather than decorative: the installed
 * framework's streaming guide records that reverse proxies and CDNs buffer a response by default and
 * that a compression layer can hold chunks back, either of which turns progressive items into one
 * delayed blob and defeats R5.1 and R5.2. `nosniff` follows the same guide's Route Handler example.
 */
export const GENERATION_STREAM_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Type": GENERATION_STREAM_CONTENT_TYPE,
  "Cache-Control": "private, no-store, no-transform",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
});

/**
 * The longest single line `decodeFrames` will buffer, in UTF-16 code units — never more than the
 * byte count, since a UTF-8 encoding of a character is never shorter than its UTF-16 encoding.
 *
 * Comfortably above anything this path produces: provider output is token-bounded and the request
 * that seeds a paper is bounded at 500 KB by `readBoundedJson`. Well below `paperDataSchema`'s
 * theoretical ceiling, which a generated paper does not approach — a caller that needs that ceiling
 * raises the bound explicitly rather than inheriting an unbounded buffer, because a decoder that
 * grows without a limit is a denial-of-service surface on untrusted bytes (R26.1).
 */
export const GENERATION_FRAME_MAX_LENGTH = 2_000_000;

/** Every way a stream can be refused. Closed, for the same reason the error reasons are. */
export const GENERATION_STREAM_FAILURES = [
  "BLANK_LINE",
  "INVALID_JSON",
  "REFUSED_FRAME",
  "FRAME_TOO_LARGE",
  "FRAME_AFTER_TERMINAL",
  "TRUNCATED_LINE",
  "MISSING_TERMINAL_FRAME",
] as const;
export type GenerationStreamFailure = (typeof GENERATION_STREAM_FAILURES)[number];

/**
 * A refusal that carries no content.
 *
 * The code, the line's position and its length — never the line itself, and never the zod issues.
 * An issue list quotes the value it rejected and a record key path *is* a provider-supplied
 * identifier, so attaching either would reopen exactly the leak the `error` frame is shaped to
 * prevent, this time through a thrown object that something upstream will log.
 */
export class GenerationStreamError extends Error {
  readonly code: GenerationStreamFailure;
  readonly lineIndex: number;
  readonly length: number;

  constructor(code: GenerationStreamFailure, lineIndex: number, length: number) {
    super(code);
    this.name = "GenerationStreamError";
    this.code = code;
    this.lineIndex = lineIndex;
    this.length = length;
  }
}

/** One NDJSON line, terminated. Serializes the parse *output*, so an unknown key is refused here
 * rather than forwarded to a client. `JSON.stringify` escapes every newline and lone surrogate, so
 * no field value can forge a frame boundary. */
export function encodeFrame(frame: GenerationFrame): string {
  return `${JSON.stringify(generationFrameSchema.parse(frame))}\n`;
}

/** One NDJSON line back. Refuses — never skips — a line it cannot read: a silently dropped line is
 * how a truncated or injected frame disappears without anyone noticing. */
export function decodeFrameLine(line: string, lineIndex = 0, maxLength = GENERATION_FRAME_MAX_LENGTH): GenerationFrame {
  if (line.length > maxLength) throw new GenerationStreamError("FRAME_TOO_LARGE", lineIndex, line.length);
  if (!line.trim()) throw new GenerationStreamError("BLANK_LINE", lineIndex, line.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    throw new GenerationStreamError("INVALID_JSON", lineIndex, line.length);
  }
  const result = generationFrameSchema.safeParse(parsed);
  if (!result.success) throw new GenerationStreamError("REFUSED_FRAME", lineIndex, line.length);
  return result.data;
}

/**
 * Frames to bytes.
 *
 * Pull-based, so the platform's backpressure decides when the next frame is asked for rather than
 * the whole paper queueing in memory. The source iterator's `return()` runs on the first terminal
 * frame and on cancellation, so a disconnected client stops the producer's loop — which is how
 * "stop charging further provider calls" (R5.12) is reachable from a pure module.
 *
 * A thrown cause becomes a terminal `error` frame carrying a closed code and the count of items
 * already shipped. The stream then *closes normally*: erroring the transport instead would surface
 * the cause to the platform's logs and leave the client unable to tell a recorded failure from a
 * dropped connection, under a `200` that can no longer be changed.
 */
export function encodeFrames(frames: AsyncIterable<GenerationFrame>): ReadableStream<Uint8Array> {
  const iterator = frames[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  let items = 0;
  let closed = false;

  const stopProducer = async () => {
    try {
      await iterator.return?.();
    } catch {
      // The producer failed while unwinding. There is nothing further to report to a client whose
      // terminal frame has already been written, and nothing to log that would not be a cause.
    }
  };

  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // Already closed or cancelled by the consumer.
    }
  };

  const write = (controller: ReadableStreamDefaultController<Uint8Array>, line: string) => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(line));
    } catch {
      // The consumer is gone; `cancel` has stopped the producer.
      closed = true;
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      let next: IteratorResult<GenerationFrame>;
      try {
        next = await iterator.next();
      } catch (cause) {
        write(controller, encodeFrame(errorFrame(generationErrorReason(cause), items)));
        close(controller);
        return;
      }
      if (next.done) {
        // The producer ended without saying how it ended. The client is told, rather than left to
        // read a clean end of stream as success.
        write(controller, encodeFrame(errorFrame("INCOMPLETE_STREAM", items)));
        close(controller);
        return;
      }
      let line: string;
      try {
        line = encodeFrame(next.value);
      } catch (cause) {
        // A frame that does not parse never reaches the wire, and its content never reaches the
        // reason: the classifier's range is the closed code set.
        await stopProducer();
        write(controller, encodeFrame(errorFrame(generationErrorReason(cause), items)));
        close(controller);
        return;
      }
      if (next.value.type === "item") items += 1;
      write(controller, line);
      if (isTerminalFrame(next.value)) {
        await stopProducer();
        close(controller);
      }
    },
    async cancel() {
      closed = true;
      await stopProducer();
    },
  });
}

/**
 * Bytes back to frames.
 *
 * NDJSON over a byte stream, so a line arrives in pieces and a chunk boundary can fall inside a
 * multi-byte character — routine, not theoretical, for Arabic and Urdu prompts. The decoder is
 * therefore streaming (`{ stream: true }`) and holds the partial tail until its newline arrives.
 *
 * Three refusals that a tolerant reader would turn into silent data loss:
 *
 * - a line that is not a readable frame is refused, not skipped;
 * - a stream cut mid-line is `TRUNCATED_LINE`;
 * - a stream that ends at a line boundary without a terminal frame is `MISSING_TERMINAL_FRAME`.
 *
 * The last two are the ones the HTTP contract needs. The status line was fixed at `200` when the
 * first chunk shipped, so a severed connection and a finished generation look identical from
 * outside the body; only the terminal frame separates them. Both checks run on a natural end of
 * stream, so a consumer that stops reading early — the author pressed cancel — is not accused of
 * truncating anything.
 */
export async function* decodeFrames(
  stream: ReadableStream<Uint8Array>,
  options: { maxFrameLength?: number } = {},
): AsyncGenerator<GenerationFrame, void, void> {
  const maxFrameLength = options.maxFrameLength ?? GENERATION_FRAME_MAX_LENGTH;
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let lineIndex = 0;
  let terminated = false;

  const read = (line: string): GenerationFrame => {
    if (terminated) throw new GenerationStreamError("FRAME_AFTER_TERMINAL", lineIndex, line.length);
    return decodeFrameLine(line, lineIndex, maxFrameLength);
  };

  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        // A trailing carriage return is dropped: an intermediary that rewrote the line ending has
        // not changed which frame this is.
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        const frame = read(line);
        lineIndex += 1;
        terminated = isTerminalFrame(frame);
        yield frame;
      }
      // The tail has no newline yet, so it is still growing. Bound it here rather than when it
      // finally completes, so a line that never ends cannot consume memory first.
      if (buffer.length > maxFrameLength) throw new GenerationStreamError("FRAME_TOO_LARGE", lineIndex, buffer.length);
    }
    // Flushing surfaces an incomplete multi-byte sequence as U+FFFD, which fails the parse below
    // rather than passing a silently altered field on.
    buffer += decoder.decode();
    if (buffer.length > 0) throw new GenerationStreamError("TRUNCATED_LINE", lineIndex, buffer.length);
    if (!terminated) throw new GenerationStreamError("MISSING_TERMINAL_FRAME", lineIndex, 0);
  } finally {
    // Runs on an early `break` too, so cancelling the read cancels the response body and the
    // producer behind it.
    try {
      await reader.cancel();
    } catch {
      // The stream was already closed or errored.
    }
    reader.releaseLock();
  }
}
