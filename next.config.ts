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

  // `serverExternalPackages` keeps @sparticuz/chromium loadable at
  // runtime, but Next's file tracer only follows JavaScript require()
  // calls — it can't see the brotli-compressed Chromium binary that
  // the package reads via fs.readFileSync from its bin/ directory.
  // Without this explicit include the function crashes at runtime with:
  //
  //   The input directory "/var/task/node_modules/@sparticuz/chromium/bin"
  //   does not exist
  //
  // We apply it to both routes that call generatePdf().
  outputFileTracingIncludes: {
    "/api/generate-pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/send-report": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;
