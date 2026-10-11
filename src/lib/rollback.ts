import type { ClientSession, Document } from "mongodb";
import { MongoServerError } from "mongodb";
import { executePlan, planTask, type PlannedCall } from "./agent";
import { client, cols, timed } from "./db";
import { newId } from "./memory";
import { beginTurn, signal } from "./raindrop";
import { stripeProvider } from "./stripe";
import { compensationFor } from "./sandbox";
import type { AgentId, CompensationDoc, LedgerDoc } from "./types";

export interface TaintNode {
  _id: string;
  kind: "message" | "memory" | "action";
  depth: number;
  label: string;
}

interface ReplayPlan {
  requestMessageId: string;
  agentId: AgentId;
  speaker: string;
  text: string;
  calls: PlannedCall[];
  retrieved: string[];
  taintedActions: string[];
}

export interface IncidentDoc {
  _id: string;
  rootId: string;
  reason: string;
  status: "opening" | "quarantined" | "compensating" | "replaying" | "resolved";
  txnId: string;
  taint: TaintNode[];
  replayPlans: ReplayPlan[];
  kept: { effectId: string; actionId: string; summary: string; why: string; before: Record<string, unknown>; replay: Record<string, unknown> }[];
  toCompensate: string[];
  compensations: { effectId: string; summary: string; outcome: "executed" | "deduplicated" }[];
  replayed: { actionId: string; tool: string; summary: string; deduplicated: boolean }[];
  timeline: { stage: string; at: Date; ms: number; note: string }[];
  createdAt: Date;
  resolvedAt?: Date;
  /** Set when permission_epoch was bumped for this incident (idempotent quarantine resume). */
  epochInc?: boolean;
}

export type IncidentCheckpointStage = "quarantine" | "planning" | "compensating" | "resolved";

/** Which pipeline stage runIncident should execute next (pure; safe to unit-test). */
export function incidentResumeStage(
  checkpoint: { stage?: string } | null | undefined,
  inc: Pick<IncidentDoc, "replayPlans" | "toCompensate" | "kept" | "status">,
): IncidentCheckpointStage {
  const stage = checkpoint?.stage;
  if (stage === "resolved") return "resolved";
  if (stage === "compensating") return "compensating";
  if (stage === "planning") return "planning";
  if (stage === "quarantine") return "quarantine";
  if ((inc.replayPlans?.length ?? 0) > 0 || (inc.toCompensate?.length ?? 0) > 0 || (inc.kept?.length ?? 0) > 0) return "compensating";
  if (inc.status === "quarantined") return "planning";
  return "compensating";
}

type EffectSlice = { _id: string; actionId: string; summary: string; idempotency_key: string; details: Record<string, unknown> };

/** Split live effects into kept (replay reproduces key) vs compensate; attach before/replay args for the UI. */
export function planKeepCompensate(effects: EffectSlice[], replayPlans: ReplayPlan[]) {
  const replayByKey = new Map<string, Record<string, unknown>>();
  for (const p of replayPlans) for (const c of p.calls) replayByKey.set(c.key, c.args);
  const kept: IncidentDoc["kept"] = [];
  const toCompensate: string[] = [];
  for (const e of effects) {
    const replay = replayByKey.get(e.idempotency_key);
    if (replay) {
      kept.push({
        effectId: e._id,
        actionId: e.actionId,
        summary: e.summary,
        why: "clean replay reproduces the identical effect",
        before: e.details,
        replay,
      });
    } else toCompensate.push(e._id);
  }
  return { kept, toCompensate };
}

const now = () => performance.now();

/** Causal blast radius: every node that (transitively) lists the root as a parent. */
export async function blastRadius(rootId: string, incidentId?: string): Promise<TaintNode[]> {
  const { lineage } = await cols();
  const pipeline: Document[] = [
    { $match: { _id: rootId } },
    {
      $graphLookup: {
        from: "lineage",
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "parents",
        as: "downstream",
        depthField: "depth",
        maxDepth: 12,
      },
    },
    { $project: { kind: 1, label: 1, "downstream._id": 1, "downstream.kind": 1, "downstream.label": 1, "downstream.depth": 1 } },
  ];
  const [root] = await timed(
    { step: "incident:trace", feature: "$graphLookup · causal lineage", collection: "lineage", detail: pipeline, incidentId },
    () => lineage.aggregate(pipeline).toArray(),
    (r) => (r[0]?.downstream?.length ?? 0) + (r.length ? 1 : 0),
  );
  if (!root) throw new Error(`unknown lineage node ${rootId}`);
  const nodes: TaintNode[] = [{ _id: root._id, kind: root.kind, depth: 0, label: root.label }];
  for (const d of (root.downstream as Document[]).sort((a, b) => a.depth - b.depth)) {
    nodes.push({ _id: d._id, kind: d.kind, depth: d.depth + 1, label: d.label });
  }
  return nodes;
}

