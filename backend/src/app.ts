import express, { type Express } from "express";

import "./types.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { accessRequestsRouter } from "./routes/access-requests.js";
import { adminRouter } from "./routes/admin.js";
import { catalogRouter } from "./routes/catalog.js";
import { grantsRouter } from "./routes/grants.js";
import { meRouter } from "./routes/me.js";

/**
 * L'application Express, sans le `listen`.
 *
 * Séparée du point d'entrée pour que les tests puissent la démarrer
 * eux-mêmes sur un port éphémère, sans dépendre d'un serveur lancé à la
 * main ni monopoliser le port 4000.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  /**
   * Sonde de disponibilité, publique.
   * Ne révèle rien d'autre que le fait que le service répond.
   */
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", meRouter);
  app.use("/api", accessRequestsRouter);
  app.use("/api", catalogRouter);
  app.use("/api", grantsRouter);
  app.use("/api", adminRouter);

  // Toujours en dernier : le 404 attrape ce qu'aucune route n'a servi,
  // et le gestionnaire d'erreurs ne voit que ce qui a échoué avant lui.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
