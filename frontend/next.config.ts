import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone for a tiny production image (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
