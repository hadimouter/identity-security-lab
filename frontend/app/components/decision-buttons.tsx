"use client";

import { useFormStatus } from "react-dom";

import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui";

/**
 * Boutons d'approbation et de refus.
 *
 * Le même formulaire porte les deux décisions : c'est l'attribut `value`
 * du bouton cliqué qui est envoyé sous le nom `decision`. Cela évite
 * deux formulaires concurrents autour du même champ de commentaire.
 */
export function DecisionButtons() {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="submit"
        name="decision"
        value="reject"
        disabled={pending}
        aria-busy={pending}
        className={`${SECONDARY_BUTTON} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Traitement…" : "Refuser"}
      </button>
      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
        aria-busy={pending}
        className={`${PRIMARY_BUTTON} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Traitement…" : "Approuver"}
      </button>
    </>
  );
}
