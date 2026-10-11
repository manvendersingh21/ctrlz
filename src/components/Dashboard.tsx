"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, ArrowDown, ArrowUpRight, Compass, Database, Loader2, Network, RotateCcw, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import type { IncidentDoc } from "@/lib/rollback";
import type { AgentId } from "@/lib/types";
import { ChatPane } from "./ChatPane";
import { cn } from "./cn";
import { Guardrails } from "./Guardrails";
import { GuidedDemo } from "./GuidedDemo";
import { IncidentPanel } from "./IncidentPanel";
import { LineageGraph } from "./LineageGraph";
import { NodeDrawer } from "./NodeDrawer";
import { ScriptRail } from "./ScriptRail";
import { RaindropFeed, type FeedbackResult } from "./Raindrop";
import { Ledger, Memories, OpsFeed, WriteLog } from "./Tables";
import { Button, Empty, Panel, Pill, Reveal } from "./ui";
import { useSnapshot } from "./useSnapshot";

const TABS = ["Ledger", "Memories", "Write log", "Raindrop", "Atlas ops"] as const;

/** "ask" = first visit: offer the guided demo before anything else. */
type GuideState = { mode: "ask" | "off" | "open" | "paused"; step: number };
const GUIDE_KEY = "ctrlz.guide";

/** The guide's position is a per-viewer convenience: restore it after a reload, but never depend on it. */
function loadGuide(): GuideState {
  try {
    const g = JSON.parse(window.localStorage.getItem(GUIDE_KEY) ?? "null") as GuideState | null;
    if (g && ["off", "open", "paused"].includes(g.mode) && Number.isInteger(g.step)) return g;
  } catch {}
  return { mode: "ask", step: 0 };
}

