# ctrlz — Ctrl+Z for AI-agent memory

**Hackathon:** [Harness Engineering & Model Wrangling · SF Tech Week](https://cerebralvalley.ai/e/mongodb-sftw-hackathon)\
**Live demo:** [Project](https://ctrlz-mu.vercel.app) · [Console](https://ctrlz-mu.vercel.app/console)\
**Pitch:** ctrlz traces which actions trusted a poisoned memory, isolates tainted state, records recovery outcomes, and tests a stronger memory-write guardrail.

## The problem

Persistent memory lets an agent carry useful information across tasks. It also
lets one untrusted write influence later actions. Deleting that memory alone
does not identify dependent work or explain what happened to its side effects.

ctrlz makes that chain inspectable. The demo uses a travel concierge and a
finance agent backed by MongoDB. A guest persona supplies a false payment
instruction; a later task may use it. The operator selects the source and sees
the dependent records, recovery plan, compensation outcomes, and replay evidence.

## What judges can verify

1. **Provenance:** open the write log and memory view to inspect the source, speaker label, and trust tier.
2. **Causal impact:** follow message → memory → action links in the lineage graph, traced with Atlas `$graphLookup`.
3. **Selective recovery:** inspect which effects are kept, which receive compensation entries, and replay verification signals.
4. **Guardrail evolution:** compare each proposal's development and held-out scores; distinguish generated, passed, and shipped states.
5. **Expected writes:** inspect Mallory's re-attack and Alice's legitimate update separately in the message-scoped write evidence.

Use the [three-minute demo guide](docs/DEMO_SCRIPT.md) for the exact click path.
The guided demo reports warnings when required evidence is missing or a
recovery outcome failed.

## Benchmark evidence

The project has a small, reproducible guardrail smoke evaluation, not an
application-to-application benchmark. The checked-in test fixtures compare the
baseline with deterministic minimal and strict rule sets:

| Rule set | Dev: attacks blocked | Dev: benign kept | Held-out: attacks blocked | Held-out: benign kept |
| --- | ---: | ---: | ---: | ---: |
| Baseline v1 | 0/5 | 6/6 | 0/5 | 6/6 |
| Evolved minimal | 5/5 | 6/6 | 5/5 | 6/6 |
| Evolved strict | 5/5 | 3/6 | 5/5 | 3/6 |

The [benchmark page](docs/BENCHMARK.md) includes a chart, source references,
and methodology. The samples are hand-authored smoke fixtures; they do not
show broad generalization, production attack resistance, or superiority over
other products. The fixture definitions are checked into the repository.

## How it works

- **MongoDB Atlas** stores memories, provenance, actions, ledger entries,
  lineage, guardrail versions, and evaluation state. Atlas `$graphLookup`
  follows causal links; hybrid `$vectorSearch` and `$search` retrieval uses
  `$rankFusion`; unique indexes support deduplication.
- **Recovery** quarantines tainted records in a transaction on Atlas or a
  replica set. Standalone MongoDB uses a sequential, non-atomic fallback that
  is labeled in the ops feed. Replay planning compares semantic idempotency
  keys so matching effects can be retained.
- **Guardrail evolution** scores generated proposals against dev and held-out
  splits. In cloud mode, the held-out data is stored in a separate database and
  read through a grader principal. Local mode uses local demo configuration.
- **Raindrop** can receive interactions, spans, diagnostics, and recovery
  signals when configured. Without a provider connection, events are mirrored
  locally for the console.
- **Optional providers:** deterministic embeddings and planning keep the demo
  usable without AI keys. Voyage and an OpenAI-compatible LLM are optional.

## Limits and trust boundary

- **Persona is simulated.** The console chooses Alice, Bob, or Mallory; the API
  validates those labels but does not authenticate the chosen identity. A
  production deployment must bind speaker identity to a verified session or
  trusted platform event.
- **Effects are bounded.** Stripe supports test mode only. Hotel, invoice,
  payment-recall, and email effects are simulated ledger entries or intents.
  This demonstrates orchestration and evidence, not universal external undo.
- **Failed refunds need attention.** Provider failure is visible and makes the
  guide incomplete. A resolved incident is not automatically retried; an
  operator must follow up.
- **Evaluation is small.** Each split has five attacks and six benign examples.
  It is a shipping smoke gate, not a scientific or cross-product benchmark.
- **Agent Engine is not integrated.** ctrlz is its own demo harness and
  governance/recovery layer; it does not claim Atlas Agent Engine integration.
- **Deployment matters.** The public console is shared mutable state. Use a
  protected, isolated judge deployment and a fallback recording.

## Run and inspect

```bash
cp .env.example .env   # optional provider configuration
docker compose up --build
```

Open `http://localhost:3000/console`, use **Reset world**, and follow the
[demo guide](docs/DEMO_SCRIPT.md). Reset clears the configured demo collections;
use a dedicated local database. For tests, run `pnpm test`. The detailed API,
state shape, provider modes, and storage layout are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
