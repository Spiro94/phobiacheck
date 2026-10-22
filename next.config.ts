import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page depends on the auth session and locale cookie, so pages render per request.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
