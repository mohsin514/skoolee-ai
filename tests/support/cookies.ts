/**
 * Set-Cookie parsing and a cookie jar.
 *
 * The suites assert on cookie *attributes*, not just the value, because the
 * defect being fixed is that logout tore the cookie down with a different
 * attribute set than login used to create it. So this keeps the raw attributes
 * rather than collapsing them into "is the cookie set".
 */

export interface ParsedCookie {
  name: string;
  value: string;
  /** Present only when the header carried it; `null` means absent. */
  maxAge: number | null;
  path: string | null;
  domain: string | null;
  expires: string | null;
  httpOnly: boolean;
  secure: boolean;
  /** Lower-cased ("lax" / "strict" / "none"), or null when absent. */
  sameSite: string | null;
  raw: string;
}

export function parseSetCookie(raw: string): ParsedCookie {
  const parts = raw.split(";");
  const [namePart = "", ...attrParts] = parts;

  const eq = namePart.indexOf("=");
  const name = (eq === -1 ? namePart : namePart.slice(0, eq)).trim();
  const value = eq === -1 ? "" : namePart.slice(eq + 1).trim();

  const cookie: ParsedCookie = {
    name,
    value,
    maxAge: null,
    path: null,
    domain: null,
    expires: null,
    httpOnly: false,
    secure: false,
    sameSite: null,
    raw,
  };

  for (const attr of attrParts) {
    const trimmed = attr.trim();
    if (!trimmed) continue;

    const aEq = trimmed.indexOf("=");
    const key = (aEq === -1 ? trimmed : trimmed.slice(0, aEq)).trim().toLowerCase();
    const val = aEq === -1 ? "" : trimmed.slice(aEq + 1).trim();

    switch (key) {
      case "max-age": {
        const n = Number(val);
        cookie.maxAge = Number.isFinite(n) ? n : null;
        break;
      }
      case "path":
        cookie.path = val;
        break;
      case "domain":
        cookie.domain = val;
        break;
      case "expires":
        cookie.expires = val;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "samesite":
        cookie.sameSite = val.toLowerCase();
        break;
    }
  }

  return cookie;
}

/** Every Set-Cookie header on a response, in order. */
export function setCookies(response: Response): ParsedCookie[] {
  return response.headers.getSetCookie().map(parseSetCookie);
}

/** The last Set-Cookie for `name`, or undefined. Last wins, as browsers do. */
export function setCookie(response: Response, name: string): ParsedCookie | undefined {
  const all = setCookies(response).filter((c) => c.name === name);
  return all.length ? all[all.length - 1] : undefined;
}

/**
 * A cookie is "cleared" when the browser would drop it: empty value, or an
 * explicit instruction to expire it. Servers use several spellings of the same
 * intent (Max-Age=0, Max-Age=-1, Expires in the past), so all are accepted —
 * the attribute-mirroring assertions live in the cookie-contract suite, not
 * here, so this stays a question of effect rather than of style.
 */
export function isCleared(cookie: ParsedCookie | undefined): boolean {
  if (!cookie) return false;
  if (cookie.value === "") return true;
  if (cookie.maxAge !== null && cookie.maxAge <= 0) return true;
  if (cookie.expires && Number.isFinite(Date.parse(cookie.expires))) {
    return Date.parse(cookie.expires) <= Date.now();
  }
  return false;
}

/**
 * Minimal cookie jar: enough to carry a session across requests and to notice
 * when the server takes it away. Deliberately ignores domain and path scoping,
 * because every suite here talks to a single origin and every cookie involved
 * is Path=/ — modelling more would be fiction that could hide a real bug.
 */
export class CookieJar {
  private jar = new Map<string, string>();

  /** Applies every Set-Cookie on the response, honouring clears. */
  absorb(response: Response): this {
    for (const cookie of setCookies(response)) {
      if (isCleared(cookie)) this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, cookie.value);
    }
    return this;
  }

  get(name: string): string | undefined {
    return this.jar.get(name);
  }

  has(name: string): boolean {
    return this.jar.has(name);
  }

  set(name: string, value: string): this {
    this.jar.set(name, value);
    return this;
  }

  clear(): this {
    this.jar.clear();
    return this;
  }

  /** Serialised for a Cookie request header, or undefined when empty. */
  header(): string | undefined {
    if (this.jar.size === 0) return undefined;
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
