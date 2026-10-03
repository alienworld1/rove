import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { CorridorApiError } from "./api";

export function createProtectedQueryClient(onAccessDenied: () => void) {
  let revoked = false;
  const rejectAccess = (error: Error) => {
    if (!(error instanceof CorridorApiError) || error.status !== 403) return;
    revoked = true;
    onAccessDenied();
    client.clear();
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: rejectAccess }),
    mutationCache: new MutationCache({
      onError: rejectAccess,
      onSettled: () => {
        if (revoked) client.clear();
      },
    }),
    defaultOptions: {
      queries: {
        retry: (attempt, error) =>
          !(error instanceof CorridorApiError && error.status === 403) &&
          attempt < 1,
        staleTime: 1_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
  client.getQueryCache().subscribe((event) => {
    if (revoked && event.type !== "removed")
      client.removeQueries({ queryKey: event.query.queryKey, exact: true });
  });
  return client;
}
