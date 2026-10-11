"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Undo2, X } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import { money, time } from "./format";
import { Button, Pill, statusTone } from "./ui";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1 text-xs">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function NodeDrawer({ data, id, onClose, onRollback, busy }: { data: Snapshot; id: string | null; onClose: () => void; onRollback: (id: string, reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState("reported as poisoned");
  const node = id ? data.lineage.find((n) => n._id === id) : undefined;
  const mem = id ? data.memories.find((m) => m._id === id) : undefined;
  const act = id ? data.actions.find((a) => a._id === id) : undefined;
  const msg = id ? data.messages.find((m) => m._id === id) : undefined;
  const effect = act?.effectId ? data.ledger.find((l) => l._id === act.effectId) : undefined;
  const children = id ? data.lineage.filter((n) => n.parents.includes(id)) : [];
  const canRollback = node && node.status !== "quarantined" && node.kind !== "action";
  // Siblings written from the same message (e.g. a card change plus a cc route) are usually one attack,
  // so a memory's default rollback targets its source message; "this memory only" stays available.
  const source = mem?.provenance.messageId ? data.lineage.find((n) => n._id === mem.provenance.messageId && n.status !== "quarantined") : undefined;
  const siblings = source ? data.memories.filter((m) => m.provenance.messageId === source._id).length : 0;

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          key={node._id}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-y-2 right-2 z-10 flex w-[min(360px,calc(100%-16px))] flex-col rounded-2xl border border-white/10 bg-[#1a0c2c]/95 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl"
        >
          <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Pill tone="accent">{node.kind}</Pill>
            <code className="text-[11px] text-muted">{node._id}</code>
            <Pill tone={statusTone(node.status)}>{node.status}</Pill>
            <button onClick={onClose} className="ml-auto rounded-full p-1 text-muted transition-colors hover:bg-white/[0.07] hover:text-fg" aria-label="Close details">
              <X className="size-4" />
            </button>
          </header>
          <div className="scroll-thin flex-1 overflow-auto px-3 py-2">
            <p className="mb-2 font-serif text-base leading-snug text-cream">{mem?.text ?? msg?.text ?? effect?.summary ?? node.label}</p>
            <dl className="divide-y divide-line">
              {mem && (
                <>
                  <Row k="Category">{mem.category}</Row>
                  <Row k="Scope">{mem.scope}</Row>
                  <Row k="Spoken by">
                    {mem.provenance.speaker} <span className="text-muted">({mem.provenance.speakerRole})</span>
                  </Row>
                  <Row k="Source">{mem.provenance.source}</Row>
                  <Row k="Trust">
                    {mem.trust} · {mem.provenance.trust_tier}
                  </Row>
                  <Row k="Guard">v{mem.guardVersion}</Row>
                  {mem.quarantine && <Row k="Quarantine">{mem.quarantine.incidentId} · depth {mem.quarantine.depth}</Row>}
                </>
              )}
              {act && (
                <>
                  <Row k="Tool">
                    <code>{act.tool}</code>
                  </Row>
                  <Row k="Args">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted">{JSON.stringify(act.args, null, 2)}</pre>
                  </Row>
                  <Row k="Justified by">
                    <div className="flex flex-wrap gap-1">
                      {act.justified_by.map((j) => (
                        <code key={j} className="rounded-full bg-white/[0.06] px-1.5 py-px text-[11px]">
                          {j}
                        </code>
                      ))}
                    </div>
                  </Row>
                  {act.replayOf && <Row k="Replay of">{act.replayOf}</Row>}
                  {effect && (
                    <Row k="Effect">
                      <span className={effect.status === "reversed" ? "line-through opacity-70" : ""}>{effect.summary}</span> {money(effect.amount)}
                      {effect.provider?.name === "stripe" ? (
                        <div className={effect.provider.status === "failed" ? "text-danger" : "text-muted"}>
                          {effect.provider.dashboardUrl ? <a href={effect.provider.dashboardUrl} target="_blank" rel="noopener" className="underline">Stripe test · {effect.provider.status}</a> : `Stripe test · ${effect.provider.status}`}
                          {effect.provider.error && <div>{effect.provider.error}</div>}
                        </div>
                      ) : effect.provider?.name === "simulated" ? <div className="text-muted">simulated</div> : null}
                    </Row>
                  )}
                </>
              )}
              {msg && (
                <>
                  <Row k="Speaker">{msg.speaker}</Row>
                  <Row k="Channel">{msg.channel}</Row>
                  <Row k="At">{time(msg.createdAt)}</Row>
                </>
              )}
              <Row k="Children">{children.length ? children.map((c) => c.kind).join(", ") : "none"}</Row>
            </dl>
          </div>
          {canRollback && (
            <footer className="space-y-2 border-t border-white/10 p-3">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-xs outline-none transition-colors placeholder:text-faint focus:border-accent/60"
                aria-label="Incident reason"
              />
              {source && siblings > 1 ? (
                <>
                  <Button variant="danger" className="w-full" loading={busy} onClick={() => onRollback(source._id, reason)}>
                    <Undo2 /> Roll back source message ({siblings} memories)
                  </Button>
                  <Button variant="ghost" className="w-full" disabled={busy} onClick={() => onRollback(node._id, reason)}>
                    This memory only
                  </Button>
                  <p className="text-[11px] leading-snug text-muted">
                    {source.label.split(":")[0]}’s message wrote {siblings} memories. Rolling back only this one leaves the others active, and the replay will still use them.
                  </p>
                </>
              ) : (
                <>
                  <Button variant="danger" className="w-full" loading={busy} onClick={() => onRollback(node._id, reason)}>
                    <Undo2 /> Roll back from here
                  </Button>
                  <p className="text-[11px] leading-snug text-muted">Quarantines everything downstream, compensates side effects newest-first, and replays affected requests without this {node.kind}.</p>
                </>
              )}
            </footer>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
