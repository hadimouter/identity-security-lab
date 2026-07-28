import { auth } from "@/auth";

import { fetchMe } from "./api";

export type EffectiveRoles = {
  roles: string[];
  /**
   * Vrai quand les rôles affichés proviennent du repli et non de l'API.
   * L'interface doit alors le signaler : un état restreint sans
   * explication est exactement ce qu'on cherche à supprimer.
   */
  degraded: boolean;
};

/**
 * Droits effectifs de l'utilisateur courant, côté frontend.
 *
 * La session Auth.js ne porte que les rôles du jeton Keycloak. Elle
 * ignore les accès accordés par le workflow, qui vivent en base et ne
 * sont connus que de l'API. S'appuyer sur `session.roles` afficherait
 * donc un état périmé dès la première approbation.
 *
 * On interroge l'API, qui recalcule l'union à chaque requête. Si elle
 * est injoignable, on retombe sur les rôles du jeton — restrictif,
 * jamais permissif — mais l'appelant en est informé par `degraded`.
 *
 * Rappel : cette valeur ne sert qu'à afficher ou masquer. Le contrôle
 * qui fait autorité reste celui de l'API.
 */
export async function getEffectiveRoles(): Promise<EffectiveRoles> {
  const session = await auth();
  if (!session) return { roles: [], degraded: false };

  // Renouvellement échoué : inutile d'appeler l'API, le jeton est mort.
  // requireFreshSession redirige déjà vers l'écran de session expirée.
  if (session.error) {
    return { roles: session.roles, degraded: true };
  }

  const me = await fetchMe();
  if (!me.ok) {
    return { roles: session.roles, degraded: true };
  }

  return { roles: me.data.roles.all, degraded: false };
}
