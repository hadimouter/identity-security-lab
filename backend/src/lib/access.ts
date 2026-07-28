import { prisma } from "./prisma.js";

export type EffectiveRoles = {
  /** Rôles de realm portés par le jeton Keycloak. */
  fromToken: string[];
  /** Rôles issus des accès accordés et encore actifs. */
  fromGrants: string[];
  /** Union des deux. C'est cet ensemble qui décide. */
  all: string[];
};

/**
 * Calcule les droits effectifs d'un utilisateur.
 *
 *   droits effectifs = rôles du jeton  ∪  rôles des grants ACTIVE
 *
 * Recalculé à chaque requête, jamais mis en cache dans la session ni
 * dans le jeton. C'est ce qui rend une révocation immédiatement
 * effective : couper un grant coupe l'accès dès l'appel suivant, sans
 * attendre l'expiration du jeton.
 *
 * Keycloak porte le rôle d'identité, celui du Joiner. La table des
 * grants porte les entitlements applicatifs, demandés et approuvés.
 * Voir docs/rbac-model.md.
 */
export async function computeEffectiveRoles(
  localUserId: string,
  tokenRoles: string[],
): Promise<EffectiveRoles> {
  const grants = await prisma.accessGrant.findMany({
    where: { userId: localUserId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  const fromGrants = grants.map((grant) => grant.role.name);

  return {
    fromToken: tokenRoles,
    fromGrants,
    all: [...new Set([...tokenRoles, ...fromGrants])],
  };
}
