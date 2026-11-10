import { z } from "zod";
import { cosine } from "./embed";
import type { Category, GuardRule, SplitScore, WriteCandidate } from "./types";

export const CATEGORIES: Category[] = ["preference", "payment_instruction", "contact_routing", "fact", "booking_record", "policy"];

export const BASELINE_RULES: GuardRule[] = [
  {
    id: "no-raw-secrets",
    description: "Never store raw credentials, CVVs or full card numbers.",
    match: { keywordsAny: ["password", "cvv", "ssn", "full card number"] },
    effect: "block",
  },
];

export const RuleSchema = z.object({
  id: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  match: z
    .object({
      categories: z.array(z.enum(CATEGORIES as [Category, ...Category[]])).optional(),
      scopePrefix: z.string().optional(),
      sourceTypes: z.array(z.enum(["user_direct", "channel_message", "tool_output", "agent_inference"])).optional(),
      speakerRolesNot: z.array(z.string()).optional(),
      speakerNotSubject: z.boolean().optional(),
      keywordsAny: z.array(z.string()).optional(),
      similarToRevokedAbove: z.number().min(0.5).max(0.99).optional(),
    })
    // Falsy fields are ignored by ruleMatches, so a match made only of them would hit every write.
    .refine(
      (m) => Object.values(m).some((v) => v !== undefined && v !== false && v !== "" && !(Array.isArray(v) && v.length === 0)),
      "match must constrain at least one field",
    ),
  effect: z.enum(["block", "hold"]),
});

export interface EvalCase {
  candidate: WriteCandidate;
  embedding?: number[];
}

export interface Decision {
  decision: "allow" | "block" | "hold";
  hits: string[];
  maxRevokedSimilarity: number;
}

export function ruleMatches(rule: GuardRule, c: WriteCandidate, sim: number): boolean {
  const m = rule.match;
  if (m.categories && !m.categories.includes(c.category)) return false;
  if (m.scopePrefix && !c.scope.startsWith(m.scopePrefix)) return false;
  if (m.sourceTypes && !m.sourceTypes.includes(c.sourceType)) return false;
  if (m.speakerRolesNot && m.speakerRolesNot.includes(c.speakerRole)) return false;
  if (m.speakerNotSubject && c.speaker === c.subject) return false;
  if (m.keywordsAny && !m.keywordsAny.some((k) => c.text.toLowerCase().includes(k.toLowerCase()))) return false;
  if (m.similarToRevokedAbove !== undefined && sim < m.similarToRevokedAbove) return false;
  return true;
}

export function evaluateWrite(c: WriteCandidate, rules: GuardRule[], maxRevokedSimilarity = 0): Decision {
  const hits = rules.filter((r) => ruleMatches(r, c, maxRevokedSimilarity));
  const decision = hits.some((h) => h.effect === "block") ? "block" : hits.length ? "hold" : "allow";
  return { decision, hits: hits.map((h) => h.id), maxRevokedSimilarity };
}

export function maxSimilarity(embedding: number[] | undefined, signatures: number[][]) {
  if (!embedding || signatures.length === 0) return 0;
  return Math.max(...signatures.map((s) => cosine(embedding, s)));
}

export function scoreSplit(
  cases: (EvalCase & { label: "poison" | "benign" })[],
  rules: GuardRule[],
  signatures: number[][],
): SplitScore & { misses: string[]; falsePositives: string[] } {
  const s = { attacks: 0, attacksBlocked: 0, benign: 0, benignKept: 0, misses: [] as string[], falsePositives: [] as string[] };
  for (const c of cases) {
    const d = evaluateWrite(c.candidate, rules, maxSimilarity(c.embedding, signatures));
    if (c.label === "poison") {
      s.attacks++;
      if (d.decision !== "allow") s.attacksBlocked++;
      else s.misses.push(c.candidate.text);
    } else {
      s.benign++;
      if (d.decision === "allow") s.benignKept++;
      else s.falsePositives.push(c.candidate.text);
    }
  }
  return s;
}

/** Deterministic fallback when the LLM proposer is unavailable or returns invalid rules. */
export function heuristicProposal(root: WriteCandidate): { minimal: GuardRule[]; strict: GuardRule[]; rationale: string } {
  const sensitive: Category[] = ["payment_instruction", "contact_routing"];
  return {
    rationale: `Root cause: a ${root.speakerRole} (${root.speaker}) wrote a ${root.category} memory into ${root.scope} via ${root.sourceType}; v1 had no provenance requirement for money/contact routing.`,
    minimal: [
      {
        id: "team-money-routing-needs-finance-admin",
        description: "Team-scoped payment or contact-routing memories must be stated by a finance_admin; otherwise hold for confirmation.",
        match: { categories: sensitive, scopePrefix: "team:", speakerRolesNot: ["finance_admin"] },
        effect: "hold",
      },
      {
        id: "user-money-routing-needs-self",
        description: "Payment or contact-routing memories about a user must come from that user.",
        match: { categories: sensitive, scopePrefix: "user:", speakerNotSubject: true },
        effect: "hold",
      },
      {
        id: "similar-to-revoked",
        description: "Block writes semantically close to a revoked (poisoned) memory.",
        match: { similarToRevokedAbove: 0.86 },
        effect: "block",
      },
    ],
    strict: [
      {
        id: "no-money-routing-memories",
        description: "Never auto-store payment or contact-routing memories.",
        match: { categories: sensitive },
        effect: "block",
      },
    ],
  };
}

export const RULE_DSL_DOC = `A guardrail is a list of rules evaluated on every memory WRITE candidate. A rule matches when ALL of its match fields hold:
- categories: candidate.category in list. Categories: ${CATEGORIES.join(", ")}
- scopePrefix: candidate.scope starts with it ("team:" for shared team memory, "user:" for personal memory)
- sourceTypes: candidate.sourceType in list (user_direct, channel_message, tool_output, agent_inference)
- speakerRolesNot: candidate.speakerRole NOT in list (roles: employee, finance_admin, guest, system)
- speakerNotSubject: true => the speaker is not the person the memory is about
- keywordsAny: text contains any keyword (case-insensitive)
- similarToRevokedAbove: cosine similarity (0.5-0.99) to any previously revoked memory is at least this value
effect: "block" (never store) or "hold" (store as held, invisible to retrieval until a human confirms).`;
