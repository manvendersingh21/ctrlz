"use client";

import { Check, Circle, Play } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import { cn } from "./cn";

const TONE = {
  attack: "border-white/10 hover:border-danger/50 hover:bg-danger/5",
  task: "border-white/10 hover:border-info/50 hover:bg-info/5",
  benign: "border-white/10 hover:border-ok/50 hover:bg-ok/5",
} as const;

export function ScriptRail({ data, onRun, pending }: { data: Snapshot; onRun: (step: Snapshot["script"][number]) => void; pending: string | null }) {
  const sent = new Set(data.messages.filter((m) => m.role === "user").map((m) => m.text));
  return (
    <div className="scroll-thin grid gap-2.5 overflow-x-auto pb-1 sm:grid-cols-2 xl:grid-cols-3">
      {data.script.map((s, i) => {
        const done = sent.has(s.text);
        const running = pending === `script:${s.id}`;
        return (
          <button
            key={s.id}
            onClick={() => onRun(s)}
            disabled={pending !== null}
            title={s.text}
            className={cn("group flex min-h-[92px] min-w-[220px] items-start gap-3 rounded-2xl border bg-white/[0.03] p-3.5 text-left backdrop-blur-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60", TONE[s.tone], done && "border-ok/30 bg-ok/[0.04]")}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold", done ? "border-ok/30 bg-ok/10 text-ok" : s.tone === "attack" ? "border-danger/25 bg-danger/5 text-danger" : s.tone === "benign" ? "border-ok/25 bg-ok/5 text-ok" : "border-info/25 bg-info/5 text-info")}>
              {done ? <Check className="size-4" /> : running ? <Play className="size-3 animate-pulse" /> : <Circle className="size-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2 text-xs font-semibold text-fg"><span className="font-serif text-sm italic text-faint">{String(i + 1).padStart(2, "0")}</span>{s.label}</span>
              <span className="mt-1.5 line-clamp-2 block text-[10px] leading-4 text-muted">{s.text}</span>
              <span className={cn("mt-2 block text-[9px] font-semibold uppercase tracking-[0.14em]", done ? "text-ok" : "text-faint")}>{done ? "Complete" : running ? "Running" : "Run step"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
