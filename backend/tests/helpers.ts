import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app.js";
// L'import d'env.ts charge le .env de la racine et échoue tôt, avec un
// message clair, si une variable manque.
import { env } from "../src/env.js";
import { prisma } from "../src/lib/prisma.js";

/** Comptes de démonstration créés par l'import du realm Keycloak. */
export const DEMO = {
  user: { username: "user", password: process.env.DEMO_USER_PASSWORD },
  manager: { username: "manager", password: process.env.DEMO_MANAGER_PASSWORD },
  admin: { username: "admin", password: process.env.DEMO_ADMIN_PASSWORD },
} as const;

export type DemoAccount = keyof typeof DEMO;

/**
 * Vérifie que l'infrastructure du lab est joignable.
 *
 * Ces tests sont des tests d'intégration : ils valident la chaîne
 * complète, jusqu'à la validation cryptographique d'un vrai jeton émis
 * par Keycloak. Un échec ici n'est pas un test rouge, c'est un
 * environnement absent — d'où le message explicite.
 */
export async function requireStack(): Promise<void> {
  try {
    const response = await fetch(
      `${env.keycloakIssuer}/.well-known/openid-configuration`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (cause) {
    throw new Error(
      `Keycloak est injoignable sur ${env.keycloakIssuer}. ` +
        `Lancer l'infrastructure : docker compose up -d`,
      { cause },
    );
  }

  try {
    await prisma.role.count();
  } catch (cause) {
    throw new Error(
      "PostgreSQL est injoignable. Lancer l'infrastructure : " +
        "docker compose up -d, puis npx prisma migrate deploy",
      { cause },
    );
  }
}

/**
 * Démarre l'API sur un port éphémère.
 *
 * Le port 0 laisse le système en choisir un libre : les tests ne
 * dépendent pas d'un serveur lancé à la main et n'entrent pas en
 * conflit avec celui du développement sur le port 4000.
 */
export async function startApi() {
  const server = createApp().listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

const tokenCache = new Map<DemoAccount, string>();

/**
 * Jeton d'accès réel, obtenu de Keycloak.
 *
 * Les jetons sont mis en cache pour la durée de la série. Ce n'est pas
 * qu'une optimisation : réutiliser le même jeton après un changement de
 * droits est exactement ce que les tests doivent vérifier. Les droits
 * effectifs sont recalculés en base à chaque requête, donc un accès
 * accordé ou révoqué prend effet sans qu'aucun jeton ne change.
 */
export async function tokenFor(account: DemoAccount): Promise<string> {
  const cached = tokenCache.get(account);
  if (cached) return cached;

  const { username, password } = DEMO[account];
  if (!password) {
    throw new Error(
      `Mot de passe manquant pour le compte ${username}. ` +
        `Vérifier DEMO_${account.toUpperCase()}_PASSWORD dans le .env.`,
    );
  }

  const response = await fetch(
    `${env.keycloakIssuer}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: process.env.KEYCLOAK_CLIENT_ID ?? "identity-lab-web",
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
        username,
        password,
      }),
    },
  );

  const payload = (await response.json()) as { access_token?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Keycloak a refusé le compte ${username} (HTTP ${response.status}).`,
    );
  }

  tokenCache.set(account, payload.access_token);
  return payload.access_token;
}

type ApiResponse<T = Record<string, unknown>> = {
  status: number;
  body: T;
};

/** Appel HTTP de l'API, avec le jeton porteur si l'appelant en a un. */
export async function callApi<T = Record<string, unknown>>(
  baseUrl: string,
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const { token, method = "GET", body } = options;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Les réponses de l'API sont toujours en JSON, sauf un corps vide.
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as T,
  };
}

/**
 * Supprime tout ce que la série a écrit depuis `since`.
 *
 * Les tests tournent sur la base de développement et doivent la rendre
 * telle qu'ils l'ont trouvée. L'ordre suit les clés étrangères : un
 * accès référence sa demande d'origine.
 */
export async function cleanupSince(since: Date): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { createdAt: { gte: since } } });
  await prisma.accessGrant.deleteMany({ where: { approvedAt: { gte: since } } });
  await prisma.accessRequest.deleteMany({ where: { createdAt: { gte: since } } });
}

export { prisma };

/**
 * Remet à zéro ce qui peut bloquer une série de tests.
 *
 * Une demande déjà en attente, ou un accès déjà actif, fait légitimement
 * échouer une création en 409. Les tests ont besoin d'un point de départ
 * connu, donc on retire ces deux états pour le compte visé.
 *
 * Volontairement limité : l'historique — demandes traitées, accès
 * révoqués, journal d'audit — n'est pas touché.
 */
export async function resetFixturesFor(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  await prisma.accessGrant.deleteMany({
    where: { userId: user.id, status: "ACTIVE" },
  });
  await prisma.accessRequest.deleteMany({
    where: { requesterId: user.id, status: "PENDING" },
  });
}

/** Identifiant local d'un compte, tel que l'API le provisionne. */
export async function localUserId(
  baseUrl: string,
  token: string,
): Promise<string> {
  const me = await callApi<{ localUser: { id: string } }>(baseUrl, "/api/me", {
    token,
  });
  return me.body.localUser.id;
}

/** Identifiant d'un rôle du catalogue. */
export async function roleId(name: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { name } });
  if (!role) throw new Error(`Rôle absent du catalogue : ${name}. Lancer npx prisma db seed.`);
  return role.id;
}
