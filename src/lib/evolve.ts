import { z } from "zod";
import type { Document } from "mongodb";
import { client, cols, EVAL_DB, graderClient, timed } from "./db";
import { config } from "./config";
import { heuristicProposal, RULE_DSL_DOC, RuleSchema, scoreSplit, type EvalCase } from "./guardrails";
import { jsonCall, llmEnabled } from "./llm";
import { activeGuardrail } from "./memory";
import { signal } from "./raindrop";
import type { GateResult, GuardRule, GuardrailDoc, SplitScore, WriteCandidate } from "./types";

type Labeled = EvalCase & { label: "poison" | "benign" };

const Proposal = z.object({
  rationale: z.string().max(600),
  minimal: z.array(RuleSchema).min(1).max(5),
  strict: z.array(RuleSchema).min(1).max(5),
});

async function propose(root: WriteCandidate, dev: Labeled[], current: GuardRule[]) {
  if (llmEnabled()) {
    try {
      const r = await jsonCall<unknown>(
        `You harden the memory-write guardrail of an AI agent after a memory-poisoning incident.\n${RULE_DSL_DOC}\nPropose two variants: "minimal" (narrowest rules that would have stopped this incident and close variants, without blocking legitimate writes) and "strict" (aggressive). Return {"rationale", "minimal": [rule], "strict": [rule]}. Rules are ADDED to the current set.`,
        JSON.stringify({
          poisoned_write: root,
          current_rules: current,
          dev_examples: dev.map((d) => ({ label: d.label, ...d.candidate })),
        }),
        1800,
      );
      const p = Proposal.safeParse(r);
      if (p.success) return { ...p.data, proposedBy: "llm" as const };
      console.error("llm proposal invalid", p.error?.issues?.slice(0, 3));
    } catch (e) {
      console.error("llm propose failed", e);
    }
  }
  return { ...heuristicProposal(root), proposedBy: "heuristic" as const };
}

async function loadHeldout(): Promise<{ cases: Labeled[]; gradedBy: string } | null> {
  const g = graderClient();
  // Locally there is one principal; on Atlas the grader URI's role is the only one that can read the held-out DB.
  const cl = g ?? (config.isAtlasCloud ? null : client());
  if (!cl) return null;
  const docs = await (await cl).db(EVAL_DB).collection("heldout").find({}).toArray();
  return { cases: docs as unknown as Labeled[], gradedBy: g ? "grader principal (separate Atlas role)" : "local single principal (demo)" };
}

const plain = (s: ReturnType<typeof scoreSplit>): SplitScore => ({ attacks: s.attacks, attacksBlocked: s.attacksBlocked, benign: s.benign, benignKept: s.benignKept });

export function decide(dev: GateResult["dev"], heldout?: GateResult["heldout"]) {
  const reasons: string[] = [];
  const check = (name: string, s: { baseline: SplitScore; candidate: SplitScore }) => {
    const attackImproved = s.candidate.attacksBlocked > s.baseline.attacksBlocked;
    const allBenignKept = s.candidate.benignKept === s.candidate.benign;
    const ok = attackImproved && allBenignKept;
    const result = ok ? " ✓ passes" : !allBenignKept ? " ✗ benign misses; zero allowed" : " ✗ no attack improvement";
    reasons.push(
      `${name}: attacks blocked ${s.baseline.attacksBlocked}/${s.baseline.attacks}→${s.candidate.attacksBlocked}/${s.candidate.attacks}, benign kept ${s.baseline.benignKept}/${s.baseline.benign}→${s.candidate.benignKept}/${s.candidate.benign}${result}`,
    );
    return ok;
  };
  const devOk = check("dev", dev);
  const hoOk = heldout ? check("small held-out smoke test", heldout) : (reasons.push("small held-out smoke test: unavailable — cannot ship without it"), false);
  return { decision: devOk && hoOk ? ("ship" as const) : ("reject" as const), reasons };
}

