import OpenAI from "openai";
import { config } from "./config";

const cache = new Map<string, number[]>();

function voyageBase() {
  const key = process.env.VOYAGE_API_KEY ?? "";
  if (process.env.VOYAGE_BASE_URL) return process.env.VOYAGE_BASE_URL;
  return key.startsWith("al-") ? "https://ai.mongodb.com/v1" : config.embed.voyageBaseUrl;
}

async function voyageEmbed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
  const res = await fetch(`${voyageBase()}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: config.embed.model, input_type: inputType, output_dimension: config.embed.dimensions }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

let nim: OpenAI | null = null;
async function nvidiaEmbed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
  nim ??= new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY });
  const r = await nim.embeddings.create(
    {
      model: config.embed.model,
      input: texts,
      encoding_format: "float",
      // NIM-specific fields
      ...({ input_type: inputType === "query" ? "query" : "passage", truncate: "END" } as object),
    },
    { timeout: 20000 },
  );
  return r.data.map((d) => d.embedding as number[]);
}

function hashEmbed(text: string): number[] {
  const dim = config.embed.dimensions;
  const v = new Array(dim).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9@.\-]+/g) ?? [];
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
    v[Math.abs(h) % dim] += 1;
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export async function embed(texts: string[], inputType: "query" | "document" = "document"): Promise<number[][]> {
  const out: (number[] | null)[] = texts.map((t) => cache.get(`${inputType}:${t}`) ?? null);
  const missing = texts.map((t, i) => (out[i] ? -1 : i)).filter((i) => i >= 0);
  if (missing.length) {
    const batch = missing.map((i) => texts[i]);
    let vecs: number[][];
    try {
      if (config.embed.provider === "voyage") vecs = await voyageEmbed(batch, inputType);
      else if (config.embed.provider === "nvidia") vecs = await nvidiaEmbed(batch, inputType);
      else vecs = batch.map(hashEmbed);
    } catch (e) {
      console.error("embed failed, using hash fallback", e);
      vecs = batch.map(hashEmbed);
    }
    missing.forEach((i, j) => {
      out[i] = vecs[j];
      cache.set(`${inputType}:${texts[i]}`, vecs[j]);
    });
  }
  return out as number[][];
}

export async function embedOne(text: string, inputType: "query" | "document" = "document") {
  return (await embed([text], inputType))[0];
}

/** Voyage reranker; returns indices in relevance order (identity when Voyage isn't configured). */
export async function rerank(query: string, docs: string[], topK: number): Promise<{ index: number; score: number }[]> {
  if (config.embed.provider !== "voyage" || docs.length === 0) return docs.map((_, i) => ({ index: i, score: 0 })).slice(0, topK);
  try {
    const res = await fetch(`${voyageBase()}/rerank`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, documents: docs, model: config.embed.rerankModel, top_k: topK }),
    });
    if (!res.ok) throw new Error(`rerank ${res.status}`);
    const json = (await res.json()) as { data: { index: number; relevance_score: number }[] };
    return json.data.map((d) => ({ index: d.index, score: d.relevance_score }));
  } catch (e) {
    console.error("rerank failed", e);
    return docs.map((_, i) => ({ index: i, score: 0 })).slice(0, topK);
  }
}

export function cosine(a: number[], b: number[]) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return s / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
