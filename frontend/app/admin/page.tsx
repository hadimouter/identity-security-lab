import { forbidden } from "next/navigation";

import { requireFreshSession } from "@/lib/session";
import { getEffectiveRoles } from "@/lib/session-roles";

/**
 * Page d'administration.
 *
 * Contrôle d'accès volontairement minimal à ce stade : il sert à rendre
 * jouable l'étape 4 du script de démonstration, où un utilisateur sans
 * privilège tente d'accéder à cet écran et se fait refuser.
 *
 * Ce contrôle vit dans le rendu de page, donc côté serveur, mais il ne
 * protège que l'affichage. En phase 3, l'autorisation qui fait autorité
 * passera dans l'API Express, qui vérifie le jeton et recalcule les
 * droits effectifs à chaque requête.
 */
export default async function AdminPage() {
  // 401 si aucune identité, écran de session expirée si le
  // renouvellement du jeton a échoué.
  await requireFreshSession();

  // 403 : identité connue, rôle insuffisant.
  // Les droits effectifs, pas ceux du jeton : un accès admin accordé par
  // le workflow doit ouvrir cette page comme il ouvre les routes de l'API.
  const { roles } = await getEffectiveRoles();
  if (!roles.includes("admin")) {
    forbidden();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Administration
        </h1>
        <p className="text-muted">
          Écran réservé au rôle <span className="font-mono">admin</span>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        <p>
          Vous voyez cette page parce que votre jeton porte le rôle{" "}
          <span className="font-mono">admin</span>. Un compte{" "}
          <span className="font-mono">user</span> ou{" "}
          <span className="font-mono">manager</span> obtient un 403 sur cette
          même adresse.
        </p>
        <p className="mt-3">
          Le contenu d&apos;administration — liste des utilisateurs, accès
          accordés, audit logs — arrive en phases 4 et 5.
        </p>
      </div>
    </div>
  );
}
