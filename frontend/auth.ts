import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import type { JWT } from "@auth/core/jwt";

import { decodeJwtPayload, extractRoles } from "@/lib/jwt";

/**
 * Marge de renouvellement.
 *
 * On renouvelle 30 secondes avant l'expiration réelle, pas après. Sans
 * cette marge, un jeton encore valide au moment du rendu peut expirer
 * pendant l'appel à l'API.
 */
const REFRESH_MARGIN_SECONDS = 30;

/**
 * Échange le refresh token contre un nouvel access token.
 *
 * Appel serveur à serveur, avec le client secret. Le flux de connexion
 * reste Authorization Code + PKCE : PKCE ne protège que l'échange du
 * code initial, il n'intervient pas dans un renouvellement.
 *
 * Le refresh token ne quitte jamais le serveur. Il vit uniquement dans
 * le JWT interne d'Auth.js, chiffré dans un cookie httpOnly.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshTokenError" };
  }

  try {
    const response = await fetch(
      `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
          client_id: process.env.KEYCLOAK_CLIENT_ID ?? "",
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
        }),
      },
    );

    const payload = (await response.json()) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      // Cas légitime : la session SSO de Keycloak a expiré, le refresh
      // token est mort avec elle.
      throw new Error(
        payload.error_description ?? payload.error ?? "renouvellement refusé",
      );
    }

    // Le nouvel access token est redécodé : si un administrateur a
    // modifié les rôles de realm, le changement est pris en compte ici
    // plutôt qu'à la prochaine reconnexion.
    const claims = decodeJwtPayload(payload.access_token);

    return {
      ...token,
      accessToken: payload.access_token,
      // Keycloak ne renvoie pas toujours un nouveau refresh token, ni un
      // nouvel id_token. On conserve les précédents le cas échéant.
      refreshToken: payload.refresh_token ?? token.refreshToken,
      idToken: payload.id_token ?? token.idToken,
      expiresAt: Math.floor(Date.now() / 1000) + (payload.expires_in ?? 300),
      claims,
      roles: extractRoles(claims),
      error: undefined,
    };
  } catch (error) {
    console.error("[auth] échec du renouvellement du jeton :", error);
    return { ...token, error: "RefreshTokenError" };
  }
}

/**
 * Configuration OpenID Connect du lab.
 *
 * Le frontend est un client confidentiel : il échange le code
 * d'autorisation contre des jetons côté serveur, avec son client secret.
 * Les jetons restent côté serveur, seul un cookie de session chiffré et
 * httpOnly est déposé dans le navigateur.
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
     * Appelé à chaque lecture de session, donc à chaque rendu serveur.
     *
     * Trois cas :
     *   1. `account` présent   -> première connexion, on stocke les jetons
     *   2. jeton encore valide -> rien à faire
     *   3. jeton expiré        -> renouvellement
     */
    async jwt({ token, account }) {
      if (account) {
        const claims = decodeJwtPayload(account.access_token);

        token.accessToken = account.access_token;
        // Nécessaire au renouvellement. Ne sort jamais du serveur.
        token.refreshToken = account.refresh_token;
        // Conservé uniquement pour le logout SSO (id_token_hint).
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
        token.claims = claims;
        token.roles = extractRoles(claims);
        return token;
      }

      const stillValid =
        typeof token.expiresAt === "number" &&
        Date.now() / 1000 < token.expiresAt - REFRESH_MARGIN_SECONDS;

      if (stillValid) return token;

      // On retente même si un renouvellement précédent a échoué : une
      // indisponibilité passagère de Keycloak ne doit pas condamner
      // définitivement la session.
      return refreshAccessToken(token);
    },

    /**
     * Ce qui est exposé aux pages.
     *
     * L'access token y figure parce que c'est le seul objet qui porte sa
     * valeur *renouvelée* : Next.js interdit d'écrire le cookie de
     * session depuis un composant serveur, donc le cookie conserve le
     * jeton d'origine jusqu'à la prochaine écriture possible.
     *
     * Cet objet étant aussi servi au navigateur par /api/auth/session,
     * le champ en est retiré dans app/api/auth/[...nextauth]/route.ts.
     * Le refresh token, lui, ne quitte jamais le JWT interne.
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.expiresAt = token.expiresAt;
      session.roles = token.roles ?? [];
      session.claims = token.claims ?? null;
      session.error = token.error;
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
