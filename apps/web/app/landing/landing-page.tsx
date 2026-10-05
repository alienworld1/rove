import { InviteAccessForm } from "../invite-access-form";
import { PublicHeader } from "./public-header";
import { LandingHero } from "./landing-hero";
import { ProtectionStory } from "./protection-story";
import { CreditComparison } from "./credit-comparison";
import { IntegrationContext } from "./integration-context";
import { RecordedExamplesSection } from "./recorded-examples-section";
import { LandingFooter } from "./landing-footer";

export function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
      <a
        href="#landing-content"
        className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:underline"
      >
        Skip to content
      </a>
      <PublicHeader />
      <main id="landing-content">
        <LandingHero />
        <ProtectionStory />
        <CreditComparison />
        <IntegrationContext />
        <RecordedExamplesSection />
        <InviteAccessForm />
      </main>
      <LandingFooter />
    </div>
  );
}
