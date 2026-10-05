import type { NextConfig } from "next";

import { publicOrigin } from "../../packages/contracts/src/docs-links";

publicOrigin(
  process.env.NEXT_PUBLIC_DOCS_ORIGIN,
  "NEXT_PUBLIC_DOCS_ORIGIN",
  "http://localhost:3001",
  process.env.NODE_ENV === "development",
);

const nextConfig: NextConfig = {
  distDir: process.env.ROVE_BUILD_DIRECTORY ?? ".next",
};

export default nextConfig;
