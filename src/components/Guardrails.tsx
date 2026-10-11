"use client";

import { History, Shield } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import { cn } from "./cn";
import { Button, Panel, Pill, statusTone } from "./ui";

export function Guardrails({ data, onRevert, pending }: { data: Snapshot; onRevert: () => void; pending: string | null }) {
  const active = data.guardrails.find((g) => g.status === "active");
  const versions = [...data.guardrails].reverse();
  return (
    <Panel
      title="Write guardrail"
      icon={<Shield />}
      actions={
        <>
          {active && <Pill tone="ok">v{active.version} active</Pill>}
          {active?.parentVersion && (
            <Button variant="ghost" loading={pending === "revert"} disabled={pending !== null} onClick={onRevert} title={`Revert to v${active.parentVersion}`}>
              <History /> Revert
            </Button>
          )}
        </>
      }
      bodyClassName="scroll-thin max-h-72 overflow-auto"
    >
      <ul className="divide-y divide-line">
        {versions.map((g) => (
          <li key={g._id} className={cn("space-y-1 px-3 py-2", g.status !== "active" && "opacity-70")}>
            <div className="flex items-center gap-1.5">
              <code className="text-xs font-semibold">v{g.version}</code>
              <Pill tone={statusTone(g.status)}>{g.status}</Pill>
              <Pill>{g.proposedBy}</Pill>
              <span className="ml-auto text-[10px] text-muted">{g.rules.length} rules</span>
            </div>
            <p className="line-clamp-2 text-[11px] text-muted">{g.rationale}</p>
            {g.status === "active" && (
              <ul className="space-y-0.5">
                {g.rules.map((r) => (
                  <li key={r.id} className="flex items-start gap-1.5 text-[11px]">
                    <Pill tone={r.effect === "block" ? "danger" : "violet"} className="mt-px">
                      {r.effect}
                    </Pill>
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
