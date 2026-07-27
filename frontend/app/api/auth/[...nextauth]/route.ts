import { handlers } from "@/auth";

/**
 * Point d'entrée OIDC du frontend.
 *
 * Auth.js expose ici les routes de login, de callback et de logout.
 * C'est /api/auth/callback/keycloak qui est déclaré comme redirect URI
 * dans le client Keycloak.
 */
export const { GET, POST } = handlers;
