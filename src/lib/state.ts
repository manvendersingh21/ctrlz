import { cols } from "./db";
import { publicConfig } from "./config";
import type { RaindropEvent } from "./raindrop";
import { SCRIPT, USERS } from "./scenario";

/** Everything the dashboard renders, in one round trip. */
export async function snapshot() {
  const c = await cols();
  const noVec = { projection: { embedding: 0 } };
  const [messages, memories, actions, ledger, lineage, incidents, guardrails, ops, writes, epoch, raindrop] = await Promise.all([
    c.messages.find({}).sort({ createdAt: 1 }).toArray(),
    c.memories.find({}, noVec).sort({ createdAt: 1 }).toArray(),
    c.actions.find({}).sort({ createdAt: 1 }).toArray(),
    c.ledger.find({}).sort({ createdAt: 1 }).toArray(),
    c.lineage.find({}).sort({ createdAt: 1 }).toArray(),
    c.incidents.find({}).sort({ createdAt: -1 }).toArray(),
    c.guardrails.find({}).sort({ version: 1 }).toArray(),
    c.ops.find({}).sort({ ts: -1 }).limit(40).toArray(),
    c.writeLog.find({}, noVec).sort({ ts: -1 }).limit(30).toArray(),
    c.system.findOne({ _id: "permission_epoch" as never }),
    c.raindrop.find({}).sort({ ts: -1 }).limit(200).toArray() as unknown as Promise<RaindropEvent[]>,
  ]);
  return {
    config: publicConfig(),
    users: USERS,
    script: SCRIPT,
    epoch: (epoch?.value as number) ?? 1,
    messages,
    memories,
    actions,
    ledger,
    lineage,
    incidents,
    guardrails,
    ops,
    writes,
    raindrop,
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
