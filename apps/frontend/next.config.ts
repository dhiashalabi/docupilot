import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  // Emit a minimal standalone server (.next/standalone) for small prod images.
  output: "standalone",
  allowedDevOrigins: ["3000-01kv8qt5y96a31hqwjxve2fkdx.cloudspaces.litng.ai"],
}

export default withNextIntl(nextConfig)
