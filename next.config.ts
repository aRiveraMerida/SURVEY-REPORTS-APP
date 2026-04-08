import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages must NOT be bundled into the serverless function output —
  // they're loaded from node_modules at runtime. Bundling them (especially
  // full `puppeteer` with its ~300MB of Chromium) pushes the function past
  // Vercel's size limits.
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
};

export default nextConfig;
