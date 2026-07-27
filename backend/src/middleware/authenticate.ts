import type { RequestHandler } from "express";
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

import { env } from "../env.js";

/**
 * Récupération des clés publiques de Keycloak.
 *
 * Le JWKS est mis en cache et rafraîchi automatiquement quand un jeton
 * présente un `kid` inconnu. Keycloak peut donc faire tourner ses clés
 * sans que l'API ait besoin d'être redémarrée.
 *
 * Conséquence importante : la vérification est locale. L'API n'appelle
 * pas Keycloak à chaque requête, ce qui la rend scalable. En contrepartie,
 * un jeton valide ne peut pas être révoqué avant son expiration — d'où le
 * fait que les droits sensibles soient relus en base à chaque requête.
 * Voir docs/rbac-model.md.
 */
const JWKS = createRemoteJWKSet(
  new URL(`${env.keycloakIssuer}/protocol/openid-connect/certs`),
);

/** Seuls ces rôles sont exploités. Keycloak en ajoute d'autres, techniques. */
const BUSINESS_ROLES = ["user", "manager", "admin"];

type RealmAccess = { roles?: string[] };

function extractRoles(payload: JWTPayload): string[] {
  const realmAccess = payload.realm_access as RealmAccess | undefined;
  const roles = realmAccess?.roles ?? [];
  return roles.filter((role) => BUSINESS_ROLES.includes(role));
}

/**
 * Traduit une erreur de `jose` en message expliquant quel contrôle a échoué.
 * Utile pour comprendre le comportement, et sans risque : ces informations
 * ne révèlent rien qu'un appelant légitime ne sache déjà.
 */
function describeFailure(error: unknown): string {
  if (error instanceof errors.JWTExpired) {
    return "Le jeton a expiré.";
  }
  if (error instanceof errors.JWTClaimValidationFailed) {
    return `Claim invalide : ${error.claim}. Le jeton n'est pas destiné à cette API, ou ne vient pas du bon realm.`;
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) {
    return "Signature invalide. Le jeton n'a pas été émis par Keycloak.";
  }
  if (error instanceof errors.JWKSNoMatchingKey) {
    return "Aucune clé du JWKS ne correspond au kid du jeton. Il vient probablement d'un autre realm ou d'un autre émetteur.";
  }
  if (error instanceof errors.JOSEAlgNotAllowed) {
    return "Algorithme de signature non autorisé. Seul RS256 est accepté.";
  }
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) {
    return "Le jeton est mal formé.";
  }
  return "Le jeton n'a pas pu être vérifié.";
}

/**
 * Vérifie le Bearer token présenté par l'appelant.
 *
 * Ordre des contrôles, tous obligatoires :
 *   1. signature RS256, avec la clé publique du JWKS
 *   2. issuer, il doit correspondre au realm attendu
 *   3. audience, le jeton doit être destiné à cette API
 *   4. expiration
 *
 * `algorithms: ["RS256"]` est essentiel : sans cette contrainte, un
 * attaquant pourrait présenter un jeton signé avec un algorithme faible,
 * voire `none`. On ne fait jamais confiance à l'en-tête `alg` du jeton.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "unauthorized",
      message: "En-tête Authorization: Bearer <token> attendu.",
    });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.keycloakIssuer,
      audience: env.keycloakAudience,
      algorithms: ["RS256"],
    });

    if (!payload.sub) {
      res.status(401).json({
        error: "unauthorized",
        message: "Le jeton ne porte pas de claim sub.",
      });
      return;
    }

    req.auth = {
      sub: payload.sub,
      username: payload.preferred_username as string | undefined,
      email: payload.email as string | undefined,
      roles: extractRoles(payload),
      expiresAt: payload.exp,
    };

    next();
  } catch (error) {
    res.status(401).json({
      error: "unauthorized",
      message: describeFailure(error),
    });
  }
};
