import type { LedgerDoc } from "./types";

export type ProviderResult = {
  name: "stripe";
  mode: "test";
  status: "succeeded" | "failed" | "requires_action" | "processing" | "canceled";
  id?: string;
  dashboardUrl?: string;
  error?: string;
};

export interface EffectProvider {
  name: string;
  execute(effect: LedgerDoc): Promise<ProviderResult>;
  compensate(effect: LedgerDoc): Promise<ProviderResult>;
}

type StripeMode = "test" | "refused-live" | "off";

let warnedLive = false;

/** STRIPE_SECRET_KEY is canonical; STRIPE_API_KEY is accepted as an alias. */
const stripeKey = () => process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || "";

export function stripeMode(): StripeMode {
  const key = stripeKey();
  if (!key) return "off";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    if (!warnedLive) {
      console.warn("Stripe live mode refused; no Stripe requests will be sent.");
      warnedLive = true;
    }
    return "refused-live";
  }
  return "off";
}

async function stripeRequest(path: string, body: URLSearchParams, idempotencyKey: string): Promise<Record<string, unknown>> {
  if (stripeMode() !== "test") throw new Error("Stripe is not enabled in test mode");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body,
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(err?.message || `Stripe request failed (${response.status})`);
  }
  return data;
}

function resultStatus(status: unknown): ProviderResult["status"] {
  if (status === "succeeded") return "succeeded";
  if (status === "requires_action") return "requires_action";
  if (status === "processing") return "processing";
  if (status === "canceled") return "canceled";
  return "failed";
}

function failed(error: unknown): ProviderResult {
  return { name: "stripe", mode: "test", status: "failed", error: error instanceof Error ? error.message : String(error) };
}

export const stripeProvider: EffectProvider = {
  name: "stripe",
  async execute(effect) {
    if (stripeMode() !== "test") return failed(new Error("Stripe is not enabled in test mode"));
    try {
      const amount = Math.round(Number(effect.amount) * 100);
      const body = new URLSearchParams({
        amount: String(amount),
        currency: "usd",
        confirm: "true",
        payment_method: "pm_card_visa",
        "automatic_payment_methods[enabled]": "true",
        "automatic_payment_methods[allow_redirects]": "never",
        description: effect.summary,
        "metadata[ctrlz_effect_id]": effect._id,
        "metadata[ctrlz_idempotency_key]": effect.idempotency_key,
        "metadata[card_on_file]": String(effect.details.payment_method ?? ""),
      });
      const data = await stripeRequest("/payment_intents", body, effect.idempotency_key);
      const id = typeof data.id === "string" ? data.id : undefined;
      const status = resultStatus(data.status);
      return {
        name: "stripe",
        mode: "test",
        status,
        ...(id ? { id, dashboardUrl: `https://dashboard.stripe.com/test/payments/${id}` } : {}),
        ...(status === "failed" ? { error: "Stripe payment intent did not succeed" } : {}),
      };
    } catch (error) {
      return failed(error);
    }
  },
  async compensate(effect) {
    if (stripeMode() !== "test") return failed(new Error("Stripe is not enabled in test mode"));
    const paymentIntent = effect.provider?.name === "stripe" ? effect.provider.id : undefined;
    if (!paymentIntent) return failed(new Error("Stripe payment intent id is missing"));
    try {
      const data = await stripeRequest("/refunds", new URLSearchParams({ payment_intent: paymentIntent }), `comp:${effect._id}`);
      const id = typeof data.id === "string" ? data.id : undefined;
      const status = data.status === "pending" ? "processing" : resultStatus(data.status);
      return {
        name: "stripe",
        mode: "test",
        status,
        ...(id ? { id, dashboardUrl: `https://dashboard.stripe.com/test/payments/${paymentIntent}` } : {}),
        ...(status === "failed" ? { error: "Stripe refund did not succeed" } : {}),
      };
    } catch (error) {
      return failed(error);
    }
  },
};
