import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a minimal standalone server (.next/standalone) for small prod images.
  output: "standalone",
};

export default nextConfig;
