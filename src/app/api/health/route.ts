import pkg from "../../../../package.json";
import { publicConfig } from "@/lib/config";
import { client, db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PING_TIMEOUT_MS = 2000;
const startedAt = Date.now();

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** True when every Atlas Search / Vector Search index on the app's collections is queryable. */
async function searchIndexesQueryable(): Promise<boolean | undefined> {
  try {
    const d = await db();
    const lists = await Promise.all(
      ["memories", "revoked_signatures"].map((name) => d.collection(name).listSearchIndexes().toArray()),
    );
    const all = lists.flat();
    if (all.length === 0) return false;
    return all.every((i) => (i as { queryable?: boolean }).queryable === true);
  } catch {
    // Search index commands unsupported on this deployment (e.g. plain mongod) — unknown, not down.
    return undefined;
  }
}

export async function GET() {
  let mongo: "up" | "down" = "down";
  let error: string | undefined;
  let indexes: boolean | undefined;
  try {
    await withTimeout(
      (async () => (await client()).db("admin").command({ ping: 1 }))(),
      PING_TIMEOUT_MS,
      "mongo ping",
    );
    mongo = "up";
    indexes = await withTimeout(searchIndexesQueryable(), PING_TIMEOUT_MS, "search index check").catch(() => undefined);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const ok = mongo === "up";
  const body = {
    ok,
    mongo,
    ...(indexes === undefined ? {} : { searchIndexesQueryable: indexes }),
    ...(ok || process.env.NODE_ENV === "production" ? {} : { error }),
    config: publicConfig(),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    version: pkg.version,
  };
  return Response.json(body, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
