import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "./prisma.js";

/**
 * Événements d'audit du lab. Voir docs/audit-logs.md.
 *
 * Les noms sont figés ici plutôt que saisis à la main dans chaque
 * handler : une faute de frappe rendrait un événement introuvable au
 * moment où on en aurait besoin.
 */
export const AUDIT = {
  requestCreated: "access_request_created",
  requestApproved: "access_request_approved",
  requestRejected: "access_request_rejected",
  grantCreated: "access_grant_created",
  grantRevoked: "access_grant_revoked",
  unauthorized: "unauthorized_access_attempt",
} as const;

/** Accepte le client normal ou un client de transaction. */
type Db = Prisma.TransactionClient | typeof prisma;

export type AuditEntry = {
  /** Null pour une action sans auteur identifié. */
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  result: "success" | "denied";
  metadata?: Prisma.InputJsonValue;
};

/**
 * Écrit une trace d'audit.
 *
 * À appeler avec le client de transaction quand l'action modifie des
 * droits : la trace et la modification doivent être atomiques. Une
 * approbation sans son audit log serait un trou dans la piste d'audit.
 */
export function writeAuditLog(db: Db, entry: AuditEntry) {
  return db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      result: entry.result,
      metadata: entry.metadata,
    },
  });
}

/**
 * Écrit une trace sans faire échouer la requête en cas de problème.
 *
 * Réservé aux refus : un accès refusé doit le rester même si la base
 * d'audit est indisponible. L'inverse serait un moyen de contourner le
 * contrôle en saturant la base.
 */
export async function writeAuditLogSafely(entry: AuditEntry): Promise<void> {
  try {
    await writeAuditLog(prisma, entry);
  } catch (error) {
    console.error("[audit] écriture impossible :", error);
  }
}
