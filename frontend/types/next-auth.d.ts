import type { DefaultSession } from "next-auth";
import type { JwtClaims } from "@/lib/jwt";

/**
 * Extension des types d'Auth.js pour les champs propres au lab.
 */
declare module "next-auth" {
  /**
   * Objet session.
   *
   * Servi au navigateur par /api/auth/session. Les champs sensibles en
   * sont retirés dans app/api/auth/[...nextauth]/route.ts.
   */
  interface Session extends DefaultSession {
    /**
     * Jeton envoyé à l'API. Retiré de la réponse de /api/auth/session,
     * il ne doit jamais atteindre le navigateur.
     */
    accessToken?: string;
    /** Expiration de l'access token, en secondes depuis l'époque Unix. */
    expiresAt?: number;
    /** Rôles portés par le jeton. Repli quand l'API est injoignable. */
    roles: string[];
    /** Claims décodés, affichés à titre pédagogique sur /profile. */
    claims: JwtClaims | null;
    /** Positionné quand le renouvellement du jeton a échoué. */
    error?: "RefreshTokenError";
  }
}

// L'interface JWT est déclarée dans @auth/core/jwt. Le module
// next-auth/jwt se contente de la réexporter, l'augmenter n'aurait
// aucun effet sur la déclaration d'origine.
declare module "@auth/core/jwt" {
  /**
   * JWT interne d'Auth.js, chiffré dans un cookie httpOnly.
   * C'est le seul endroit où vivent les jetons.
   */
  interface JWT {
    accessToken?: string;
    /** Ne sort jamais du serveur. Sert uniquement au renouvellement. */
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
    roles?: string[];
    claims?: JwtClaims | null;
    error?: "RefreshTokenError";
  }
}