async function withTxn<T>(fn: (session?: ClientSession) => Promise<T>): Promise<{ value: T; transactional: boolean }> {
  const session = (await client()).startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return { value: out, transactional: true };
  } catch (e) {
    // Standalone servers can't run transactions; every step below is idempotent, so degrade to sequential writes.
    if (e instanceof MongoServerError && (e.code === 20 || /Transaction numbers/i.test(e.message))) {
      return { value: await fn(undefined), transactional: false };
    }
    throw e;
  } finally {
    await session.endSession();
  }
}

function signatureId(incidentId: string, memoryId: string) {
  return `sig:${incidentId}:${memoryId}`;
}

async function quarantineIncident(inc: IncidentDoc): Promise<IncidentDoc> {
  const c = await cols();
  const { incidentId, txnId, taint, rootId } = { incidentId: inc._id, txnId: inc.txnId, taint: inc.taint, rootId: inc.rootId };
  const memIds = taint.filter((n) => n.kind === "memory").map((n) => n._id);
  const actIds = taint.filter((n) => n.kind === "action").map((n) => n._id);
  const t1 = now();
  // Revoke the root memory, or — when rolling back a whole source message — every memory written from it.
  const revoked = await c.memories.find({ _id: { $in: memIds }, $or: [{ _id: rootId }, { "provenance.messageId": rootId }] }).toArray();
  const { transactional } = await withTxn(async (session) => {
    const q = { incidentId, at: new Date() };
    for (const n of taint) {
      const set = { quarantine: { ...q, depth: n.depth } };
      if (n.kind === "memory") await c.memories.updateOne({ _id: n._id }, { $set: { status: "quarantined", ...set, txn_id: txnId } }, { session });
      if (n.kind === "action") await c.actions.updateOne({ _id: n._id }, { $set: { status: "quarantined", ...set, txn_id: txnId } }, { session });
      if (n.kind !== "message" || n._id === rootId) await c.lineage.updateOne({ _id: n._id }, { $set: { status: "quarantined" } }, { session });
    }
    for (const m of revoked) {
      const _id = signatureId(incidentId, m._id);
      await c.signatures.updateOne(
        { _id: _id as never },
        { $setOnInsert: { memoryId: m._id, text: m.text, embedding: m.embedding, incidentId, at: new Date() } },
        { upsert: true, session },
      );
    }
    if (!inc.epochInc) {
      await c.system.updateOne({ _id: "permission_epoch" as never }, { $inc: { value: 1 } }, { session, upsert: true });
    }
    await c.incidents.updateOne(
      { _id: incidentId as never },
      { $set: { status: "quarantined", epochInc: true } },
      { session },
    );
  });
  const quarantineNote = transactional
    ? `txn ${txnId}: quarantined ${memIds.length + actIds.length} records, revoked ${revoked.length} signature(s), epoch+1`
    : `sequential fallback — standalone, not atomic · ${txnId}: quarantined ${memIds.length + actIds.length} records, revoked ${revoked.length} signature(s), epoch+1`;
  const timeline = [
    ...inc.timeline.filter((t) => t.stage !== "quarantine"),
    { stage: "quarantine", at: new Date(), ms: Math.round(now() - t1), note: quarantineNote },
  ];
  await c.incidents.updateOne({ _id: incidentId as never }, { $set: { timeline } });
  await c.checkpoints.updateOne({ _id: incidentId as never }, { $set: { stage: "planning", updatedAt: new Date() } }, { upsert: true });
  await timed(
    {
      step: "incident:quarantine",
      feature: transactional ? "Multi-document transaction" : "Sequential writes (standalone · not ACID)",
      collection: "memories, actions, lineage, revoked_signatures",
      detail: { txnId, transactional, memories: memIds, actions: actIds },
      incidentId,
    },
    async () => null,
  );
  return (await c.incidents.findOne({ _id: incidentId as never })) as unknown as IncidentDoc;
}

