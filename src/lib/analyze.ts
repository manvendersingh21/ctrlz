import { extract, riskFindings, scopeForSubject } from "./agent";
import { cols } from "./db";
import { BASELINE_RULES, evaluateWrite, heuristicProposal } from "./guardrails";
import { tierFor, trustFor } from "./memory";
import { roleOf } from "./scenario";
import type { GuardRule, WriteCandidate } from "./types";

/**
 * Dry run for the landing-page widget: what would ctrlz do with this message? Extracts memories, scores each
 * against the baseline and the hardened guardrail, and applies the live self-diagnosis rule. Writes nothing.
 */
export async function analyzeMessage(speaker: string, text: string) {
  const ex = await extract(text, speaker);
  const role = roleOf(speaker);
  let hardened: GuardRule[] | null = null;
  try {
    const { guardrails } = await cols();
    const active = await guardrails.findOne({ status: "active" }, { sort: { version: -1 } });
    if (active && active.version > 1) hardened = active.rules;
  } catch {
    /* DB optional for a dry run */
  }
  const memories = ex.items.map((item) => {
    const c: WriteCandidate = {
      text: item.text,
      kind: item.category === "preference" ? "preference" : "semantic",
      category: item.category,
      scope: scopeForSubject(item.subject),
      subject: item.subject,
      sourceType: speaker === item.subject ? "user_direct" : "channel_message",
      speaker,
      speakerRole: role,
    };
    const trust = trustFor(c);
    const base = evaluateWrite(c, BASELINE_RULES);
    const hard = evaluateWrite(c, hardened ?? [...BASELINE_RULES, ...heuristicProposal(c).minimal]);
    return { candidate: c, trustTier: tierFor(trust, c), trust, baseline: base.decision, hardened: hard.decision, hits: hard.hits };
  });
  const risk = riskFindings(
    "agent action",
    memories.map((m, i) => ({
      _id: `preview_${i}`,
      category: m.candidate.category,
      subject: m.candidate.subject,
      text: m.candidate.text,
      provenance: { source: m.candidate.sourceType, trust_tier: m.trustTier, speaker, speakerRole: role },
    })),
  ).map((r) => ({ category: r.category, description: r.description.replace(/^agent action relied on preview_\d+ /, "A memory ") }));
  return {
    extractor: ex.extractor,
    isTask: ex.isTask,
    memories: memories.map((m) => ({
      text: m.candidate.text,
      category: m.candidate.category,
      subject: m.candidate.subject,
      scope: m.candidate.scope,
      trustTier: m.trustTier,
      baseline: m.baseline,
      hardened: m.hardened,
      hits: m.hits,
    })),
    risk,
    verdict: risk.length || memories.some((m) => m.hardened !== "allow") ? ("risky" as const) : ("safe" as const),
  };
}
