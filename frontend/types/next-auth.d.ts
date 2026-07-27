import type { DefaultSession } from "next-auth";
import type { JwtClaims } from "@/lib/jwt";

/**
 * Extension des types d'Auth.js pour les champs propres au lab.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    /** Jeton envoyé à l'API Express. Ne quitte jamais le serveur. */
    accessToken?: string;
    /** Rôles métier extraits du token : user, manager, admin. */
    roles: string[];
    /** Claims décodés, affichés à titre pédagogique sur /profile. */
    claims: JwtClaims | null;
  }
}

// L'interface JWT est déclarée dans @auth/core/jwt. Le module
// next-auth/jwt se contente de la réexporter, l'augmenter n'aurait
// aucun effet sur la déclaration d'origine.
declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    idToken?: string;
    expiresAt?: number;
    roles?: string[];
    claims?: JwtClaims | null;
  }
}
