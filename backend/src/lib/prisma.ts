import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../env.js";

/**
 * Client Prisma, instancié une seule fois.
 *
 * Prisma 7 impose un adaptateur de driver : la connexion passe par le
 * pilote PostgreSQL natif plutôt que par le moteur binaire des versions
 * précédentes.
 *
 * `globalThis` évite d'ouvrir un nouveau pool à chaque rechargement à
 * chaud en développement, ce qui finirait par saturer les connexions.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
