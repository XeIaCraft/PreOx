"use client";

import { createContext, useContext } from "react";

// Who is using the module (dossiers are encrypted per user on the device)
// whether the carnet is available to plan cases in, and the view: `isAdmin`
// is the admin view (all tabs), `realIsAdmin` whether the user may switch.
type Session = { userId: string; carnetEnabled: boolean; isAdmin: boolean; realIsAdmin: boolean };
const PreopSession = createContext<Session | null>(null);

export function PreopSessionProvider({ children, ...session }: Session & { children: React.ReactNode }) {
  return <PreopSession.Provider value={session}>{children}</PreopSession.Provider>;
}

export function usePreopSession() {
  const ctx = useContext(PreopSession);
  if (!ctx) throw new Error("usePreopSession must be used within PreopSessionProvider");
  return ctx;
}
