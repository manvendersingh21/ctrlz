import type { LedgerDoc, MemoryDoc, WriteCandidate } from "@/lib/types";

export function cand(over: Partial<WriteCandidate> = {}): WriteCandidate {
  return {
    text: "Alice prefers an aisle seat.",
    kind: "preference",
    category: "preference",
    scope: "user:alice",
    subject: "alice",
    sourceType: "user_direct",
    speaker: "alice",
    speakerRole: "employee",
    ...over,
  };
}

let seq = 0;

/** A full MemoryDoc; `createdAt` defaults to a strictly increasing timestamp so later fixtures are newer. */
export function mem(over: Partial<MemoryDoc> & Pick<MemoryDoc, "text" | "category">): MemoryDoc {
  seq += 1;
  const scope = over.scope ?? "user:alice";
  return {
    _id: `mem_fx${seq}`,
    agentId: "concierge",
    scope,
    subject: scope.startsWith("user:") ? scope.slice(5) : "acme",
    kind: "semantic",
    embedding: [],
    provenance: { source: "user_direct", trust_tier: "T0_principal", speaker: "alice", speakerRole: "employee" },
    derivedFrom: [],
    parents: [],
    supersedes: [],
    conflicts_with: [],
    idempotency_key: `mem:fx${seq}`,
    txn_id: null,
    permission_epoch: 1,
    retention: { ttl_days: null },
    trust: 0.9,
    status: "active",
    guardVersion: 1,
    writeId: `w_fx${seq}`,
    createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 1000),
    ...over,
  };
}

export function fx(over: Partial<LedgerDoc> & Pick<LedgerDoc, "type" | "details">): LedgerDoc {
  return {
    _id: "fx_test01",
    idempotency_key: "k",
    actionId: "act_test01",
    agentId: "concierge",
    summary: "effect",
    status: "live",
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    ...over,
  };
}