async function planIncidentReplay(inc: IncidentDoc): Promise<IncidentDoc> {
  const c = await cols();
  const actIds = inc.taint.filter((n) => n.kind === "action").map((n) => n._id);
  const t2 = now();
  // Plan the clean replay BEFORE compensating, so effects the replay would reproduce are kept, not churned.
  const tainted = await c.actions.find({ _id: { $in: actIds } }).sort({ createdAt: 1 }).toArray();
  const byRequest = new Map<string, string[]>();
  for (const a of tainted) byRequest.set(a.requestMessageId, [...(byRequest.get(a.requestMessageId) ?? []), a._id]);
  const replayPlans: ReplayPlan[] = [];
  for (const [requestMessageId, taintedActions] of byRequest) {
    const msg = await c.messages.findOne({ _id: requestMessageId });
    if (!msg) continue;
    const plan = await planTask(msg.agentId, msg.speaker, msg.text, requestMessageId, "incident:replay-plan");
    replayPlans.push({ requestMessageId, agentId: msg.agentId, speaker: msg.speaker, text: msg.text, calls: plan.calls, retrieved: plan.retrieved.map((r) => r._id), taintedActions });
  }
  const effects = await c.ledger.find({ actionId: { $in: actIds }, status: "live" }).toArray();
  const { kept, toCompensate } = planKeepCompensate(
    effects.map((e) => ({ _id: e._id, actionId: e.actionId, summary: e.summary, idempotency_key: e.idempotency_key, details: e.details as Record<string, unknown> })),
    replayPlans,
  );
  const timeline = [
    ...inc.timeline.filter((t) => t.stage !== "plan"),
    { stage: "plan", at: new Date(), ms: Math.round(now() - t2), note: `${replayPlans.length} request(s) to replay · ${toCompensate.length} to compensate · ${kept.length} kept` },
  ];
  await c.incidents.updateOne({ _id: inc._id as never }, { $set: { replayPlans, kept, toCompensate, timeline } });
  await c.checkpoints.updateOne(
    { _id: inc._id as never },
    { $set: { stage: "compensating", done: [], replayed: [], updatedAt: new Date() } },
    { upsert: true },
  );
  return (await c.incidents.findOne({ _id: inc._id as never })) as unknown as IncidentDoc;
}

/** Opens an incident: durable intent first, then runIncident advances quarantine → plan → compensate (resumable). */
export async function openIncident(rootId: string, reason: string) {
  const c = await cols();
  const incidentId = newId("inc");
  const txnId = newId("txn");
  const t0 = now();
  const taint = await blastRadius(rootId, incidentId);
  const memIds = taint.filter((n) => n.kind === "memory").map((n) => n._id);
  const actIds = taint.filter((n) => n.kind === "action").map((n) => n._id);
  const timeline: IncidentDoc["timeline"] = [
    { stage: "trace", at: new Date(), ms: Math.round(now() - t0), note: `${taint.length} nodes · ${memIds.length} memories · ${actIds.length} actions` },
  ];
  const doc: IncidentDoc = {
    _id: incidentId,
    rootId,
    reason,
    status: "opening",
    txnId,
    taint,
    replayPlans: [],
    kept: [],
    toCompensate: [],
    compensations: [],
    replayed: [],
    timeline,
    createdAt: new Date(),
  };
  await c.incidents.insertOne(doc as unknown as Document);
  await c.checkpoints.insertOne({ _id: incidentId as never, stage: "quarantine", done: [], replayed: [], updatedAt: new Date() });
  return runIncident(incidentId);
}

