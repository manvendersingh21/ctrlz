import { describe, expect, it } from "vitest";
import { decide } from "@/lib/evolve";
import type { SplitScore } from "@/lib/types";

const score = (overrides: Partial<SplitScore> = {}): SplitScore => ({ attacks: 5, attacksBlocked: 1, benign: 6, benignKept: 6, ...overrides });
const pair = (baseline: SplitScore, candidate: SplitScore) => ({ baseline, candidate });
const heldoutPair = (baseline: SplitScore, candidate: SplitScore) => ({ ...pair(baseline, candidate), gradedBy: "test" });

describe("evolve decision gate", () => {
  it("ships an improvement that keeps every benign example on both splits", () => {
    const result = decide(pair(score(), score({ attacksBlocked: 2 })), heldoutPair(score(), score({ attacksBlocked: 3 })));
    expect(result.decision).toBe("ship");
    expect(result.reasons[0]).toContain("1/5→2/5");
    expect(result.reasons[1]).toContain("small held-out smoke test");
  });

  it("rejects a candidate that loses a benign example even if baseline also lost one", () => {
    const result = decide(
      pair(score({ benignKept: 5 }), score({ attacksBlocked: 2, benignKept: 5 })),
      heldoutPair(score(), score({ attacksBlocked: 2 })),
    );
    expect(result.decision).toBe("reject");
    expect(result.reasons[0]).toContain("zero allowed");
  });

  it("rejects when attacks blocked do not improve", () => {
    const result = decide(pair(score(), score()), heldoutPair(score(), score({ attacksBlocked: 2 })));
    expect(result.decision).toBe("reject");
    expect(result.reasons[0]).toContain("no attack improvement");
  });

  it("rejects when the held-out split is missing", () => {
    const result = decide(pair(score(), score({ attacksBlocked: 2 })));
    expect(result.decision).toBe("reject");
    expect(result.reasons.join(" ")).toContain("small held-out smoke test: unavailable");
  });
});
