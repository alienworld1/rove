import defaultComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import ExampleCodeBlock from "./components/example-code-block";
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultComponents, pre: ExampleCodeBlock, ...components };
}
