import type { Request, RequestHandler, Response } from "express";
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

import { env } from "../env.js";
import { AUDIT, writeAuditLogSafely } from "../lib/audit.js";

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
type Failure = {
  /** Code stable, exploitable pour filtrer le journal. */
  code: string;
  /** Message rendu à l'appelant. */
  message: string;
};

function describeFailure(error: unknown): Failure {
  if (error instanceof errors.JWTExpired) {
    return { code: "token_expired", message: "Le jeton a expiré." };
  }
  if (error instanceof errors.JWTClaimValidationFailed) {
    // `claim` vaut iss, aud, exp… : la distinction est utile au journal.
    return {
      code: `invalid_claim_${error.claim}`,
      message: `Claim invalide : ${error.claim}. Le jeton n'est pas destiné à cette API, ou ne vient pas du bon realm.`,
    };
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) {
    return {
      code: "invalid_signature",
      message: "Signature invalide. Le jeton n'a pas été émis par Keycloak.",
    };
  }
  if (error instanceof errors.JWKSNoMatchingKey) {
    return {
      code: "unknown_signing_key",
      message:
        "Aucune clé du JWKS ne correspond au kid du jeton. Il vient probablement d'un autre realm ou d'un autre émetteur.",
    };
  }
  if (error instanceof errors.JOSEAlgNotAllowed) {
    return {
      code: "algorithm_not_allowed",
      message:
        "Algorithme de signature non autorisé. Seul RS256 est accepté.",
    };
  }
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) {
    return { code: "malformed_token", message: "Le jeton est mal formé." };
  }
  return {
    code: "verification_failed",
    message: "Le jeton n'a pas pu être vérifié.",
  };
}

/** Longueur maximale conservée pour l'agent utilisateur. */
const USER_AGENT_MAX = 256;

/**
 * Journalise une tentative d'accès non authentifiée, puis répond 401.
 *
 * `actorId` reste nul : aucune identité n'a été établie. Prétendre le
 * contraire à partir d'un jeton non vérifié n'aurait aucun sens.
 *
 * Ce qui est enregistré : la méthode, le chemin, la cause de l'échec,
 * l'adresse et l'agent utilisateur. Ce qui ne l'est jamais : le jeton,
 * ni l'en-tête Authorization, même tronqué. Un journal d'audit se
 * consulte largement — y déposer un identifiant de connexion
 * reviendrait à en faire une cible.
 *
 * L'écriture est volontairement tolérante aux pannes : un refus doit
 * rester un refus même si la base d'audit est indisponible.
 */
async function denyUnauthenticated(
  req: Request,
  res: Response,
  failure: Failure,
): Promise<void> {
  // `req.path` est relatif au routeur monté : il vaudrait « /me » pour
  // « /api/me ». On reconstruit le chemin complet, sans la chaîne de
  // requête, qui pourrait transporter des valeurs à ne pas journaliser.
  const path = `${req.baseUrl}${req.path}`;

  await writeAuditLogSafely({
    actorId: null,
    action: AUDIT.unauthorized,
    targetType: "route",
    targetId: `${req.method} ${path}`,
    result: "denied",
    metadata: {
      method: req.method,
      path,
      code: failure.code,
      reason: failure.message,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, USER_AGENT_MAX) ?? null,
    },
  });

  res.status(401).json({ error: "unauthorized", message: failure.message });
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
    await denyUnauthenticated(req, res, {
      code: "missing_bearer_header",
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
      await denyUnauthenticated(req, res, {
        code: "missing_subject",
        message: "Le jeton ne porte pas de claim sub.",
      });
      return;
    }

    req.auth = {
      sub: payload.sub,
      username: payload.preferred_username as string | undefined,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      roles: extractRoles(payload),
      expiresAt: payload.exp,
    };

    next();
  } catch (error) {
    await denyUnauthenticated(req, res, describeFailure(error));
  }
};
