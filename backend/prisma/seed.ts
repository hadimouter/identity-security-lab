import { prisma } from "../src/lib/prisma.js";

/**
 * Rôles demandables dans l'application.
 *
 * Ils portent les mêmes noms que les rôles de realm Keycloak, ce qui
 * permet de raisonner sur un ensemble unique de noms de rôles, quelle
 * que soit leur provenance. Voir docs/rbac-model.md.
 */
const ROLES = [
  {
    name: "user",
    description: "Rôle de base attribué à tout collaborateur authentifié",
  },
  {
    name: "manager",
    description: "Valide ou refuse les demandes d'accès, révoque les accès",
  },
  {
    name: "admin",
    description: "Rôle à privilèges, administration de l'application",
  },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
    console.log(`  rôle ${role.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
