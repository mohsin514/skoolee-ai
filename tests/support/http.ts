/**
 * HTTP client for the logout suites.
 *
 * Two things it must get right, because both are load-bearing for what is
 * being tested:
 *
 * 1. Redirects are never followed. The assertions are *about* the redirect —
 *    its status and its Location — so following it would throw away the
 *    evidence and report the login page's 200 instead.
 * 2. The cookie jar is explicit. Nothing is carried implicitly between
 *    requests, so "this request had the session cookie" is always visible at
 *    the call site rather than a property of some ambient agent.
 */
import { resolveTarget } from "./env";
import { CookieJar, setCookie, isCleared, type ParsedCookie } from "./cookies";
import { recordMintedToken } from "./db";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send the jar's cookies. Default true. Set false to probe as a stranger. */
  withCookies?: boolean;
  /** Apply the response's Set-Cookie headers to the jar. Default true. */
  absorb?: boolean;
}

export class TestClient {
  readonly jar = new CookieJar();
  readonly baseUrl: string;

  constructor(baseUrl = resolveTarget().baseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const {
      method = "GET",
      body,
      headers = {},
      withCookies = true,
      absorb = true,
    } = options;

    const requestHeaders: Record<string, string> = { ...headers };

    if (withCookies) {
      const cookie = this.jar.header();
      if (cookie) requestHeaders.cookie = cookie;
    }

    let payload: string | undefined;
    if (body !== undefined) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      requestHeaders["content-type"] ??= "application/json";
    }

    const response = await fetch(new URL(path, this.baseUrl + "/"), {
      method,
      headers: requestHeaders,
      body: payload,
      // The assertions are about the redirect itself.
      redirect: "manual",
    });

    if (absorb) this.jar.absorb(response);
    return response;
  }

  get(path: string, options: RequestOptions = {}) {
    return this.request(path, { ...options, method: "GET" });
  }

  post(path: string, options: RequestOptions = {}) {
    return this.request(path, { ...options, method: "POST" });
  }

  /** The session cookie value currently in the jar, if any. */
  get sessionToken(): string | undefined {
    return this.jar.get(SESSION_COOKIE_NAME);
  }
}

export interface LoginResult {
  response: Response;
  /** The raw JWT the server issued. Captured so it can be replayed later. */
  token: string;
  cookie: ParsedCookie;
  body: any;
}

/**
 * Signs in over the real login route and returns the token it minted.
 *
 * Throws on failure rather than returning a sad result: every suite here treats
 * "could not sign in" as a broken fixture, not as a finding about logout, and
 * an early hard failure says so much more clearly than a cascade of
 * assertion errors downstream.
 */
export async function login(
  client: TestClient,
  email: string,
  password: string,
  options: { rememberMe?: boolean } = {}
): Promise<LoginResult> {
  const response = await client.post("/api/auth/login", {
    body: { email, password, ...(options.rememberMe ? { rememberMe: true } : {}) },
    withCookies: false,
  });

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `Login failed for ${email}: ${response.status} ${JSON.stringify(body)}`
    );
  }

  const cookie = setCookie(response, SESSION_COOKIE_NAME);
  if (!cookie || isCleared(cookie) || !cookie.value) {
    throw new Error(`Login for ${email} returned no ${SESSION_COOKIE_NAME} cookie`);
  }

  // Registered so the row can be cleaned up even if this test never signs out.
  recordMintedToken(cookie.value);

  return { response, token: cookie.value, cookie, body };
}

/** POSTs the logout route with whatever is in the jar. */
export function logout(client: TestClient, options: RequestOptions = {}) {
  return client.post("/api/auth/logout", options);
}

/**
 * A client holding a specific token and nothing else.
 *
 * This is how a stolen-token replay is modelled: the jar the user logged out
 * of is gone, and all that is left is the string an attacker kept.
 */
export function clientWithToken(token: string): TestClient {
  const client = new TestClient();
  client.jar.set(SESSION_COOKIE_NAME, token);
  return client;
}

export interface PageOutcome {
  status: number;
  /** Where the response sends the client, or null if it sends it nowhere. */
  redirectedTo: string | null;
  /**
   * True when the instruction arrived inside the streamed RSC payload rather
   * than as a Location header.
   */
  streamed: boolean;
  /** Rendered text with scripts and markup stripped, for "did it leak" checks. */
  visibleText: string;
  /** Short description for assertion messages and the results table. */
  summary: string;
}

/**
 * What a page response actually does, accounting for streamed redirects.
 *
 * A `redirect()` in a layout cannot always answer 3xx. Once any part of the
 * response has been flushed — and these segments all have a loading.tsx, which
 * puts them behind a Suspense boundary — the status line is already gone, so
 * Next delivers the redirect inside the RSC stream as
 * `NEXT_REDIRECT;replace;<url>;<status>;` and the client performs it. The page
 * body in that case contains no console content, only the shell.
 *
 * So "status 307" is the wrong contract to assert for pages: it would fail on
 * correct behaviour, and it is not what the app already did before this change
 * (/messages has redirected on a missing session for a long time and answers
 * 200 the same way). The contract that matters is the one a user experiences —
 * the console does not render and the browser ends up at /login — and that is
 * what this models. The Playwright suite then confirms it in a real browser,
 * which is the only place the client-side half can actually be observed.
 */
export async function readPageOutcome(response: Response): Promise<PageOutcome> {
  const header = response.headers.get("location");
  if (header) {
    return {
      status: response.status,
      redirectedTo: header,
      streamed: false,
      visibleText: "",
      summary: `${response.status} → ${header}`,
    };
  }

  const body = await response.text();
  const visibleText = body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // NEXT_REDIRECT;replace;/login?redirect=%2Fadmin;307;
  const match = body.match(/NEXT_REDIRECT;[^;]*;([^;\\"]+);/);
  if (match) {
    const target = match[1];
    return {
      status: response.status,
      redirectedTo: target,
      streamed: true,
      visibleText,
      summary: `${response.status} ⇢ ${target} (streamed)`,
    };
  }

  return {
    status: response.status,
    redirectedTo: null,
    streamed: false,
    visibleText,
    summary: String(response.status),
  };
}

/** The pathname a page outcome sends the client to, or null. */
export function redirectPathname(outcome: PageOutcome): string | null {
  if (!outcome.redirectedTo) return null;
  try {
    return new URL(outcome.redirectedTo, "http://placeholder").pathname;
  } catch {
    return null;
  }
}

export async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Waits for the target to answer, so a suite fails on "no server" clearly. */
export async function waitForServer(
  baseUrl = resolveTarget().baseUrl,
  timeoutMs = 90_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/login", baseUrl + "/"), {
        redirect: "manual",
      });
      if (response.status < 500) return;
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(
    `${baseUrl} did not become ready within ${timeoutMs}ms ` +
      `(last error: ${lastError instanceof Error ? lastError.message : lastError}). ` +
      `Is the dev server running?`
  );
}
