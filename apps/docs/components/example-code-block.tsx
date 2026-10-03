"use client";
import { useRef, useState, type ComponentProps } from "react";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
export default function ExampleCodeBlock(props: ComponentProps<"pre">) {
  const blockRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    const pre = blockRef.current?.querySelector("pre");
    if (!pre) return;
    const content = pre.cloneNode(true) as HTMLElement;
    content
      .querySelectorAll(".nd-copy-ignore")
      .forEach((node) => node.replaceWith("\n"));
    try {
      await navigator.clipboard.writeText(content.textContent ?? "");
      setStatus("Copied");
    } catch {
      setStatus("Couldn't copy. Select the example and copy it.");
    }
  }
  return (
    <CodeBlock
      {...props}
      ref={blockRef}
      allowCopy={false}
      title={
        <span className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void copy()}
            className="rounded px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-fd-primary"
          >
            Copy example
          </button>
          <span role="status" aria-live="polite" className="text-xs">
            {status}
          </span>
        </span>
      }
    >
      <Pre>{props.children}</Pre>
    </CodeBlock>
  );
}
