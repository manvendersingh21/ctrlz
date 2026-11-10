import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripeMode, stripeProvider } from "@/lib/stripe";
import type { LedgerDoc } from "@/lib/types";

const payment = (status = "succeeded", id = "pi_test123") => ({ ok: true, status: 200, json: async () => ({ id, status }) });
const effect: LedgerDoc = {
  _id: "fx_123",
  idempotency_key: "book_flight:abc123",
  type: "flight_booking",
  actionId: "act_123",
  agentId: "concierge",
  summary: "Flight Tokyo · $1240 charged to Visa ending 4417",
  details: { payment_method: "Visa ending 4417" },
  amount: 1240,
  status: "live",
  createdAt: new Date(),
};

describe("Stripe test compensator", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects test, refuses live, and reports off when unset", () => {
    expect(stripeMode()).toBe("test");
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_unit");
    expect(stripeMode()).toBe("test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit");
    expect(stripeMode()).toBe("refused-live");
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_unit");
    expect(stripeMode()).toBe("refused-live");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeMode()).toBe("off");
  });

  it("creates a confirmed payment intent with metadata and provider idempotency", async () => {
    vi.mocked(fetch).mockResolvedValue(payment() as Response);
    const result = await stripeProvider.execute(effect);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk_test_unit");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(effect.idempotency_key);
    expect(body.get("amount")).toBe("124000");
    expect(body.get("currency")).toBe("usd");
    expect(body.get("confirm")).toBe("true");
    expect(body.get("payment_method")).toBe("pm_card_visa");
    expect(body.get("automatic_payment_methods[enabled]")).toBe("true");
    expect(body.get("automatic_payment_methods[allow_redirects]")).toBe("never");
    expect(body.get("description")).toBe(effect.summary);
    expect(body.get("metadata[ctrlz_effect_id]")).toBe(effect._id);
    expect(body.get("metadata[ctrlz_idempotency_key]")).toBe(effect.idempotency_key);
    expect(body.get("metadata[card_on_file]")).toBe("Visa ending 4417");
    expect(result).toMatchObject({ name: "stripe", mode: "test", status: "succeeded", id: "pi_test123", dashboardUrl: "https://dashboard.stripe.com/test/payments/pi_test123" });
  });

  it("maps Stripe API and action-required failures", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: { message: "Card declined" } }) } as Response);
    expect(await stripeProvider.execute(effect)).toMatchObject({ status: "failed", error: "Card declined" });
    vi.mocked(fetch).mockResolvedValue(payment("requires_action") as Response);
    expect(await stripeProvider.execute(effect)).toMatchObject({ status: "requires_action", id: "pi_test123" });
  });

  it("refunds the original payment intent with a compensator idempotency key", async () => {
    vi.mocked(fetch).mockResolvedValue(payment("succeeded", "re_test123") as Response);
    const original: LedgerDoc = { ...effect, provider: { name: "stripe", mode: "test", status: "succeeded", id: "pi_test123" } };
    const result = await stripeProvider.compensate(original);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/refunds");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(`comp:${effect._id}`);
    expect(new URLSearchParams(init.body as string).get("payment_intent")).toBe("pi_test123");
    expect(result).toMatchObject({ status: "succeeded", id: "re_test123" });
  });

  it("never sends requests with live, off, or unknown keys", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit");
    expect((await stripeProvider.execute(effect)).status).toBe("failed");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await stripeProvider.execute(effect)).status).toBe("failed");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_unknown_unit");
    expect((await stripeProvider.execute(effect)).status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });
});
