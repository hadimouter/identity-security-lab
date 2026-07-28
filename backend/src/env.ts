import { resolve } from "node:path";

import { config } from "dotenv";

/**
 * Le lab n'a qu'un seul fichier .env, à la racine du dépôt.
 * L'API le lit depuis son propre dossier.
 */
config({ path: resolve(process.cwd(), "../.env"), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. ` +
        `Copier .env.example vers .env à la racine du dépôt.`,
    );
  }
  return value;
}

export const env = {
  port: Number(process.env.API_PORT ?? 4000),

  /** Base applicative. Distincte de celle de Keycloak. */
  databaseUrl: required("DATABASE_URL"),

  /** Issuer OIDC attendu. Tout jeton émis ailleurs est rejeté. */
  keycloakIssuer: required("KEYCLOAK_ISSUER"),

  /** Audience attendue. Empêche le rejeu d'un jeton émis pour une autre API. */
  keycloakAudience: required("KEYCLOAK_AUDIENCE"),
};
