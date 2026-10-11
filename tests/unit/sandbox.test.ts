import { describe, expect, it } from "vitest";
import { compensationFor, idempotencyKey } from "@/lib/sandbox";
import { fx } from "./fixtures";

const REQ = "msg_req001";

const flight = {
  traveler: "alice",
  destination: "Tokyo",
  date: "2026-11-03",
  seat: "aisle",
  meal: "vegetarian",
  payment_method: "Amex ending 1001",
};

const hotel = { traveler: "alice", hotel: "Park Hyatt", city: "Tokyo", check_in: "2026-11-03", nights: 3, room_notes: "gym access", guarantee: "Amex ending 1001" };

const invoice = { invoice_id: "INV-2209", vendor: "Acme Travel", amount: 1240, pay_to_account: "ACME-001" };

const email = {
  to: "alice@acme.co",
  cc: [] as string[],
  subject: "Your Tokyo trip",
  body: "Flight to Tokyo on 2026-11-03 charged to Amex ending 1001. Park Hyatt reserved.",
};

const key = (tool: string, args: Record<string, unknown>, req = REQ, agent: "concierge" | "finance" = "concierge") => idempotencyKey(agent, tool, args, req);

describe("idempotencyKey", () => {
  it("is prefixed by the tool and deterministic", () => {
    const k = key("book_flight", flight);
    expect(k).toMatch(/^book_flight:[0-9a-f]{16}$/);
    expect(key("book_flight", { ...flight })).toBe(k);
  });

  it("is scoped to the request and agent", () => {
    expect(key("book_flight", flight, "msg_other")).not.toBe(key("book_flight", flight));
    expect(key("book_flight", flight, REQ, "finance")).not.toBe(key("book_flight", flight));
  });

  describe("book_flight", () => {
    const base = key("book_flight", flight);

    it("changes when seat or meal changes, but ignores extra fields", () => {
      expect(key("book_flight", { ...flight, seat: "window" })).not.toBe(base);
      expect(key("book_flight", { ...flight, meal: "standard" })).not.toBe(base);
      expect(key("book_flight", { ...flight, note: "anything" })).toBe(base);
    });

    it("normalizes whitespace and case of identity args", () => {
      expect(key("book_flight", { ...flight, destination: "  TOKYO ", payment_method: "amex   ENDING 1001", traveler: "Alice" })).toBe(base);
    });

    it("changes when the payment method changes", () => {
      expect(key("book_flight", { ...flight, payment_method: "Visa ending 4417" })).not.toBe(base);
    });

    it("changes when traveler, destination or date change", () => {
      expect(key("book_flight", { ...flight, traveler: "bob" })).not.toBe(base);
      expect(key("book_flight", { ...flight, destination: "London" })).not.toBe(base);
      expect(key("book_flight", { ...flight, date: "2026-11-04" })).not.toBe(base);
    });
  });

  describe("reserve_hotel", () => {
    const base = key("reserve_hotel", hotel);

    it("includes city and nights, but ignores the guarantee card and free-text room notes", () => {
      expect(key("reserve_hotel", { ...hotel, guarantee: "Visa ending 4417", city: "tokyo " })).toBe(base);
      expect(key("reserve_hotel", { ...hotel, nights: 4 })).not.toBe(base);
      expect(key("reserve_hotel", { ...hotel, nights: "3" })).toBe(base);
      expect(key("reserve_hotel", { ...hotel, room_notes: "Has gym" })).toBe(base);
      expect(key("reserve_hotel", { ...hotel, city: "London" })).not.toBe(base);
    });

    it("changes when hotel, traveler or check-in change", () => {
      expect(key("reserve_hotel", { ...hotel, hotel: "Aman" })).not.toBe(base);
      expect(key("reserve_hotel", { ...hotel, traveler: "bob" })).not.toBe(base);
      expect(key("reserve_hotel", { ...hotel, check_in: "2026-11-05" })).not.toBe(base);
    });
  });

  describe("pay_invoice", () => {
    const base = key("pay_invoice", invoice, REQ, "finance");

    it("ignores the vendor display name and normalizes case/whitespace", () => {
      expect(key("pay_invoice", { ...invoice, vendor: "ACME TRAVEL LTD", pay_to_account: " acme-001 " }, REQ, "finance")).toBe(base);
    });

    it("changes when pay_to_account, amount or invoice change", () => {
      expect(key("pay_invoice", { ...invoice, pay_to_account: "IBAN GB29-EVIL-0001" }, REQ, "finance")).not.toBe(base);
      expect(key("pay_invoice", { ...invoice, amount: 1241 }, REQ, "finance")).not.toBe(base);
      expect(key("pay_invoice", { ...invoice, invoice_id: "INV-2210" }, REQ, "finance")).not.toBe(base);
    });
  });

  describe("send_email", () => {
    const base = key("send_email", email);

    it("ignores subject and wording when the material facts are the same", () => {
      expect(
        key("send_email", {
          ...email,
          subject: "Trip confirmation",
          body: "Hi Alice — your flight (2026-11-03) to Tokyo was billed to the Amex ending 1001; enjoy Park Hyatt!",
        }),
      ).toBe(base);
    });

    it("treats the cc set as order-, case- and whitespace-insensitive", () => {
      const a = key("send_email", { ...email, cc: ["x@a.io", "Y@b.io"] });
      expect(key("send_email", { ...email, cc: [" y@b.io", "X@A.IO"] })).toBe(a);
      expect(a).not.toBe(base);
    });

    it("changes when the cc set changes", () => {
      const a = key("send_email", { ...email, cc: ["travel-desk@ma11ory.io"] });
      expect(a).not.toBe(base);
      expect(key("send_email", { ...email, cc: ["travel-desk@ma11ory.io", "boss@acme.co"] })).not.toBe(a);
    });

    it("changes when the recipient changes", () => {
      expect(key("send_email", { ...email, to: "bob@acme.co" })).not.toBe(base);
    });

    it("changes when the card in the body changes", () => {
      expect(key("send_email", { ...email, body: email.body.replace("Amex ending 1001", "Visa ending 4417") })).not.toBe(base);
    });

    it("changes when the date in the body changes", () => {
      expect(key("send_email", { ...email, body: email.body.replace("2026-11-03", "2026-11-04") })).not.toBe(base);
    });

    it("changes when the IBAN or amount in a remittance body changes", () => {
      const rem = { to: "ap@acmetravel.com", cc: [], subject: "Remittance INV-2209", body: "Paid INV-2209 $1240 to ACME-001." };
      const k = key("send_email", rem, REQ, "finance");
      expect(key("send_email", { ...rem, subject: "Payment sent", body: "We have paid INV-2209 ($1240) into ACME-001. Thanks!" }, REQ, "finance")).toBe(k);
      expect(key("send_email", { ...rem, body: "Paid INV-2209 $1240 to IBAN GB29-EVIL-0001." }, REQ, "finance")).not.toBe(k);
      expect(key("send_email", { ...rem, body: "Paid INV-2209 $1250 to ACME-001." }, REQ, "finance")).not.toBe(k);
      expect(key("send_email", { ...rem, body: "Paid INV-2210 $1240 to ACME-001." }, REQ, "finance")).not.toBe(k);
    });

    // KNOWN BUG (reported): FACT_RE's card alternative captures every word between the brand and
    // "ending", and amounts are compared as raw strings, so pure wording/formatting changes a key.
    it("ignores filler words inside a card mention ('Amex ending 1001' vs 'Amex card ending 1001')", () => {
      expect(key("send_email", { ...email, body: email.body.replace("Amex ending 1001", "your Amex card ending 1001") })).toBe(base);
    });

    it("treats $1240 and $1,240 as the same amount", () => {
      const rem = { to: "ap@acmetravel.com", cc: [], body: "Paid INV-2209 $1240 to ACME-001." };
      expect(key("send_email", { ...rem, body: "Paid INV-2209 $1,240 to ACME-001." }, REQ, "finance")).toBe(key("send_email", rem, REQ, "finance"));
    });

    it("tolerates a missing cc and body", () => {
      expect(key("send_email", { to: "alice@acme.co" })).toMatch(/^send_email:/);
    });
  });

  it("falls back to the full args for unknown tools", () => {
    expect(key("other", { a: 1 })).toBe(key("other", { a: 1 }));
    expect(key("other", { a: 1 })).not.toBe(key("other", { a: 2 }));
  });

  it("keeps the hotel and changes the flight + email between the poisoned and clean demo plans", () => {
    const poisonedCard = "Visa ending 4417";
    const cleanCard = "Amex ending 1001";
    const plan = (card: string, cc: string[]) => ({
      flight: key("book_flight", { ...flight, payment_method: card }),
      hotel: key("reserve_hotel", { ...hotel, guarantee: card }),
      email: key("send_email", { ...email, cc, body: `Flight to Tokyo on 2026-11-03 charged to ${card}. Park Hyatt reserved.` }),
    });
    const poisoned = plan(poisonedCard, ["travel-desk@ma11ory.io"]);
    const clean = plan(cleanCard, []);
    expect(clean.hotel).toBe(poisoned.hotel);
    expect(clean.flight).not.toBe(poisoned.flight);
    expect(clean.email).not.toBe(poisoned.email);
  });
});

