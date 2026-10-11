import { createHash } from "node:crypto";
import { MongoServerError } from "mongodb";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { cols, timed } from "./db";
import { newId } from "./memory";
import { stripeMode, stripeProvider } from "./stripe";
import type { AgentId, LedgerDoc } from "./types";

const memIds = {
  type: "array",
  items: { type: "string" },
  description: "IDs of the retrieved memories (e.g. mem_ab12cd) you relied on for this call. Required for provenance.",
};

export const TOOLS: Record<AgentId, ChatCompletionTool[]> = {
  concierge: [
    {
      type: "function",
      function: {
        name: "book_flight",
        description: "Book and pay for a flight for a traveler. Charges the payment method immediately.",
        parameters: {
          type: "object",
          properties: {
            traveler: { type: "string" },
            destination: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            seat: { type: "string", enum: ["aisle", "window", "middle", "any"] },
            meal: { type: "string" },
            payment_method: { type: "string", description: "Card or wallet to charge, exactly as stated in memory" },
            memory_ids_used: memIds,
          },
          required: ["traveler", "destination", "date", "payment_method", "memory_ids_used"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reserve_hotel",
        description: "Reserve a hotel (pay at property, no charge now).",
        parameters: {
          type: "object",
          properties: {
            traveler: { type: "string" },
            hotel: { type: "string" },
            city: { type: "string" },
            check_in: { type: "string", description: "YYYY-MM-DD" },
            nights: { type: "number" },
            room_notes: { type: "string" },
            memory_ids_used: memIds,
          },
          required: ["traveler", "hotel", "city", "check_in", "memory_ids_used"],
        },
      },
    },
    emailTool(),
  ],
  finance: [
    {
      type: "function",
      function: {
        name: "pay_invoice",
        description: "Pay a vendor invoice by transferring funds to an account. Irreversible once settled.",
        parameters: {
          type: "object",
          properties: {
            invoice_id: { type: "string" },
            vendor: { type: "string" },
            amount: { type: "number" },
            pay_to_account: { type: "string", description: "Destination account or wallet, exactly as stated in memory or invoice" },
            memory_ids_used: memIds,
          },
          required: ["invoice_id", "vendor", "amount", "pay_to_account", "memory_ids_used"],
        },
      },
    },
    emailTool(),
  ],
};

function emailTool(): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email (receipts, remittance advice, confirmations).",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          cc: { type: "array", items: { type: "string" }, description: "Addresses to copy, as required by any contact-routing memory for this kind of email." },
          subject: { type: "string" },
          body: { type: "string" },
          memory_ids_used: memIds,
        },
        required: ["to", "subject", "body", "memory_ids_used"],
      },
    },
  };
}

