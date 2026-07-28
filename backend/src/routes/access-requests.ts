import { Router, type Response } from "express";

import { AccessRequestStatus } from "../generated/prisma/client.js";

import { AUDIT, writeAuditLog, writeAuditLogSafely } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { authenticated } from "../middleware/authenticated.js";
import { requireRole } from "../middleware/require-role.js";

export const accessRequestsRouter: Router = Router();

const JUSTIFICATION_MIN = 10;
const JUSTIFICATION_MAX = 1000;

/** Sélection commune, pour que toutes les réponses aient la même forme. */
const REQUEST_SHAPE = {
  id: true,
  justification: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  reviewComment: true,
  role: { select: { name: true, description: true } },
  requester: { select: { email: true, name: true } },
  reviewedBy: { select: { email: true, name: true } },
} as const;

/**
 * Création d'une demande d'accès.
 *
 * Le demandeur est toujours l'utilisateur authentifié : il n'est jamais
 * lu depuis le corps de la requête, sinon n'importe qui pourrait
 * déposer une demande au nom d'un autre.
 */
accessRequestsRouter.post("/access-requests", ...authenticated, async (req, res) => {
  const body = (req.body ?? {}) as { roleName?: unknown; justification?: unknown };
  const roleName = typeof body.roleName === "string" ? body.roleName.trim() : "";
  const justification =
    typeof body.justification === "string" ? body.justification.trim() : "";

  if (!roleName) {
    res.status(400).json({ error: "bad_request", message: "Le rôle demandé est obligatoire." });
    return;
  }
  if (justification.length < JUSTIFICATION_MIN) {
    res.status(400).json({
      error: "bad_request",
      message: `La justification doit faire au moins ${JUSTIFICATION_MIN} caractères.`,
    });
    return;
  }
  if (justification.length > JUSTIFICATION_MAX) {
    res.status(400).json({
      error: "bad_request",
      message: `La justification ne doit pas dépasser ${JUSTIFICATION_MAX} caractères.`,
    });
    return;
  }

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    res.status(400).json({ error: "bad_request", message: `Rôle inconnu : ${roleName}.` });
    return;
  }

  const requester = req.localUser!;

  // Demander un rôle déjà détenu n'a pas de sens et polluerait la file.
  if (req.effectiveRoles!.all.includes(role.name)) {
    res.status(409).json({
      error: "conflict",
      message: `Vous disposez déjà du rôle ${role.name}.`,
    });
    return;
  }

  const pending = await prisma.accessRequest.findFirst({
    where: { requesterId: requester.id, roleId: role.id, status: "PENDING" },
  });
  if (pending) {
    res.status(409).json({
      error: "conflict",
      message: `Une demande est déjà en attente pour le rôle ${role.name}.`,
    });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.accessRequest.create({
      data: { requesterId: requester.id, roleId: role.id, justification },
      select: REQUEST_SHAPE,
    });

    await writeAuditLog(tx, {
      actorId: requester.id,
      action: AUDIT.requestCreated,
      targetType: "access_request",
      targetId: request.id,
      result: "success",
      metadata: { role: role.name, justification },
    });

    return request;
  });

  res.status(201).json(created);
});

/** Ses propres demandes. */
accessRequestsRouter.get("/access-requests/mine", ...authenticated, async (req, res) => {
  const requests = await prisma.accessRequest.findMany({
    where: { requesterId: req.localUser!.id },
    select: REQUEST_SHAPE,
    orderBy: { createdAt: "desc" },
  });
  res.json({ requests });
});

/** File d'approbation. Réservée aux managers et aux admins. */
accessRequestsRouter.get(
  "/access-requests",
  ...authenticated,
  requireRole("manager", "admin"),
  async (req, res) => {
    const raw = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      raw && raw in AccessRequestStatus
        ? (raw as AccessRequestStatus)
        : undefined;

    const requests = await prisma.accessRequest.findMany({
      where: status ? { status } : {},
      select: REQUEST_SHAPE,
      orderBy: { createdAt: "desc" },
    });
    res.json({ requests });
  },
);

/**
 * Vérifications communes à l'approbation et au refus.
 *
 * Renvoie la demande si l'action est permise, sinon répond elle-même et
 * renvoie null.
 */
