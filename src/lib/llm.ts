import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { config } from "./config";

let _llm: OpenAI | null = null;
export function llm() {
  _llm ??= new OpenAI({ baseURL: config.llm.baseUrl, apiKey: config.llm.apiKey || "missing" });
  return _llm;
}

export const llmEnabled = () => Boolean(config.llm.apiKey) && process.env.LLM_DISABLED !== "1";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export async function chatWithTools(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
): Promise<{ content: string; toolCalls: ToolCall[]; model: string; ms: number; message: ChatCompletionMessageParam | null }> {
  const t0 = Date.now();
  const r = await llm().chat.completions.create(
    { model: config.llm.model, messages, tools, tool_choice: "auto", temperature: 0.1, max_tokens: 1200 },
    { timeout: config.llm.timeoutMs },
  );
  const m = r.choices[0]?.message;
  const toolCalls: ToolCall[] = (m?.tool_calls ?? []).flatMap((tc) => {
    if (tc.type !== "function") return [];
    try {
      return [{ id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") }];
    } catch {
      return [];
    }
  });
  return { content: m?.content ?? "", toolCalls, model: config.llm.model, ms: Date.now() - t0, message: m ? (m as ChatCompletionMessageParam) : null };
}

export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.search(/[[{]/);
    if (start < 0) continue;
    const open = c[start];
    const close = open === "{" ? "}" : "]";
    const end = c.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function jsonCall<T>(system: string, user: string, maxTokens = 1500): Promise<T | null> {
  const r = await llm().chat.completions.create(
    {
      model: config.llm.model,
      messages: [
        { role: "system", content: `${system}\nRespond with JSON only, no prose.` },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    },
    { timeout: config.llm.timeoutMs },
  );
  return extractJson<T>(r.choices[0]?.message?.content ?? "");
}