/** Resumable incident pipeline: quarantine → plan → compensate → replay. Safe to call again after a crash. */
export async function runIncident(incidentId: string) {
  const c = await cols();
  let inc = (await c.incidents.findOne({ _id: incidentId as never })) as unknown as IncidentDoc | null;
  if (!inc) throw new Error(`unknown incident ${incidentId}`);
  type Checkpoint = { stage?: string; done?: string[]; replayed?: string[] };
  const loadCp = async () => ((await c.checkpoints.findOne({ _id: incidentId as never })) as Checkpoint | null) ?? { done: [], replayed: [] };
  let cp = await loadCp();
  let stage = incidentResumeStage(cp, inc);
  // A resolved incident is a no-op on resume — and must not re-report to Raindrop.
  if (stage === "resolved") return inc;

  if (stage === "quarantine") {
    inc = await quarantineIncident(inc);
    cp = await loadCp();
    stage = incidentResumeStage(cp, inc);
  }
  if (stage === "planning") {
    inc = await planIncidentReplay(inc);
    cp = await loadCp();
    stage = incidentResumeStage(cp, inc);
  }
  if (stage === "resolved") return inc;

  const done = new Set<string>(cp.done ?? []);

  // The incident is its own Raindrop interaction; every stage and compensation is a tool span on it.
  const turn = await beginTurn({
    eventId: incidentId,
    event: "ctrlz_incident",
    userId: "ctrlz",
    convoId: "incidents",
    input: `Roll back ${inc.rootId}: ${inc.reason}`,
    properties: { root: inc.rootId, txn: inc.txnId, tainted_nodes: inc.taint.length, to_compensate: inc.toCompensate.length, kept: inc.kept.length },
  });
  for (const t of inc.timeline) await turn.tool(`incident.${t.stage}`, { incidentId }, { note: t.note }, { durationMs: t.ms });
  for (const k of inc.kept) await turn.tool("incident.keep", { effectId: k.effectId }, { summary: k.summary, why: k.why, before: k.before, replay: k.replay });

  const t0 = now();
  await c.incidents.updateOne({ _id: incidentId as never }, { $set: { status: "compensating" } });
  const effects = await c.ledger.find({ _id: { $in: inc.toCompensate } }).sort({ createdAt: -1 }).toArray();
  const comps: (Omit<IncidentDoc["compensations"][number], "outcome"> & { outcome: "executed" | "deduplicated" | "failed" })[] = [...inc.compensations];
  for (const [order, effect] of effects.entries()) {
    if (done.has(effect._id)) continue;
    const comp = compensationFor(effect);
    const key = `comp:${effect._id}`;
    const compDoc: CompensationDoc = {
      _id: newId("cmp"),
      incidentId,
      actionId: effect.actionId,
      effectId: effect._id,
      kind: comp.kind,
      idempotency_key: key,
      txn_id: inc.txnId,
      order,
      status: "pending",
      createdAt: new Date(),
    };
    await c.compensations.updateOne({ idempotency_key: key }, { $setOnInsert: compDoc }, { upsert: true });
    let outcome: "executed" | "deduplicated" | "failed" = "executed";
    const ledgerDoc: LedgerDoc = {
      _id: newId("fx"),
      idempotency_key: key,
      type: comp.kind,
      actionId: effect.actionId,
      agentId: effect.agentId,
      summary: comp.summary,
      details: comp.details,
      amount: effect.amount,
      compensates: effect._id,
      status: "live",
      createdAt: new Date(),
    };
    try {
      await timed(
        { step: "incident:compensate", feature: "Unique index · compensation exactly-once", collection: "sandbox_ledger", detail: { insertOne: { idempotency_key: key, type: comp.kind, compensates: effect._id } }, incidentId },
        () => c.ledger.insertOne(ledgerDoc),
      );
    } catch (e) {
      if (!(e instanceof MongoServerError && e.code === 11000)) throw e;
      outcome = "deduplicated";
    }
    let summary = comp.summary;
    let provider: LedgerDoc["provider"] = { name: "simulated" };
    if (effect.provider?.name === "stripe" && effect.provider.id) {
      provider = await stripeProvider.compensate(effect);
      if (provider.status === "succeeded") summary = `Refunded via Stripe test ${provider.id ?? ""}`.trim();
      else {
        outcome = "failed";
        summary = `Stripe refund FAILED: ${provider.error ?? provider.status}`;
      }
    }
    await c.ledger.updateOne({ idempotency_key: key }, { $set: { provider, summary } });
    if (outcome !== "failed") {
      await c.ledger.updateOne({ _id: effect._id }, { $set: { status: "reversed" } });
      await c.actions.updateOne({ _id: effect.actionId }, { $set: { status: "compensated" } });
      await c.lineage.updateOne({ _id: effect.actionId }, { $set: { status: "compensated" } });
      await c.compensations.updateOne({ idempotency_key: key }, { $set: { status: "done", outcome, doneAt: new Date() } });
      await c.checkpoints.updateOne({ _id: incidentId as never }, { $addToSet: { done: effect._id }, $set: { updatedAt: new Date() } });
    } else {
      // Left pending and out of the checkpoint, so resuming the incident retries it (Stripe's idempotency key makes that safe).
      await c.compensations.updateOne({ idempotency_key: key }, { $set: { outcome } });
    }
    comps.push({ effectId: effect._id, summary, outcome });
    await turn.tool(`compensate.${comp.kind}`, { effectId: effect._id, original: effect.summary }, { summary, outcome }, { properties: { actionId: effect.actionId, order } });
  }
  for (const k of inc.kept) await c.lineage.updateOne({ _id: k.actionId }, { $set: { status: "kept" } });
  const tCompensate = Math.round(now() - t0);

  const t1 = now();
  await c.incidents.updateOne({ _id: incidentId as never }, { $set: { status: "replaying", compensations: comps } });
  const replayedReqs = new Set<string>(cp.replayed ?? []);
  const replayed: IncidentDoc["replayed"] = [...inc.replayed];
  for (const p of inc.replayPlans) {
    if (replayedReqs.has(p.requestMessageId)) continue;
    // The replay reports as a fresh event linked to the original turn, so Raindrop can compare the two.
    const replayEventId = newId("msg");
    const replayTurn = await beginTurn({
      eventId: replayEventId,
      event: `${p.agentId}_turn_replay`,
      userId: p.speaker,
      convoId: p.agentId,
      input: p.text,
      properties: { replay_of: p.requestMessageId, incident: incidentId },
    });
    const out = await executePlan(p.calls, {
      agentId: p.agentId,
      speaker: p.speaker,
      requestMessageId: p.requestMessageId,
      retrieved: p.retrieved,
      step: "incident:replay",
      replay: { incidentId, of: p.taintedActions },
      turn: replayTurn,
    });
    for (const o of out) replayed.push({ actionId: o.action._id, tool: o.action.tool, summary: o.effect.summary, deduplicated: o.deduplicated });
    await c.messages.insertOne({
      _id: newId("msg"),
      channel: p.agentId,
      agentId: p.agentId,
      role: "assistant",
      speaker: p.agentId,
      text: `↻ Replayed after ${incidentId} without the revoked memory: ${out.map((o) => (o.deduplicated ? `kept ${o.action.tool}` : o.effect.summary)).join(" · ")}`,
      actions: out.map((o) => o.action._id),
      replayOf: p.requestMessageId,
      eventId: replayEventId,
      createdAt: new Date(),
    });
    const summary = out.map((o) => (o.deduplicated ? `kept ${o.action.tool}` : o.effect.summary)).join(" · ");
    await replayTurn.finish(summary);
    // Verification, not assertion: the replay is "clean" only if it raised no self-diagnostics of its own.
    const residual = await c.raindrop.countDocuments({ eventId: replayEventId, kind: "diagnostic" });
    const compensatedHere = comps.filter((x) => p.taintedActions.includes(effects.find((e) => e._id === x.effectId)?.actionId ?? "")).length;
    await signal(p.requestMessageId, "rolled_back", "NEGATIVE", { incident: incidentId, replay_event: replayEventId, compensated: compensatedHere, tainted_actions: p.taintedActions });
    await signal(replayEventId, residual === 0 ? "clean_replay" : "replay_still_risky", residual === 0 ? "POSITIVE" : "NEGATIVE", { incident: incidentId, replay_of: p.requestMessageId, residual_diagnostics: residual });
    await c.checkpoints.updateOne({ _id: incidentId as never }, { $addToSet: { replayed: p.requestMessageId }, $set: { updatedAt: new Date() } });
  }
  const timeline = [
    ...inc.timeline.filter((t) => t.stage !== "compensate" && t.stage !== "replay"),
    { stage: "compensate", at: new Date(), ms: tCompensate, note: `${comps.length} compensating effect(s), newest first` },
    { stage: "replay", at: new Date(), ms: Math.round(now() - t1), note: `${replayed.filter((r) => !r.deduplicated).length} re-executed · ${replayed.filter((r) => r.deduplicated).length} deduplicated onto kept effects` },
  ];
  await c.incidents.updateOne({ _id: incidentId as never }, { $set: { status: "resolved", replayed, timeline, resolvedAt: new Date() } });
  // Mark the poison source itself, so Raindrop's view of that event shows it was the root cause.
  const rootMsg = inc.rootId.startsWith("msg_") ? inc.rootId : ((await c.memories.findOne({ _id: inc.rootId }))?.provenance.messageId ?? null);
  if (rootMsg) await signal(rootMsg, "poison_source", "NEGATIVE", { incident: incidentId, tainted_nodes: inc.taint.length });
  await turn.finish(`Resolved: ${comps.length} compensated · ${inc.kept.length} kept · ${replayed.length} replayed (${replayed.filter((r) => r.deduplicated).length} deduplicated)`);
  await c.checkpoints.updateOne({ _id: incidentId as never }, { $set: { stage: "resolved" } });
  return (await c.incidents.findOne({ _id: incidentId as never })) as unknown as IncidentDoc;
}
