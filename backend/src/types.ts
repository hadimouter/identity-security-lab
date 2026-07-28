/**
 * Identité issue d'un jeton dont la validité a été vérifiée.
 *
 * Ces valeurs viennent exclusivement du jeton validé, jamais du corps
 * de la requête ni d'un en-tête fourni par l'appelant.
 */
export type AuthenticatedUser = {
  /** Claim `sub`. Identifiant stable de l'utilisateur dans Keycloak. */
  sub: string;
  username?: string;
  email?: string;
  /** Claim `name`, utilisé pour le provisionnement local. */
  name?: string;
  /** Rôles métier extraits de realm_access.roles. */
  roles: string[];
  /** Expiration du jeton, en secondes depuis l'époque Unix. */
  expiresAt?: number;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      /** Droits effectifs, posés par la chaîne `authenticated`. */
      effectiveRoles?: import("./lib/access.js").EffectiveRoles;
      /** Ligne locale rattachée à l'identité, posée par le middleware provision. */
      localUser?: import("./generated/prisma/client.js").User;
    }
  }
}

export {};
