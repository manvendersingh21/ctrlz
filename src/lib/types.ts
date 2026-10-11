export type AgentId = "concierge" | "finance";
export type UserId = "alice" | "bob" | "mallory";
export type NodeKind = "message" | "memory" | "action";
export type MemoryStatus = "active" | "quarantined" | "held";
export type ActionStatus = "executed" | "quarantined" | "compensating" | "compensated" | "deduped";
export type SourceType = "user_direct" | "channel_message" | "tool_output" | "agent_inference";
export type Category =
  | "preference"
  | "payment_instruction"
  | "contact_routing"
  | "fact"
  | "booking_record"
  | "policy";

export interface WriteCandidate {
  text: string;
  kind: "semantic" | "episodic" | "procedural" | "preference";
  category: Category;
  scope: string;
  subject: string;
  sourceType: SourceType;
  speaker: string;
  speakerRole: string;
}

export interface MemoryDoc {
  _id: string;
  agentId: AgentId;
  scope: string;
  subject: string;
  kind: WriteCandidate["kind"];
  category: Category;
  text: string;
  embedding: number[];
  /** AOEP-v0 provenance: bound at write time from the platform, never inferred from content. */
  provenance: { source: SourceType; trust_tier: TrustTier; messageId?: string; actionId?: string; speaker: string; speakerRole: string };
  derivedFrom: string[];
  /** AOEP-v0 causal links */
  parents: string[];
  supersedes: string[];
  conflicts_with: string[];
  idempotency_key: string;
  txn_id: string | null;
  permission_epoch: number;
  retention: { ttl_days: number | null };
  trust: number;
  status: MemoryStatus;
  guardVersion: number;
  writeId: string;
  createdAt: Date;
  quarantine?: { incidentId: string; at: Date; depth: number };
}

export type TrustTier = "T0_principal" | "T1_verified" | "T2_unverified" | "T3_external";

export interface ActionDoc {
  _id: string;
  agentId: AgentId;
  tool: string;
  args: Record<string, unknown>;
  /** rollback-traceability invariant: every side effect carries a handle to the records that justified it */
  justified_by: string[];
  retrieved: string[];
  parents: string[];
  requestMessageId: string;
  idempotency_key: string;
  txn_id: string | null;
  permission_epoch: number;
  effectId?: string;
  status: ActionStatus;
  result?: Record<string, unknown>;
  replayOf?: string;
  createdAt: Date;
  quarantine?: { incidentId: string; at: Date; depth: number };
}

export interface MessageDoc {
  _id: string;
  channel: string;
  agentId: AgentId;
  role: "user" | "assistant";
  speaker: string;
  text: string;
  retrieved?: string[];
  actions?: string[];
  replayOf?: string;
  /** Raindrop event this message belongs to (the turn's request message id, or a replay's event id). */
  eventId?: string;
  createdAt: Date;
}

export interface LineageDoc {
  _id: string;
  kind: NodeKind;
  parents: string[];
  agentId: AgentId;
  label: string;
  status: string;
  createdAt: Date;
}

export interface LedgerDoc {
  _id: string;
  idempotency_key: string;
  type: "flight_booking" | "payment" | "email" | "hotel_reservation" | "refund" | "cancellation" | "correction_email" | "payment_recall";
  actionId: string;
  agentId: AgentId;
  summary: string;
  details: Record<string, unknown>;
  amount?: number;
  compensates?: string;
  status: "live" | "reversed";
  createdAt: Date;
}

export interface CompensationDoc {
  _id: string;
  incidentId: string;
  actionId: string;
  effectId: string;
  kind: LedgerDoc["type"];
  idempotency_key: string;
  txn_id: string;
  order: number;
  status: "pending" | "done";
  outcome?: "executed" | "deduplicated";
  createdAt: Date;
  doneAt?: Date;
}

export interface GuardRule {
  id: string;
  description: string;
  match: {
    categories?: Category[];
    scopePrefix?: string;
    sourceTypes?: SourceType[];
    speakerRolesNot?: string[];
    speakerNotSubject?: boolean;
    keywordsAny?: string[];
    similarToRevokedAbove?: number;
  };
  effect: "block" | "hold";
}

export interface GuardrailDoc {
  _id: string;
  version: number;
  status: "active" | "retired" | "candidate" | "rejected" | "reverted";
  rules: GuardRule[];
  rationale: string;
  proposedBy: "baseline" | "llm" | "heuristic";
  parentVersion?: number;
  incidentId?: string;
  createdAt: Date;
  gate?: GateResult;
}

export interface SplitScore {
  attacks: number;
  attacksBlocked: number;
  benign: number;
  benignKept: number;
}

export interface GateResult {
  baselineVersion: number;
  dev: { baseline: SplitScore; candidate: SplitScore };
  heldout?: { baseline: SplitScore; candidate: SplitScore; gradedBy: string };
  decision: "ship" | "reject";
  reasons: string[];
  at: Date;
}

export interface AtlasOp {
  _id?: string;
  ts: Date;
  step: string;
  feature: string;
  collection: string;
  detail: unknown;
  ms: number;
  n?: number;
  incidentId?: string;
}
