import type { ErrorRequestHandler, RequestHandler } from "express";

import { Prisma } from "../generated/prisma/client.js";
import { ConflictError } from "../lib/errors.js";

/** Code Prisma d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "P2002";

/** Route inconnue. */
export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Aucune route pour ${req.method} ${req.path}.`,
  });
};

/**
 * Gestionnaire d'erreurs global.
 *
 * Express 5 transmet automatiquement les rejets des handlers asynchrones
 * ici, ce qui évite d'envelopper chaque route dans un try/catch. Les
 * routes se contentent donc de lever une erreur métier.
 *
 * Le détail d'une erreur inattendue reste dans les logs du serveur : la
 * réponse ne doit pas divulguer d'informations internes à l'appelant.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Conflit attendu : la requête était légitime, l'état des données ne
  // s'y prête pas. Ce n'est pas une panne, il n'y a rien à journaliser.
  if (error instanceof ConflictError) {
    res.status(409).json({ error: "conflict", message: error.message });
    return;
  }

  // Deux transactions concurrentes ont franchi la même vérification et
  // c'est la base qui a tranché, via un index unique. Le perdant reçoit
  // un 409, pas un 500 : le refus est le comportement voulu.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  ) {
    res.status(409).json({
      error: "conflict",
      message: "Cette opération vient d'être effectuée par ailleurs.",
    });
    return;
  }

  console.error("[api] erreur non gérée :", error);

  res.status(500).json({
    error: "internal_error",
    message: "Une erreur interne est survenue.",
  });
};
