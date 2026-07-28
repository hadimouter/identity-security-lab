import type { RequestHandler } from "express";

import { computeEffectiveRoles } from "../lib/access.js";

import { authenticate } from "./authenticate.js";
import { provision } from "./provision.js";

/**
 * Pose les droits effectifs sur la requête.
 *
 * Doit venir après `provision` : le calcul a besoin de la ligne locale
 * pour lire les accès accordés.
 */
const withEffectiveRoles: RequestHandler = async (req, res, next) => {
  if (!req.auth || !req.localUser) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authentification requise.",
    });
    return;
  }

  req.effectiveRoles = await computeEffectiveRoles(
    req.localUser.id,
    req.auth.roles,
  );
  next();
};

/**
 * Chaîne appliquée à toute route authentifiée.
 *
 *   1. vérifier le jeton
 *   2. rattacher, ou créer, l'utilisateur local
 *   3. recalculer les droits effectifs
 *
 * Les trois vont ensemble : oublier la troisième reviendrait à décider
 * des droits à partir du seul jeton, ce que le modèle refuse.
 */
export const authenticated: RequestHandler[] = [
  authenticate,
  provision,
  withEffectiveRoles,
];
