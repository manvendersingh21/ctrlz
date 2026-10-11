import { describe, expect, it } from "vitest";
import { idempotencyKey } from "@/lib/sandbox";
import { incidentResumeStage, planKeepCompensate } from "@/lib/rollback";

const REQ = "msg_req001";

describe("incidentResumeStage", () => {
  const base = { replayPlans: [], toCompensate: [], kept: [], status: "opening" as const };

  it("follows explicit checkpoint stages", () => {
    expect(incidentResumeStage({ stage: "quarantine" }, base)).toBe("quarantine");
    expect(incidentResumeStage({ stage: "planning" }, base)).toBe("planning");
    expect(incidentResumeStage({ stage: "compensating" }, base)).toBe("compensating");
    expect(incidentResumeStage({ stage: "resolved" }, base)).toBe("resolved");
  });

  it("infers planning when quarantined but not yet planned", () => {
    expect(incidentResumeStage(null, { ...base, status: "quarantined" })).toBe("planning");
  });

  it("defaults to compensating when replay plan is already persisted (legacy)", () => {
    expect(
      incidentResumeStage(null, {
        ...base,
        status: "quarantined",
        replayPlans: [{ requestMessageId: REQ, agentId: "concierge", speaker: "alice", text: "book", calls: [], retrieved: [], taintedActions: [] }],
      }),
    ).toBe("compensating");
  });
});

describe("planKeepCompensate", () => {
  const hotelBefore = { traveler: "alice", hotel: "Park Hyatt", city: "Tokyo", check_in: "2026-11-03", nights: 3 };
  const hotelReplay = { ...hotelBefore, nights: 4 };
  const key = idempotencyKey("concierge", "reserve_hotel", hotelReplay, REQ);

  it("keeps effects whose idempotency key appears in the replay plan with before/replay args", () => {
    const effects = [
      {
        _id: "fx_old",
        actionId: "act_1",
        summary: "Hotel Park Hyatt",
        idempotency_key: key,
        details: hotelBefore,
      },
      {
        _id: "fx_pay",
        actionId: "act_2",
        summary: "Paid invoice",
        idempotency_key: "pay_invoice:deadbeefdeadbeef",
        details: { invoice_id: "INV-1" },
      },
    ];
    const replayPlans = [
      {
        requestMessageId: REQ,
        agentId: "concierge" as const,
        speaker: "alice",
        text: "book hotel",
        calls: [{ tool: "reserve_hotel", args: hotelReplay, justifiedBy: [], key }],
        retrieved: [],
        taintedActions: ["act_1"],
      },
    ];
    const { kept, toCompensate } = planKeepCompensate(effects, replayPlans);
    expect(toCompensate).toEqual(["fx_pay"]);
    expect(kept).toHaveLength(1);
    expect(kept[0].effectId).toBe("fx_old");
    expect(kept[0].before).toEqual(hotelBefore);
    expect(kept[0].replay).toEqual(hotelReplay);
  });
});
