import { cols } from "./db";
import { signal } from "./raindrop";
import type { MemoryDoc } from "./types";

const TIER_RISK: Record<string, number> = { T3_external: 3, T2_unverified: 2, T1_verified: 1, T0_principal: 0 };
const SENSITIVE = new Set(["payment_instruction", "contact_routing"]);

export interface Suspect {
  memoryId: string;
  text: string;
  speaker: string;
  speakerRole: string;
  trustTier: string;
  sourceMessageId: string | null;
  score: number;
  reasons: string[];
}

/** Ranks the memories that justified an event's actions by how likely each is to be the poisoned one. */
export function rankSuspects(mems: Pick<MemoryDoc, "_id" | "text" | "category" | "subject" | "provenance" | "createdAt" | "status">[]): Suspect[] {
  return mems
    .filter((m) => m.status === "active")
    .map((m) => {
      const reasons: string[] = [];
      let score = TIER_RISK[m.provenance.trust_tier] ?? 0;
      if (score >= 2) reasons.push(`unverified source (${m.provenance.trust_tier})`);
      if (m.provenance.speaker !== m.subject && m.provenance.speakerRole !== "finance_admin" && m.provenance.speakerRole !== "system") {
        score += 2;
        reasons.push(`${m.provenance.speaker} (${m.provenance.speakerRole}) spoke for ${m.subject}`);
      }
      if (SENSITIVE.has(m.category)) {
        score += 1;
        reasons.push(`${m.category.replace("_", " ")} memory`);
      }
      return {
        memoryId: m._id,
        text: m.text,
        speaker: m.provenance.speaker,
        speakerRole: m.provenance.speakerRole,
        trustTier: m.provenance.trust_tier,
        sourceMessageId: m.provenance.messageId ?? null,
        score,
        reasons,
        createdAt: +new Date(m.createdAt),
      };
    })
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .map(({ createdAt: _c, ...s }) => (void _c, s));
}

/**
 * Human feedback on an agent reply: reported to Raindrop as a feedback signal on the turn's event; on a
 * thumbs-down, blames the memories behind that turn's actions and suggests the rollback root.
 */
export async function feedback(eventId: string, rating: "up" | "down", comment?: string) {
  const c = await cols();
  const turnActions = await c.actions.find({ requestMessageId: eventId }).toArray();
  if (!turnActions.length && !(await c.messages.findOne({ eventId }))) throw new Error(`unknown event ${eventId}`);
  await signal(eventId, rating === "up" ? "thumbs_up" : "thumbs_down", rating === "up" ? "POSITIVE" : "NEGATIVE", { actions: turnActions.length }, { type: "feedback", comment });
  if (rating === "up") return { eventId, suspects: [] as Suspect[], suggestedRoot: null };

  const ids = [...new Set(turnActions.flatMap((a) => a.justified_by))];
  const mems = ids.length ? await c.memories.find({ _id: { $in: ids } }, { projection: { embedding: 0 } }).toArray() : [];
  const suspects = rankSuspects(mems).filter((s) => s.score > 0);
  const top = suspects[0];
  const suggestedRoot = top ? (top.sourceMessageId ?? top.memoryId) : null;
  if (top) await signal(eventId, "suspect_identified", "NEGATIVE", { memory: top.memoryId, source_message: top.sourceMessageId, score: top.score, reasons: top.reasons });
  return { eventId, suspects, suggestedRoot };
}
