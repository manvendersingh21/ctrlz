import { cols, ensureSchema, EVAL_DB, client, graderClient, waitForSearchIndexes } from "./db";
import { embed } from "./embed";
import { BASELINE_RULES } from "./guardrails";
import { newId, writeMemory } from "./memory";
import { EVAL_DEV, EVAL_HELDOUT, SEED_MEMORIES } from "./scenario";
import type { GuardrailDoc } from "./types";

/** Wipes harness state (keeping collections and search indexes) and seeds the demo world. */
export async function resetWorld() {
  const t0 = Date.now();
  await ensureSchema();
  const c = await cols();
  await Promise.all(
    [
      c.memories, c.actions, c.messages, c.lineage, c.ledger, c.compensations, c.incidents, c.guardrails,
      c.writeLog, c.evalDev, c.evalRuns, c.signatures, c.checkpoints, c.ops, c.traces, c.system, c.raindrop,
    ].map((coll) => coll.deleteMany({})),
  );

  await c.system.insertOne({ _id: "permission_epoch" as never, value: 1 });
  const v1: GuardrailDoc = {
    _id: "guard_v1",
    version: 1,
    status: "active",
    rules: BASELINE_RULES,
    rationale: "Baseline: block raw secrets only.",
    proposedBy: "baseline",
    createdAt: new Date(),
  };
  await c.guardrails.insertOne(v1);

  for (const s of SEED_MEMORIES) {
    const { agentId, ...cand } = s;
    const msgId = newId("msg");
    await c.messages.insertOne({
      _id: msgId,
      channel: agentId,
      agentId,
      role: "user",
      speaker: cand.speaker,
      text: cand.text,
      createdAt: new Date(),
    });
    await c.lineage.insertOne({ _id: msgId, kind: "message", parents: [], agentId, label: `${cand.speaker}: ${cand.text}`, status: "seed", createdAt: new Date() });
    await writeMemory({ ...cand, sourceType: cand.sourceType ?? "user_direct" }, { agentId, messageId: msgId, step: "seed" });
  }

  const devVecs = await embed(EVAL_DEV.map((e) => e.candidate.text));
  await c.evalDev.insertMany(EVAL_DEV.map((e, i) => ({ _id: `dev_${i}` as never, ...e, embedding: devVecs[i] })));

  // Held-out lives in a separate database that only the grader principal reads during gating.
  // Seeding it is an admin step: use the grader if it can write, otherwise the seeding (main) principal.
  const heldVecs = await embed(EVAL_HELDOUT.map((e) => e.candidate.text));
  const g = graderClient();
  const canGraderWrite = g
    ? await (await g)
        .db(EVAL_DB)
        .command({ connectionStatus: 1, showPrivileges: true })
        .then((st) => JSON.stringify(st.authInfo?.authenticatedUserPrivileges ?? []).includes('"insert"'))
        .catch(() => false)
    : false;
  const held = (await (canGraderWrite && g ? g : client())).db(EVAL_DB).collection("heldout");
  await held.deleteMany({});
  await held.insertMany(EVAL_HELDOUT.map((e, i) => ({ _id: `ho_${i}` as never, ...e, embedding: heldVecs[i] })));

  const indexesReady = await waitForSearchIndexes(90000);
  return { ok: true, indexesReady, ms: Date.now() - t0 };
}