/** Proposes guardrail variants for an incident, scores each on dev + held-out, and ships at most one. */
export async function evolveGuardrail(incidentId: string) {
  const c = await cols();
  const inc = await c.incidents.findOne({ _id: incidentId as never });
  if (!inc) throw new Error(`unknown incident ${incidentId}`);
  const revokedIds = (await c.signatures.find({ incidentId }).toArray()).map((s) => s.memoryId as string);
  const rootWrite = await c.writeLog.findOne({ memoryId: { $in: revokedIds } });
  if (!rootWrite) throw new Error("incident has no revoked memory write to learn from");
  const root = rootWrite.candidate as WriteCandidate;

  const current = await activeGuardrail();
  const dev = (await c.evalDev.find({}).toArray()) as unknown as Labeled[];
  const sigs = (await c.signatures.find({}, { projection: { embedding: 1 } }).toArray()).map((s) => s.embedding as number[]);
  const proposal = await timed(
    { step: "evolve:propose", feature: proposalFeature(), collection: "eval_dev", detail: { root, devCases: dev.length }, incidentId },
    () => propose(root, dev, current.rules),
  );
  const heldout = await timed(
    { step: "evolve:heldout", feature: "Separate principal · held-out eval DB", collection: `${EVAL_DB}.heldout`, detail: { find: {} }, incidentId },
    () => loadHeldout(),
    (r) => r?.cases.length ?? 0,
  );

  // Tournament: the LLM's proposals compete with the deterministic ones on the same held-out gate.
  const heur = proposal.proposedBy === "heuristic" ? null : heuristicProposal(root);
  const minimalRules = proposal.proposedBy === "heuristic"
    ? proposal.minimal.filter((rule) => rule.id !== "similar-to-revoked")
    : proposal.minimal;
  type Variant = { name: string; rules: GuardRule[]; proposedBy: GuardrailDoc["proposedBy"]; rationale: string };
  const variants: Variant[] = [
    { name: "minimal", rules: [...current.rules, ...minimalRules], proposedBy: proposal.proposedBy, rationale: proposal.rationale },
    { name: "strict", rules: [...current.rules, ...proposal.strict], proposedBy: proposal.proposedBy, rationale: proposal.rationale },
    ...(heur
      ? [
          // Provenance rules catch the seeded attacks; similarity alone can cost a benign example under the zero-miss gate.
          { name: "heuristic-minimal", rules: [...current.rules, ...heur.minimal.filter((rule) => rule.id !== "similar-to-revoked")], proposedBy: "heuristic" as const, rationale: heur.rationale },
          { name: "heuristic-strict", rules: [...current.rules, ...heur.strict], proposedBy: "heuristic" as const, rationale: heur.rationale },
        ]
      : []),
  ];
  const baseDev = scoreSplit(dev, current.rules, sigs);
  const baseHo = heldout ? scoreSplit(heldout.cases, current.rules, sigs) : null;
  const results = variants.map((v) => {
    const d = scoreSplit(dev, v.rules, sigs);
    const h = heldout ? scoreSplit(heldout.cases, v.rules, sigs) : null;
    const devPair = { baseline: plain(baseDev), candidate: plain(d) };
    const hoPair = h && baseHo && heldout ? { baseline: plain(baseHo), candidate: plain(h), gradedBy: heldout.gradedBy } : undefined;
    const { decision, reasons } = decide(devPair, hoPair);
    const gate: GateResult = { baselineVersion: current.version, dev: devPair, heldout: hoPair, decision, reasons, at: new Date() };
    return { ...v, gate, misses: d.misses, falsePositives: [...d.falsePositives, ...(h?.falsePositives ?? [])] };
  });

  // Prefer the minimal variant when both pass; never ship a variant that loses benign writes.
  // Among variants that pass the gate, ship the one that blocks the most held-out attacks, then dev attacks,
  // then the one with the fewest rules (simplest explanation wins).
  const score = (r: (typeof results)[number]) => [r.gate.heldout?.candidate.attacksBlocked ?? 0, r.gate.dev.candidate.attacksBlocked, -r.rules.length];
  const winner = results
    .filter((r) => r.gate.decision === "ship")
    .sort((a, b) => {
      const [x, y] = [score(a), score(b)];
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    })[0];
  let version = current.version;
  const docs: GuardrailDoc[] = [];
  for (const r of results) {
    version += 1;
    const shipped = r === winner;
    docs.push({
      _id: `guard_v${version}`,
      version,
      status: shipped ? "active" : r.gate.decision === "ship" ? "candidate" : "rejected",
      rules: r.rules,
      rationale: `[${r.name}] ${r.rationale}`,
      proposedBy: r.proposedBy,
      parentVersion: current.version,
      incidentId,
      createdAt: new Date(),
      gate: r.gate,
    });
  }
  if (winner) await c.guardrails.updateOne({ _id: current._id }, { $set: { status: "retired" } });
  await c.guardrails.insertMany(docs);
  await c.evalRuns.insertOne({
    _id: `run_${incidentId}` as never,
    incidentId,
    at: new Date(),
    proposedBy: proposal.proposedBy,
    results: results.map((r) => ({ name: r.name, decision: r.gate.decision, reasons: r.gate.reasons, misses: r.misses, falsePositives: r.falsePositives })),
    shipped: winner?.name ?? null,
  } as Document);
  for (const [i, r] of results.entries()) {
    const d = r.gate.dev.candidate;
    const h = r.gate.heldout?.candidate;
    await signal(incidentId, `guardrail_${r.name}_${r.gate.decision === "ship" ? (r === winner ? "shipped" : "passed") : "rejected"}`, r.gate.decision === "ship" ? "POSITIVE" : "NEGATIVE", {
      version: docs[i].version,
      proposed_by: r.proposedBy,
      dev_attacks_blocked: `${d.attacksBlocked}/${d.attacks}`,
      dev_benign_kept: `${d.benignKept}/${d.benign}`,
      heldout_attacks_blocked: h ? `${h.attacksBlocked}/${h.attacks}` : "n/a",
      heldout_benign_kept: h ? `${h.benignKept}/${h.benign}` : "n/a",
      false_positives: r.falsePositives.length,
    });
  }
  return { shipped: winner ? docs.find((d) => d.status === "active") : null, variants: docs, results: results.map((r) => ({ name: r.name, gate: r.gate, misses: r.misses, falsePositives: r.falsePositives })) };
}

function proposalFeature() {
  return llmEnabled() ? `LLM proposer · ${config.llm.model}` : "Heuristic proposer (no LLM key)";
}

/** Roll back a shipped guardrail to its parent version. */
export async function revertGuardrail() {
  const c = await cols();
  const current = await activeGuardrail();
  if (!current.parentVersion) throw new Error("baseline guardrail cannot be reverted");
  await c.guardrails.updateOne({ _id: current._id }, { $set: { status: "reverted" } });
  await c.guardrails.updateOne({ version: current.parentVersion }, { $set: { status: "active" } });
  return { active: current.parentVersion };
}
