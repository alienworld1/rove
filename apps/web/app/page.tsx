import { ReadinessPanel } from "./readiness-panel";
import { IntegrationStatus } from "./integration-status";
import { ChargingProjection } from "./charging-projection";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-10 sm:py-20">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-5 border-b border-line-strong pb-8">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
            Charging assurance
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-ink">
            Rove
          </h1>
        </div>
        <p className="max-w-xs text-sm leading-6 text-ink-secondary">
          Trusted charging evidence and payment readiness, checked at their
          source.
        </p>
      </header>
      <ReadinessPanel />
      <p className="mt-6 text-sm leading-6 text-ink-secondary">
        Charging protection becomes available when its evidence and payment
        dependencies are verified.
      </p>
      {process.env.NODE_ENV === "development" ? (
        <>
          <IntegrationStatus />
          <ChargingProjection />
        </>
      ) : null}
    </main>
  );
}
