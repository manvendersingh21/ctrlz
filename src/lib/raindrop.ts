import Raindrop from "raindrop-ai";
import { cols } from "./db";
import { newId } from "./memory";

/**
 * Raindrop is ctrlz's detection-and-verification channel:
 * - every agent turn is a Raindrop interaction (eventId = the request message id, the one join key);
 * - the agent self-diagnoses risky actions (money/contact routing justified by unverified memory) as they happen;
 * - incidents, compensations and clean replays come back as signals on the very events they remediate.
 *
 * Every payload is also mirrored to the `raindrop_events` collection so the dashboard (and tests) can show
 * exactly what was reported, with or without a write key. All calls are fail-open: telemetry never blocks or
 * breaks the agent or the rollback path.
 */

type Client = InstanceType<typeof Raindrop>;
type Sentiment = "POSITIVE" | "NEGATIVE";
type Props = Record<string, string | number | boolean | null | string[]>;

export type RaindropMode = "cloud" | "workshop" | "mirror-only";

/** One mirrored Raindrop payload (collection `raindrop_events`). */
export interface RaindropEvent {
  _id: string;
  ts: Date;
  kind: "interaction" | "tool" | "signal" | "diagnostic";
  eventId: string;
  name: string;
  mode: RaindropMode;
  sentiment?: Sentiment;
  signalType?: "agent" | "feedback";
  description?: string;
  comment?: string | null;
  input?: unknown;
  output?: unknown;
  properties?: Record<string, unknown>;
  error?: string | null;
}

const g = globalThis as unknown as { _ctrlzRaindrop?: Client | null };

export function raindropMode(): RaindropMode {
  if (process.env.RAINDROP_WRITE_KEY) return "cloud";
  if (process.env.RAINDROP_WORKSHOP) return "workshop";
  return "mirror-only";
}

function client(): Client | null {
  if (g._ctrlzRaindrop !== undefined) return g._ctrlzRaindrop;
  const mode = raindropMode();
  try {
    g._ctrlzRaindrop =
      mode === "mirror-only"
        ? null
        : new Raindrop({
            writeKey: process.env.RAINDROP_WRITE_KEY || undefined,
            projectId: process.env.RAINDROP_PROJECT_ID || undefined,
            // Explicit: never auto-probe a Workshop daemon that isn't there.
            localWorkshopUrl: process.env.RAINDROP_WORKSHOP || false,
            redactPii: process.env.RAINDROP_REDACT_PII === "1",
            appGit: process.env.RAINDROP_COMMIT_SHA ? { commitSha: process.env.RAINDROP_COMMIT_SHA } : undefined,
          });
  } catch (e) {
    console.error("raindrop init failed; continuing with mirror only", e);
    g._ctrlzRaindrop = null;
  }
  return g._ctrlzRaindrop;
}

const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.error("raindrop call failed", e);
  }
};

const stringProps = (p: Props): Record<string, string> => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]));

async function mirror(kind: "interaction" | "tool" | "signal" | "diagnostic", eventId: string, name: string, extra: Record<string, unknown> = {}) {
  try {
    const { raindrop } = await cols();
    await raindrop.insertOne({ _id: newId("rd") as never, ts: new Date(), kind, eventId, name, mode: raindropMode(), ...extra });
  } catch (e) {
    console.error("raindrop mirror failed", e);
  }
}

export interface Turn {
  eventId: string;
  props(p: Props): void;
  attach(name: string, value: string, opts?: { type?: "code" | "text"; language?: string; role?: "input" | "output" }): void;
  tool(name: string, input: unknown, output: unknown, opts?: { durationMs?: number; error?: string; properties?: Props }): Promise<void>;
  diagnose(category: string, description: string, properties?: Props): Promise<void>;
  finish(output: string): Promise<void>;
}

/** Opens one Raindrop interaction. `eventId` is ours (a message or incident id) so signals can target it later. */
export async function beginTurn(p: { eventId: string; event: string; userId: string; convoId: string; input: string; properties?: Props }): Promise<Turn> {
  const rd = client();
  let it: ReturnType<Client["begin"]> | null = null;
  safe(() => {
    it = rd?.begin({ eventId: p.eventId, event: p.event, userId: p.userId, convoId: p.convoId, input: p.input, properties: p.properties }) ?? null;
  });
  const props: Props = { ...(p.properties ?? {}) };
  const attachments: { name: string; type: string }[] = [];
  const self: Turn = {
    eventId: p.eventId,
    props(x) {
      Object.assign(props, x);
      safe(() => it?.setProperties(x));
    },
    attach(name, value, opts = {}) {
      attachments.push({ name, type: opts.type ?? "text" });
      const role = opts.role ?? "output";
      safe(() =>
        it?.addAttachments([opts.type === "code" ? { type: "code", language: opts.language ?? "json", name, value, role } : { type: "text", name, value, role }]),
      );
    },
    async tool(name, input, output, opts = {}) {
      safe(() =>
        it?.trackTool({ name, input, output, durationMs: opts.durationMs, error: opts.error, properties: opts.properties ? stringProps(opts.properties) : undefined }),
      );
      await mirror("tool", p.eventId, name, { input, output, properties: opts.properties ?? {}, error: opts.error ?? null });
    },
    async diagnose(category, description, properties = {}) {
      await diagnose(p.eventId, category, description, properties);
    },
    async finish(output) {
      // Not awaited: the terminal POST must never sit on the request path.
      safe(() => void it?.finish({ output }).catch((e: unknown) => console.error("raindrop finish failed", e)));
      await mirror("interaction", p.eventId, p.event, { userId: p.userId, convoId: p.convoId, input: p.input, output, properties: props, attachments });
    },
  };
  return self;
}

/** Self-diagnostic signal: the agent flags its own risky behaviour on the event where it happened. */
export async function diagnose(eventId: string, category: string, description: string, properties: Props = {}) {
  safe(() => client()?.selfDiagnose({ eventId, category, description, properties }));
  await mirror("diagnostic", eventId, category, { description, sentiment: "NEGATIVE", properties });
}

export async function signal(eventId: string, name: string, sentiment: Sentiment, properties: Props = {}, opts: { type?: "agent" | "feedback"; comment?: string } = {}) {
  const type = opts.type ?? "agent";
  safe(() =>
    client()?.trackSignal(type === "feedback" ? { eventId, name, sentiment, type: "feedback", comment: opts.comment, properties } : { eventId, name, sentiment, type: "agent", properties }),
  );
  await mirror("signal", eventId, name, { sentiment, signalType: type, comment: opts.comment ?? null, properties });
}

/** Flush pending Raindrop payloads (best effort, bounded). */
export async function flushRaindrop(timeoutMs = 3000) {
  const rd = client();
  if (!rd) return;
  await Promise.race([rd.forceFlush().catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
}
