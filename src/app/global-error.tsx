"use client";

import { useEffect } from "react";

// Only fires if the root layout itself throws — must render its own
// <html>/<body> since it replaces everything else, including layout.tsx.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          background: "#faf9f6",
          color: "#161f1d",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "0 1rem",
        }}
      >
        <p style={{ fontSize: "1.5rem", fontWeight: 500 }}>PreOx a rencontré une erreur critique</p>
        <p style={{ fontSize: "0.875rem", color: "#4b5754" }}>Rechargez la page ou réessayez dans un instant.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            borderRadius: "9999px",
            background: "#2f5d54",
            color: "#f7faf9",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
