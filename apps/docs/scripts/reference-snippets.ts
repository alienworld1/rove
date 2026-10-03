import { referenceBlocks } from "../lib/reference-blocks";
for (const [name, block] of referenceBlocks())
  process.stdout.write(`${name}\n${block}\n`);
