import Image from "next/image";
import Link from "next/link";
import { DocsLink } from "../docs-link";

export function PublicHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3 border-b border-line-strong py-5">
      <Link
        href="/"
        aria-label="Rove home"
        className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-info"
      >
        <Image src="/rove-logo.png" alt="" width={144} height={48} />
      </Link>
      <nav
        aria-label="Main navigation"
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm sm:gap-x-7"
      >
        <Link
          href="/#how-it-works"
          className="inline-flex min-h-11 items-center hover:underline focus-visible:outline-2 focus-visible:outline-info"
        >
          How it works
        </Link>
        <Link
          href="/#published-runs"
          className="inline-flex min-h-11 items-center hover:underline focus-visible:outline-2 focus-visible:outline-info"
        >
          Recorded examples
        </Link>
        <DocsLink>Docs</DocsLink>
        <Link
          href="/?view=workspace"
          className="inline-flex min-h-11 items-center hover:underline focus-visible:outline-2 focus-visible:outline-info"
        >
          Your workspace
        </Link>
        <Link
          href="/#invite-access"
          className="inline-flex min-h-11 items-center border-l border-line pl-5 font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-info"
        >
          Have an invite?
        </Link>
      </nav>
    </header>
  );
}
