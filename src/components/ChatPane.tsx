"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import type { AgentId } from "@/lib/types";
import { cn } from "./cn";
import { time } from "./format";
import { FeedbackBar, RaindropChips, type FeedbackResult } from "./Raindrop";
import { Button, Empty, Panel, Pill, statusTone } from "./ui";

const ROLE_TONE = { employee: "info", finance_admin: "ok", guest: "danger" } as const;

export function ChatPane({
  data,
  agentId,
  onSend,
  busy,
  onFeedback,
  onRollback,
  rollbackBusy,
}: {
  data: Snapshot;
  agentId: AgentId;
  onSend: (speaker: string, text: string) => Promise<boolean>;
  busy: boolean;
  onFeedback: (eventId: string, rating: "up" | "down") => Promise<FeedbackResult | null>;
  onRollback: (rootId: string) => void;
  rollbackBusy: boolean;
}) {
  const [speaker, setSpeaker] = useState(agentId === "finance" ? "bob" : "alice");
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const msgs = data.messages.filter((m) => m.channel === agentId && !(m.role === "user" && data.lineage.find((l) => l._id === m._id)?.status === "seed"));
  const writesByText = new Map(data.writes.map((w) => [w.candidate.text as string, w]));

  useEffect(() => {
    // Scroll only the message list — scrollIntoView would scroll the whole page on every poll.
    const list = end.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [msgs.length]);

  const submit = async () => {
    if (!text.trim()) return;
    if (await onSend(speaker, text.trim())) setText("");
  };

  return (
    <Panel title={agentId === "concierge" ? "Concierge agent" : "Finance agent"} icon={<Bot />} actions={<Pill>{msgs.length} msgs</Pill>} className="h-[340px]" bodyClassName="flex flex-col">
      <div className="scroll-thin flex-1 space-y-2 overflow-auto p-3">
        {msgs.length === 0 && <Empty>No messages yet — use the demo script above or type below.</Empty>}
        {msgs.map((m) => {
          const user = data.users[m.speaker as keyof Snapshot["users"]];
          const isUser = m.role === "user";
          const writes = isUser ? data.memories.filter((mem) => mem.provenance.messageId === m._id) : [];
          return (
            <div key={m._id} className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
              <div className="flex items-center gap-1.5 text-[10px] text-muted">
                {isUser ? (
                  <>
                    <span className="font-medium text-fg">{user?.name ?? m.speaker}</span>
                    {user && <Pill tone={ROLE_TONE[user.role as keyof typeof ROLE_TONE] ?? "neutral"}>{user.role}</Pill>}
                  </>
                ) : (
                  <span className="font-medium text-fg">{m.replayOf ? "replay" : agentId}</span>
                )}
                <span>{time(m.createdAt)}</span>
              </div>
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-snug",
                  isUser ? "border border-accent/25 bg-accent/10" : "border border-white/10 bg-white/[0.04]",
                  m.replayOf && "border-info/40 bg-info/5",
                )}
              >
                {m.replayOf && <RotateCcw className="mr-1 inline size-3 text-info" />}
                {m.text}
              </div>
              {!isUser && <RaindropChips data={data} eventId={m.eventId} />}
              {!isUser && m.eventId && <FeedbackBar eventId={m.eventId} onFeedback={onFeedback} onRollback={onRollback} busy={rollbackBusy} />}
              {writes.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {writes.map((w) => {
                    const log = writesByText.get(w.text);
                    return (
                      <Pill key={w._id} tone={statusTone(w.status === "active" ? "allow" : w.status)} className="max-w-full">
                        {w.category} · {w.status}
                        {log && log.hits.length > 0 && <span className="opacity-70">({log.hits.join(", ")})</span>}
                      </Pill>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form
        className="flex items-center gap-1.5 border-t border-white/10 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="h-8 rounded-lg border border-white/10 bg-white/[0.05] px-1.5 text-xs outline-none transition-colors focus:border-accent/60" aria-label="Speaker">
          {Object.entries(data.users).map(([id, u]) => (
            <option key={id} value={id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message the ${agentId} agent…`}
          maxLength={1000}
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-xs outline-none transition-colors placeholder:text-faint focus:border-accent/60"
        />
        <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </Panel>
  );
}
