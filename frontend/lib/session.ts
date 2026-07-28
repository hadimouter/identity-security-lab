import { redirect, unauthorized } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/auth";

/**
 * Garde commune à toutes les pages protégées.
 *
 * Deux situations distinctes, deux réponses distinctes :
 *
 *   aucune session          -> 401, l'identité n'est pas établie
 *   renouvellement échoué   -> écran de session expirée
 *
 * Le second cas est celui qui laissait auparavant l'utilisateur dans un
 * état « connecté mais cassé » : la session applicative restait valide
 * des jours durant, alors que l'access token était mort au bout de cinq
 * minutes et que tous les appels à l'API échouaient en silence.
 */
export async function requireFreshSession(): Promise<Session> {
  const session = await auth();

  if (!session) {
    unauthorized();
  }

  if (session.error === "RefreshTokenError") {
    redirect("/auth/session-expired");
  }

  return session;
}
