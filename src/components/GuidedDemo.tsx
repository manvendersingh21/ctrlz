"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Circle, Compass, Info, Pause, Play, RotateCcw, X } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import { cn } from "./cn";
import { guideStatus, guideSucceeded, sentCard, storyIncident, type Check } from "./guide";
import { Button } from "./ui";

type ScriptStep = Snapshot["script"][number];
export type EvidenceTab = "Ledger" | "Memories" | "Write log";

interface Props {
  data: Snapshot;
  pending: string | null;
  step: number;
  paused: boolean;
  onStep: (step: number) => void;
  onPause: (paused: boolean) => void;
  onExit: () => void;
  onRun: (step: ScriptStep) => void;
  onReset: () => Promise<boolean>;
  onEvolve: (incidentId: string) => void;
  onSelect: (id: string) => void;
  onShowTab: (tab: EvidenceTab) => void;
}

interface StepCopy {
  title: string;
  /** What to do. */
  todo: string;
  /** What the app is doing. */
  app: string;
  /** What to notice on screen. */
  notice: string;
  /** Observational steps can't be "detected"; the user continues manually. */
  manual?: boolean;
}

const STEPS: StepCopy[] = [
  {
    title: "Reset the demo world",
    todo: "Press Reset world below and confirm. This wipes everything in this console’s world, including chats you ran yourself, and reseeds it.",
    app: "Clears the demo collections and reseeds Alice, Bob, Mallory, their starting memories, and guardrail v1.",
    notice: "Ledger and incidents empty out. The Memories tab shows only the seed memories.",
  },
  {
    title: "Mallory poisons Alice’s travel memory",
    todo: "Run card 01. Mallory, a guest contractor, tells the concierge that Alice’s card changed and receipts should go to an outside address.",
    app: "The write guardrail checks the message and decides whether to store it, holding on to who said it and how much to trust it.",
    notice: "Memories tab: a payment memory spoken by mallory (guest). Lineage: Mallory’s message now feeds memory nodes.",
  },
  {
    title: "The concierge acts on the poisoned memory",
    todo: "Run card 02. Alice asks for a Tokyo flight, a Park Hyatt hotel, and a receipt email.",
    app: "The concierge retrieves Alice’s memories, including Mallory’s, and books. Every action records which memories justified it.",
    notice: "Ledger: which card the flight was charged to, and whether each effect is Stripe test mode or simulated. Lineage: actions now hang off Mallory’s memory.",
  },
  {
    title: "Roll back Mallory’s source",
    todo: "Select Mallory’s message in the lineage graph (or use the button below), then press the roll back button in the drawer that opens.",
    app: "Traces everything downstream, quarantines it in a database transaction when supported (otherwise an explicitly non-atomic sequential fallback), plans a clean replay, compensates bad effects newest-first, then replays Alice’s request without the poison.",
    notice: "Incident panel: the five stages tick off. Lineage colors: magenta quarantined, peach compensated, green kept.",
  },
  {
    title: "Check the compensation and the kept hotel",
    todo: "Read the incident’s Compensated, Kept and Replayed columns, and the Ledger tab.",
    app: "The wrong-card flight charge is compensated and the clean replay runs. Refunds use Stripe test mode only when configured; hotel, invoice, and email effects are sandbox simulations. The hotel is kept only when the incident evidence confirms a matching booking.",
    notice: "The live evidence below comes straight from this incident. Continue when you’ve shown it.",
    manual: true,
  },
  {
    title: "Evolve the guardrail",
    todo: "Press Evolve guardrail.",
    app: "Proposes minimal and strict rule sets from this incident, scores each on a dev split and, when available, a held-out split, and ships at most one.",
    notice: "SHIP / REJECT cards with scores. If a variant ships, the Write guardrail panel shows it as the new active version. These are small smoke sets: they gate what ships, they don’t prove generalization.",
  },
  {
    title: "Mallory re-attacks; Alice updates her own card",
    todo: "Run card 05 (Mallory paraphrases the attack), then card 06 (Alice changes her own card).",
    app: "Same kind of memory write, different speaker. The guardrail judges each write by who said it and what it touches.",
    notice: "Simulation only: this console lets you choose Alice or Mallory; the API trusts that demo choice. It is not authenticated identity. Production must bind speaker identity to a verified session or trusted platform event before evaluating guardrails.",
  },
];

