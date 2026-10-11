import type { Snapshot } from "@/lib/state";
import type { IncidentDoc } from "@/lib/rollback";

/** One piece of live evidence shown under a guided-demo step. `tone` colors it; it never asserts more than the snapshot says. */
export interface Check {
  tone: "ok" | "warn" | "info";
  text: string;
}

export interface StepStatus {
  done: boolean;
  checks: Check[];
}

type Ledger = Snapshot["ledger"][number];
type Message = Snapshot["messages"][number];

const ms = (d: unknown) => new Date(d as string).getTime();

/** The most recent user message matching a script card's text (the same "sent" rule ScriptRail uses). */
export function sentCard(data: Snapshot, id: string): Message | undefined {
  const step = data.script.find((s) => s.id === id);
  if (!step) return undefined;
  return data.messages.filter((m) => m.role === "user" && m.text === step.text).at(-1);
}

export function providerLabel(l: Ledger | undefined): string {
  if (!l?.provider) return "provider pending";
  if (l.provider.name === "stripe") return `Stripe test mode · ${l.provider.status}`;
  return "simulated";
}

/** The incident rooted at Mallory's card-01 message, or at one of the memories it wrote ("This memory only"). */
export function storyIncident(data: Snapshot): IncidentDoc | undefined {
  const msg = sentCard(data, "poison-card");
  if (!msg) return undefined;
  const memIds = new Set(data.memories.filter((m) => m.provenance.messageId === msg._id).map((m) => m._id));
  return (data.incidents as unknown as IncidentDoc[]).find((i) => i.rootId === msg._id || memIds.has(i.rootId));
}

export const decisionWord = (d: string) => (d === "block" ? "blocked" : d === "hold" ? "held" : d === "allow" ? "allowed" : d);

