import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { config } from "./config";
import type {
  ActionDoc,
  AtlasOp,
  CompensationDoc,
  GuardrailDoc,
  LedgerDoc,
  LineageDoc,
  MemoryDoc,
  MessageDoc,
} from "./types";

const g = globalThis as unknown as { _ctrlzClient?: Promise<MongoClient>; _ctrlzGrader?: Promise<MongoClient> };

export function client(): Promise<MongoClient> {
  if (!g._ctrlzClient) {
    // Drop a failed attempt so the next request reconnects instead of failing until restart.
    g._ctrlzClient = new MongoClient(config.mongoUri, { appName: "ctrlz-harness", maxPoolSize: 20, serverSelectionTimeoutMS: 5000 })
      .connect()
      .catch((e) => {
        g._ctrlzClient = undefined;
        throw e;
      });
  }
  return g._ctrlzClient;
}

/** Separate principal whose role can read the held-out eval set; the harness principal cannot. */
export function graderClient(): Promise<MongoClient> | null {
  if (!config.graderUri) return null;
  if (!g._ctrlzGrader) {
    g._ctrlzGrader = new MongoClient(config.graderUri, { appName: "ctrlz-grader", maxPoolSize: 5, serverSelectionTimeoutMS: 5000 })
      .connect()
      .catch((e) => {
        g._ctrlzGrader = undefined;
        throw e;
      });
  }
  return g._ctrlzGrader;
}

export async function db(): Promise<Db> {
  return (await client()).db(config.dbName);
}

export const EVAL_DB = `${config.dbName}_eval`;

export async function cols() {
  const d = await db();
  return {
    db: d,
    memories: d.collection<MemoryDoc>("memories"),
    actions: d.collection<ActionDoc>("actions"),
    messages: d.collection<MessageDoc>("messages"),
    lineage: d.collection<LineageDoc>("lineage"),
    ledger: d.collection<LedgerDoc>("sandbox_ledger"),
    compensations: d.collection<CompensationDoc>("compensations"),
    incidents: d.collection<Document>("incidents"),
    guardrails: d.collection<GuardrailDoc>("guardrails"),
    writeLog: d.collection<Document>("write_log"),
    evalDev: d.collection<Document>("eval_dev"),
    evalRuns: d.collection<Document>("eval_runs"),
    signatures: d.collection<Document>("revoked_signatures"),
    checkpoints: d.collection<Document>("worker_checkpoints"),
    ops: d.collection<AtlasOp>("atlas_ops"),
    traces: d.collection<Document>("traces"),
    system: d.collection<Document>("system"),
    raindrop: d.collection<Document>("raindrop_events"),
  };
}

export type Cols = Awaited<ReturnType<typeof cols>>;

/** Records an Atlas operation (pipeline, timing) so the UI can show what ran under the hood. */
export async function recordOp(op: Omit<AtlasOp, "ts">) {
  const { ops } = await cols();
  await ops.insertOne({ ...op, ts: new Date() });
}

export async function timed<T>(
  meta: { step: string; feature: string; collection: string; detail: unknown; incidentId?: string },
  fn: () => Promise<T>,
  count?: (r: T) => number,
): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  await recordOp({ ...meta, ms, n: count ? count(r) : undefined });
  return r;
}

export const VECTOR_INDEX = "memory_vector_index";
export const TEXT_INDEX = "memory_text_index";
export const SIG_INDEX = "signature_vector_index";

export function vectorIndexDefinition() {
  return {
    fields: [
      { type: "vector", path: "embedding", numDimensions: config.embed.dimensions, similarity: "cosine" },
      { type: "filter", path: "status" },
      { type: "filter", path: "scope" },
      { type: "filter", path: "trust" },
      { type: "filter", path: "agentId" },
    ],
  };
}

async function ensureSearchIndex<T extends Document>(coll: Collection<T>, name: string, type: "search" | "vectorSearch", definition: Document) {
  const existing = await coll.listSearchIndexes(name).toArray().catch(() => []);
  if (existing.length === 0) {
    await coll.createSearchIndex({ name, type, definition });
  }
}

export async function ensureSchema() {
  const c = await cols();
  const existing = new Set((await c.db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name));
  for (const name of [
    "memories",
    "actions",
    "messages",
    "lineage",
    "sandbox_ledger",
    "compensations",
    "incidents",
    "guardrails",
    "write_log",
    "eval_dev",
    "eval_runs",
    "revoked_signatures",
    "worker_checkpoints",
    "atlas_ops",
    "traces",
    "system",
    "raindrop_events",
  ]) {
    if (!existing.has(name)) await c.db.createCollection(name);
  }
  await Promise.all([
    c.ledger.createIndex({ idempotency_key: 1 }, { unique: true }),
    c.actions.createIndex({ idempotency_key: 1 }, { unique: true }),
    c.compensations.createIndex({ idempotency_key: 1 }, { unique: true }),
    c.lineage.createIndex({ parents: 1 }),
    c.memories.createIndex({ status: 1, scope: 1 }),
    c.ops.createIndex({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 6 }),
    c.writeLog.createIndex({ ts: -1 }),
    c.raindrop.createIndex({ eventId: 1, ts: 1 }),
  ]);
  await ensureSearchIndex(c.memories, VECTOR_INDEX, "vectorSearch", vectorIndexDefinition());
  await ensureSearchIndex(c.memories, TEXT_INDEX, "search", {
    mappings: {
      dynamic: false,
      fields: { text: { type: "string" }, status: { type: "token" }, scope: { type: "token" }, trust: { type: "number" } },
    },
  });
  await ensureSearchIndex(c.signatures, SIG_INDEX, "vectorSearch", {
    fields: [{ type: "vector", path: "embedding", numDimensions: config.embed.dimensions, similarity: "cosine" }],
  });
}

export async function waitForSearchIndexes(timeoutMs = 60000) {
  const c = await cols();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const a = await c.memories.listSearchIndexes().toArray();
    const b = await c.signatures.listSearchIndexes().toArray();
    if ([...a, ...b].every((i) => (i as { queryable?: boolean }).queryable)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
