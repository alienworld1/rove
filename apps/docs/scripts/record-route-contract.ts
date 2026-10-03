import { writeFileSync } from "node:fs";
import { routeSourceInventory } from "../lib/reference-sources";
writeFileSync(
  "lib/route-contract.json",
  JSON.stringify(routeSourceInventory(), null, 2) + "\n",
);
