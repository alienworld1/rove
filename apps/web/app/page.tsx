import { readBaseConfig } from "@rove/config";
import { HostedEntry } from "./hosted-entry";
import { HostedQueryProvider } from "./hosted-query-provider";
import { idSchema } from "@rove/contracts";
import { CorridorQueryProvider } from "./corridor/corridor-query-provider";
import { LocalEntry } from "./local-entry";
import { LandingPage } from "./landing/landing-page";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedId = (name: string) => {
    const value = params[name];
    return typeof value === "string" && idSchema.safeParse(value).success
      ? value
      : null;
  };
  if (readBaseConfig().ACCESS_MODE === "hosted")
    return (
      <HostedQueryProvider>
        <HostedEntry>
          <LandingPage />
        </HostedEntry>
      </HostedQueryProvider>
    );
  return (
    <CorridorQueryProvider
      controlledMode={process.env.NODE_ENV === "development"}
    >
      <LocalEntry
        controlledMode={process.env.NODE_ENV === "development"}
        initialRunId={selectedId("run")}
        initialScenarioId={selectedId("scenario")}
        initialCorridorId={selectedId("corridor")}
      />
    </CorridorQueryProvider>
  );
}
