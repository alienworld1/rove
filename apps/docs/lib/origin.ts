import { publicOrigin } from "@rove/contracts/docs-links";
export const appOrigin = publicOrigin(
  process.env.NEXT_PUBLIC_APP_ORIGIN,
  "NEXT_PUBLIC_APP_ORIGIN",
  "http://localhost:3000",
  process.env.NODE_ENV === "development",
);
