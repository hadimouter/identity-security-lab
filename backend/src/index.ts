import express from "express";

import "./types.js";
import { env } from "./env.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { accessRequestsRouter } from "./routes/access-requests.js";
import { adminRouter } from "./routes/admin.js";
import { catalogRouter } from "./routes/catalog.js";
import { grantsRouter } from "./routes/grants.js";
import { meRouter } from "./routes/me.js";

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

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`[api] resource server sur http://localhost:${env.port}`);
  console.log(`[api] issuer attendu   : ${env.keycloakIssuer}`);
  console.log(`[api] audience attendue: ${env.keycloakAudience}`);
});
