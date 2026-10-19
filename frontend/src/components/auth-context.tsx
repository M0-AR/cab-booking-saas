"use client";

import { createContext, useContext } from "react";

import type { MeOut } from "@/lib/types";

interface MeContextValue {
  me: MeOut;
}

export const MeContext = createContext<MeContextValue | null>(null);

export function useMe(): MeContextValue {
  const value = useContext(MeContext);
  if (!value) throw new Error("useMe must be used inside the dashboard layout");
  return value;
}
