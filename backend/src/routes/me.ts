import { Router } from "express";

import { env } from "../env.js";
import { authenticate } from "../middleware/authenticate.js";
import { provision } from "../middleware/provision.js";
import { requireRole } from "../middleware/require-role.js";

export const router: Router = Router();

/**
 * Identité telle que l'API la reconstitue à partir du jeton validé.
 *
 * Rien ici ne vient de l'appelant : tout est dérivé du jeton dont la
 * signature, l'issuer, l'audience et l'expiration ont été vérifiés.
 */
router.get("/me", authenticate, provision, (req, res) => {
  const auth = req.auth!;
  const local = req.localUser!;

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
    roles: auth.roles,
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

/**
 * Route réservée au rôle admin.
 *
 * Sert à démontrer que le refus est prononcé par l'API, indépendamment
 * de ce que le frontend affiche ou masque. Un appel direct au curl avec
 * le jeton d'un utilisateur sans privilège reçoit un 403.
 */
router.get("/admin/summary", authenticate, requireRole("admin"), (req, res) => {
  res.json({
    message: "Contenu réservé aux administrateurs.",
    requestedBy: req.auth!.username,
  });
});