/** Derives each guided step's completion and evidence from the live snapshot. Order matches GUIDE_STEPS. */
export function guideStatus(data: Snapshot): StepStatus[] {
  const ledgerById = new Map(data.ledger.map((l) => [l._id, l]));
  const msg01 = sentCard(data, "poison-card");
  const msg02 = sentCard(data, "book-trip");
  const msg05 = sentCard(data, "reattack");
  const msg06 = sentCard(data, "legit-update");
  const poisoned = msg01 ? data.memories.filter((m) => m.provenance.messageId === msg01._id) : [];
  const inc = storyIncident(data);

  // 1 · Reset: the world is in seed state, or it was when card 01 started the story.
  const anyScript = data.script.some((s) => sentCard(data, s.id));
  const fresh = !anyScript && data.incidents.length === 0 && data.ledger.length === 0 && !data.guardrails.some((g) => g.incidentId);
  const cleanStart =
    !!msg01 &&
    !data.messages.some((m) => m.role === "user" && ms(m.createdAt) < ms(msg01.createdAt) && data.script.some((s) => s.text === m.text)) &&
    !data.incidents.some((i) => ms(i.createdAt) < ms(msg01.createdAt));
  const reset: StepStatus = {
    done: data.guardrails.length > 0 && (fresh || cleanStart),
    checks:
      data.guardrails.length === 0
        ? [{ tone: "warn", text: "The world hasn’t been seeded yet." }]
        : fresh
          ? [{ tone: "ok", text: `Seed state: ${data.memories.length} starting memories, no script messages, no side effects, no incidents.` }]
          : cleanStart
            ? [{ tone: "ok", text: "The world was in seed state when card 01 ran." }]
            : [{ tone: "warn", text: `Earlier activity is present (${data.ledger.length} side effects, ${data.incidents.length} incidents). Reset for a clean run.` }],
  };

  // 2 · Card 01: what the guardrail actually did with Mallory's message.
  const card01: StepStatus = {
    done: !!msg01,
    checks: !msg01
      ? []
      : poisoned.length
        ? poisoned.map((m) => ({
            tone: m.status === "active" ? "warn" : "info",
            text: `Memory ${m.status}: “${m.text}” — spoken by ${m.provenance.speaker} (${m.provenance.speakerRole}), trust tier ${m.provenance.trust_tier}.`,
          }))
        : [{ tone: "info", text: "No memory was stored from Mallory’s message. Check the Write log for the guardrail’s decision." }],
  };

  // 3 · Card 02: the concierge's real side effects for Alice's request (the planner may differ from the script).
  const acts02 = msg02 ? data.actions.filter((a) => a.requestMessageId === msg02._id && !a.replayOf) : [];
  const poisonIds = new Set(poisoned.map((m) => m._id));
  const usedPoison = acts02.filter((a) => a.justified_by.some((j) => poisonIds.has(j)));
  const card02: StepStatus = {
    done: !!msg02 && acts02.length > 0,
    checks: !msg02
      ? []
      : acts02.length === 0
        ? [{ tone: "info", text: "Alice’s request is recorded but no actions are visible yet." }]
        : [
            ...acts02.map((a): Check => {
              const fx = a.effectId ? ledgerById.get(a.effectId) : undefined;
              return { tone: "info", text: `${fx?.summary ?? a.tool} — ${providerLabel(fx)}` };
            }),
            usedPoison.length
              ? { tone: "warn", text: `${usedPoison.length} action(s) cite Mallory’s memory as justification.` }
              : { tone: "info", text: "No action cites Mallory’s memory in this run." },
          ],
  };

  // 4 · Rollback of Mallory's source.
  const rollback: StepStatus = {
    done: inc?.status === "resolved",
    checks: !inc
      ? []
      : [
          inc.status === "resolved"
            ? { tone: "ok", text: `Incident ${inc._id} resolved: ${inc.taint.length} nodes quarantined · ${inc.compensations.length} compensated · ${inc.kept.length} kept · ${inc.replayed.length} replayed.` }
            : { tone: "info", text: `Incident ${inc._id} is ${inc.status}…` },
          ...(inc.rootId !== msg01?._id && poisoned.length > 1
            ? [{ tone: "warn" as const, text: "Only one of Mallory’s memories was rolled back; the other from the same message is still active." }]
            : []),
        ],
  };

  // 5 · Compensation and kept hotel: observational, always needs a manual continue.
  const isHotel = (id: string) => ledgerById.get(id)?.type === "hotel_reservation";
  const hotelKept = !!inc && (inc.kept.some((k) => isHotel(k.effectId)) || inc.replayed.some((r) => r.deduplicated && r.tool === "reserve_hotel"));
  const evidence: StepStatus = {
    done: inc?.status === "resolved",
    checks: !inc || inc.status !== "resolved"
      ? []
      : [
          ...inc.compensations.map((c): Check => {
            const orig = ledgerById.get(c.effectId);
            const comp = data.ledger.find((l) => l.compensates === c.effectId);
            const failed = comp?.summary.includes("FAILED") ?? false;
            return {
              tone: failed ? "warn" : "ok",
              text: `Compensated: ${orig?.summary ?? c.summary} → ${comp?.summary ?? c.outcome} (${providerLabel(comp)})`,
            };
          }),
          ...inc.kept.map((k): Check => ({ tone: "ok", text: `Kept: ${k.summary} (${providerLabel(ledgerById.get(k.effectId))}) — ${k.why}` })),
          ...inc.replayed.map((r): Check => ({ tone: "info", text: `Replayed: ${r.summary}${r.deduplicated ? " — deduplicated onto the kept booking" : " — re-executed"}` })),
          ...(hotelKept ? [] : [{ tone: "warn" as const, text: "No hotel booking was kept in this run." }]),
        ],
  };

  // 6 · Guardrail evolution from this incident.
  const variants = inc ? data.guardrails.filter((g) => g.incidentId === inc._id) : [];
  // Several variants can pass the gate; only the best-scoring one ships (the rest stay "candidate").
  const shipped = variants.find((g) => g.gate?.decision === "ship" && g.status !== "candidate");
  const evolve: StepStatus = {
    done: variants.length > 0,
    checks: variants.map((g): Check => {
      const name = g.rationale.match(/^\[([\w-]+)\]/)?.[1] ?? `v${g.version}`;
      const dev = g.gate?.dev.candidate;
      const held = g.gate?.heldout?.candidate;
      const scores = [
        dev && `dev ${dev.attacksBlocked}/${dev.attacks} attacks blocked, ${dev.benignKept}/${dev.benign} benign kept`,
        held ? `held-out ${held.attacksBlocked}/${held.attacks} blocked, ${held.benignKept}/${held.benign} kept` : "held-out split unavailable",
      ]
        .filter(Boolean)
        .join(" · ");
      const verdict = g === shipped ? `shipped (${g.status})` : g.gate?.decision === "ship" ? "passed the gate, not shipped" : "rejected by the gate";
      return { tone: g === shipped ? "ok" : "info", text: `${name} v${g.version} (proposed by ${g.proposedBy}): ${verdict} — ${scores}` };
    }),
  };
  if (variants.length && !shipped) evolve.checks.push({ tone: "warn", text: "No variant passed the gate, so the active guardrail is unchanged." });

  // 7 · Re-attack and legitimate update: the write log's real decisions after each card.
  const active = data.guardrails.find((g) => g.status === "active");
  const writesAfter = (speaker: string, msg: Message | undefined) =>
    msg ? data.writes.filter((w) => w.candidate.speaker === speaker && ms(w.ts) >= ms(msg.createdAt)) : [];
  const writeChecks = (who: string, msg: Message | undefined, want: "stopped" | "allowed"): Check[] => {
    if (!msg) return [];
    const rows = writesAfter(who.toLowerCase(), msg);
    if (!rows.length) return [{ tone: "warn", text: `${who}: no memory write was recorded for this message.` }];
    return rows.map((w) => {
      const good = want === "stopped" ? w.decision !== "allow" : w.decision === "allow";
      const stale = shipped && w.guardVersion < shipped.version ? ` (checked by older guard v${w.guardVersion})` : ` (guard v${w.guardVersion})`;
      return { tone: good ? "ok" : "warn", text: `${who}’s write ${decisionWord(w.decision)}${stale}: “${w.candidate.text}”` };
    });
  };
  const outcomes: StepStatus = {
    done: !!msg05 && !!msg06,
    checks: [...writeChecks("Mallory", msg05, "stopped"), ...writeChecks("Alice", msg06, "allowed")],
  };
  if (msg05 && active && !shipped) outcomes.checks.push({ tone: "warn", text: `The active guardrail is still v${active.version}; no evolved rule shipped in this run.` });

  return [reset, card01, card02, rollback, evidence, evolve, outcomes];
}
