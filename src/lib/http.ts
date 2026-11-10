import { ZodError } from "zod";
import { checkRateLimit, clientIp } from "./ratelimit";

/** Largest request body accepted by API routes (the biggest legit body is a ~1 KB chat message). */
export const MAX_BODY_BYTES = 64 * 1024;

const isProd = process.env.NODE_ENV === "production";

/** Whether `POST /api/reset` is allowed. Disabled only by `CTRLZ_ALLOW_RESET=0`. */
export function resetAllowed(): boolean {
  return process.env.CTRLZ_ALLOW_RESET !== "0";
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Domain errors thrown by src/lib with a well-defined HTTP meaning. */
const KNOWN_ERRORS: { test: RegExp; status: number }[] = [
  { test: /^unknown (lineage node|incident|event) /, status: 404 },
  { test: /^no active guardrail/, status: 409 },
  { test: /^baseline guardrail cannot be reverted/, status: 409 },
  { test: /^incident has no revoked memory write/, status: 409 },
];

function newRequestId(): string {
  return crypto.randomUUID();
}

function log(entry: Record<string, unknown>, level: "info" | "warn" | "error") {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...entry });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

interface BodyCheck {
  /** True when the body is empty or not valid JSON, so a SyntaxError from req.json() is the client's fault. */
  notJson: boolean;
  error?: HttpError;
}

/** Inspects a clone of the body so the route can still read the original stream. */
async function checkBody(req: Request): Promise<BodyCheck> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { notJson: true, error: new HttpError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`) };
  }
  let text: string;
  try {
    text = await req.clone().text();
  } catch {
    return { notJson: true, error: new HttpError(400, "unreadable request body") };
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { notJson: true, error: new HttpError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`) };
  }
  if (text.trim() === "") return { notJson: true };
  try {
    JSON.parse(text);
    return { notJson: false };
  } catch {
    return { notJson: true, error: new HttpError(400, "malformed JSON body") };
  }
}

interface ErrorReply {
  status: number;
  body: Record<string, unknown>;
}

function toErrorReply(e: unknown, bodyNotJson: boolean): ErrorReply {
  if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...e.extra } };
  if (e instanceof ZodError) return { status: 400, body: { error: "invalid request", issues: e.issues } };
  // req.json() on an empty/garbled body. Internal JSON.parse failures (e.g. LLM output) stay 500.
  if (e instanceof SyntaxError && bodyNotJson) return { status: 400, body: { error: "malformed JSON body" } };
  const message = e instanceof Error ? e.message : String(e);
  const known = KNOWN_ERRORS.find((k) => k.test.test(message));
  if (known) return { status: known.status, body: { error: message } };
  // The message is surfaced to the UI; stacks are only ever logged (and only outside production).
  return { status: 500, body: { error: message } };
}

function finalize(res: Response, requestId: string, extra?: Record<string, string>): Response {
  let out = res;
  try {
    res.headers.set("Cache-Control", "no-store");
  } catch {
    // Immutable headers (e.g. a Response produced by fetch()): copy into a mutable response.
    out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
    out.headers.set("Cache-Control", "no-store");
  }
  out.headers.set("x-request-id", requestId);
  for (const [k, v] of Object.entries(extra ?? {})) out.headers.set(k, v);
  return out;
}

/**
 * Wraps a route handler: rate-limits mutating requests, rejects malformed/oversized bodies, maps errors to
 * proper status codes as JSON (never an HTML error page, never a stack trace), sets `Cache-Control: no-store`
 * and `x-request-id`, and writes one structured JSON log line per request.
 *
 * `fn` may return plain data (serialized as JSON with 200) or a ready `Response`.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A): Promise<Response> => {
    const t0 = performance.now();
    const req = args[0] instanceof Request ? args[0] : null;
    const method = req?.method ?? "GET";
    let path = "";
    if (req) {
      try {
        path = new URL(req.url).pathname;
      } catch {
        path = req.url;
      }
    }
    const requestId = req?.headers.get("x-request-id")?.slice(0, 128) || newRequestId();
    const ip = req ? clientIp(req.headers) : "unknown";
    let extraHeaders: Record<string, string> | undefined;
    let res: Response;
    let failure: unknown;

    let bodyNotJson = false;
    try {
      if (req && method !== "GET" && method !== "HEAD") {
        const rl = checkRateLimit(ip);
        extraHeaders = { "X-RateLimit-Limit": String(rl.limit), "X-RateLimit-Remaining": String(rl.remaining) };
        if (!rl.ok) {
          extraHeaders["Retry-After"] = String(rl.retryAfterSec);
          throw new HttpError(429, "rate limit exceeded", { retryAfterSec: rl.retryAfterSec });
        }
        if (path === "/api/reset" && !resetAllowed()) {
          throw new HttpError(403, "reset is disabled on this deployment (CTRLZ_ALLOW_RESET=0)");
        }
        const body = await checkBody(req);
        bodyNotJson = body.notJson;
        if (body.error) throw body.error;
      }
      const result = await fn(...args);
      res = result instanceof Response ? result : Response.json(result ?? null);
    } catch (e) {
      failure = e;
      const reply = toErrorReply(e, bodyNotJson);
      res = Response.json({ ...reply.body, requestId }, { status: reply.status });
    }

    const status = res.status;
    const entry: Record<string, unknown> = { method, path, status, ms: Math.round(performance.now() - t0), requestId, ip };
    if (failure !== undefined) {
      entry.error = failure instanceof Error ? failure.message : String(failure);
      if (status >= 500 && !isProd && failure instanceof Error) entry.stack = failure.stack;
    }
    log(entry, status >= 500 ? "error" : status >= 400 ? "warn" : "info");
    return finalize(res, requestId, extraHeaders);
  };
}
