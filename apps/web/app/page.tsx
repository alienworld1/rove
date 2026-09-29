import { idSchema } from "@rove/contracts";
import { CorridorQueryProvider } from "./corridor/corridor-query-provider";
import { CorridorWorkspace } from "./corridor/corridor-workspace";

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
  return (
    <CorridorQueryProvider>
      <CorridorWorkspace
        controlledMode={process.env.NODE_ENV === "development"}
        initialRunId={selectedId("run")}
        initialScenarioId={selectedId("scenario")}
        initialCorridorId={selectedId("corridor")}
      />
    </CorridorQueryProvider>
  );
}
