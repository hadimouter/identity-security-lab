import { Router } from "express";

import { env } from "../env.js";
import { authenticated } from "../middleware/authenticated.js";

export const meRouter: Router = Router();

/**
 * Identité telle que l'API la reconstitue à partir du jeton validé.
 *
 * Rien ici ne vient de l'appelant : tout est dérivé du jeton dont la
 * signature, l'issuer, l'audience et l'expiration ont été vérifiés.
 */
meRouter.get("/me", ...authenticated, (req, res) => {
  const auth = req.auth!;
  const local = req.localUser!;
  const roles = req.effectiveRoles!;

  res.json({
    identity: {
      sub: auth.sub,
      username: auth.username,
      email: auth.email,
    },
    /**
     * Ligne locale créée au premier appel. Elle ne duplique pas
     * l'annuaire : elle sert de point de rattachement aux demandes,
     * aux accès accordés et aux audit logs.
     */
    localUser: {
      id: local.id,
      createdAt: local.createdAt,
    },
    /**
     * Détail volontairement exposé : on voit d'où vient chaque rôle.
     * C'est le cœur du modèle, `all` est l'ensemble qui décide.
     */
    roles: {
      fromToken: roles.fromToken,
      fromGrants: roles.fromGrants,
      all: roles.all,
    },
    token: {
      issuer: env.keycloakIssuer,
      audience: env.keycloakAudience,
      expiresAt: auth.expiresAt,
      checks: [
        "signature RS256 via le JWKS de Keycloak",
        "issuer",
        "audience",
        "expiration",
      ],
    },
  });
});

