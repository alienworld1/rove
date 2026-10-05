import { DocsLink } from "../docs-link";

export function IntegrationContext() {
  return (
    <section
      aria-labelledby="integration-title"
      className="border-t border-line-strong py-14 sm:py-20"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-ink-secondary">
        03 / Fits between delivery and settlement
      </p>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
        <div>
          <h2
            id="integration-title"
            className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Keep your roaming.
            <br />
            Keep your accounting.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-secondary">
            Add live payment protection between delivery and final settlement.
            Rove is for charging and mobility businesses managing their partner
            relationships.
          </p>
        </div>
        <div className="space-y-6 text-sm leading-relaxed text-ink-secondary">
          <p>
            Your existing{" "}
            <strong className="font-semibold text-ink">
              Open Charge Point Interface (OCPI)
            </strong>{" "}
            charging records remain the basis for final accounting. Rove checks
            the final record against accepted readings, authorized payment, and
            collected value.
          </p>
          <p>
            <strong className="font-semibold text-ink">
              Tempo is the payment network.
            </strong>{" "}
            It supplies funded payment channels for the rolling reserve and
            settlement. Drivers don’t need to connect a wallet or interact with
            Rove.
          </p>
          <div className="border-l-2 border-line-strong pl-5">
            <p className="font-semibold text-ink">What an integration needs</p>
            <ul className="mt-3 list-disc space-y-2 pl-4">
              <li>Compatible, signed meter readings during charging.</li>
              <li>A partner able to maintain programmable payment funding.</li>
              <li>
                A charging system that consumes and enforces pause instructions.
              </li>
            </ul>
          </div>
          <p>
            The current demonstration uses simulated chargers and controlled
            signed readings, with real payments on Tempo’s test network. A
            production charging-system integration is required to stop physical
            equipment.
          </p>
          <DocsLink>Read the integration manual</DocsLink>
        </div>
      </div>
    </section>
  );
}
