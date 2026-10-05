"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { hostedJson, readHostedSession } from "./hosted-api";
import { clearPrivateWorkspace } from "./workspace-access-state";

export function EndAccessButton() {
  const client = useQueryClient();
  const router = useRouter();
  const session = useQuery({
    queryKey: ["hosted-session"],
    queryFn: readHostedSession,
  });
  const end = useMutation({
    mutationFn: () => hostedJson("/api/access/end", {}),
    onSuccess: () => {
      clearPrivateWorkspace(client);
      client.clear();
      router.push("/");
    },
  });
  if (!session.data?.authenticated) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => end.mutate()}
        disabled={end.isPending}
        className="min-h-11 text-xs text-ink-secondary underline focus-visible:outline-2 focus-visible:outline-info disabled:opacity-50"
      >
        {end.isPending ? "Ending access…" : "End access"}
      </button>
      {end.error ? (
        <p role="alert" className="max-w-xs text-xs text-critical">
          We couldn’t end access. Please try again.
        </p>
      ) : null}
    </div>
  );
}
