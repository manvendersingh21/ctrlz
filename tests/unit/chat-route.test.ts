import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent", () => ({ runTurn: vi.fn(async (input) => input) }));

import { runTurn } from "@/lib/agent";
import { POST } from "@/app/api/chat/route";

describe("chat demo identity boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only the demo character names and rejects arbitrary submitted speakers", async () => {
    const valid = await POST(new Request("http://localhost/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "concierge", speaker: "mallory", text: "hello" }),
    }));
    expect(valid.status).toBe(200);
    expect(runTurn).toHaveBeenCalledWith({ agentId: "concierge", speaker: "mallory", text: "hello" });

    const invalid = await POST(new Request("http://localhost/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "concierge", speaker: "not-a-demo-user", text: "hello" }),
    }));
    expect(invalid.status).toBe(400);
    expect(runTurn).toHaveBeenCalledTimes(1);
  });
});
