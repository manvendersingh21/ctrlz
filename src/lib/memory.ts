import { customAlphabet } from "nanoid";
import type { Document } from "mongodb";
import { cols, timed, VECTOR_INDEX, TEXT_INDEX, SIG_INDEX } from "./db";
import { embedOne, rerank } from "./embed";
import { evaluateWrite } from "./guardrails";
import { createHash } from "node:crypto";
import type { AgentId, GuardrailDoc, MemoryDoc, TrustTier, WriteCandidate } from "./types";

const nano = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);
export const newId = (prefix: string) => `${prefix}_${nano()}`;

export const MIN_TRUST = 0.5;

export function trustFor(c: WriteCandidate): number {
  if (c.sourceType === "tool_output") return 0.8;
  if (c.sourceType === "agent_inference") return 0.65;
  if (c.speaker === c.subject) return 0.9;
  if (c.speakerRole === "finance_admin") return 0.9;
  if (c.speakerRole === "employee") return 0.75;
  return 0.6;
}

export function tierFor(trust: number, c: WriteCandidate): TrustTier {
  if (c.sourceType === "tool_output" && trust >= 0.8) return "T1_verified";
  if (trust >= 0.9) return "T0_principal";
  if (trust >= 0.75) return "T1_verified";
  if (trust >= 0.6) return "T2_unverified";
  return "T3_external";
}

export async function permissionEpoch(): Promise<number> {
  const { system } = await cols();
  const d = await system.findOne({ _id: "permission_epoch" as never });
  return (d?.value as number) ?? 1;
}

export async function activeGuardrail(): Promise<GuardrailDoc> {
  const { guardrails } = await cols();
  const g = await guardrails.findOne({ status: "active" }, { sort: { version: -1 } });
  if (!g) throw new Error("no active guardrail; run /api/reset");
  return g;
}

/** Highest similarity between a candidate and any revoked memory, via Atlas Vector Search. */
export async function revokedSimilarity(embedding: number[], step: string): Promise<number> {
  const { signatures } = await cols();
  const pipeline: Document[] = [
    { $vectorSearch: { index: SIG_INDEX, path: "embedding", queryVector: embedding, numCandidates: 50, limit: 1 } },
    { $project: { _id: 1, text: 1, score: { $meta: "vectorSearchScore" } } },
  ];
  const hits = await timed(
    { step, feature: "Vector Search · revoked signatures", collection: "revoked_signatures", detail: redactVectors(pipeline) },
    () => signatures.aggregate(pipeline).toArray(),
    (r) => r.length,
  ).catch(() => [] as Document[]);
  // vectorSearchScore for cosine is (1 + cos) / 2
  return hits.length ? 2 * (hits[0].score as number) - 1 : 0;
}

export interface WriteContext {
  agentId: AgentId;
  messageId?: string;
  actionId?: string;
  derivedFrom?: string[];
  step: string;
}

export async function writeMemory(c: WriteCandidate, ctx: WriteContext) {
  const { memories, lineage, writeLog } = await cols();
  const guard = await activeGuardrail();
  const embedding = await embedOne(c.text, "document");
  const sim = guard.rules.some((r) => r.match.similarToRevokedAbove !== undefined) ? await revokedSimilarity(embedding, ctx.step) : 0;
  const d = evaluateWrite(c, guard.rules, sim);
  const writeId = newId("w");
  const memoryId = newId("mem");
  const parents = [ctx.messageId, ctx.actionId, ...(ctx.derivedFrom ?? [])].filter(Boolean) as string[];
  // Non-amplification: a derived memory can never be more trusted than the least-trusted record it came from.
  const upstreamIds = [...(ctx.derivedFrom ?? [])];
  if (ctx.actionId) {
    const act = await (await cols()).actions.findOne({ _id: ctx.actionId }, { projection: { justified_by: 1 } });
    upstreamIds.push(...(act?.justified_by ?? []));
  }
  const upstream = upstreamIds.length ? await memories.find({ _id: { $in: upstreamIds } }, { projection: { trust: 1 } }).toArray() : [];
  const trust = Math.min(trustFor(c), ...upstream.map((u) => u.trust));
  const epoch = await permissionEpoch();

  await writeLog.insertOne({
    _id: writeId as never,
    ts: new Date(),
    messageId: ctx.messageId ?? null,
    candidate: c,
    embedding,
    decision: d.decision,
    hits: d.hits,
    similarity: Math.round(sim * 1000) / 1000,
    guardVersion: guard.version,
    memoryId: d.decision === "block" ? null : memoryId,
    agentId: ctx.agentId,
  });
  if (d.decision === "block") return { decision: d, memory: null };

  const doc: MemoryDoc = {
    _id: memoryId,
    agentId: ctx.agentId,
    scope: c.scope,
    subject: c.subject,
    kind: c.kind,
    category: c.category,
    text: c.text,
    embedding,
    provenance: { source: c.sourceType, trust_tier: tierFor(trust, c), messageId: ctx.messageId, actionId: ctx.actionId, speaker: c.speaker, speakerRole: c.speakerRole },
    derivedFrom: ctx.derivedFrom ?? [],
    parents,
    supersedes: [],
    conflicts_with: [],
    idempotency_key: `mem:${createHash("sha256").update([c.scope, c.text, ctx.messageId ?? ctx.actionId ?? ""].join("|")).digest("hex").slice(0, 16)}`,
    txn_id: null,
    permission_epoch: epoch,
    retention: { ttl_days: c.kind === "episodic" ? 90 : null },
    trust,
    status: d.decision === "hold" ? "held" : "active",
    guardVersion: guard.version,
    writeId,
    createdAt: new Date(),
  };
  await memories.insertOne(doc);
  await lineage.insertOne({
    _id: memoryId,
    kind: "memory",
    parents,
    agentId: ctx.agentId,
    label: c.text,
    status: doc.status,
    createdAt: doc.createdAt,
  });
  return { decision: d, memory: doc };
}

