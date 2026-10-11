import { describe, expect, it, vi } from "vitest";
import { SCRIPT } from "@/lib/scenario";

// The dry run reads the active guardrail from Mongo inside a try/catch. Make that lookup fail fast and
// deterministically so the test exercises the "no DB" path (baseline + heuristic hardened rules) and never
// depends on whatever guardrail a local database happens to hold.
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  cols: async () => {
    throw new Error("database unavailable in unit tests");
  },
}));

const { analyzeMessage } = await import("@/lib/analyze");

const scriptText = (id: string): { speaker: string; text: string } => {
  const s = SCRIPT.find((x) => x.id === id);
  if (!s) throw new Error(`no script step ${id}`);
  return { speaker: s.speaker, text: s.text };
};

describe("analyzeMessage (dry run, heuristic extractor, no DB)", () => {
  it("Mallory rerouting Alice's card: baseline allows, hardened holds, verdict risky", async () => {
    const { speaker, text } = scriptText("poison-card");
    expect(speaker).toBe("mallory");
    const r = await analyzeMessage(speaker, text);

    expect(r.extractor).toBe("heuristic");
    expect(r.isTask).toBe(false);
    expect(r.verdict).toBe("risky");

    const card = r.memories.find((m) => m.category === "payment_instruction");
    expect(card).toBeDefined();
    expect(card?.text).toMatch(/visa[^0-9]*4417/i);
    expect(card?.subject).toBe("alice");
    expect(card?.scope).toBe("user:alice");
    expect(card?.baseline).toBe("allow");
    expect(card?.hardened).toBe("hold");
    expect(card?.hits.length).toBeGreaterThan(0);

    const cc = r.memories.find((m) => m.category === "contact_routing");
    expect(cc?.text).toMatch(/ma11ory/i);
    expect(cc?.baseline).toBe("allow");
    expect(cc?.hardened).not.toBe("allow");

    expect(r.risk.length).toBeGreaterThan(0);
    for (const finding of r.risk) expect(finding.description).not.toMatch(/preview_\d+/);
  });

  it("Alice updating her own card: allowed under both guardrails, verdict safe", async () => {
    const { speaker, text } = scriptText("legit-update");
    expect(speaker).toBe("alice");
    const r = await analyzeMessage(speaker, text);

    expect(r.isTask).toBe(false);
    expect(r.memories).toHaveLength(1);
    const [card] = r.memories;
    expect(card.category).toBe("payment_instruction");
    expect(card.subject).toBe("alice");
    expect(card.text).toMatch(/amex[^0-9]*2002/i);
    expect(card.baseline).toBe("allow");
    expect(card.hardened).toBe("allow");
    expect(r.risk).toEqual([]);
    expect(r.verdict).toBe("safe");
  });

  it("a pure task writes no memories and is safe", async () => {
    const { speaker, text } = scriptText("book-trip");
    const r = await analyzeMessage(speaker, text);
    expect(r.isTask).toBe(true);
    expect(r.memories).toEqual([]);
    expect(r.risk).toEqual([]);
    expect(r.verdict).toBe("safe");
  });
});
