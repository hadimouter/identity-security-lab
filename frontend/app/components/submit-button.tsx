"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
};

/**
 * Bouton de formulaire qui reflète l'état de l'action en cours.
 *
 * La redirection vers Keycloak et la déconnexion passent par le réseau :
 * sans retour visuel, l'utilisateur clique une deuxième fois.
 */
export function SubmitButton({ children, pendingLabel, className = "" }: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
