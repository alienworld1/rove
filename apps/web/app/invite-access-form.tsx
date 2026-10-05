"use client";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { redeemInvite } from "./hosted-api";
import { inviteDestination } from "./lab/navigation-url";
import { InviteCodeContext } from "./invite-code-context";
import { clearPrivateWorkspace } from "./workspace-access-state";
export function InviteAccessForm() {
  const [code, setCode] = useState("");
  const client = useQueryClient();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const inviteContext = useContext(InviteCodeContext);
  const invite = inviteContext?.code;
  useEffect(() => {
    if (invite) {
      queueMicrotask(() => {
        setCode(invite);
        input.current?.focus();
      });
    }
  }, [invite]);
  const redemption = useMutation({
    mutationFn: redeemInvite,
    onSuccess: (session) => {
      setCode("");
      inviteContext?.clear();
      clearPrivateWorkspace(client);
      client.setQueryData(["hosted-session"], session);
      router.replace(inviteDestination(window.location.href));
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    redemption.mutate(code);
  }
  return (
    <section
      id="invite-access"
      className="scroll-mt-6 border-t border-line-strong py-12 sm:py-16"
      aria-labelledby="invite-title"
    >
      <h2
        id="invite-title"
        className="text-3xl font-semibold tracking-tight text-ink"
      >
        Have an invite?
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-secondary">
        Open your private workspace to build charging scenarios and run them on
        Tempo testnet. Rove supplies the test funds; you don’t need to connect a
        wallet.
      </p>
      <form
        onSubmit={submit}
        className="mt-5 flex max-w-xl flex-wrap items-end gap-3"
      >
        <label
          className="min-w-0 basis-60 flex-1 text-sm font-medium text-ink"
          htmlFor="invite-code"
        >
          Invite code
          <input
            ref={input}
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
