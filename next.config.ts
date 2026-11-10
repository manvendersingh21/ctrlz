import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mongodb", "raindrop-ai"],
  turbopack: {
    rules: {
      // Tailwind only processes the global stylesheet; CSS modules keep their default (scoped) handling.
      "globals.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