export function redactVectors(p: unknown): unknown {
  return JSON.parse(
    JSON.stringify(p, (k, v) => (k === "queryVector" && Array.isArray(v) ? `[${v.length} floats · ${v.slice(0, 3).map((x: number) => x.toFixed(3)).join(", ")}, …]` : v)),
  );
}

export function retrievalFilter(scopes: string[]) {
  return { status: "active" as const, scope: { $in: scopes }, trust: { $gte: MIN_TRUST } };
}

export interface Retrieved {
  _id: string;
  text: string;
  category: string;
  scope: string;
  trust: number;
  score: number;
  provenance: MemoryDoc["provenance"];
}

/**
 * Hybrid retrieval: $rankFusion over $vectorSearch (Voyage embeddings) and Atlas Search full-text,
 * both pre-filtered so quarantined/held/low-trust memory is never a candidate. Then Voyage rerank.
 */
export async function retrieve(query: string, scopes: string[], step: string, k = 6): Promise<Retrieved[]> {
  const { memories } = await cols();
  const qv = await embedOne(query, "query");
  const filter = retrievalFilter(scopes);
  const vectorStage = { $vectorSearch: { index: VECTOR_INDEX, path: "embedding", queryVector: qv, numCandidates: 100, limit: 12, filter } };
  const textStage = {
    $search: {
      index: TEXT_INDEX,
      compound: {
        must: [{ text: { query, path: "text" } }],
        filter: [{ equals: { path: "status", value: "active" } }, { in: { path: "scope", value: scopes } }, { range: { path: "trust", gte: MIN_TRUST } }],
      },
    },
  };
  const project = { $project: { embedding: 0 } };
  const hybrid: Document[] = [
    { $rankFusion: { input: { pipelines: { vector: [vectorStage], text: [textStage, { $limit: 12 }] } }, combination: { weights: { vector: 0.7, text: 0.3 } } } },
    { $limit: 12 },
    { $addFields: { score: { $meta: "score" } } },
    project,
  ];
  let docs: Document[];
  try {
    docs = await timed(
      { step, feature: "$rankFusion · Vector Search + Atlas Search (pre-filtered)", collection: "memories", detail: redactVectors(hybrid) },
      () => memories.aggregate(hybrid).toArray(),
      (r) => r.length,
    );
  } catch {
    const vec: Document[] = [vectorStage, { $addFields: { score: { $meta: "vectorSearchScore" } } }, project];
    docs = await timed(
      { step, feature: "Vector Search (pre-filtered)", collection: "memories", detail: redactVectors(vec) },
      () => memories.aggregate(vec).toArray(),
      (r) => r.length,
    );
  }
  // Search indexes are eventually consistent: re-check status against the collection so a memory
  // quarantined a moment ago can never be served from a stale index.
  const live = new Set(
    (await memories.find({ _id: { $in: docs.map((d) => d._id as string) }, ...retrievalFilter(scopes) }, { projection: { _id: 1 } }).toArray()).map((d) => d._id),
  );
  docs = docs.filter((d) => live.has(d._id as string));
  const order = await rerank(query, docs.map((d) => d.text as string), k);
  return order.map(({ index, score }) => {
    const d = docs[index];
    return { _id: d._id, text: d.text, category: d.category, scope: d.scope, trust: d.trust, score: score || (d.score as number), provenance: d.provenance } as Retrieved;
  });
}

/** Same query without the trust/status pre-filter, to show what a naive memory layer would have served. */
export async function retrieveUnfiltered(query: string, k = 6) {
  const { memories } = await cols();
  const qv = await embedOne(query, "query");
  return memories
    .aggregate([
      { $vectorSearch: { index: VECTOR_INDEX, path: "embedding", queryVector: qv, numCandidates: 100, limit: k } },
      { $project: { _id: 1, text: 1, status: 1, score: { $meta: "vectorSearchScore" } } },
    ])
    .toArray();
}
