import { ParallelSessions } from "./parallel-sessions";
import { PublishedExamples } from "./published-examples";

export function RecordedExamplesSection() {
  return (
    <section
      id="published-runs"
      aria-labelledby="examples-title"
      className="scroll-mt-6 border-t border-line-strong py-14 sm:py-20"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-ink-secondary">
            04 / See the mechanism in action
          </p>
          <h2
            id="examples-title"
            className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Follow the evidence.
            <br />
            Inspect the payment.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-ink-secondary">
          Open a recorded example to inspect readings, payment approvals, and
          final accounting. Viewing it never starts a payment.
        </p>
      </div>
      <ParallelSessions />
      <PublishedExamples />
    </section>
  );
}