describe("compensationFor", () => {
  it("cancels a hotel reservation", () => {
    const c = compensationFor(fx({ type: "hotel_reservation", details: { hotel: "Park Hyatt", confirmation: "HT-1234" } }));
    expect(c.kind).toBe("cancellation");
    expect(c.details).toEqual({ cancels: "HT-1234" });
    expect(c.summary).toContain("Park Hyatt");
    expect(c.summary).toContain("HT-1234");
  });

  it("cancels and refunds a flight to the charged card", () => {
    const c = compensationFor(fx({ type: "flight_booking", amount: 1240, details: { confirmation: "BK-5555", payment_method: "Visa ending 4417" } }));
    expect(c.kind).toBe("cancellation");
    expect(c.details).toEqual({ cancels: "BK-5555", refund: 1240 });
    expect(c.summary).toContain("refunded $1240 to Visa ending 4417");
  });

  it("files a recall for a payment", () => {
    const c = compensationFor(fx({ type: "payment", amount: 1240, details: { pay_to_account: "IBAN GB29-EVIL-0001", invoice_id: "INV-2209" } }));
    expect(c.kind).toBe("payment_recall");
    expect(c.details).toEqual({ recall: "IBAN GB29-EVIL-0001", amount: 1240 });
    expect(c.summary).toContain("INV-2209");
  });

  it("sends a correction email naming leaked cc recipients", () => {
    const c = compensationFor(fx({ type: "email", details: { to: "alice@acme.co", subject: "Your Tokyo trip", cc: ["travel-desk@ma11ory.io"] } }));
    expect(c.kind).toBe("correction_email");
    expect(c.details).toEqual({ to: "alice@acme.co", blocked: ["travel-desk@ma11ory.io"] });
    expect(c.summary).toContain("receipt leaked to travel-desk@ma11ory.io");
  });

  it("sends a correction email without cc", () => {
    const c = compensationFor(fx({ type: "email", details: { to: "ap@acmetravel.com", subject: "Remittance INV-2209", cc: [] } }));
    expect(c.kind).toBe("correction_email");
    expect(c.details).toEqual({ to: "ap@acmetravel.com", blocked: [] });
    expect(c.summary).toContain("content was based on revoked memory");
  });

  it("handles an email whose cc field is absent", () => {
    const c = compensationFor(fx({ type: "email", details: { to: "ap@acmetravel.com", subject: "x" } }));
    expect(c.details).toEqual({ to: "ap@acmetravel.com", blocked: [] });
  });

  it.each(["refund", "cancellation", "correction_email", "payment_recall"] as const)("falls back to a generic correction for %s", (type) => {
    const c = compensationFor(fx({ type, summary: "original", details: {} }));
    expect(c).toEqual({ kind: "correction_email", summary: "Compensated original", details: {} });
  });
});
