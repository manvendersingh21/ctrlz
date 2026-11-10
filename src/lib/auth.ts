/**
 * HTTP Basic auth helpers. Web-platform APIs only (Web Crypto, TextEncoder, atob) so this module is safe to
 * import from `src/proxy.ts` regardless of the runtime the proxy ends up on — no `node:` imports here.
 */

export const AUTH_REALM = "ctrlz";

export interface BasicCredentials {
  user: string;
  pass: string;
}

/** Parses `CTRLZ_BASIC_AUTH="user:pass"`. Returns null when unset or malformed (auth disabled). */
export function configuredCredentials(raw: string | undefined = process.env.CTRLZ_BASIC_AUTH): BasicCredentials | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  if (i <= 0 || i === raw.length - 1) return null;
  return { user: raw.slice(0, i), pass: raw.slice(i + 1) };
}

/** Decodes an `Authorization: Basic <base64>` header value into credentials, or null if absent/invalid. */
export function parseBasicAuthHeader(header: string | null): BasicCredentials | null {
  if (!header) return null;
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header);
  if (!m) return null;
  let decoded: string;
  try {
    const bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/**
 * Constant-time string equality. Both inputs are hashed first so the comparison always runs over 32 bytes,
 * hiding length differences, then compared with an XOR accumulator that never short-circuits.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/** True when the request's Authorization header matches the expected credentials. */
export async function isAuthorized(authorization: string | null, expected: BasicCredentials): Promise<boolean> {
  const got = parseBasicAuthHeader(authorization) ?? { user: "", pass: "" };
  // Evaluate both comparisons unconditionally so timing does not reveal which half was wrong.
  const [userOk, passOk] = await Promise.all([timingSafeEqual(got.user, expected.user), timingSafeEqual(got.pass, expected.pass)]);
  return userOk && passOk;
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "authentication required" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}
