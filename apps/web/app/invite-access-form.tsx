"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { redeemInvite } from "./hosted-api";
export function InviteAccessForm() {
  const [code, setCode] = useState("");
  const client = useQueryClient();
  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = new URLSearchParams(url.hash.slice(1)).get("invite");
    if (invite) {
      url.hash = "";
      window.history.replaceState(null, "", url);
      queueMicrotask(() => setCode(invite));
    }
  }, []);
  const redemption = useMutation({
    mutationFn: redeemInvite,
    onSuccess: (session) => {
      setCode("");
      client.removeQueries({ queryKey: ["run"] });
      client.removeQueries({ queryKey: ["corridor"] });
      client.setQueryData(["hosted-session"], session);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    redemption.mutate(code);
  }
  return (
    <section
      id="invite-access"
      className="border-t border-line-strong py-8"
      aria-labelledby="invite-title"
    >
      <h2 id="invite-title" className="text-xl font-semibold text-ink">
        Invite access
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-secondary">
        An invite opens a private workspace for running Rove on Tempo testnet.
        Rove supplies the test assets; no wallet connection is needed.
      </p>
      <form
        onSubmit={submit}
        className="mt-5 flex max-w-xl flex-wrap items-end gap-3"
      >
        <label
          className="min-w-60 flex-1 text-sm font-medium text-ink"
          htmlFor="invite-code"
        >
          Invite code
          <input
            id="invite-code"
            type="password"
            autoComplete="off"
            required
            maxLength={128}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="mt-2 block min-h-11 w-full rounded-sm border border-line-strong bg-pure px-3 py-2 focus-visible:outline-2 focus-visible:outline-info"
          />
        </label>
        <button
          disabled={redemption.isPending}
          className="min-h-11 rounded-sm bg-ink px-5 py-2 text-sm font-semibold text-pure disabled:opacity-50"
        >
          {redemption.isPending ? "Opening your workspace…" : "Open workspace"}
        </button>
      </form>
      {redemption.error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {redemption.error.message}
        </p>
      ) : null}
    </section>
  );
}
