import { publicOrigin } from "@rove/contracts/docs-links";
export const docsOrigin = publicOrigin(
  process.env.NEXT_PUBLIC_DOCS_ORIGIN,
  "NEXT_PUBLIC_DOCS_ORIGIN",
  "http://localhost:3001",
  process.env.NODE_ENV === "development",
);
