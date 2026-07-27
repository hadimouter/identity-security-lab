"use client";

import { useEffect, useState } from "react";

/**
 * Compte à rebours avant expiration de l'access token.
 *
 * Rend tangible le fait qu'un jeton est de courte durée : 5 minutes par
 * défaut dans Keycloak. Passé ce délai, le jeton n'est plus accepté par
 * l'API, alors que la session applicative, elle, reste ouverte.
 */
export function TokenCountdown({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, expiresAt - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (remaining === 0) {
    return (
      <span className="font-mono text-amber-700 dark:text-amber-400">
        expiré
      </span>
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <span className="font-mono tabular-nums">
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}
