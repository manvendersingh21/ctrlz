"use client";

import { useState } from "react";
import { ChevronRight, CreditCard, Hotel, Landmark, Mail, Plane, Undo2 } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import { cn } from "./cn";
import { money, time } from "./format";
import { Bar, Empty, Pill, statusTone } from "./ui";

const FX_ICON: Record<string, typeof Plane> = { flight_booking: Plane, hotel_reservation: Hotel, payment: Landmark, email: Mail };

export function Ledger({ data }: { data: Snapshot }) {
  if (!data.ledger.length) return <Empty>No side effects yet.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-[#170a2a]/95 text-left text-[10px] uppercase tracking-wide text-muted backdrop-blur-sm">
        <tr>
          <th className="px-3 py-1.5 font-medium">Effect</th>
          <th className="px-2 py-1.5 font-medium">Amount</th>
          <th className="px-2 py-1.5 font-medium">Status</th>
          <th className="px-3 py-1.5 font-medium">At</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {data.ledger.map((l) => {
          const Icon = l.compensates ? Undo2 : (FX_ICON[l.type] ?? CreditCard);
          return (
            <tr key={l._id} className={cn(l.compensates && "bg-warn/5")}>
              <td className="px-3 py-1.5">
                <div className="flex items-start gap-2">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", l.compensates ? "text-warn" : "text-muted")} />
                  <div className={cn(l.status === "reversed" && "line-through opacity-60")}>
                    {l.summary}
                    {l.compensates && <span className="ml-1 text-[10px] text-muted">↶ {l.compensates}</span>}
                    <div className="mt-0.5">
                      {l.provider?.name === "stripe" ? (
                        l.provider.dashboardUrl ? (
                          <a href={l.provider.dashboardUrl} target="_blank" rel="noopener" className={cn("rounded-full border px-1.5 py-px text-[10px]", l.provider.status === "failed" ? "border-danger/30 bg-danger/10 text-danger" : "border-info/30 bg-info/10 text-info")}>
                            Stripe test{l.provider.status === "failed" ? " · failed" : ""}
                          </a>
                        ) : <span className="rounded-full border border-danger/30 bg-danger/10 px-1.5 py-px text-[10px] text-danger">Stripe test · {l.provider.status}</span>
                      ) : l.provider?.name === "simulated" ? <span className="text-[10px] text-muted">simulated</span> : null}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-2 py-1.5 tabular-nums">{money(l.amount)}</td>
              <td className="px-2 py-1.5">
                <Pill tone={statusTone(l.status)}>{l.status}</Pill>
              </td>
              <td className="px-3 py-1.5 tabular-nums text-muted">{time(l.createdAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const FILTERS = ["all", "active", "held", "quarantined"] as const;

export function Memories({ data, onSelect }: { data: Snapshot; onSelect: (id: string) => void }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");
  const rows = data.memories.filter((m) => f === "all" || m.status === f);
  return (
    <div>
      <div className="flex gap-1 px-3 py-1.5">
        {FILTERS.map((x) => (
          <button key={x} onClick={() => setF(x)} className={cn("rounded-full px-2.5 py-1 text-[11px] capitalize transition-colors", f === x ? "bg-white/[0.08] text-fg" : "text-muted hover:text-fg")}>
            {x} <span className="tabular-nums opacity-60">{x === "all" ? data.memories.length : data.memories.filter((m) => m.status === x).length}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>No {f} memories.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((m) => (
            <li key={m._id} className="grid cursor-pointer grid-cols-[1fr_auto] gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.04]" onClick={() => onSelect(m._id)}>
              <div className="min-w-0">
                <div className={cn("truncate text-xs", m.status === "quarantined" && "line-through opacity-60")}>{m.text}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                  <span>{m.category}</span>·<span>{m.scope}</span>·
                  <span>
                    {m.provenance.speaker} ({m.provenance.speakerRole})
                  </span>
                  ·<span>{m.provenance.trust_tier}</span>
                </div>
              </div>
              <div className="flex w-24 flex-col items-end gap-1">
                <Pill tone={statusTone(m.status)}>{m.status}</Pill>
                <Bar value={m.trust} max={1} tone={m.trust >= 0.8 ? "ok" : m.trust >= 0.6 ? "warn" : "danger"} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WriteLog({ data }: { data: Snapshot }) {
  if (!data.writes.length) return <Empty>No memory writes yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {data.writes.map((w) => (
        <li key={String(w._id)} className="flex items-start gap-2 px-3 py-1.5 text-xs">
          <Pill tone={statusTone(w.decision)} className="mt-px w-12 justify-center">
            {w.decision}
          </Pill>
          <div className="min-w-0 flex-1">
            <div className="truncate">{w.candidate.text}</div>
            <div className="text-[10px] text-muted">
              {w.candidate.speaker} ({w.candidate.speakerRole}) → {w.candidate.scope} · guard v{w.guardVersion}
              {w.hits.length > 0 && <> · {w.hits.join(", ")}</>}
              {w.similarity > 0 && <> · sim {w.similarity}</>}
            </div>
          </div>
          <span className="tabular-nums text-[10px] text-muted">{time(w.ts)}</span>
        </li>
      ))}
    </ul>
  );
}

export function OpsFeed({ data }: { data: Snapshot }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!data.ops.length) return <Empty>No Atlas operations recorded yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {data.ops.map((o, i) => {
        const id = `${String(o._id ?? i)}`;
        const isOpen = open === id;
        return (
          <li key={id} className="px-3 py-1.5 text-xs">
            <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : id)}>
              <ChevronRight className={cn("size-3 shrink-0 text-muted transition-transform", isOpen && "rotate-90")} />
              <span className="min-w-0 flex-1 truncate font-medium">{o.feature}</span>
              <code className="hidden text-[10px] text-muted sm:inline">{o.collection}</code>
              <span className="w-14 text-right tabular-nums text-muted">{o.ms} ms</span>
              {o.n !== undefined && <Pill>n={o.n}</Pill>}
            </button>
            <div className="pl-5 text-[10px] text-muted">
              {o.step} · {time(o.ts)}
            </div>
            {isOpen && <pre className="scroll-thin mt-1 max-h-64 overflow-auto rounded-lg border border-white/10 bg-white/[0.05] p-2 font-mono text-[10px] leading-snug">{JSON.stringify(o.detail, null, 2)}</pre>}
          </li>
        );
      })}
    </ul>
  );
}