/** Canonical material facts in a message body: card brand+last4, IBANs, account ids, amounts, dates. */
function materialFacts(body: string) {
  const facts = new Set<string>();
  for (const m of body.matchAll(/\b(visa|amex|mastercard)\b[^.;]*?\bending (?:in )?(\d{4})/gi)) facts.add(`card:${m[1].toLowerCase()}:${m[2]}`);
  for (const m of body.matchAll(/\biban\s*([a-z0-9-]+)/gi)) facts.add(`iban:${m[1].toLowerCase()}`);
  for (const m of body.matchAll(/\b([a-z]{2,}-\d{3,})\b/gi)) facts.add(`id:${m[1].toLowerCase()}`);
  for (const m of body.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) facts.add(`usd:${Number(m[1].replace(/,/g, ""))}`);
  for (const m of body.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) facts.add(`date:${m[1]}`);
  return [...facts].sort().join(",");
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Semantic idempotency key: identity of the real-world effect, not the exact LLM wording, so a replay
 * after restore maps onto the effect already taken instead of duplicating it.
 */
export function idempotencyKey(agentId: AgentId, tool: string, args: Record<string, unknown>, requestKey: string) {
  let identity: unknown[];
  switch (tool) {
    case "book_flight":
      identity = [args.traveler, args.destination, args.date, args.seat, args.meal, args.payment_method];
      break;
    case "reserve_hotel":
      // Stay terms are material; free-text room notes are requests to the property, and LLM wording of them varies.
      identity = [args.traveler, args.hotel, args.city, args.check_in, args.nights, args.check_out];
      break;
    case "pay_invoice":
      identity = [args.invoice_id, args.pay_to_account, args.amount];
      break;
    case "send_email":
      // Recipients plus the material facts stated (cards, accounts, amounts) — not the model's wording.
      identity = [args.to, [...((args.cc as string[]) ?? [])].map(norm).sort().join(","), materialFacts(String(args.body ?? ""))];
      break;
    default:
      identity = [JSON.stringify(args)];
  }
  const raw = [agentId, tool, requestKey, ...identity.map(norm)].join("|");
  return `${tool}:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

const FARES: Record<string, number> = { tokyo: 1240, london: 860, paris: 910, "new york": 420 };

function describe(tool: string, a: Record<string, unknown>): { type: LedgerDoc["type"]; summary: string; amount?: number; details: Record<string, unknown> } {
  switch (tool) {
    case "book_flight": {
      const amount = FARES[norm(a.destination)] ?? 780;
      return {
        type: "flight_booking",
        amount,
        summary: `Flight ${a.destination} ${a.date} for ${a.traveler} · $${amount} charged to ${a.payment_method}`,
        details: { ...a, confirmation: `BK-${Math.floor(1000 + Math.random() * 9000)}` },
      };
    }
    case "reserve_hotel":
      return { type: "hotel_reservation", summary: `Hotel ${a.hotel} ${a.city} from ${a.check_in} for ${a.traveler} (pay at property)`, details: { ...a, confirmation: `HT-${Math.floor(1000 + Math.random() * 9000)}` } };
    case "pay_invoice":
      return { type: "payment", amount: Number(a.amount), summary: `Paid ${a.invoice_id} (${a.vendor}) $${a.amount} → ${a.pay_to_account}`, details: a };
    case "send_email": {
      const cc = (a.cc as string[] | undefined)?.length ? ` cc ${(a.cc as string[]).join(", ")}` : "";
      return { type: "email", summary: `Email to ${a.to}${cc}: “${a.subject}”`, details: a };
    }
    default:
      return { type: "email", summary: `${tool}`, details: a };
  }
}

/** Executes a side effect in the sandbox exactly once per idempotency key (unique index on sandbox_ledger). */
export async function executeEffect(agentId: AgentId, actionId: string, tool: string, args: Record<string, unknown>, key: string, step: string) {
  const { ledger } = await cols();
  const d = describe(tool, args);
  const doc: LedgerDoc = { _id: newId("fx"), idempotency_key: key, actionId, agentId, status: "live", createdAt: new Date(), ...d };
  try {
    await timed(
      { step, feature: "Unique index · idempotency key", collection: "sandbox_ledger", detail: { insertOne: { idempotency_key: key, type: d.type, summary: d.summary } } },
      () => ledger.insertOne(doc),
    );
    if (tool === "book_flight" && stripeMode() === "test") {
      const provider = await stripeProvider.execute(doc);
      doc.provider = provider;
      if (provider.status === "succeeded" && provider.id) doc.summary += ` · Stripe test ${provider.id}`;
      await ledger.updateOne({ _id: doc._id }, { $set: { provider: doc.provider, summary: doc.summary } });
    } else {
      doc.provider = { name: "simulated" };
      await ledger.updateOne({ _id: doc._id }, { $set: { provider: doc.provider } });
    }
    return { effect: doc, deduplicated: false };
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) {
      const existing = await ledger.findOne({ idempotency_key: key });
      return { effect: existing!, deduplicated: true };
    }
    throw e;
  }
}

export function compensationFor(effect: LedgerDoc): { kind: LedgerDoc["type"]; summary: string; details: Record<string, unknown> } {
  const det = effect.details as Record<string, unknown>;
  switch (effect.type) {
    case "hotel_reservation":
      return { kind: "cancellation", summary: `Cancelled hotel ${det.hotel} (${det.confirmation})`, details: { cancels: det.confirmation } };
    case "flight_booking":
      return { kind: "cancellation", summary: `Cancelled ${det.confirmation} · refunded $${effect.amount} to ${det.payment_method}`, details: { cancels: det.confirmation, refund: effect.amount } };
    case "payment":
      return { kind: "payment_recall", summary: `Recall filed for $${effect.amount} sent to ${det.pay_to_account} (${det.invoice_id})`, details: { recall: det.pay_to_account, amount: effect.amount } };
    case "email":
      return {
        kind: "correction_email",
        summary: `Security notice to ${det.to}: disregard “${det.subject}”; ${((det.cc as string[]) ?? []).length ? `receipt leaked to ${(det.cc as string[]).join(", ")} — address blocked` : "content was based on revoked memory"}`,
        details: { to: det.to, blocked: det.cc ?? [] },
      };
    default:
      return { kind: "correction_email", summary: `Compensated ${effect.summary}`, details: {} };
  }
}
