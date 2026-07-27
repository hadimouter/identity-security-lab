import type { ErrorRequestHandler, RequestHandler } from "express";

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
 * ici, ce qui évite d'envelopper chaque route dans un try/catch.
 *
 * Le détail de l'erreur reste dans les logs du serveur : la réponse ne
 * doit pas divulguer d'informations internes à l'appelant.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("[api] erreur non gérée :", error);

  res.status(500).json({
    error: "internal_error",
    message: "Une erreur interne est survenue.",
  });
};
