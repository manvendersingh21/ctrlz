"use client";

import { CheckCircle2, FlaskConical, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import type { IncidentDoc } from "@/lib/rollback";
import type { GuardrailDoc, SplitScore } from "@/lib/types";
import { cn } from "./cn";
import { Bar, Button, Empty, Panel, Pill, statusTone } from "./ui";

const STAGES = ["trace", "quarantine", "plan", "compensate", "replay"] as const;

function Score({ label, base, cand }: { label: string; base: SplitScore; cand: SplitScore }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="grid grid-cols-[88px_1fr_44px] items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="text-muted">attacks blocked</span>
        <div className="space-y-0.5">
          <Bar value={base.attacksBlocked} max={base.attacks} tone="neutral" />
          <Bar value={cand.attacksBlocked} max={cand.attacks} tone="ok" />
        </div>
        <span className="tabular-nums">
          {cand.attacksBlocked}/{cand.attacks}
        </span>
        <span className="text-muted">benign kept</span>
        <div className="space-y-0.5">
          <Bar value={base.benignKept} max={base.benign} tone="neutral" />
          <Bar value={cand.benignKept} max={cand.benign} tone={cand.benignKept < base.benignKept ? "danger" : "ok"} />
        </div>
        <span className="tabular-nums">
          {cand.benignKept}/{cand.benign}
        </span>
      </div>
    </div>
  );
}

function Variant({ g, parent }: { g: GuardrailDoc; parent?: GuardrailDoc }) {
  if (!g.gate) return null;
  const ship = g.gate.decision === "ship";
  const name = g.rationale.match(/^\[([\w-]+)\]/)?.[1] ?? `v${g.version}`;
  const added = g.rules.filter((r) => !parent?.rules.some((p) => p.id === r.id));
  return (
    <div className={cn("space-y-2 rounded-lg border p-2.5", ship ? "border-ok/40" : "border-danger/40")}>
      <div className="flex items-center gap-2">
        {ship ? <ShieldCheck className="size-4 text-ok" /> : <ShieldX className="size-4 text-danger" />}
        <span className="text-xs font-semibold capitalize">{name}</span>
        <code className="text-[11px] text-muted">v{g.version}</code>
        <Pill tone={statusTone(g.status)}>{g.status}</Pill>
        <span className={cn("ml-auto rounded border px-1.5 text-[10px] font-bold tracking-widest", ship ? "border-ok text-ok" : "border-danger text-danger")}>{ship ? "SHIP" : "REJECT"}</span>
      </div>
      <Score label="dev split" base={g.gate.dev.baseline} cand={g.gate.dev.candidate} />
      {g.gate.heldout ? <Score label={`held-out · ${g.gate.heldout.gradedBy}`} base={g.gate.heldout.baseline} cand={g.gate.heldout.candidate} /> : <p className="text-[11px] text-danger">Held-out split unavailable.</p>}
      <ul className="space-y-0.5 text-[11px] text-muted">
        {added.map((r) => (
          <li key={r.id}>
            <code className="text-fg">{r.id}</code> → {r.effect}: {r.description}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncidentPanel({ data, onEvolve, pending }: { data: Snapshot; onEvolve: (incidentId: string) => void; pending: string | null }) {
  const inc = data.incidents[0] as unknown as IncidentDoc | undefined;
  if (!inc)
    return (
      <Panel title="Incident" icon={<ShieldAlert />}>
        <Empty>No incidents. Click a poisoned message or memory in the lineage graph and choose “Roll back from here”.</Empty>
      </Panel>
    );
  const variants = data.guardrails.filter((g) => g.incidentId === inc._id);
  const byDepth = inc.taint.reduce<Record<number, number>>((acc, t) => ({ ...acc, [t.depth]: (acc[t.depth] ?? 0) + 1 }), {});
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Incident <code className="font-normal text-muted">{inc._id}</code>
        </span>
      }
      icon={<ShieldAlert />}
      actions={<Pill tone={statusTone(inc.status)}>{inc.status}</Pill>}
      bodyClassName="scroll-thin overflow-auto"
    >
      <div className="space-y-3 p-3">
        <p className="text-xs text-muted">
          Root <code className="text-fg">{inc.rootId}</code> · {inc.reason}
        </p>
        <ol className="grid grid-cols-5 gap-1">
          {STAGES.map((s) => {
            const t = inc.timeline.find((x) => x.stage === s);
            return (
              <li key={s} className={cn("rounded-md border px-1.5 py-1", t ? "border-ok/40 bg-ok/5" : "border-line")} title={t?.note}>
                <div className="flex items-center gap-1 text-[10px] font-medium capitalize">
                  {t && <CheckCircle2 className="size-3 text-ok" />}
                  {s}
                </div>
                <div className="text-[10px] tabular-nums text-muted">{t ? `${t.ms} ms` : "…"}</div>
              </li>
            );
          })}
        </ol>
        <ul className="space-y-0.5 text-[11px] text-muted">
          {inc.timeline.map((t) => (
            <li key={t.stage}>
              <span className="font-medium capitalize text-fg">{t.stage}:</span> {t.note}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1">
          {Object.entries(byDepth).map(([d, n]) => (
            <Pill key={d} tone="danger">
              depth {d}: {n}
            </Pill>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Column title="Compensated" tone="warn" items={inc.compensations.map((c) => ({ id: c.effectId, text: c.summary, badge: c.outcome === "deduplicated" ? "dedup" : undefined }))} />
          <Column title="Kept" tone="ok" items={inc.kept.map((k) => ({ id: k.effectId, text: k.summary, sub: k.why }))} />
          <Column title="Replayed" tone="info" items={inc.replayed.map((r) => ({ id: r.actionId, text: r.summary, badge: r.deduplicated ? "deduplicated" : undefined }))} />
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 pt-3">
          <FlaskConical className="size-4 text-muted" />
          <span className="text-xs font-semibold">Guardrail evolution</span>
          {variants.length === 0 && (
            <Button variant="primary" className="ml-auto" loading={pending === "evolve"} disabled={inc.status !== "resolved" || pending !== null} onClick={() => onEvolve(inc._id)}>
              Evolve guardrail
            </Button>
          )}
        </div>
        {variants.length === 0 ? (
          <p className="text-[11px] text-muted">Proposes a minimal and a strict rule set from this incident, scores both on the dev split and on a held-out split the proposer never sees, and ships at most one.</p>
        ) : (
          <div className="space-y-2">
            {variants.map((g) => (
              <Variant key={g._id} g={g} parent={data.guardrails.find((p) => p.version === g.parentVersion)} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Column({ title, tone, items }: { title: string; tone: "warn" | "ok" | "info"; items: { id: string; text: string; sub?: string; badge?: string }[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <div className="mb-1 flex items-center gap-1.5">
        <Pill tone={tone}>{title}</Pill>
        <span className="text-[11px] text-muted">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted">none</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="text-[11px] leading-snug">
              {i.text}
              {i.badge && (
                <Pill tone="info" className="ml-1">
                  {i.badge}
                </Pill>
              )}
              {i.sub && <div className="text-muted">{i.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
