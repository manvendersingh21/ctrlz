import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landing = readFileSync(new URL("../../src/components/landing/Landing.tsx", import.meta.url), "utf8");
const effects = readFileSync(new URL("../../src/components/landing/fx.tsx", import.meta.url), "utf8");

describe("landing evidence claims", () => {
  it("does not publish hardcoded run counts without a reproducible report", () => {
    expect(landing).not.toMatch(/<strong>(?:7|0|5\/5|153)<\/strong>/);
    expect(landing).toContain("Inspect incident-specific nodes and timings in the console");
    expect(landing).toContain("Hand-authored dev and held-out examples; scores include denominators");
    expect(landing).toContain("only the travel and finance agents run in this demo");
    expect(landing).toContain("Use an atomic database transaction where supported");
  });

  it("labels simulated effects and the conditional Stripe test mode", () => {
    expect(landing).toContain("With a Stripe test key, flight charges and refunds create test objects; no real money moves.");
    expect(landing).toContain("Correction-email intent recorded; no email sent");
    expect(landing).toContain("payment-recall effects are simulated ledger entries");
    expect(landing).toContain("simulated payment-recall intent");
    expect(landing).toContain("When configured, Raindrop receives turn and risk signals");
    expect(effects).toContain("EXAMPLE SIGNAL FLOW");
    expect(effects).not.toContain("LIVE SIGNAL");
    expect(effects).not.toContain("evt msg_7f3a");
  });

  it("qualifies replay and transaction behavior by the evidence and runtime mode", () => {
    expect(landing).toContain("Hotel kept only when replay terms match");
    expect(landing).toContain("standalone development mode falls back to sequential writes and is not atomic");
  });
});
