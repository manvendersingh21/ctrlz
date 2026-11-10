/**
 * In-memory sliding-window rate limiter keyed by client IP.
 *
 * Each key keeps the timestamps of its hits inside the last window (a sliding log, capped at `limit` entries,
 * so memory per key is bounded). Stale keys are swept periodically and the total key count is capped, so a
 * flood of spoofed IPs cannot grow memory without bound. State lives on `globalThis` so it survives dev HMR.
 *
 * This is per-process: with several replicas each enforces its own budget. Good enough to stop a runaway
 * client or script hammering the LLM/Atlas-backed endpoints; use a shared store for strict global limits.
 */

export const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
const SWEEP_EVERY_MS = 30_000;

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the next request would be accepted (0 when ok). */
  retryAfterSec: number;
}

interface LimiterState {
  hits: Map<string, number[]>;
  lastSweep: number;
}

const g = globalThis as unknown as { _ctrlzRateLimit?: LimiterState };
const state: LimiterState = (g._ctrlzRateLimit ??= { hits: new Map(), lastSweep: Date.now() });

export function rateLimitPerMin(): number {
  const n = Number(process.env.CTRLZ_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

/** Client IP from the first `x-forwarded-for` hop, then `x-real-ip`, else "unknown". */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}

function sweep(now: number) {
  const cutoff = now - WINDOW_MS;
  for (const [key, ts] of state.hits) {
    if (ts.length === 0 || ts[ts.length - 1] <= cutoff) state.hits.delete(key);
  }
  // Still over budget (many active keys): drop the oldest-inserted keys. Map iteration is insertion order.
  if (state.hits.size > MAX_KEYS) {
    let excess = state.hits.size - MAX_KEYS;
    for (const key of state.hits.keys()) {
      if (excess-- <= 0) break;
      state.hits.delete(key);
    }
  }
  state.lastSweep = now;
}

/** Records a hit for `key` and reports whether it is within the limit. Rejected hits are not counted. */
export function checkRateLimit(key: string, limit: number = rateLimitPerMin(), now: number = Date.now()): RateLimitResult {
  if (now - state.lastSweep > SWEEP_EVERY_MS || state.hits.size > MAX_KEYS) sweep(now);

  const cutoff = now - WINDOW_MS;
  const prev = state.hits.get(key) ?? [];
  let start = 0;
  while (start < prev.length && prev[start] <= cutoff) start++;
  const ts = start > 0 ? prev.slice(start) : prev;

  if (ts.length >= limit) {
    state.hits.set(key, ts);
    const retryAfterSec = Math.max(1, Math.ceil((ts[0] + WINDOW_MS - now) / 1000));
    return { ok: false, limit, remaining: 0, retryAfterSec };
  }

  ts.push(now);
  state.hits.set(key, ts);
  return { ok: true, limit, remaining: limit - ts.length, retryAfterSec: 0 };
}

/** Test helper: forget all recorded hits. */
export function resetRateLimits() {
  state.hits.clear();
  state.lastSweep = Date.now();
}
