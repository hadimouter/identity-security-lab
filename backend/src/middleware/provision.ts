import type { RequestHandler } from "express";

import { provisionUser } from "../lib/users.js";

/**
 * Attache l'utilisateur local à la requête, en le créant au besoin.
 *
 * À placer après `authenticate` : le provisionnement s'appuie sur les
 * claims d'un jeton déjà vérifié, jamais sur des données fournies par
 * l'appelant.
 */
export const provision: RequestHandler = async (req, res, next) => {
  if (!req.auth) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authentification requise.",
    });
    return;
  }

  req.localUser = await provisionUser(req.auth);
  next();
};
