import { createApp } from "./app.js";
import { env } from "./env.js";

createApp().listen(env.port, () => {
  console.log(`[api] resource server sur http://localhost:${env.port}`);
  console.log(`[api] issuer attendu   : ${env.keycloakIssuer}`);
  console.log(`[api] audience attendue: ${env.keycloakAudience}`);
});
