import { Router } from "express";

import { AUDIT, writeAuditLog } from "../lib/audit.js";
import { ConflictError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { authenticated } from "../middleware/authenticated.js";
import { requireRole } from "../middleware/require-role.js";

export const grantsRouter: Router = Router();

/** Sélection commune, pour que toutes les réponses aient la même forme. */
const GRANT_SHAPE = {
  id: true,
  status: true,
  approvedAt: true,
  revokedAt: true,
  role: { select: { name: true } },
  user: { select: { email: true, name: true } },
  approvedBy: { select: { email: true, name: true } },
  revokedBy: { select: { email: true, name: true } },
  request: { select: { justification: true } },
} as const;

/** Ses propres accès, actifs comme révoqués. */
grantsRouter.get("/grants/mine", ...authenticated, async (req, res) => {
  const grants = await prisma.accessGrant.findMany({
    where: { userId: req.localUser!.id },
    select: GRANT_SHAPE,
    orderBy: { approvedAt: "desc" },
  });
  res.json({ grants });
});

/** Tous les accès du lab. Réservé aux managers et aux admins. */
grantsRouter.get(
  "/grants",
  ...authenticated,
  requireRole("manager", "admin"),
  async (_req, res) => {
    const grants = await prisma.accessGrant.findMany({
      select: GRANT_SHAPE,
      orderBy: [{ status: "asc" }, { approvedAt: "desc" }],
    });
    res.json({ grants });
  },
);

/**
 * Révocation d'un accès.
 *
 * L'effet est immédiat sans qu'aucun jeton ne change : les droits
 * effectifs sont recalculés à chaque requête à partir des grants encore
 * actifs. Le jeton de la personne reste valide jusqu'à son expiration,
 * mais il ne porte plus le rôle révoqué.
 *
 * Pas de contrôle de séparation des tâches ici : révoquer, y compris son
 * propre accès, réduit les privilèges. C'est l'octroi qui doit être
 * contrôlé, pas le retrait.
 */
grantsRouter.post(
  "/grants/:id/revoke",
  ...authenticated,
  requireRole("manager", "admin"),
  async (req, res) => {
    const grant = await prisma.accessGrant.findUnique({
      where: { id: String(req.params.id) },
      include: { role: true },
    });

    if (!grant) {
      res.status(404).json({ error: "not_found", message: "Accès introuvable." });
      return;
    }

    // Chemin rapide, pour un message clair dans le cas courant. La garde
    // qui fait autorité est dans la transaction : entre cette lecture et
    // l'écriture, un autre manager peut avoir révoqué l'accès.
    if (grant.status !== "ACTIVE") {
      res.status(409).json({
        error: "conflict",
        message: "Cet accès a déjà été révoqué.",
      });
      return;
    }

    const revoker = req.localUser!;
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : null;

    const updated = await prisma.$transaction(async (tx) => {
      // Garde atomique : deux managers qui révoquent au même instant
      // franchissent tous deux la lecture ci-dessus. Sans la condition
      // sur le statut, le second écraserait revokedById et revokedAt, et
      // écrirait une seconde trace pour une seule révocation — un
      // journal comptant deux révocations là où il n'y en a eu qu'une.
      const claimed = await tx.accessGrant.updateMany({
        where: { id: grant.id, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          revokedById: revoker.id,
          revokedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        throw new ConflictError("Cet accès a déjà été révoqué.");
      }

      const result = await tx.accessGrant.findUniqueOrThrow({
        where: { id: grant.id },
        select: GRANT_SHAPE,
      });

      // La demande d'origine passe à REVOKED : son issue n'est plus
      // « approuvée », l'accès qu'elle avait produit n'existe plus.
      if (grant.requestId) {
        await tx.accessRequest.update({
          where: { id: grant.requestId },
          data: { status: "REVOKED" },
        });
      }

      await writeAuditLog(tx, {
        actorId: revoker.id,
        action: AUDIT.grantRevoked,
        targetType: "access_grant",
        targetId: grant.id,
        result: "success",
        metadata: {
          role: grant.role.name,
          revokedFrom: grant.userId,
          reason,
        },
      });

      return result;
    });

    res.json(updated);
  },
);
