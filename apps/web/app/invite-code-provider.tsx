"use client";

import { useEffect, useState, type ReactNode } from "react";
import { InviteCodeContext } from "./invite-code-context";

export function InviteCodeProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState("");
  useEffect(() => {
    const consume = () => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.hash.slice(1));
      const invite = params.get("invite");
      if (!invite) return;
      params.delete("invite");
      url.hash = params.toString();
      window.history.replaceState(null, "", url);
      queueMicrotask(() => setCode(invite));
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
  }, []);
  return (
    <InviteCodeContext.Provider value={{ code, clear: () => setCode("") }}>
      {children}
    </InviteCodeContext.Provider>
  );
}
