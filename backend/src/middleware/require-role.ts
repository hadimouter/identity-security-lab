import type { RequestHandler } from "express";

import { AUDIT, writeAuditLogSafely } from "../lib/audit.js";

/**
 * Contrôle RBAC serveur.
 *
 * À placer après la chaîne `authenticated`, qui a vérifié le jeton,
 * rattaché l'utilisateur local et calculé ses droits effectifs.
 *
 * La décision se prend sur `effectiveRoles.all`, c'est-à-dire les rôles
 * du jeton réunis aux accès accordés et encore actifs. Un accès révoqué
 * disparaît donc de cet ensemble dès la requête suivante.
 *
 * Distinction volontaire entre les deux refus :
 *   401 — aucune identité établie
 *   403 — identité connue, rôle insuffisant
 *
 * Tout refus produit une trace d'audit : un journal qui ne contiendrait
 * que des succès ne servirait à rien en cas d'incident.
 */
export function requireRole(...allowed: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.auth || !req.effectiveRoles) {
      res.status(401).json({
        error: "unauthorized",
        message: "Authentification requise.",
      });
      return;
    }

    const held = req.effectiveRoles.all;
    const granted = allowed.some((role) => held.includes(role));

    if (!granted) {
      void writeAuditLogSafely({
        actorId: req.localUser?.id ?? null,
        action: AUDIT.unauthorized,
        targetType: "route",
        targetId: `${req.method} ${req.originalUrl}`,
        result: "denied",
        metadata: { requiredRoles: allowed, heldRoles: held },
      });

      res.status(403).json({
        error: "forbidden",
        message: "Votre rôle ne permet pas cette action.",
        requiredRoles: allowed,
        yourRoles: held,
      });
      return;
    }

    next();
  };
}
