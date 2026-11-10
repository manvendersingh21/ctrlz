import { describe, expect, it } from "vitest";
import { MIN_TRUST, newId, retrievalFilter, tierFor, trustFor } from "@/lib/memory";
import type { TrustTier, WriteCandidate } from "@/lib/types";
import { cand } from "./fixtures";

type Row = [label: string, over: Partial<WriteCandidate>, trust: number, tier: TrustTier];

const ROWS: Row[] = [
  ["tool output", { sourceType: "tool_output", speaker: "concierge", speakerRole: "system", subject: "alice" }, 0.8, "T1_verified"],
  ["agent inference", { sourceType: "agent_inference", speaker: "concierge", speakerRole: "system", subject: "alice" }, 0.65, "T2_unverified"],
  ["subject speaking about themself (guest)", { sourceType: "channel_message", speaker: "mallory", speakerRole: "guest", subject: "mallory" }, 0.9, "T0_principal"],
  ["subject speaking about themself (user_direct)", { sourceType: "user_direct", speaker: "alice", speakerRole: "employee", subject: "alice" }, 0.9, "T0_principal"],
  ["finance admin about a vendor", { sourceType: "channel_message", speaker: "bob", speakerRole: "finance_admin", subject: "acme-travel" }, 0.9, "T0_principal"],
  ["employee about someone else", { sourceType: "channel_message", speaker: "dave", speakerRole: "employee", subject: "alice" }, 0.75, "T1_verified"],
  ["guest about someone else", { sourceType: "channel_message", speaker: "mallory", speakerRole: "guest", subject: "alice" }, 0.6, "T2_unverified"],
  ["unknown role about someone else", { sourceType: "channel_message", speaker: "erin", speakerRole: "contractor", subject: "bob" }, 0.6, "T2_unverified"],
];

describe("trustFor / tierFor", () => {
  it.each(ROWS)("%s → trust %s, tier %s", (_label, over, trust, tier) => {
    const c = cand(over);
    expect(trustFor(c)).toBe(trust);
    expect(tierFor(trustFor(c), c)).toBe(tier);
  });

  it("source type outranks speaker identity", () => {
    expect(trustFor(cand({ sourceType: "tool_output", speaker: "alice", subject: "alice" }))).toBe(0.8);
    expect(trustFor(cand({ sourceType: "agent_inference", speakerRole: "finance_admin" }))).toBe(0.65);
  });

  it.each<[number, TrustTier]>([
    [1, "T0_principal"],
    [0.9, "T0_principal"],
    [0.89, "T1_verified"],
    [0.75, "T1_verified"],
    [0.74, "T2_unverified"],
    [0.6, "T2_unverified"],
    [0.59, "T3_external"],
    [0, "T3_external"],
  ])("tier thresholds: trust %s → %s", (trust, tier) => {
    expect(tierFor(trust, cand({ sourceType: "channel_message" }))).toBe(tier);
  });

  it("a tool output whose trust was capped by a low-trust upstream is not verified", () => {
    const c = cand({ sourceType: "tool_output" });
    expect(tierFor(0.8, c)).toBe("T1_verified");
    expect(tierFor(0.6, c)).toBe("T2_unverified");
  });

  it("guest-written memories stay retrievable (trust ≥ MIN_TRUST) — guardrails, not trust, gate them", () => {
    expect(trustFor(cand({ speaker: "mallory", speakerRole: "guest", subject: "alice", sourceType: "channel_message" }))).toBeGreaterThanOrEqual(MIN_TRUST);
  });
});

describe("helpers", () => {
  it("newId uses the prefix and an unambiguous 6-char alphabet", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId("mem")));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^mem_[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
  });

  it("retrievalFilter only serves active, in-scope, trusted memories", () => {
    expect(retrievalFilter(["user:alice", "team:acme"])).toEqual({ status: "active", scope: { $in: ["user:alice", "team:acme"] }, trust: { $gte: MIN_TRUST } });
  });
});
