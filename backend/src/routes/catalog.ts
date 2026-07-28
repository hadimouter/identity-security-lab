import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { authenticated } from "../middleware/authenticated.js";
import { requireRole } from "../middleware/require-role.js";

export const catalogRouter: Router = Router();

/** Rôles demandables. Alimente le formulaire de demande d'accès. */
catalogRouter.get("/roles", ...authenticated, async (_req, res) => {
  const roles = await prisma.role.findMany({
    select: { name: true, description: true },
    orderBy: { name: "asc" },
  });
  res.json({ roles });
});

/** Ses propres accès, actifs comme révoqués. */
catalogRouter.get("/grants/mine", ...authenticated, async (req, res) => {
  const grants = await prisma.accessGrant.findMany({
    where: { userId: req.localUser!.id },
    select: {
      id: true,
      status: true,
      approvedAt: true,
      revokedAt: true,
      role: { select: { name: true } },
      approvedBy: { select: { email: true, name: true } },
      request: { select: { justification: true } },
    },
    orderBy: { approvedAt: "desc" },
  });
  res.json({ grants });
});

/**
 * Journal d'audit.
 *
 * Réservé aux managers et aux admins : il contient qui a demandé quoi,
 * avec quelle justification, et qui a tranché.
 */
catalogRouter.get(
  "/audit-logs",
  ...authenticated,
  requireRole("manager", "admin"),
  async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);

    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        result: true,
        metadata: true,
        createdAt: true,
        actor: { select: { email: true, name: true } },
      },
    });
    res.json({ logs });
  },
);
