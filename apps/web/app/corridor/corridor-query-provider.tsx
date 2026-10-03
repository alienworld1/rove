"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createProtectedQueryClient } from "./protected-query-client";
import { AppShell } from "./app-shell";
import { ControlledSessionGate } from "./controlled-session-gate";

export function CorridorQueryProvider({
  children,
  controlledMode,
}: {
  children: ReactNode;
  controlledMode: boolean;
}) {
  const [accessDenied, setAccessDenied] = useState(false);
  const [client, setClient] = useState(() =>
    createProtectedQueryClient(() => setAccessDenied(true)),
  );
  return (
    <QueryClientProvider client={client}>
      {accessDenied ? (
        <main className="mx-auto w-full max-w-[1720px] px-5 py-5 sm:px-8 lg:px-12">
          <AppShell connection="idle" checkedAt={null} />
          {controlledMode ? (
            <ControlledSessionGate
              onConnected={() => {
                setClient(
                  createProtectedQueryClient(() => setAccessDenied(true)),
                );
                setAccessDenied(false);
              }}
            />
          ) : (
            <p
              role="alert"
              className="py-20 text-center text-sm text-ink-secondary"
            >
              You don&apos;t have access to this Corridor.
            </p>
          )}
        </main>
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}
