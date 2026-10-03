"use client";
import Link from "next/link";
export default function DocumentationError({ retry }: { retry: () => void }) {
  return (
    <main id="docs-content" className="p-8">
      <h1 className="text-xl font-semibold">
        This page couldn&apos;t be loaded. Try again or browse the topics.
      </h1>
      <button
        onClick={retry}
        className="mt-4 rounded border border-fd-border px-4 py-2"
      >
        Try again
      </button>
      <Link href="/docs" className="ml-4 underline">
        Browse docs
      </Link>
    </main>
  );
}
