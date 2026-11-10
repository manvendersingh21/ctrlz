import { describe, expect, it } from "vitest";
import { extractJson, llmEnabled } from "@/lib/llm";

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses a ```json fenced block", () => {
    expect(extractJson('Here you go:\n```json\n{"is_task": true, "memories": []}\n```\nanything else')).toEqual({ is_task: true, memories: [] });
  });

  it("parses an unlabelled fenced block", () => {
    expect(extractJson('```\n{"ok": "yes"}\n```')).toEqual({ ok: "yes" });
  });

  it("parses an object wrapped in prose", () => {
    expect(extractJson('Sure! The answer is {"rationale": "x", "minimal": [{"id": "r"}]} — hope that helps.')).toEqual({ rationale: "x", minimal: [{ id: "r" }] });
  });

  it("parses a top-level array, fenced or wrapped", () => {
    expect(extractJson("[1, 2, 3]")).toEqual([1, 2, 3]);
    expect(extractJson("Results: [{\"a\": 1}, {\"a\": 2}] done")).toEqual([{ a: 1 }, { a: 2 }]);
    expect(extractJson("```json\n[\"x\"]\n```")).toEqual(["x"]);
  });

  it("keeps nested braces intact", () => {
    expect(extractJson('{"match": {"categories": ["fact"]}, "effect": "hold"}')).toEqual({ match: { categories: ["fact"] }, effect: "hold" });
  });

  it("falls back to the whole text when the fenced block holds no JSON", () => {
    expect(extractJson('```\nno json here\n``` but really {"b": 2}')).toEqual({ b: 2 });
  });

  it.each([
    ["empty", ""],
    ["prose only", "I cannot help with that."],
    ["truncated", '{"a": 1, "b": '],
    ["invalid JSON", "{a: 1}"],
    ["closing before opening", "} {"],
  ])("returns null for %s", (_label, input) => {
    expect(extractJson(input)).toBeNull();
  });
});

describe("llmEnabled", () => {
  it("is off in the hermetic test environment", () => {
    expect(llmEnabled()).toBe(false);
  });
});
