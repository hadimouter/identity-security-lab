import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { authenticated } from "../middleware/authenticated.js";
import { requireRole } from "../middleware/require-role.js";

export const adminRouter: Router = Router();

/**
 * Contenu réservé au rôle admin.
 *
 * Sert à démontrer que le refus est prononcé par l'API, indépendamment
 * de ce que le frontend affiche ou masque. Un appel direct au curl avec
 * le jeton d'un utilisateur sans privilège reçoit un 403.
 */
adminRouter.get(
  "/admin/summary",
  ...authenticated,
  requireRole("admin"),
  (req, res) => {
    res.json({
      message: "Contenu réservé aux administrateurs.",
      requestedBy: req.auth!.username,
    });
  },
);

/**
 * Inventaire des identités connues de l'application.
 *
 * Attention à ce que cette liste est, et à ce qu'elle n'est pas : elle
 * ne contient que les identités **provisionnées à la volée**, donc les
 * personnes qui se sont connectées au moins une fois. L'annuaire de
 * référence reste Keycloak. L'application ne duplique pas les comptes,
 * elle rattache ce que l'Identity Provider ne connaît pas : demandes,
 * accès accordés et audit logs.
 *
 * Les accès sont renvoyés séparés en actifs et révoqués, chacun avec la
 * personne qui a décidé. Un écran d'administration IAM qui dirait qui a
 * quoi sans dire qui l'a accordé n'aurait qu'un intérêt limité.
 */
adminRouter.get(
  "/users",
  ...authenticated,
  requireRole("admin"),
  async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        keycloakId: true,
        email: true,
        name: true,
        createdAt: true,
        grantsHeld: {
          select: {
            status: true,
            approvedAt: true,
            revokedAt: true,
            role: { select: { name: true } },
            approvedBy: { select: { email: true } },
            revokedBy: { select: { email: true } },
          },
          orderBy: { approvedAt: "desc" },
        },
        _count: { select: { requestsMade: true } },
      },
      orderBy: { email: "asc" },
    });

    res.json({
      users: users.map((user) => ({
        id: user.id,
        keycloakId: user.keycloakId,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        activeGrants: user.grantsHeld
          .filter((grant) => grant.status === "ACTIVE")
          .map((grant) => ({
            role: grant.role.name,
            approvedAt: grant.approvedAt,
            approvedBy: grant.approvedBy.email,
          })),
        revokedGrants: user.grantsHeld
          .filter((grant) => grant.status === "REVOKED")
          .map((grant) => ({
            role: grant.role.name,
            approvedAt: grant.approvedAt,
            revokedAt: grant.revokedAt,
            revokedBy: grant.revokedBy?.email ?? null,
          })),
        requestCount: user._count.requestsMade,
      })),
    });
  },
);
