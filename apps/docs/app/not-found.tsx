import Link from "next/link";
export default function NotFound() {
  return (
    <main id="docs-content" className="mx-auto max-w-prose p-8">
      <h1 className="text-2xl font-semibold">
        We couldn&apos;t find that documentation page.
      </h1>
      <Link href="/docs" className="mt-4 inline-block underline">
        Browse docs
      </Link>
    </main>
  );
}
