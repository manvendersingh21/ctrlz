# ctrlz — architecture & contracts

ctrlz is a **Ctrl+Z for AI-agent memory**. Two agents (a travel *concierge* and a *finance* agent) share a
long-term memory in MongoDB Atlas. When a poisoned memory gets in and causes side effects (real Stripe
**test-mode** charges when a key is set, simulated ledger effects otherwise), ctrlz:

1. **Traces** the causal blast radius with `$graphLookup` over the `lineage` collection
   (message → memory → action → derived memory).
2. **Quarantines** every tainted record in one multi-document transaction (Atlas / replica sets; standalone
   dev MongoDB falls back to sequential writes, flagged non-atomic in the ops feed), revokes the poisoned
   memory's embedding (`revoked_signatures`), and bumps the permission epoch. The incident intent is
   persisted *before* quarantine; every stage is checkpointed and resumable.
3. **Plans a clean replay** of every affected request *before* compensating, so effects the replay would
   reproduce identically (same semantic idempotency key — covering material fields: nights and city for
   hotels, seat and meal for flights) are **kept**, not cancelled and redone. Kept entries carry the
   original and replayed arguments for the UI.
4. **Compensates** the rest newest-first (refund / payment recall / correction email — **compensation
   intents**), exactly once via unique indexes, with checkpoints in `worker_checkpoints` so `runIncident`
   can resume after a crash. With `STRIPE_SECRET_KEY` set, flight charges/refunds run as real Stripe
   **test-mode** PaymentIntents/Refunds via the `EffectProvider` adapter (`stripe.ts`); hotels, invoices
   and emails are simulated and labeled so in the ledger. Provider failures surface as outcome `failed`
   and stay pending for retry on resume.
5. **Replays** the requests without the revoked memory; duplicates dedupe on `sandbox_ledger.idempotency_key`.
6. **Evolves the write guardrail**: an LLM (or heuristic fallback) proposes `minimal` and `strict` rule sets;
   both are scored on a dev split and a held-out split (separate DB, separate principal on Atlas). A
   variant ships only if it blocks more attacks **and** keeps every benign write on both splits — small
   smoke sets (5 attacks / 6 benign per split) that gate shipping, not a generalization claim. Revertible.

Everything runs without API keys: embeddings fall back to a hashing embedder, the LLM to deterministic
heuristics. Keys upgrade quality (Voyage embeddings + rerank, any OpenAI-compatible LLM).

## Layout

