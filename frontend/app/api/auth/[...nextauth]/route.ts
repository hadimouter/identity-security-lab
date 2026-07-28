import type { NextRequest } from "next/server";

import { handlers } from "@/auth";

/**
 * Point d'entrée OIDC du frontend.
 *
 * Auth.js expose ici les routes de login, de callback et de logout.
 * C'est /api/auth/callback/keycloak qui est déclaré comme redirect URI
 * dans le client Keycloak.
 *
 * GET est enveloppé pour une raison précise, détaillée ci-dessous.
 */

/**
 * Champs de la session qui ne doivent jamais atteindre le navigateur.
 *
 * Auth.js sert l'objet session tel quel sur /api/auth/session. Or le
 * code serveur a besoin de l'access token sur cet objet : c'est le seul
 * endroit qui porte la valeur renouvelée, Next.js interdisant d'écrire
 * le cookie de session depuis un composant serveur.
 *
 * On garde donc le jeton côté serveur et on le retire de la seule
 * réponse qui sort vers le navigateur.
 */
const SERVER_ONLY_FIELDS = ["accessToken"] as const;

async function handleGet(request: NextRequest): Promise<Response> {
  const response = await handlers.GET(request);

  if (!new URL(request.url).pathname.endsWith("/session")) {
    return response;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  for (const field of SERVER_ONLY_FIELDS) {
    delete payload[field];
  }

  return Response.json(payload, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export { handleGet as GET };
export const { POST } = handlers;