async function loadReviewableRequest(
  requestId: string,
  reviewerId: string,
  res: Response,
  action: string,
) {
  const request = await prisma.accessRequest.findUnique({
    where: { id: requestId },
    include: { role: true },
  });

  if (!request) {
    res.status(404).json({ error: "not_found", message: "Demande introuvable." });
    return null;
  }

  // Chemin rapide, pour un message clair dans le cas courant. La garde
  // qui fait autorité est dans la transaction : entre cette lecture et
  // l'écriture, un autre manager peut avoir traité la demande.
  if (request.status !== "PENDING") {
    res.status(409).json({
      error: "conflict",
      message: `Cette demande a déjà été traitée (${request.status}).`,
    });
    return null;
  }

  // Séparation des tâches : nul ne valide sa propre demande.
  if (request.requesterId === reviewerId) {
    await writeAuditLogSafely({
      actorId: reviewerId,
      action: AUDIT.unauthorized,
      targetType: "access_request",
      targetId: request.id,
      result: "denied",
      metadata: { reason: "separation_of_duties", attemptedAction: action },
    });

    res.status(403).json({
      error: "forbidden",
      message:
        "Séparation des tâches : vous ne pouvez pas traiter votre propre demande.",
    });
    return null;
  }

  return request;
}

/**
 * Approbation.
 *
 * Met la demande à APPROVED et crée l'accès correspondant, dans une
 * seule transaction avec ses deux traces d'audit. Soit tout est écrit,
 * soit rien : un accès accordé sans trace serait inexplicable.
 */
accessRequestsRouter.post(
  "/access-requests/:id/approve",
  ...authenticated,
  requireRole("manager", "admin"),
  async (req, res) => {
    const reviewer = req.localUser!;
    const request = await loadReviewableRequest(
      String(req.params.id),
      reviewer.id,
      res,
      "approve",
    );
    if (!request) return;

    const comment =
      typeof req.body?.comment === "string" ? req.body.comment.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      // Garde atomique : la mise à jour n'aboutit que si la demande est
      // encore PENDING. Deux managers qui approuvent simultanément
      // passeraient tous deux une simple lecture ; ici, le second obtient
      // un compte de 0 et repart avec un 409, pas une erreur interne.
      const claimed = await tx.accessRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: {
          status: "APPROVED",
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          reviewComment: comment,
        },
      });

      if (claimed.count === 0) {
        return { conflict: "Cette demande vient d'être traitée." } as const;
      }

      // Même raisonnement pour l'accès : la vérification doit vivre dans
      // la transaction, sinon deux demandes distinctes pour le même rôle
      // pourraient produire deux accès actifs.
      const existing = await tx.accessGrant.findFirst({
        where: {
          userId: request.requesterId,
          roleId: request.roleId,
          status: "ACTIVE",
        },
      });

      if (existing) {
        return { conflict: "Le demandeur dispose déjà de cet accès." } as const;
      }

      const updated = await tx.accessRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: REQUEST_SHAPE,
      });

      const grant = await tx.accessGrant.create({
        data: {
          userId: request.requesterId,
          roleId: request.roleId,
          approvedById: reviewer.id,
          requestId: request.id,
        },
      });

      await writeAuditLog(tx, {
        actorId: reviewer.id,
        action: AUDIT.requestApproved,
        targetType: "access_request",
        targetId: request.id,
        result: "success",
        metadata: { role: request.role.name, comment },
      });

      await writeAuditLog(tx, {
        actorId: reviewer.id,
        action: AUDIT.grantCreated,
        targetType: "access_grant",
        targetId: grant.id,
        result: "success",
        metadata: { role: request.role.name, grantedTo: request.requesterId },
      });

      return { request: updated, grantId: grant.id };
    });

    if ("conflict" in result) {
      res.status(409).json({ error: "conflict", message: result.conflict });
      return;
    }

    res.json(result);
  },
);

/** Refus. Aucun accès n'est créé, mais la trace l'est. */
accessRequestsRouter.post(
  "/access-requests/:id/reject",
  ...authenticated,
  requireRole("manager", "admin"),
  async (req, res) => {
    const reviewer = req.localUser!;
    const request = await loadReviewableRequest(
      String(req.params.id),
      reviewer.id,
      res,
      "reject",
    );
    if (!request) return;

    const comment =
      typeof req.body?.comment === "string" ? req.body.comment.trim() : null;

    const updated = await prisma.$transaction(async (tx) => {
      // Même garde atomique que pour l'approbation.
      const claimed = await tx.accessRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          reviewComment: comment,
        },
      });

      if (claimed.count === 0) {
        return { conflict: "Cette demande vient d'être traitée." } as const;
      }

      const result = await tx.accessRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: REQUEST_SHAPE,
      });

      await writeAuditLog(tx, {
        actorId: reviewer.id,
        action: AUDIT.requestRejected,
        targetType: "access_request",
        targetId: request.id,
        result: "success",
        metadata: { role: request.role.name, comment },
      });

      return result;
    });

    if ("conflict" in updated) {
      res.status(409).json({ error: "conflict", message: updated.conflict });
      return;
    }

    res.json(updated);
  },
);
