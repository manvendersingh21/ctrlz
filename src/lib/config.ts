import { stripeMode } from "./stripe";

export type EmbedProvider = "voyage" | "nvidia" | "hash";

function embedProvider(): EmbedProvider {
  const forced = process.env.EMBED_PROVIDER as EmbedProvider | undefined;
  if (forced) return forced;
  if (process.env.VOYAGE_API_KEY) return "voyage";
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  return "hash";
}

const provider = embedProvider();

/** LLM precedence: explicit LLM_* settings, then OpenAI (fast tool calling), then NVIDIA NIM. */
function llmConfig() {
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 25000);
  if (process.env.LLM_API_KEY) {
    return { baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1", apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL || "gpt-4.1-mini", timeoutMs };
  }
  if (process.env.OPENAI_API_KEY) {
    return { baseUrl: "https://api.openai.com/v1", apiKey: process.env.OPENAI_API_KEY, model: process.env.LLM_MODEL || "gpt-4.1-mini", timeoutMs };
  }
  return { baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY || "", model: process.env.LLM_MODEL || "openai/gpt-oss-20b", timeoutMs };
}

export const config = {
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/?directConnection=true",
  graderUri: process.env.MONGODB_GRADER_URI || "",
  dbName: process.env.MONGODB_DB || "ctrlz",
  embed: {
    provider,
    model:
      provider === "voyage"
        ? process.env.VOYAGE_MODEL || "voyage-3.5"
        : provider === "nvidia"
          ? "nvidia/nemotron-3-embed-1b"
          : "hash-1024",
    dimensions: provider === "voyage" ? 1024 : provider === "nvidia" ? 2048 : 1024,
    voyageBaseUrl: process.env.VOYAGE_BASE_URL || "https://api.voyageai.com/v1",
    rerankModel: process.env.VOYAGE_RERANK_MODEL || "rerank-2.5-lite",
  },
  llm: llmConfig(),
  raindrop: {
    writeKey: process.env.RAINDROP_WRITE_KEY || "",
  },
  agentEngine: {
    apiKey: process.env.AGENT_ENGINE_API_KEY || "",
    projectId: process.env.AGENT_ENGINE_PROJECT_ID || "",
    baseUrl: process.env.AGENT_ENGINE_BASE_URL || "https://agentengine.mongodb.com",
  },
  isAtlasCloud: (process.env.MONGODB_URI || "").includes("mongodb.net"),
};

export function publicConfig() {
  return {
    atlas: config.isAtlasCloud ? "MongoDB Atlas (cloud)" : "Atlas Local (mongodb-atlas-local)",
    embed: `${config.embed.provider === "voyage" ? "Voyage AI" : config.embed.provider === "nvidia" ? "NVIDIA NIM (fallback)" : "hash (offline)"} · ${config.embed.model} · ${config.embed.dimensions}d`,
    rerank: config.embed.provider === "voyage" ? `Voyage ${config.embed.rerankModel}` : "off",
    llm: config.llm.apiKey ? config.llm.model : "rule-based fallback",
    raindrop: process.env.RAINDROP_WRITE_KEY ? "cloud" : process.env.RAINDROP_WORKSHOP ? "workshop" : "mirror-only",
    agentEngine: Boolean(config.agentEngine.apiKey && config.agentEngine.projectId),
    graderRole: Boolean(config.graderUri),
    stripe: stripeMode(),
  };
}
