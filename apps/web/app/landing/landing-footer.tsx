import Link from "next/link";
import { DocsLink } from "../docs-link";

export function LandingFooter() {
  return (
    <footer className="flex flex-wrap justify-between gap-5 border-t border-line-strong py-6 text-xs text-ink-secondary">
      <p>Rove · Payment protection for EV roaming</p>
      <nav aria-label="Footer navigation" className="flex flex-wrap gap-5">
        <Link
          href="/"
          className="underline focus-visible:outline-2 focus-visible:outline-info"
        >
          Home
        </Link>
        <a
          href="#published-runs"
          className="underline focus-visible:outline-2 focus-visible:outline-info"
        >
          Recorded examples
        </a>
        <DocsLink>Documentation</DocsLink>
      </nav>
    </footer>
  );
}
