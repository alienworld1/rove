import {
  defineDocs,
  defineConfig,
  frontmatterSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: { extractLinkReferences: true, includeMDAST: true },
    schema: frontmatterSchema.extend({
      title: z.string().min(1),
      description: z.string().min(1),
    }),
  },
});
export default defineConfig();
