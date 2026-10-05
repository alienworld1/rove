import { HeroRelationship } from "./hero-relationship";
import { RecordedExampleLink } from "./recorded-example-link";

export function LandingHero() {
  return (
    <section
      aria-labelledby="landing-title"
      className="grid gap-12 pb-16 pt-14 sm:pb-24 sm:pt-20 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-secondary">
          Payment protection for EV charging networks
        </p>
        <h1
          id="landing-title"
          className="mt-6 max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl xl:text-6xl"
        >
          Your chargers deliver now.
          <br />
          <span className="text-ink-secondary">
            Put a limit on the payment risk.
          </span>
        </h1>
        <p className="mt-7 max-w-xl text-base leading-relaxed text-ink-secondary sm:text-lg">
          When a customer of another mobility provider uses your charger, you
          supply electricity before that provider pays you. Rove uses verified
          meter readings and a small rolling payment reserve to keep that
          business’s unpaid exposure within a limit you set.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <RecordedExampleLink />
          <a
            href="#invite-access"
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-info"
          >
            Have an invite?
          </a>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-secondary">
          No sign-in needed. Simulated charging, real Tempo testnet payments.
        </p>
      </div>
      <HeroRelationship />
    </section>
  );
}
