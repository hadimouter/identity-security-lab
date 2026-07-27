import type { RequestHandler } from "express";

/**
 * Contrôle RBAC serveur.
 *
 * À placer après `authenticate`, qui a déjà vérifié le jeton et rempli
 * `req.auth`. Les rôles proviennent uniquement du jeton validé : rien
 * de ce que l'appelant envoie dans le corps ou dans un en-tête n'est
 * pris en compte.
 *
 * Distinction volontaire entre les deux refus :
 *   401 — aucune identité établie
 *   403 — identité connue, rôle insuffisant
 *
 * En phase 4, les rôles effectifs seront la réunion des rôles du jeton
 * et des grants actifs en base, recalculés à chaque requête.
 */
export function requireRole(...allowed: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({
        error: "unauthorized",
        message: "Authentification requise.",
      });
      return;
    }

    const granted = allowed.some((role) => req.auth!.roles.includes(role));

    if (!granted) {
      res.status(403).json({
        error: "forbidden",
        message: "Votre rôle ne permet pas cette action.",
        requiredRoles: allowed,
        yourRoles: req.auth.roles,
      });
      return;
    }

    next();
  };
}
