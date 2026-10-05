"use client";
import dynamic from "next/dynamic";
import { CorridorWorkspace } from "./corridor/corridor-workspace";
import { AppShell } from "./corridor/app-shell";
import { useLabNavigation } from "./lab/lab-navigation";
const LabWorkspace = dynamic(() =>
  import("./lab/lab-workspace").then((module) => module.LabWorkspace),
);
export function LocalEntry(props: Parameters<typeof CorridorWorkspace>[0]) {
  const navigation = useLabNavigation();
  if (navigation.view === "lab")
    return (
      <main className="mx-auto w-full max-w-[1720px] px-5 py-5 sm:px-8 lg:px-12">
        <AppShell connection="idle" checkedAt={null} />
        <LabWorkspace />
      </main>
    );
  return (
    <CorridorWorkspace
      {...props}
      initialRunId={navigation.runId}
      initialScenarioId={navigation.scenarioId}
      initialCorridorId={navigation.corridorId}
    />
  );
}
