"use client";

import { useState } from "react";
import { CloudRain, Flag, ThumbsDown, ThumbsUp, Undo2, Wrench } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import type { Suspect } from "@/lib/blame";
import { cn } from "./cn";
import { time } from "./format";
import { Button, Empty, Pill, type Tone } from "./ui";

type RdEvent = Snapshot["raindrop"][number];

const KIND_ICON = { interaction: CloudRain, tool: Wrench, signal: Flag, diagnostic: Flag } as const;

export const signalTone = (e: Pick<RdEvent, "kind" | "sentiment">): Tone => (e.kind === "diagnostic" ? "danger" : e.sentiment === "POSITIVE" ? "ok" : e.sentiment === "NEGATIVE" ? "warn" : "neutral");

/** Signals and self-diagnostics Raindrop holds for one event, as compact chips. */
export function RaindropChips({ data, eventId }: { data: Snapshot; eventId?: string }) {
  if (!eventId) return null;
  const items = data.raindrop.filter((e) => e.eventId === eventId && (e.kind === "signal" || e.kind === "diagnostic"));
  if (!items.length) return null;
  const seen = new Set<string>();
  return (
    <div className="flex flex-wrap gap-1">
      {items
        .filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)))
        .map((e) => (
          <Pill key={String(e._id)} tone={signalTone(e)} className="max-w-full">
            <CloudRain className="size-3" />
            {e.kind === "diagnostic" ? `self-diagnosed: ${e.name}` : e.name}
          </Pill>
        ))}
    </div>
  );
}

export interface FeedbackResult {
  suspects: Suspect[];
  suggestedRoot: string | null;
}

/** Thumbs on an agent reply → Raindrop feedback signal; thumbs-down → blame → one-click rollback. */
export function FeedbackBar({ eventId, onFeedback, onRollback, busy }: { eventId: string; onFeedback: (eventId: string, rating: "up" | "down") => Promise<FeedbackResult | null>; onRollback: (rootId: string) => void; busy: boolean }) {
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const rate = async (r: "up" | "down") => {
    setRated(r);
    const res = await onFeedback(eventId, r);
    if (r === "down") setResult(res);
  };
  return (
    <div className="flex w-full max-w-[92%] flex-col gap-1">
      <div className="flex items-center gap-1 text-muted">
        <button aria-label="Good reply" onClick={() => void rate("up")} className={cn("rounded p-0.5 hover:bg-panel-2 hover:text-ok", rated === "up" && "text-ok")}>
          <ThumbsUp className="size-3" />
        </button>
        <button aria-label="Bad reply" onClick={() => void rate("down")} className={cn("rounded p-0.5 hover:bg-panel-2 hover:text-danger", rated === "down" && "text-danger")}>
          <ThumbsDown className="size-3" />
        </button>
      </div>
      {result && (
        <div className="space-y-1.5 rounded-lg border border-danger/40 bg-danger/5 p-2 text-[11px]">
          {result.suspects.length === 0 ? (
            <p className="text-muted">Feedback sent to Raindrop. No suspicious memory behind this reply.</p>
          ) : (
            <>
              <p className="font-medium">Most likely cause</p>
              {result.suspects.slice(0, 2).map((s) => (
                <div key={s.memoryId}>
                  <span>“{s.text}”</span>
                  <div className="text-muted">{s.reasons.join(" · ")}</div>
                </div>
              ))}
              {result.suggestedRoot && (
                <Button variant="danger" loading={busy} onClick={() => onRollback(result.suggestedRoot!)}>
                  <Undo2 /> Roll back {result.suggestedRoot.startsWith("msg_") ? "source message" : "memory"}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function RaindropFeed({ data }: { data: Snapshot }) {
  const [filter, setFilter] = useState<"all" | "signals">("signals");
  const rows = data.raindrop.filter((e) => filter === "all" || e.kind === "signal" || e.kind === "diagnostic");
  const mode = data.config.raindrop;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[11px]">
        <Pill tone={mode === "cloud" ? "ok" : mode === "workshop" ? "info" : "neutral"}>
          <CloudRain className="size-3" /> {mode === "cloud" ? "streaming to Raindrop" : mode === "workshop" ? "streaming to Raindrop Workshop" : "mirror only — set RAINDROP_WRITE_KEY to stream"}
        </Pill>
        {(["signals", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-2.5 py-1 capitalize transition-colors", filter === f ? "bg-white/[0.08] text-fg" : "text-muted hover:text-fg")}>
            {f === "signals" ? "Signals & diagnostics" : "Everything"}
          </button>
        ))}
        <span className="ml-auto text-muted">{data.raindrop.length} payloads</span>
      </div>
      {rows.length === 0 ? (
        <Empty>Nothing reported yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((e) => {
            const Icon = KIND_ICON[e.kind as keyof typeof KIND_ICON] ?? Flag;
            const props = (e.properties ?? {}) as Record<string, unknown>;
            return (
              <li key={String(e._id)} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", e.kind === "diagnostic" ? "text-danger" : "text-muted")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{e.name}</span>
                    <Pill tone={signalTone(e)}>{e.kind}</Pill>
                    <code className="text-[10px] text-muted">{e.eventId}</code>
                  </div>
                  <div className="truncate text-[10px] text-muted">
                    {e.description ??
                      (typeof e.output === "string" ? e.output : undefined) ??
                      Object.entries(props)
                        .slice(0, 5)
                        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
                        .join(" · ")}
                  </div>
                </div>
                <span className="tabular-nums text-[10px] text-muted">{time(e.ts)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
