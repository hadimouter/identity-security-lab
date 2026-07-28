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
