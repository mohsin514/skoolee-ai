import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { questionSchema, type Question } from "../../src/lib/school-ai/assessment";
import {
  GENERATION_ERROR_REASONS,
  GENERATION_FRAME_MAX_LENGTH,
  GENERATION_REASON_MAX_LENGTH,
  GENERATION_STAGES,
  GENERATION_STREAM_CONTENT_TYPE,
  GENERATION_STREAM_FAILURES,
  GENERATION_STREAM_HEADERS,
  GenerationStreamError,
  cancelledFrame,
  completeFrame,
  decodeFrameLine,
  decodeFrames,
  encodeFrame,
  encodeFrames,
  errorFrame,
  generationErrorReason,
  generationFrameSchema,
  isTerminalFrame,
  itemFrame,
  stageFrame,
  type GenerationFrame,
} from "../../src/lib/school-ai/generation-stream";
import { HOSTILE_STRING_KINDS, arbitraryHostileString, arbitraryPaper, isoAt, xorshift } from "./exam-studio-generators";

/**
 * The generation frame grammar (task 7.1, Requirements 5.1, 5.2, 5.9, 5.12, 24.10, 26.9).
 *
 * Property 14 (locked and unselected item preservation) belongs to task 7.5 and its own file,
 * `exam-studio-generation.test.ts`. These are examples: the grammar's refusals do not vary with
 * generated input, so each one is stated once against a real generated paper rather than sampled.
 */

const SEED = 0x7a11c0de;
const paperFor = (edgeCase?: Parameters<typeof arbitraryPaper>[1]) => arbitraryPaper(xorshift(SEED), edgeCase ?? {});
const sample = paperFor();
const question = sample.paper.questions[0];

const bytesOf = (text: string) => new TextEncoder().encode(text);
const textOf = (frames: readonly GenerationFrame[]) => frames.map(encodeFrame).join("");

/** A byte stream delivered exactly as the given chunks, so a boundary can be placed deliberately. */
const streamOfChunks = (chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const streamOfText = (text: string, chunkBytes = Number.MAX_SAFE_INTEGER) => {
  const bytes = bytesOf(text);
  const chunks: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += chunkBytes) chunks.push(bytes.slice(at, at + chunkBytes));
  return streamOfChunks(chunks.length ? chunks : []);
};

async function collect(stream: ReadableStream<Uint8Array>, options?: { maxFrameLength?: number }) {
  const frames: GenerationFrame[] = [];
  for await (const frame of decodeFrames(stream, options)) frames.push(frame);
  return frames;
}

async function refusal(stream: ReadableStream<Uint8Array>, options?: { maxFrameLength?: number }) {
  const frames: GenerationFrame[] = [];
  try {
    for await (const frame of decodeFrames(stream, options)) frames.push(frame);
  } catch (error) {
    assert.ok(error instanceof GenerationStreamError, `expected a GenerationStreamError, received ${String(error)}`);
    return { frames, error };
  }
  throw new assert.AssertionError({ message: `the stream was accepted; frames: ${frames.length}` });
}

