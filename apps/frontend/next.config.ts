import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  // Emit a minimal standalone server (.next/standalone) for small prod images.
  output: "standalone",
}

export default withNextIntl(nextConfig)