export function Dashboard() {
  const { data, error, pending, call, toast, toasts } = useSnapshot();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Ledger");
  const [confirmReset, setConfirmReset] = useState(false);
  const [guide, setGuideState] = useState<GuideState>(() => (typeof window === "undefined" ? { mode: "off", step: 0 } : loadGuide()));
  const setGuide = (g: Partial<GuideState>) =>
    setGuideState((cur) => {
      const next = { ...cur, ...g };
      try {
        window.localStorage.setItem(GUIDE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const tainted = useMemo(() => new Set(((data?.incidents[0] as unknown as IncidentDoc | undefined)?.taint ?? []).map((t) => t._id)), [data]);

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        {error ? (
          <div className="max-w-md space-y-2 rounded-2xl border border-danger/40 bg-white/[0.04] p-5 text-sm backdrop-blur-xl">
            <div className="flex items-center gap-2 font-semibold text-danger">
              <AlertTriangle className="size-4" /> Can’t reach the harness
            </div>
            <p className="text-muted">{error}</p>
            <p className="text-xs text-muted">Is MongoDB running? Start Atlas Local with docker compose or set MONGODB_URI, then reset the world.</p>
          </div>
        ) : (
          <Loader2 className="size-5 animate-spin text-muted" />
        )}
      </div>
    );
  }

  const send = async (agentId: AgentId, speaker: string, text: string, label = `chat:${agentId}`) => (await call(label, "/api/chat", { agentId, speaker, text })) !== null;
  const rollback = async (rootId: string, reason = "reported as poisoned") => {
    const r = await call<IncidentDoc>("incident", "/api/incident", { rootId, reason });
    if (r) toast("ok", `${r._id}: ${r.compensations.length} compensated · ${r.kept.length} kept · ${r.replayed.length} replayed`);
  };
  const resetWorld = async () => {
    const ok = (await call("reset", "/api/reset")) !== null;
    if (ok) setSelected(null);
    return ok;
  };
  const evolve = async (incidentId: string) => {
    const r = await call<{ shipped: { version: number } | null }>("evolve", "/api/evolve", { incidentId });
    if (r) toast("ok", r.shipped ? `Guardrail v${r.shipped.version} shipped` : "No variant passed the gate");
  };
  const rate = (eventId: string, rating: "up" | "down") => call<FeedbackResult>(`feedback:${eventId}`, "/api/feedback", { eventId, rating });
  const empty = data.guardrails.length === 0;

  return (
    <div className="mx-auto flex max-w-[1640px] flex-col gap-8 px-4 py-6 sm:px-10 sm:py-8">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-white/10 pb-5">
        <Link href="/" className="text-xs font-medium text-muted transition-colors hover:text-fg" aria-label="Back to ctrlz home">
          ← ctrlz
        </Link>
        <span aria-hidden className="hidden h-4 w-px bg-white/10 sm:block" />
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/[0.06] shadow-[0_0_26px_rgb(229_116_255/0.28)]">
            <Undo2 className="size-4 text-cream" />
          </div>
          <div>
            <h1 className="font-serif text-xl leading-none tracking-tight">Operations console</h1>
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-faint">Agent memory defense</p>
          </div>
        </div>
        <nav className="ml-4 hidden items-center gap-6 text-xs text-muted lg:flex" aria-label="Main navigation">
          <a className="transition-colors hover:text-fg" href="#mission-console">Mission control</a>
          <a className="transition-colors hover:text-fg" href="#mission-console">Incident response</a>
          <a className="transition-colors hover:text-fg" href="#mission-console">Guardrails</a>
        </nav>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="ok">
            <Database className="size-3" /> {data.config.atlas}
          </Pill>
          <Pill>{data.config.embed}</Pill>
          <Pill>rerank: {data.config.rerank}</Pill>
          <Pill tone={data.config.llm === "rule-based fallback" ? "warn" : "accent"}>LLM: {data.config.llm}</Pill>
          <Pill tone={data.config.graderRole ? "ok" : "neutral"}>grader role: {data.config.graderRole ? "separate" : "local"}</Pill>
          <Pill tone={data.config.raindrop === "mirror-only" ? "neutral" : "ok"}>Raindrop: {data.config.raindrop}</Pill>
          <Pill tone="info">epoch {data.epoch}</Pill>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {error && (
            <Pill tone="danger">
              <AlertTriangle className="size-3" /> stale: {error}
            </Pill>
          )}
          {confirmReset ? (
            <>
              <span className="text-xs text-muted">Wipe and reseed?</span>
              <Button variant="danger" loading={pending === "reset"} onClick={async () => { await resetWorld(); setConfirmReset(false); }}>
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirmReset(true)} disabled={pending !== null}>
              <RotateCcw /> Reset world
            </Button>
          )}
          <Button id="guide-start" variant="primary" onClick={() => setGuide({ mode: "open" })} aria-pressed={guide.mode === "open"}>
            <Compass /> {guide.mode === "paused" ? "Resume guided demo" : guide.mode === "open" ? "Guided demo on" : "Start guided demo"}
          </Button>
        </div>
      </header>

      <Reveal>
        <section className="mission-glow relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 backdrop-blur-sm sm:px-12 sm:py-14">
          <div className="mission-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <div className="pointer-events-none absolute -right-8 -top-28 -z-10 size-[420px] rounded-full border border-accent/15 sm:right-20 sm:size-[500px]">
            <div className="absolute inset-8 rounded-full border border-accent/10" />
            <div className="absolute inset-20 rounded-full border border-dashed border-accent/15" />
            <div className="absolute left-[18%] top-[18%] size-3 rounded-full bg-ok shadow-[0_0_22px_#7bf583]" />
            <div className="absolute bottom-[19%] right-[20%] size-2 rounded-full bg-info shadow-[0_0_18px_#9565ff]" />
          </div>
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px] lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cream">
                <Sparkles className="size-3 text-accent" /> Agent memory defense · live simulation
              </div>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-accent">Know what your agents know</p>
              <h2 className="max-w-2xl font-serif text-5xl leading-[0.98] tracking-[-0.02em] sm:text-7xl">
                Undo what your agent <em className="italic text-accent">learned wrong.</em>
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-muted sm:text-base">
                Trace poisoned memory through every agent action. Quarantine the source, undo its impact, and replay cleanly—with proof at every step.
              </p>
              <a href="#mission-console" className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-fg px-6 text-xs font-bold text-[#160923] transition-transform hover:-translate-y-0.5">
                Begin your mission <ArrowDown className="size-4" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
              <BriefStat label="Lineage nodes" value={data.lineage.length} detail="causal evidence" />
              <BriefStat label="Memories" value={data.memories.length} detail="under watch" />
              <BriefStat label="Incidents" value={data.incidents.length} detail="response history" />
              <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-ok/20 bg-ok/5 p-4 sm:col-span-1 lg:col-span-2">
                <ShieldCheck className="size-5 shrink-0 text-ok" />
                <div><p className="text-xs font-semibold text-fg">Rollback ready</p><p className="mt-1 text-[10px] text-muted">Compensate · replay · verify</p></div>
                <ArrowUpRight className="ml-auto size-4 text-ok" />
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {empty ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-xl">
          <p className="mb-3 text-sm text-muted">The world hasn’t been seeded yet.</p>
          <Button variant="primary" loading={pending === "reset"} onClick={() => void resetWorld()}>
            Seed demo world
          </Button>
        </div>
      ) : (
        <>
          <section id="mission-console" className="scroll-mt-8 space-y-4">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">01 — Mission control</p><h2 className="mt-1.5 font-serif text-2xl tracking-tight text-cream">Run the threat simulation</h2></div>
                <p className="max-w-md text-xs leading-5 text-muted">Follow the guided scenario from suspicious memory to verified recovery. Each step updates the live evidence below.</p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <ScriptRail data={data} pending={pending} onRun={(s) => void send(s.agentId, s.speaker, s.text, `script:${s.id}`)} />
            </Reveal>
          </section>
          <Reveal delay={0.12}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_400px]">
              <div className="flex flex-col gap-4">
                <ChatPane data={data} agentId="concierge" busy={pending === "chat:concierge"} onSend={(sp, t) => send("concierge", sp, t)} onFeedback={rate} onRollback={(id) => void rollback(id, "thumbs-down on agent reply")} rollbackBusy={pending === "incident"} />
                <ChatPane data={data} agentId="finance" busy={pending === "chat:finance"} onSend={(sp, t) => send("finance", sp, t)} onFeedback={rate} onRollback={(id) => void rollback(id, "thumbs-down on agent reply")} rollbackBusy={pending === "incident"} />
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <Panel
                  title="Causal lineage"
                  icon={<Network />}
                  actions={
                    <span className="hidden items-center gap-1.5 text-[10px] text-muted md:flex">
                      <Legend c="bg-danger" t="quarantined" />
                      <Legend c="bg-warn" t="compensated" />
                      <Legend c="bg-ok" t="kept" />
                      <Legend c="bg-violet" t="held" />
                      <Legend c="bg-info" t="deduped" />
                    </span>
                  }
                  className="relative h-[520px]"
                  id="guide-lineage"
                >
                  {data.lineage.length ? (
                    <LineageGraph lineage={data.lineage} tainted={tainted} selected={selected} onSelect={setSelected} />
                  ) : (
                    <Empty>No lineage yet.</Empty>
                  )}
                  <NodeDrawer
                    data={data}
                    id={selected}
                    busy={pending === "incident"}
                    onClose={() => setSelected(null)}
                    onRollback={(rootId, reason) => void rollback(rootId, reason)}
                  />
                </Panel>
                <Panel
                  title={
                    <div className="flex gap-1">
                      {TABS.map((t) => (
                        <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={cn("guide-focus rounded-full px-2.5 py-1 text-[11px] transition-colors", tab === t ? "bg-white/[0.08] text-fg" : "font-normal text-muted hover:text-fg")}>
                          {t}
                        </button>
                      ))}
                    </div>
                  }
                  icon={<Activity />}
                  id="guide-evidence"
                  className="h-[360px]"
                  bodyClassName="scroll-thin overflow-auto"
                >
                  {tab === "Ledger" && <Ledger data={data} />}
                  {tab === "Memories" && <Memories data={data} onSelect={setSelected} />}
                  {tab === "Write log" && <WriteLog data={data} />}
                  {tab === "Raindrop" && <RaindropFeed data={data} />}
                  {tab === "Atlas ops" && <OpsFeed data={data} />}
                </Panel>
              </div>

              <div className="flex flex-col gap-4">
                <div id="guide-incident" className="flex min-h-0 flex-col rounded-2xl">
                  <IncidentPanel data={data} pending={pending} onEvolve={(incidentId) => void evolve(incidentId)} />
                </div>
                <Guardrails data={data} pending={pending} onRevert={() => void call("revert", "/api/guardrail/revert")} />
              </div>
            </div>
          </Reveal>
        </>
      )}

      {guide.mode === "ask" && (
        <section aria-labelledby="guide-offer" className="fixed bottom-4 left-4 z-40 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-accent/40 bg-[#1c0e30]/95 p-4 shadow-[0_18px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-accent" />
            <h2 id="guide-offer" className="font-serif text-lg leading-tight text-cream">Do you need a guided demo?</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">A short walkthrough: Mallory poisons Alice’s travel memory, the agent acts on it, and you roll it back. About 3 minutes, and you click every step yourself.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {/* Offered on first visit only, so taking focus here points keyboard users at the choice. */}
            <Button variant="primary" autoFocus onClick={() => setGuide({ mode: "open", step: 0 })}>
              <Compass /> Yes, guide me
            </Button>
            <Button variant="ghost" onClick={() => setGuide({ mode: "off" })}>
              No thanks, I’ll explore
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-faint">You can start it any time from the header.</p>
        </section>
      )}

      {(guide.mode === "open" || guide.mode === "paused") && (
        <>
          {/* Room to scroll the page's bottom edge out from under the docked guide. */}
          {guide.mode === "open" && <div aria-hidden className="h-[52vh] sm:h-40" />}
          <GuidedDemo
            data={data}
            pending={pending}
            step={guide.step}
            paused={guide.mode === "paused"}
            onStep={(step) => setGuide({ step })}
            onPause={(p) => setGuide({ mode: p ? "paused" : "open" })}
            onExit={() => {
              setGuide({ mode: "off" });
              // The guide unmounts; hand keyboard focus back to its entry point.
              requestAnimationFrame(() => document.getElementById("guide-start")?.focus());
            }}
            onRun={(s) => void send(s.agentId, s.speaker, s.text, `script:${s.id}`)}
            onReset={resetWorld}
            onEvolve={(incidentId) => void evolve(incidentId)}
            onSelect={setSelected}
            onShowTab={setTab}
          />
        </>
      )}

      {/* On phones the open guide is a bottom sheet, so toasts move to the top. */}
      <div className={cn("pointer-events-none fixed right-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2", guide.mode === "open" ? "top-4 sm:top-auto sm:bottom-4" : "bottom-4")}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
              className={cn("pointer-events-auto rounded-xl border bg-[#1c0e30]/90 px-3 py-2 text-xs text-cream shadow-lg backdrop-blur-xl", t.tone === "error" ? "border-danger/50 text-danger" : "border-ok/40")}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-2 rounded-full", c)} />
      {t}
    </span>
  );
}

function BriefStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className="mt-2 font-serif text-3xl leading-none tracking-tight text-fg">{value.toLocaleString()}</p>
      <p className="mt-1.5 text-[10px] text-muted">{detail}</p>
    </div>
  );
}
