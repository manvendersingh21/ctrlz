# Judge demo: the poisoned travel memory

**Target runtime:** local or judge-isolated deployment at `/console`\
**Length:** about three minutes\
**Purpose:** show causal evidence and selective recovery, not claim that every external action is reversible.

## Before the demo

- Use an isolated database. **Reset world wipes the configured demo collections.**
- Check the console's runtime configuration and ledger labels before describing providers.
- In a shared deployment, protect the console with authentication and disable reset unless the judge operator needs it.
- The speaker selector is a simulated persona. The API accepts only Alice, Bob, or Mallory, but it does not authenticate the selected identity.
- Stripe runs only in test mode and only with a configured test key. Hotel, invoice, and email effects are simulated.

## Three-minute flow

| Time | Action | What to point out |
| --- | --- | --- |
| 0:00–0:25 | **Reset world**, confirm, then run script card **01 · Mallory poisons Alice's card**. | Write log and provenance identify Mallory as the speaker and a guest. Confirm the memory's actual status; don't assume it was stored. |
| 0:25–0:55 | Run **02 · Alice books Tokyo**. Open **Ledger** and **Causal lineage**. | Show which memory justified each action and which effects are simulated or Stripe test mode. |
| 0:55–1:45 | Select Mallory's source message in the lineage graph and choose **Roll back source message**. | Read the actual transaction mode, compensation outcomes, hotel keep evidence, and replay signals. If evidence is missing or failed, say recovery is incomplete. |
| 1:45–2:20 | In the incident panel, choose **Evolve guardrail**. | Distinguish variants generated, variants passing the gate, and an active variant that shipped. Show denominators. |
| 2:20–3:00 | Run **05 · Mallory re-attacks**, then **06 · Alice updates her own card**. Open **Write log**. | The guide matches write evidence to each message. State whether Mallory was held/blocked and Alice allowed only if those rows support it. |

## Suggested narration

> “A travel concierge has persistent memory. Mallory, a guest persona in this simulation, adds a card-routing instruction for Alice. The first question is what the write guardrail actually did.”

> “Alice then asks to book a trip. The action records which memory justified it. Look at the ledger to distinguish a Stripe test operation from the simulated hotel and email effects.”

> “I select the source message and ask ctrlz to trace the dependent state. Quarantine is transactional on Atlas or a replica set; standalone MongoDB reports a sequential, non-atomic fallback. The recovery view records the keep, compensation, and replay evidence. Failed provider compensation stays visible as incomplete and requires operator follow-up.”

> “The evolution panel shows proposal generation separately from gate passage and shipping. Our checked-in smoke fixtures have five attacks and six benign writes per split. They are a small rule gate, not evidence of broad generalization or a comparison against other applications.”

> “Finally, the write log shows the decisions for Mallory's re-attack and Alice's update. This is a demo persona choice, not authenticated identity; production would bind the speaker to a verified session or trusted event.”

## Backup storyline

Only if time permits, use cards **03 · Mallory reroutes vendor bank** and
**04 · Bob pays Acme invoice**. The payment and recall are simulated ledger
effects. Read the actual incident and ledger evidence before describing the
result.

## Evidence and recovery caveats

- The guide's final success state is evidence-based. A warning means a required
  outcome is missing or failed; do not narrate it as a successful recovery.
- A resolved incident can still contain a failed Stripe refund. The current
  workflow reports that failure, but a resolved incident is not automatically
  retried; an operator must investigate.
- The benchmark table and chart are in [BENCHMARK.md](BENCHMARK.md). They
  compare guardrail configurations on fixed small fixtures, not applications.
- The public deployment is a shared mutable world. Prefer a private judge
  instance and keep a recorded fallback.
