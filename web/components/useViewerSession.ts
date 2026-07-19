"use client";

import { useEffect, useState } from "react";

// Client-side session probe for the contribution entry points (#174). The
// pages these sit on are cacheable for every reader; only the contribution
// island varies by viewer, so it asks Auth.js for the session after mount
// rather than making the whole page dynamic.

export type ViewerSession =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; name: string | null };

export function useViewerSession(): ViewerSession {
  const [session, setSession] = useState<ViewerSession>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: { name?: string | null } } | null) => {
        setSession(
          s?.user
            ? { kind: "signed-in", name: s.user.name ?? null }
            : { kind: "signed-out" },
        );
      })
      .catch(() => setSession({ kind: "signed-out" }));
  }, []);

  return session;
}
