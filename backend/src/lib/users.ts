import type { User } from "../generated/prisma/client.js";
import type { AuthenticatedUser } from "../types.js";

import { prisma } from "./prisma.js";

/**
 * Provisionnement à la volée, dit *just-in-time provisioning*.
 *
 * L'application ne duplique pas l'annuaire de Keycloak et ne crée pas de
 * comptes à l'avance. La ligne locale est créée au premier appel
 * authentifié, à partir des claims d'un jeton déjà vérifié.
 *
 * Le rattachement se fait sur `keycloakId`, c'est-à-dire le claim `sub`,
 * qui est stable. L'email est mis à jour à chaque passage : il peut
 * changer dans l'IdP, et c'est l'IdP qui fait foi.
 *
 * Cette ligne locale n'existe que pour rattacher ce que Keycloak ne
 * connaît pas : demandes d'accès, accès accordés, audit logs.
 */
export async function provisionUser(auth: AuthenticatedUser): Promise<User> {
  if (!auth.email) {
    throw new Error(
      "Le jeton ne contient pas de claim email. Vérifier que le scope `email` est demandé.",
    );
  }

  return prisma.user.upsert({
    where: { keycloakId: auth.sub },
    update: { email: auth.email, name: auth.name ?? null },
    create: {
      keycloakId: auth.sub,
      email: auth.email,
      name: auth.name ?? null,
    },
  });
}
