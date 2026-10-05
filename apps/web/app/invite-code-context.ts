"use client";

import { createContext } from "react";

export const InviteCodeContext = createContext<{
  code: string;
  clear: () => void;
} | null>(null);
