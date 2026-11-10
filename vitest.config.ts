import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Hermetic: offline hashing embedder, deterministic heuristics instead of an LLM, no provider keys.
    env: {
      EMBED_PROVIDER: "hash",
      LLM_DISABLED: "1",
      VOYAGE_API_KEY: "",
      NVIDIA_API_KEY: "",
      LLM_API_KEY: "",
    },
  },
});
