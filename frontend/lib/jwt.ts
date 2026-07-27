/**
 * Décodage de la charge utile d'un JWT, sans vérification de signature.
 *
 * Volontairement non vérifiant. Le frontend ne prend aucune décision
 * d'autorisation : il affiche des informations et masque des liens.
 * La vérification de la signature, de l'issuer, de l'audience et de
 * l'expiration est faite par l'API Express, qui est le seul endroit où
 * l'autorisation est réellement appliquée.
 *
 * Le jeton décodé ici vient directement de Keycloak, par un échange
 * serveur à serveur. Il n'a pas transité par le navigateur.
 */
export type JwtClaims = Record<string, unknown> & {
  realm_access?: { roles?: string[] };
};

export function decodeJwtPayload(token?: string | null): JwtClaims | null {
  if (!token) return null;

  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    // base64url -> base64. Buffer tolère l'absence de padding.
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Extrait les rôles de realm Keycloak d'un access token.
 *
 * Keycloak place aussi des rôles techniques dans realm_access.roles
 * (default-roles-*, offline_access, uma_authorization). On ne garde que
 * les rôles métier du lab.
 */
const BUSINESS_ROLES = ["user", "manager", "admin"] as const;

export function extractRoles(claims: JwtClaims | null): string[] {
  const roles = claims?.realm_access?.roles ?? [];
  return roles.filter((role) =>
    (BUSINESS_ROLES as readonly string[]).includes(role),
  );
}