const CARD: Record<number, string[]> = { 1: ["poison-card"], 2: ["book-trip"], 6: ["reattack", "legit-update"] };

/** Scrolls an anchor into view and briefly outlines it. Aligns to the top so the mobile sheet never covers it. */
function spotlight(id: string, focus = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.classList.add("guide-spotlight");
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  setTimeout(() => el.classList.remove("guide-spotlight"), 2400);
  if (focus) el.focus({ preventScroll: true });
}

export function GuidedDemo({ data, pending, step, paused, onStep, onPause, onExit, onRun, onReset, onEvolve, onSelect, onShowTab }: Props) {
  const status = useMemo(() => guideStatus(data), [data]);
  const succeeded = guideSucceeded(status);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resume = useRef<HTMLButtonElement>(null);
  const finished = step >= STEPS.length;
  const copy = STEPS[Math.min(step, STEPS.length - 1)];
  const s = status[Math.min(step, STEPS.length - 1)];
  const busy = pending !== null;
  const inc = storyIncident(data);
  const msg01 = sentCard(data, "poison-card");

  // Keep keyboard focus inside the guide: the step heading when it opens, resumes, or changes step; the resume pill when paused.
  useEffect(() => {
    (paused ? resume.current : heading.current)?.focus({ preventScroll: true });
  }, [step, paused]);
  const warned = s.checks.some((c) => c.tone === "warn");

  const go = (n: number) => {
    setConfirmReset(false);
    setResetFailed(false);
    onStep(Math.max(0, Math.min(STEPS.length, n)));
  };

  if (paused) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <button
          ref={resume}
          onClick={() => onPause(false)}
          className="guide-focus inline-flex h-10 items-center gap-2 rounded-full border border-accent/40 bg-[#1c0e30]/95 px-4 text-xs font-medium text-cream shadow-lg backdrop-blur-xl transition-colors hover:border-accent"
          aria-label={`Resume guided demo, ${finished ? "finished" : `step ${step + 1} of ${STEPS.length}`}`}
        >
          <Play className="size-3.5 text-accent" /> Guided demo paused · {finished ? "done" : `step ${step + 1}/${STEPS.length}`}
        </button>
      </div>
    );
  }

  const cards = (CARD[step] ?? []).map((id) => data.script.find((x) => x.id === id)).filter((x): x is ScriptStep => !!x);
  const cardNo = (id: string) => String(data.script.findIndex((x) => x.id === id) + 1).padStart(2, "0");

  let actions: ReactNode = null;
  if (!finished) {
    if (step === 0) {
      actions = confirmReset ? (
        <>
          <span className="text-xs text-muted">Wipe and reseed?</span>
          <Button
            variant="danger"
            loading={pending === "reset"}
            disabled={busy}
            onClick={async () => {
              const ok = await onReset();
              setConfirmReset(false);
              setResetFailed(!ok);
            }}
          >
            Confirm reset
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="primary" disabled={busy} onClick={() => setConfirmReset(true)}>
          <RotateCcw /> {data.guardrails.length ? "Reset world" : "Seed demo world"}
        </Button>
      );
    } else if (cards.length) {
      const evidenceTab: EvidenceTab | null = step === 2 ? "Ledger" : step === 6 ? "Write log" : null;
      const runButtons = cards.map((c) => {
        const sent = !!sentCard(data, c.id);
        return (
          <span key={c.id} className="flex items-center gap-1">
            <Button variant={sent ? "outline" : "primary"} loading={pending === `script:${c.id}`} disabled={busy} onClick={() => onRun(c)}>
              <Play /> Run card {cardNo(c.id)}{sent ? " again" : ""}
            </Button>
            <Button variant="ghost" onClick={() => spotlight(`script-${c.id}`)} aria-label={`Show card ${cardNo(c.id)} in the script rail`}>
              Show
            </Button>
          </span>
        );
      });
      actions = (
        <>
          {runButtons}
          {evidenceTab && (
            <Button variant="ghost" onClick={() => { onShowTab(evidenceTab); spotlight("guide-evidence"); }}>
              Show {evidenceTab.toLowerCase()}
            </Button>
          )}
        </>
      );
    } else if (step === 3) {
      actions = (
        <Button
          variant="primary"
          disabled={!msg01 || inc?.status === "resolved"}
          onClick={() => {
            if (!msg01) return;
            onSelect(msg01._id);
            // The drawer animates in; once it exists, bring its rollback button into view and focus it.
            setTimeout(() => (document.getElementById("guide-rollback") ? spotlight("guide-rollback", true) : spotlight("guide-lineage")), 250);
          }}
        >
          Select Mallory’s message
        </Button>
      );
    } else if (step === 4) {
      actions = (
        <>
          <Button variant="outline" onClick={() => spotlight("guide-incident")}>Show incident</Button>
          <Button variant="ghost" onClick={() => { onShowTab("Ledger"); spotlight("guide-evidence"); }}>Show ledger</Button>
        </>
      );
    } else if (step === 5) {
      const evolved = status[5].done;
      actions = (
        <>
          <Button variant="primary" loading={pending === "evolve"} disabled={busy || !inc || inc.status !== "resolved" || evolved} onClick={() => inc && onEvolve(inc._id)}>
            Evolve guardrail
          </Button>
          <Button variant="ghost" onClick={() => spotlight("guide-incident")}>Show incident</Button>
        </>
      );
    }
  }

  const blocker =
    !finished && !s.done
      ? step === 3 && !msg01
        ? "Card 01 hasn’t run yet, so there’s no Mallory message to roll back."
        : step === 4 && inc?.status !== "resolved"
          ? "Finish the rollback first; the evidence appears once the incident resolves."
          : step === 5 && !inc
            ? "Roll back Mallory’s message first; evolution works from that incident."
            : step === 5 && inc && inc.status !== "resolved"
              ? "The incident must resolve before the guardrail can evolve."
              : null
      : null;

  return (
    <section
      aria-labelledby="guide-heading"
      onKeyDown={(e) => {
        if (e.key === "Escape") onPause(true);
      }}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[52vh] flex-col rounded-t-2xl border border-accent/30 bg-[#1c0e30]/95 shadow-[0_-18px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-h-[min(560px,calc(100vh-160px))] sm:w-[340px] sm:rounded-2xl"
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Compass className="size-4 shrink-0 text-accent" />
        <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Guided demo
          {!finished && (
            <span className="text-faint">
              {" "}· <span className="sr-only">step </span>{step + 1}<span aria-hidden> / </span><span className="sr-only"> of </span>{STEPS.length}
            </span>
          )}
        </p>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label="Restart guide from step 1" onClick={() => go(0)}>
            <RotateCcw />
          </IconButton>
          <IconButton label="Pause guided demo (Esc)" onClick={() => onPause(true)}>
            <Pause />
          </IconButton>
          <IconButton label="Exit guided demo" onClick={onExit}>
            <X />
          </IconButton>
        </div>
      </header>

      <ol className="flex gap-1 px-4 pt-3" aria-label="Guided demo steps">
        {STEPS.map((x, i) => (
          <li key={x.title} className="flex-1">
            <button
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${x.title}${status[i].done ? " (detected)" : ""}`}
              className={cn("guide-focus block h-1.5 w-full rounded-full transition-colors", i === step ? "bg-accent" : status[i].done ? "bg-ok/70" : "bg-white/15 hover:bg-white/30")}
            />
          </li>
        ))}
      </ol>

      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {finished ? (
          <>
            <h2 id="guide-heading" ref={heading} tabIndex={-1} className="font-serif text-xl leading-tight text-cream outline-none">
              {succeeded ? "That’s the whole story" : "End of the guide"}
            </h2>
            <p className="text-xs leading-5 text-muted">
              {succeeded
                ? "Poisoned memory traced to its source, recovery evidence verified, and the expected writes passed the guardrail."
                : `${status.filter((x) => x.done).length} of ${STEPS.length} steps were detected in live state. Go back to any step marked as waiting to finish it.`}
            </p>
          </>
        ) : (
          <>
            <div>
              <h2 id="guide-heading" ref={heading} tabIndex={-1} className="font-serif text-lg leading-tight text-cream outline-none">
                {copy.title}
              </h2>
              <p className={cn("mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium", s.done && !copy.manual ? (warned ? "text-warn" : "text-ok") : "text-muted")} aria-live="polite">
                {copy.manual ? (
                  <>
                    <Info className="size-3.5" /> Check the evidence, then continue
                  </>
                ) : s.done && warned ? (
                  <>
                    <AlertTriangle className="size-3.5" /> Detected, but check the evidence below
                  </>
                ) : s.done ? (
                  <>
                    <CheckCircle2 className="size-3.5" /> Detected in live state
                  </>
                ) : (
                  <>
                    <Circle className="size-3" /> Waiting for this step
                  </>
                )}
              </p>
            </div>
            <dl className="space-y-2 text-xs leading-5">
              <Beat k="Do">{copy.todo}</Beat>
              <Beat k="What’s happening">{copy.app}</Beat>
              <Beat k="Notice">{copy.notice}</Beat>
            </dl>
            {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
            {blocker && <p className="text-[11px] text-warn">{blocker}</p>}
            {resetFailed && step === 0 && <p className="text-[11px] text-warn">The reset didn’t go through (see the error toast). You can continue manually, but the world was not reset.</p>}
            {s.checks.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Live evidence</p>
                <ul className="space-y-1.5" aria-live="polite">
                  {s.checks.map((c, i) => (
                    <Evidence key={i} c={c} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <LiveConfig data={data} open={step === 0 || finished} />
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
        <Button variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          <ChevronLeft /> Back
        </Button>
        {finished ? (
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" onClick={() => go(0)}>
              <RotateCcw /> Restart
            </Button>
            <Button variant="primary" onClick={onExit}>
              Exit guide
            </Button>
          </div>
        ) : (
          <Button variant={s.done ? "primary" : "outline"} className="ml-auto" onClick={() => go(step + 1)}>
            {copy.manual ? "Continue" : s.done ? (step === STEPS.length - 1 ? "Finish" : "Next step") : "Skip for now"} <ChevronRight />
          </Button>
        )}
      </footer>
    </section>
  );
}

function Beat({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{k}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

function Evidence({ c }: { c: Check }) {
  const Icon = c.tone === "ok" ? CheckCircle2 : c.tone === "warn" ? AlertTriangle : Info;
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-snug">
      <Icon className={cn("mt-px size-3.5 shrink-0", c.tone === "ok" ? "text-ok" : c.tone === "warn" ? "text-warn" : "text-info")} aria-hidden />
      <span className="sr-only">{c.tone === "ok" ? "Confirmed:" : c.tone === "warn" ? "Note:" : "Info:"}</span>
      <span className="min-w-0 break-words text-cream">{c.text}</span>
    </li>
  );
}

/** What is real in this deployment, read from the server's public config. Nothing here is assumed. */
function LiveConfig({ data, open }: { data: Snapshot; open: boolean }) {
  const { config } = data;
  const stripe =
    config.stripe === "test"
      ? "Stripe test mode: flight charges and refunds create Stripe test objects. No real money moves."
      : config.stripe === "refused-live"
        ? "A live Stripe key was refused, so flight payments are simulated."
        : "Stripe is not configured, so flight payments are simulated.";
  return (
    <details open={open} className="group rounded-xl border border-white/10 bg-white/[0.02] text-[11px] leading-snug">
      <summary className="guide-focus cursor-pointer list-none rounded-xl px-2.5 py-2 font-semibold text-muted marker:hidden">
        <ChevronRight className="mr-1 inline size-3 transition-transform group-open:rotate-90" aria-hidden />
        What’s live in this deployment
      </summary>
      <ul className="space-y-1 px-2.5 pb-2.5 text-muted">
        <li>Database: {config.atlas}</li>
        <li>{stripe}</li>
        <li>Hotel, invoice, and email effects are simulated: they’re recorded in the sandbox ledger only.</li>
        <li>{config.llm === "rule-based fallback" ? "No LLM configured: the agents use a rule-based planner." : `LLM: ${config.llm}`}</li>
        <li>Embeddings: {config.embed}</li>
      </ul>
    </details>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="guide-focus grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.07] hover:text-fg [&>svg]:size-3.5">
      {children}
    </button>
  );
}
