import { createMDX } from "fumadocs-mdx/next";
import { publicOrigin } from "../../packages/contracts/src/docs-links.ts";
publicOrigin(
  process.env.NEXT_PUBLIC_APP_ORIGIN,
  "NEXT_PUBLIC_APP_ORIGIN",
  "http://localhost:3000",
  process.env.NODE_ENV === "development",
);
export default createMDX()({
  agentRules: false,
  transpilePackages: ["@rove/contracts"],
});