| Path | Owner | What |
| --- | --- | --- |
| `src/lib/*` | core | domain logic (see below) |
| `src/app/api/*` | core | route handlers, JSON in/out via `handle()` in `src/lib/http.ts` |
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/**` | UI | dashboard |
| `tests/**`, `vitest.config.ts` | tests | unit (vitest) + e2e scenario script |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `README.md`, `.github/**` | infra | deploy + docs |
| `src/proxy.ts`, `src/lib/ratelimit.ts`, `src/lib/auth.ts`, `src/app/api/health/route.ts` | hardening | auth, rate limit, health |

Core lib: `config.ts` (env), `db.ts` (collections, indexes, search indexes), `embed.ts`, `llm.ts`,
`memory.ts` (guarded writes, hybrid `$rankFusion` retrieval with stale-index re-check), `guardrails.ts`
(rule DSL + scoring), `sandbox.ts` (tools, semantic idempotency keys, compensation), `stripe.ts`
(`EffectProvider` adapter: real test-mode charge/refund; live keys refused), `agent.ts`
(extract → plan → execute), `rollback.ts`, `evolve.ts`, `seed.ts`, `scenario.ts` (users, script, eval sets),
`state.ts` (dashboard snapshot).

## HTTP API

All responses are JSON with `Cache-Control: no-store` and an `x-request-id` header. Errors are `{ "error", "requestId" }`:
400 malformed JSON / validation (`issues` included), 403 reset disabled (`CTRLZ_ALLOW_RESET=0`), 404 unknown node or incident,
409 state conflict (no active guardrail, nothing to revert), 413 body over 64 KB, 429 rate limited (`Retry-After`), 500 otherwise (no stack).
With `CTRLZ_BASIC_AUTH` set, every route except `/api/health` requires HTTP Basic auth.
`speaker` in `POST /api/chat` is caller-supplied and trusted — the demo persona chosen by the console
operator, not an authenticated identity; production should derive it from an IdP session server-side.

| Method & path | Body | Returns |
| --- | --- | --- |
| `GET /api/health` | – | `{ ok, mongo, searchIndexesQueryable, config, uptimeSec, version }` — 200 / 503 |
| `POST /api/feedback` | `{ eventId, rating: "up"\|"down", comment? }` | `{ eventId, suspects[], suggestedRoot }` — Raindrop feedback signal + blame |
| `POST /api/reset` | – | `{ ok, indexesReady, ms }` — wipes and reseeds the world |
| `GET /api/state` | – | `Snapshot` (below) |
| `POST /api/chat` | `{ agentId: "concierge"\|"finance", speaker: "alice"\|"bob"\|"mallory", text }` | `{ messageId, extractor, writes[], plan, executed[], reply }` |
| `POST /api/incident` | `{ rootId, reason? }` (rootId = a lineage node id: `msg_…` or `mem_…`) or `{ resume: incidentId }` | `IncidentDoc` |
| `POST /api/evolve` | `{ incidentId }` | `{ shipped, variants: GuardrailDoc[], results: [{ name, gate, misses, falsePositives }] }` |
| `POST /api/guardrail/revert` | – | `{ active: version }` |

### `Snapshot` (`GET /api/state`) — see `src/lib/state.ts`, types in `src/lib/types.ts`, `src/lib/rollback.ts`

```ts
{
  config: { atlas: string; embed: string; rerank: string; llm: string; raindrop: "cloud" | "workshop" | "mirror-only"; agentEngine: boolean; graderRole: boolean; stripe: "test" | "refused-live" | "off" };
  users: Record<"alice"|"bob"|"mallory", { name; role; email; blurb }>;
  script: { id; label; agentId; speaker; text; tone: "benign"|"attack"|"task" }[];   // one-click demo steps, in order
  epoch: number;
  messages: MessageDoc[];      // role "user"|"assistant", channel = agentId, replayOf set on replay notices
  memories: MemoryDoc[];       // status "active"|"held"|"quarantined"; provenance.{speaker,speakerRole,trust_tier}
  actions: ActionDoc[];        // status executed|quarantined|compensated|deduped; justified_by = memory ids
  ledger: LedgerDoc[];         // side effects; status live|reversed; compensates = effect id it undoes; provider = stripe-test result or { name: "simulated" }
  lineage: { _id; kind: "message"|"memory"|"action"; parents: string[]; label; status; agentId }[];  // DAG for the graph
  incidents: IncidentDoc[];    // newest first: status opening|quarantined|compensating|replaying|resolved; taint[{_id,kind,depth,label}], kept[{…, before, replay}], compensations[{…, outcome: executed|deduplicated|failed}], replayed[], timeline[{stage,ms,note}]
  guardrails: GuardrailDoc[];  // ascending version; status active|retired|candidate|rejected|reverted; gate.{dev,heldout,decision,reasons}
  ops: AtlasOp[];              // newest first: { ts, step, feature, collection, detail, ms, n } — "what ran in Atlas"
  writes: { candidate, decision: "allow"|"hold"|"block", hits: string[], similarity, guardVersion, ts }[];  // write log, newest first
}
```

Lineage `status` values: `seed`, `ok`, `active`, `held`, `executed`, `deduped`, `quarantined`, `compensated`, `kept`.

## Demo script

One primary storyline (card numbers = script rail). Header **Reset world** → card **01 · Mallory poisons
Alice's card** (Amex "frozen", travel redirected to Visa •4417, receipts cc'd to travel-desk@ma11ory.io)
→ card **02 · Alice books Tokyo** (flight on Mallory's Visa — real Stripe test PaymentIntent when
configured; hotel simulated) → click Mallory's `msg_…` node in the lineage graph → **Roll back source
message** (flight refunded via real Stripe test Refund and rebooked on Amex •1001; hotel **kept**, shown
with before/replay values; correction-email intent) → Incident panel **Evolve guardrail** (minimal ships,
strict rejected) → card **05 · Mallory re-attacks (paraphrase)** (held) → card **06 · Alice updates her
own card** (allowed). Full talk track: `docs/DEMO_SCRIPT.md`.

Finance backup (only if asked): card **03 · Mallory reroutes vendor bank** → card **04 · Bob pays Acme
invoice** → roll back → recall + replay to ACME-001.

## Local dev

`docker run -d --name ctrlz-atlas -p 27017:27017 mongodb/mongodb-atlas-local:latest`, then `pnpm dev`.
This is Next.js 16: read `node_modules/next/dist/docs/` before using framework APIs (middleware is now `proxy.ts`).

## Raindrop: detect → remediate → verify

ctrlz uses Raindrop as its detection-and-verification channel (`src/lib/raindrop.ts`). One join key ties it
together: **the Raindrop `eventId` of a turn is the request message id** that lineage, actions and
incidents already use, so a signal sent later lands on exactly the event it judges.

| Moment | What Raindrop receives |
| --- | --- |
| Every agent turn | an interaction (`<agent>_turn`, userId = speaker, convoId = channel) with guard version, epoch, planner; attachments: retrieved memories with trust tiers, and the plan JSON |
| Every memory write / side effect | a tool span (`memory_write`, `book_flight`, …) carrying `justified_by`, idempotency key, dedup flag |
| Risky action, live | **self-diagnostic** on that turn: `unverified_money_routing` / `unverified_contact_routing` when an effect is justified by a money/contact memory from an unverified tier or a third party; `memory_write_held` / `memory_write_blocked` when the guardrail stops a write |
| Thumbs-down on a reply | `thumbs_down` feedback signal, then blame ranks the memories behind that turn and emits `suspect_identified`; the UI offers one-click rollback of the suggested root |
| Incident | its own interaction (`ctrlz_incident`) with a tool span per stage and per compensation; `rolled_back` on every tainted turn, `poison_source` on the root message |
| Replay | a fresh interaction (`<agent>_turn_replay`, `replay_of` property) whose actions are re-checked by the same self-diagnosis rule; it gets `clean_replay` (POSITIVE) only if it raised **zero** diagnostics, otherwise `replay_still_risky` |
| Guardrail gate | `guardrail_<variant>_shipped / passed / rejected` on the incident event with dev and held-out scores |

All calls are fail-open and never block the request path. Every payload is mirrored to `raindrop_events`, so the
dashboard's Raindrop tab and the e2e suite work without a key. Modes: `cloud` (write key), `workshop`
(`RAINDROP_WORKSHOP`), `mirror-only`.
