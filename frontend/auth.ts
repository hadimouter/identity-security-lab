import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

import { decodeJwtPayload, extractRoles } from "@/lib/jwt";

/**
 * Configuration OpenID Connect du lab.
 *
 * Le frontend est un client confidentiel : il échange le code
 * d'autorisation contre des jetons côté serveur, avec son client secret.
 * Les jetons ne sont jamais exposés au navigateur, seule une session
 * chiffrée dans un cookie httpOnly l'est.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      issuer: process.env.KEYCLOAK_ISSUER,
    }),
  ],

  pages: {
    // Remplace la page d'erreur par défaut d'Auth.js, en anglais et
    // hors charte, qui affiche « Check the server logs ».
    error: "/auth/error",
  },

  callbacks: {
    /**
     * Appelé à chaque lecture de session. `account` n'est présent qu'au
     * moment du login, c'est le seul moment où l'on reçoit les jetons.
     */
    async jwt({ token, account }) {
      if (account) {
        const claims = decodeJwtPayload(account.access_token);

        token.accessToken = account.access_token;
        // Conservé uniquement pour le logout SSO (id_token_hint).
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
        token.claims = claims;
        token.roles = extractRoles(claims);
      }
      return token;
    },

    /**
     * Ce qui est exposé aux pages. L'access token reste côté serveur :
     * il sert à appeler l'API Express, jamais à être renvoyé au client.
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.expiresAt = token.expiresAt;
      session.roles = token.roles ?? [];
      session.claims = token.claims ?? null;
      return session;
    },
  },

  events: {
    /**
     * Déconnexion complète.
     *
     * Détruire la session de l'application ne déconnecte pas de Keycloak :
     * l'utilisateur qui reclique sur « Se connecter » serait reconnecté
     * sans saisir son mot de passe. On termine donc aussi la session de
     * l'Identity Provider via son end_session_endpoint.
     */
    async signOut(message) {
      const idToken =
        "token" in message
          ? (message.token?.idToken as string | undefined)
          : undefined;

      if (!idToken || !process.env.KEYCLOAK_ISSUER) return;

      const url = new URL(
        `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`,
      );
      url.searchParams.set("id_token_hint", idToken);

      try {
        await fetch(url);
      } catch {
        // Le logout local doit aboutir même si Keycloak est injoignable.
      }
    },
  },
});
