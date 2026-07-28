import { auth } from "@/auth";

import { fetchMe } from "./api";

/**
 * Droits effectifs de l'utilisateur courant, côté frontend.
 *
 * La session Auth.js ne porte que les rôles du jeton Keycloak. Elle
 * ignore les accès accordés par le workflow, qui vivent en base et ne
 * sont connus que de l'API. S'appuyer sur `session.roles` afficherait
 * donc un état périmé dès la première approbation.
 *
 * On interroge l'API, qui recalcule l'union à chaque requête. Si elle
 * est injoignable, on retombe sur les rôles du jeton : l'affichage sera
 * restreint, jamais permissif.
 *
 * Rappel : cette valeur ne sert qu'à afficher ou masquer. Le contrôle
 * qui fait autorité reste celui de l'API.
 */
export async function getEffectiveRoles(): Promise<string[]> {
  const session = await auth();
  if (!session) return [];

  const me = await fetchMe();
  return me.ok ? me.data.roles.all : session.roles;
}
