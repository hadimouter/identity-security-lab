-- Index uniques partiels : ce sont eux qui garantissent réellement les
-- invariants du workflow. Les vérifications applicatives, même dans une
-- transaction, restent des lectures suivies d'écritures : sous le niveau
-- d'isolation Read Committed de PostgreSQL, deux transactions
-- concurrentes peuvent les franchir toutes les deux.
--
-- Prisma ne sait pas déclarer une clause WHERE sur un index, d'où cette
-- migration écrite à la main. Une violation remonte en P2002, que
-- l'API traduit en 409.

-- Un seul accès ACTIVE par couple (utilisateur, rôle).
-- Les accès REVOKED ne sont pas contraints : un même rôle peut être
-- accordé puis révoqué plusieurs fois, et l'historique doit rester.
CREATE UNIQUE INDEX "AccessGrant_userId_roleId_active_key"
  ON "AccessGrant" ("userId", "roleId")
  WHERE "status" = 'ACTIVE';

-- Une seule demande PENDING par couple (demandeur, rôle).
-- Sans elle, deux créations simultanées produisent deux demandes en
-- attente pour le même rôle, ce qui ouvre ensuite une double approbation.
CREATE UNIQUE INDEX "AccessRequest_requesterId_roleId_pending_key"
  ON "AccessRequest" ("requesterId", "roleId")
  WHERE "status" = 'PENDING';
