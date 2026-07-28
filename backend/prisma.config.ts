import { resolve } from "node:path";

import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Le lab n'a qu'un seul .env, à la racine du dépôt. Chargé avant que
// defineConfig ne lise DATABASE_URL.
config({ path: resolve(process.cwd(), "../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // En Prisma 7, l'URL vit ici et non plus dans schema.prisma.
    url: env("DATABASE_URL"),
  },
});