/** Everything a logger or an error surface could reach from a thrown refusal. */
const surfaceOf = (error: Error) => `${error.name} ${error.message} ${String(error.stack ?? "")} ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;

test("the grammar admits exactly five frame kinds and refuses anything else", () => {
  const frames: GenerationFrame[] = [
    stageFrame("BLUEPRINT", 0, 40),
    itemFrame(question),
    errorFrame("PROVIDER_FAILED", 3),
    cancelledFrame(3, isoAt(0)),
    completeFrame(sample.paper),
  ];
  for (const frame of frames) assert.deepEqual(generationFrameSchema.parse(frame), frame);
  assert.deepEqual(frames.map(isTerminalFrame), [false, false, true, true, true]);
  assert.deepEqual([...GENERATION_STAGES], ["BLUEPRINT", "ITEMS", "KEYS", "REVIEW"]);

  for (const refused of [
    { type: "progress", produced: 1, requested: 2 },
    { type: "stage", stage: "PRINTING", produced: 1, requested: 2 },
    { type: "stage", produced: 1, requested: 2 },
    { type: "stage", stage: "ITEMS", produced: -1, requested: 2 },
    { type: "stage", stage: "ITEMS", produced: 1.5, requested: 2 },
    { type: "cancelled", retained: 1, at: "yesterday" },
    { type: "item" },
    {},
    [stageFrame("ITEMS", 1, 2)],
    "stage",
    null,
  ]) {
    assert.equal(generationFrameSchema.safeParse(refused).success, false, `admitted ${JSON.stringify(refused)}`);
  }
});

test("a frame cannot carry a field belonging to another kind", () => {
  for (const borrowed of [
    { type: "stage", stage: "ITEMS", produced: 1, requested: 2, item: question },
    { type: "stage", stage: "ITEMS", produced: 1, requested: 2, paper: sample.paper },
    { type: "item", item: question, reason: "PROVIDER_FAILED" },
    { type: "item", item: question, produced: 1 },
    { type: "error", reason: "PROVIDER_FAILED", retained: 1, paper: sample.paper },
    { type: "error", reason: "PROVIDER_FAILED", retained: 1, at: isoAt(0) },
    { type: "cancelled", retained: 1, at: isoAt(0), reason: "CANCELLED" },
    { type: "complete", paper: sample.paper, retained: 1 },
  ]) {
    assert.equal(generationFrameSchema.safeParse(borrowed).success, false, `admitted ${JSON.stringify(borrowed).slice(0, 80)}`);
  }
});

test("the error frame is structurally incapable of carrying a provider body or a stack trace", () => {
  // Three fields, one of them a closed code. There is no field here a body could live in.
  assert.deepEqual(Object.keys(errorFrame("PROVIDER_FAILED", 7)).sort(), ["reason", "retained", "type"]);
  for (const reason of GENERATION_ERROR_REASONS) {
    assert.ok(reason.length <= GENERATION_REASON_MAX_LENGTH);
    assert.equal(generationFrameSchema.safeParse({ type: "error", reason, retained: 0 }).success, true);
  }

  // Free text is not a reason, so a truncated provider body or stack cannot be placed in one.
  const stack = "TypeError: Cannot read properties of undefined\n    at generateAIDraft (/Users/x/src/lib/ai/openai.ts:257:18)";
  const body = JSON.stringify({ error: { message: "incorrect api key provided: sk-live-7f3", type: "invalid_request_error" } });
  for (const leak of [stack, body, body.slice(0, GENERATION_REASON_MAX_LENGTH), "provider said no", "", "internal"]) {
    assert.equal(generationFrameSchema.safeParse({ type: "error", reason: leak, retained: 2 }).success, false, `admitted free text as a reason: ${leak.slice(0, 40)}`);
  }
  const hostile = HOSTILE_STRING_KINDS.map((kind) => arbitraryHostileString(xorshift(SEED), { kind, maxLength: GENERATION_REASON_MAX_LENGTH }).value);
  for (const value of hostile) {
    assert.equal(generationFrameSchema.safeParse({ type: "error", reason: value, retained: 2 }).success, false);
  }

  // And no second field can be added to carry it instead.
  for (const key of ["stack", "cause", "details", "body", "providerResponse", "message", "path"]) {
    assert.equal(generationFrameSchema.safeParse({ type: "error", reason: "PROVIDER_FAILED", retained: 2, [key]: stack }).success, false, `admitted an extra ${key}`);
  }
});

test("every thrown cause maps into the closed reason set and nothing of the cause survives", () => {
  const reasons = new Set<string>(GENERATION_ERROR_REASONS);
  const zodError = (() => {
    const parsed = questionSchema.safeParse({ id: "q1" });
    assert.equal(parsed.success, false);
    return parsed.error;
  })();

  assert.equal(generationErrorReason(zodError), "PROVIDER_OUTPUT_REFUSED");
  assert.equal(generationErrorReason(Object.assign(new Error("timed out"), { name: "TimeoutError" })), "PROVIDER_TIMED_OUT");
  assert.equal(generationErrorReason({ code: "UND_ERR_HEADERS_TIMEOUT" }), "PROVIDER_TIMED_OUT");
  assert.equal(generationErrorReason(Object.assign(new Error("aborted"), { name: "AbortError" })), "CANCELLED");
  assert.equal(generationErrorReason({ code: "ABORT_ERR" }), "CANCELLED");
  assert.equal(generationErrorReason({ code: "AI_QUOTA_EXHAUSTED", status: 503 }), "PROVIDER_UNAVAILABLE");
  assert.equal(generationErrorReason({ message: "Configure an approved OpenAI text provider", status: 503 }), "PROVIDER_UNAVAILABLE");
  assert.equal(generationErrorReason({ message: "Subscription suspended", status: 402 }), "CREDITS_EXHAUSTED");
  assert.equal(generationErrorReason(new Error("Cannot read properties of undefined")), "INTERNAL");

  // Whatever shape the throw takes, the output is a code from the closed set, so a message, a
  // stack, a nested provider body and a database error text have no route to the wire.
  const causes: unknown[] = [
    undefined,
    null,
    "a bare string with a key sk-live-7f3",
    { response: { status: 500, body: "upstream exploded" }, stack: "at openai.ts:1:1" },
    Object.assign(new Error("relation \"school_ai_record\" does not exist"), { code: "42P01" }),
    ...HOSTILE_STRING_KINDS.map((kind) => new Error(arbitraryHostileString(xorshift(SEED), { kind, maxLength: 400 }).value)),
  ];
  for (const cause of causes) {
    const reason = generationErrorReason(cause);
    assert.ok(reasons.has(reason), `unlisted reason ${reason}`);
    assert.equal(generationFrameSchema.safeParse({ type: "error", reason, retained: 1 }).success, true);
  }
});

test("a whole generation round-trips through the Web Streams API, Arabic prompts and a 100-item paper included", async () => {
  const arabic = paperFor({ edgeCase: "ARABIC_WRAPPING_LTR_FORMULA" });
  assert.equal(arabic.paper.language, "ar");
  const hundred = paperFor({ edgeCase: "HUNDRED_ITEM_PAPER" });
  assert.equal(hundred.paper.questions.length, 100);

  for (const generated of [arabic, hundred]) {
    const requested = generated.paper.questions.length;
    const frames: GenerationFrame[] = [
      stageFrame("BLUEPRINT", 0, requested),
      ...generated.paper.questions.map((item, index) => [itemFrame(item), stageFrame("ITEMS", index + 1, requested)]).flat(),
      stageFrame("KEYS", requested, requested),
      stageFrame("REVIEW", requested, requested),
      completeFrame(generated.paper),
    ];
    async function* produce() {
      for (const frame of frames) yield frame;
    }
    const text = await new Response(encodeFrames(produce())).text();
    assert.equal(text.split("\n").length - 1, frames.length, "one line per frame, newline terminated");
    assert.deepEqual(await collect(streamOfText(text)), frames);
  }
});

test("a line split across chunk boundaries, including inside a multi-byte character, decodes whole", async () => {
  const arabic = paperFor({ edgeCase: "ARABIC_WRAPPING_LTR_FORMULA" });
  const frames: GenerationFrame[] = [
    stageFrame("ITEMS", 0, 2),
    itemFrame(arabic.paper.questions[0]),
    itemFrame(arabic.paper.questions[arabic.paper.questions.length - 1]),
    completeFrame(arabic.paper),
  ];
  const text = textOf(frames);
  const bytes = bytesOf(text);

  // One byte at a time: every boundary is exercised, including every continuation byte.
  assert.deepEqual(await collect(streamOfText(text, 1)), frames);
  for (const chunkBytes of [3, 17, 512]) assert.deepEqual(await collect(streamOfText(text, chunkBytes)), frames);

  // And a boundary placed deliberately inside a UTF-8 continuation sequence, which is what an
  // Arabic prompt makes routine rather than theoretical.
  const inside = bytes.findIndex((byte) => (byte & 0xc0) === 0x80);
  assert.ok(inside > 0, "the encoded stream carries no multi-byte character");
  assert.deepEqual(await collect(streamOfChunks([bytes.slice(0, inside), bytes.slice(inside)])), frames);
});

test("a malformed line is refused rather than skipped, and the refusal carries no content", async () => {
  const marker = "sk-live-7f3-answer-key";
  const good = encodeFrame(stageFrame("ITEMS", 1, 2));
  const after = encodeFrame(completeFrame(sample.paper));

  const cases: ReadonlyArray<readonly [string, GenerationStreamError["code"], number]> = [
    [`{"type":"item","item":{"id":"${marker}"`, "INVALID_JSON", 1],
    [`not json at all ${marker}`, "INVALID_JSON", 1],
    [`{"type":"progress","note":"${marker}"}`, "REFUSED_FRAME", 1],
    [`{"type":"error","reason":"${marker}","retained":1}`, "REFUSED_FRAME", 1],
    [`{"type":"stage","stage":"ITEMS","produced":1,"requested":2,"leak":"${marker}"}`, "REFUSED_FRAME", 1],
    ["   ", "BLANK_LINE", 1],
    ["", "BLANK_LINE", 1],
  ];
  for (const [line, code, index] of cases) {
    const { frames, error } = await refusal(streamOfText(`${good}${line}\n${after}`));
    // The good line before it was delivered; the terminal frame after it was not reached.
    assert.deepEqual(frames, [stageFrame("ITEMS", 1, 2)], `line ${line.slice(0, 30)} did not stop at the bad line`);
    assert.equal(error.code, code);
    assert.equal(error.lineIndex, index);
    assert.ok(!surfaceOf(error).includes(marker), `the refusal quoted the refused line: ${code}`);
  }
  assert.ok(GENERATION_STREAM_FAILURES.includes("REFUSED_FRAME"));
  assert.throws(() => decodeFrameLine(`{"type":"item","item":{"id":"${marker}"}}`), (error: unknown) => error instanceof GenerationStreamError && error.code === "REFUSED_FRAME" && !surfaceOf(error).includes(marker));
});

test("a cut stream and a stream that ends without a terminal frame are both refused", async () => {
  const full = textOf([stageFrame("ITEMS", 0, 2), itemFrame(question), completeFrame(sample.paper)]);

  // Cut inside the last line: a 200 whose body stopped mid-frame is not a completed generation.
  const bytes = bytesOf(full);
  const cut = await refusal(streamOfChunks([bytes.slice(0, bytes.length - 40)]));
  assert.equal(cut.error.code, "TRUNCATED_LINE");
  assert.deepEqual(cut.frames, [stageFrame("ITEMS", 0, 2), itemFrame(question)]);

  // Cut at a line boundary: every line read cleanly, yet the generation never said how it ended.
  const short = await refusal(streamOfText(textOf([stageFrame("ITEMS", 0, 2), itemFrame(question)])));
  assert.equal(short.error.code, "MISSING_TERMINAL_FRAME");
  assert.deepEqual(short.frames, [stageFrame("ITEMS", 0, 2), itemFrame(question)]);

  // An empty 200 body is the same refusal, not an empty success.
  assert.equal((await refusal(streamOfChunks([]))).error.code, "MISSING_TERMINAL_FRAME");

  // Nothing may follow a terminal frame.
  const trailing = await refusal(streamOfText(`${full}${encodeFrame(itemFrame(question))}`));
  assert.equal(trailing.error.code, "FRAME_AFTER_TERMINAL");
  assert.equal(trailing.frames.length, 3);

  // A consumer that stops early is accused of nothing: the two checks run only on a natural end.
  const frames: GenerationFrame[] = [];
  for await (const frame of decodeFrames(streamOfText(full))) {
    frames.push(frame);
    if (frames.length === 2) break;
  }
  assert.deepEqual(frames, [stageFrame("ITEMS", 0, 2), itemFrame(question)]);
});

test("a failure after the first chunk is a terminal error frame under an already-sent 200", async () => {
  const marker = "upstream body: incorrect api key sk-live-7f3";
  let stopped = false;
  async function* produce(): AsyncGenerator<GenerationFrame> {
    try {
      yield stageFrame("ITEMS", 0, 3);
      yield itemFrame(sample.paper.questions[0]);
      yield itemFrame(sample.paper.questions[1] ?? sample.paper.questions[0]);
      throw Object.assign(new Error(marker), { stack: `Error: ${marker}\n    at generateAIDraft (/src/lib/ai/openai.ts:257:18)`, response: { body: marker } });
    } finally {
      stopped = true;
    }
  }
  const text = await new Response(encodeFrames(produce())).text();
  const frames = await collect(streamOfText(text));

  // The stream closed normally and said what happened: the status line could no longer carry it.
  assert.deepEqual(frames[frames.length - 1], errorFrame("INTERNAL", 2));
  assert.equal(frames.filter((frame) => frame.type === "item").length, 2, "retained must equal the items the client holds");
  assert.ok(stopped, "the producer was not unwound");
  for (const leaked of [marker, "openai.ts", "at generateAIDraft", "sk-live-7f3"]) {
    assert.ok(!text.includes(leaked), `the wire carried ${leaked}`);
  }
});

test("an invalid frame never reaches the wire, and its content never reaches the reason", async () => {
  const marker = "leaked-item-prompt-7f3";
  async function* produce(): AsyncGenerator<GenerationFrame> {
    yield stageFrame("ITEMS", 0, 1);
    yield { type: "item", item: { id: "q-1", prompt: marker } as unknown as Question };
    yield completeFrame(sample.paper);
  }
  const text = await new Response(encodeFrames(produce())).text();
  assert.ok(!text.includes(marker), "an unparsed item reached the wire");
  assert.deepEqual(await collect(streamOfText(text)), [stageFrame("ITEMS", 0, 1), errorFrame("PROVIDER_OUTPUT_REFUSED", 0)]);
});

test("the encoder stops the producer on a terminal frame and on a client disconnect", async () => {
  const ended: string[] = [];

  // Nothing is produced after the terminal frame, and the producer's `finally` runs.
  async function* terminal(): AsyncGenerator<GenerationFrame> {
    try {
      yield stageFrame("ITEMS", 0, 2);
      yield completeFrame(sample.paper);
      yield itemFrame(question);
    } finally {
      ended.push("terminal");
    }
  }
  const complete = await collect(streamOfText(await new Response(encodeFrames(terminal())).text()));
  assert.deepEqual(complete, [stageFrame("ITEMS", 0, 2), completeFrame(sample.paper)]);
  assert.deepEqual(ended, ["terminal"]);

  // A client that disconnects mid-stream stops the provider loop, which is what makes "stop
  // charging further provider calls" reachable (R5.12). This producer never reaches a terminal
  // frame, so only the cancellation path can unwind it.
  async function* endless(): AsyncGenerator<GenerationFrame> {
    try {
      yield stageFrame("ITEMS", 0, 40);
      for (;;) yield itemFrame(question);
    } finally {
      ended.push("disconnect");
    }
  }
  const reader = encodeFrames(endless()).getReader();
  const first = await reader.read();
  assert.ok(first.value && first.value.length > 0);
  assert.deepEqual(ended, ["terminal"], "the producer was unwound before the client disconnected");
  await reader.cancel();
  assert.deepEqual(ended, ["terminal", "disconnect"]);

  // A producer that just stops is reported, never read as success.
  async function* silent(): AsyncGenerator<GenerationFrame> {
    yield stageFrame("BLUEPRINT", 0, 4);
  }
  assert.deepEqual(await collect(streamOfText(await new Response(encodeFrames(silent())).text())), [stageFrame("BLUEPRINT", 0, 4), errorFrame("INCOMPLETE_STREAM", 0)]);
});

test("an over-long line is refused while it is still growing", async () => {
  const long = `{"type":"item","item":{"id":"${"x".repeat(4000)}"}}`;
  const refused = await refusal(streamOfText(`${long}\n`, 64), { maxFrameLength: 256 });
  assert.equal(refused.error.code, "FRAME_TOO_LARGE");
  assert.ok(refused.error.length <= 256 + 64, `the buffer grew to ${refused.error.length} past a 256 bound`);
  assert.equal(GENERATION_FRAME_MAX_LENGTH, 2_000_000);
  // The same bound applies to a complete line handed over directly.
  assert.throws(() => decodeFrameLine(long, 0, 256), (error: unknown) => error instanceof GenerationStreamError && error.code === "FRAME_TOO_LARGE");
});

test("the wire headers keep a streamed generation unbuffered", () => {
  assert.equal(GENERATION_STREAM_HEADERS["Content-Type"], GENERATION_STREAM_CONTENT_TYPE);
  assert.match(GENERATION_STREAM_CONTENT_TYPE, /^application\/x-ndjson/);
  // Proxies, CDNs and compression buffer by default; progressive items depend on these three.
  assert.equal(GENERATION_STREAM_HEADERS["X-Accel-Buffering"], "no");
  assert.match(GENERATION_STREAM_HEADERS["Cache-Control"], /no-store/);
  assert.match(GENERATION_STREAM_HEADERS["Cache-Control"], /no-transform/);
  assert.equal(GENERATION_STREAM_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.ok(Object.isFrozen(GENERATION_STREAM_HEADERS));
});

test("the module stays pure, so it runs in this suite and in the browser that consumes the stream", () => {
  const source = readFileSync(new URL("../../src/lib/school-ai/generation-stream.ts", import.meta.url), "utf8");
  // Comments are stripped: the module's own documentation names what it refuses to reach for.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specifiers = [...code.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)].map((match) => match[1]);
  assert.deepEqual(specifiers.sort(), ["./assessment", "zod"]);
  for (const forbidden of ["node:", "prisma", "Prisma", "server-only", "process.env", "Date.now", "new Date", "@/lib/"]) {
    assert.ok(!code.includes(forbidden), `the frame grammar reached for ${forbidden}`);
  }
});
