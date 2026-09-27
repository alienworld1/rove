"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-ink-tertiary">
        Rove
      </p>
      <h1 className="mt-4 text-3xl font-semibold text-ink">
        This page could not load
      </h1>
      <p className="mt-3 text-ink-secondary">
        Please try again. If the problem continues, check the service settings.
      </p>
      <button
        onClick={reset}
        className="mt-6 w-fit rounded-sm border border-line-strong px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Try again
      </button>
    </main>
  );
}
