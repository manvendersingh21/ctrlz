# Judge readiness: ctrlz

**Purpose:** a compact guide to what the project demonstrates and how to judge
its evidence. This is a code-and-documentation review, not a claim that the
public deployment or a full live scenario was re-verified today.

## The idea in one sentence

ctrlz gives an operator a causal recovery view for agent memory poisoning: find
which actions depended on the bad memory, quarantine related state, inspect
compensation and replay results, then evaluate a proposed write guardrail.

## Strongest judging path

Follow the single travel-card story in [the demo guide](docs/DEMO_SCRIPT.md):

1. Inspect Mallory's message and its memory provenance.
2. Run Alice's booking and inspect the action's memory justification.
3. Select the poison source and inspect taint, recovery decisions, and replay evidence.
4. Compare the guardrail proposals with their sample denominators and verdicts.
5. Inspect the re-attack and Alice update as separate message-scoped write outcomes.

This path makes the core contribution observable in the app. It is stronger
than presenting a feature list: the judge can follow evidence from a source
message to a downstream action and recovery record.

## Evidence to present

| Claim | Evidence in the repository or console | Boundary |
| --- | --- | --- |
| Causal dependency tracing | `lineage` graph and Atlas `$graphLookup` operation | Show the actual graph and traced records |
| Selective recovery | Incident `kept`, `compensations`, and `replayed` evidence | A warning or failed compensation means recovery is incomplete |
| Memory-write guardrail | Per-message write log and guardrail version | The speaker is a demo persona, not authenticated identity |
| Candidate comparison | [Smoke evaluation table and chart](docs/BENCHMARK.md) | 5 attacks and 6 benign examples per split; not compared with other apps |
| Provider behavior | Runtime config and ledger provider labels | Stripe test only; hotel, invoice, and email effects are simulated |
| Database consistency | Transaction mode in the incident/ops evidence | Atlas/replica sets transact; standalone MongoDB fallback is sequential and non-atomic |

## Limits judges should hear clearly

- The chat API accepts only the demo labels `alice`, `bob`, and `mallory`, but
  the caller supplies the label. It is not authentication. Production must bind
  identity to a verified session or trusted event.
- This demo integrates Stripe test mode for flight charges/refunds when
  configured. Other tool effects and compensation intents are simulations;
  there is no general booking, bank, or email undo integration.
- A failed provider refund is reported as incomplete. The incident flow marks
  itself resolved and does not automatically retry that failure; an operator
  must investigate.
- Smoke evaluation is small and uses checked-in fixtures. It does not prove
  generalization and does not support a comparison with other applications.
- A public deployment is shared mutable state. A judge run should be isolated
  and protected; reset is destructive to the configured demo collections.
- Atlas Agent Engine is not integrated. ctrlz supplies its own demo harness.

## What not to claim

Avoid saying “production-safe,” “guaranteed undo,” “authenticated user,” or
“beats other agent applications.” Describe the evidence visible for the current
run, include denominators, and distinguish Stripe test operations from
simulated ledger effects.

## Further reading

- [Project overview and quickstart](README.md)
- [Three-minute judge demo](docs/DEMO_SCRIPT.md)
- [Benchmark results and methodology](docs/BENCHMARK.md)
- [Architecture and API contracts](docs/ARCHITECTURE.md)
- [Hackathon submission](SUBMISSION.md)
