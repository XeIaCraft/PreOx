"use client";

import { createContext, useContext } from "react";

// Who is using the module (dossiers are encrypted per user on the device)
// and whether the carnet is available to plan cases in.
const PreopSession = createContext<{ userId: string; carnetEnabled: boolean } | null>(null);

export function PreopSessionProvider({ userId, carnetEnabled, children }: { userId: string; carnetEnabled: boolean; children: React.ReactNode }) {
  return <PreopSession.Provider value={{ userId, carnetEnabled }}>{children}</PreopSession.Provider>;
}

export function usePreopSession() {
  const ctx = useContext(PreopSession);
  if (!ctx) throw new Error("usePreopSession must be used within PreopSessionProvider");
  return ctx;
}
