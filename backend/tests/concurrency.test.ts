import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import {
  callApi,
  cleanupSince,
  localUserId,
  prisma,
  requireStack,
  resetFixturesFor,
  roleId,
  startApi,
  tokenFor,
} from "./helpers.js";

/**
 * Les invariants du workflow, mis sous concurrence.
 *
 * Chaque test lance deux requêtes simultanées sur la même ressource et
 * vérifie que l'état final reste cohérent. Ce sont les propriétés qui
 * font la valeur du lab : sans elles, « personne ne peut approuver deux
 * fois » et « l'audit est atomique » ne sont que des affirmations.
 *
 * Une réponse en double n'est pas le problème : le problème est ce que
 * la base contient après la course.
 */
describe("Invariants sous concurrence", () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let since: Date;

  const JUSTIFICATION = "Demande créée par la suite de tests de concurrence.";

  before(async () => {
    await requireStack();
    api = await startApi();
  });

  beforeEach(async () => {
    since = new Date();
    await resetFixturesFor("user@example.com");
  });

  afterEach(() => cleanupSince(since));

  after(async () => {
    await api.close();
    await prisma.$disconnect();
  });

  /** Dépose une demande et renvoie son identifiant. */
  async function demander(token: string, roleName: string): Promise<string> {
    const reponse = await callApi<{ id: string }>(
      api.url,
      "/api/access-requests",
      { method: "POST", token, body: { roleName, justification: JUSTIFICATION } },
    );
    assert.equal(reponse.status, 201);
    return reponse.body.id;
  }

  it("A. deux créations simultanées ne laissent qu'une demande en attente", async () => {
    const user = await tokenFor("user");

    const reponses = await Promise.all([
      callApi(api.url, "/api/access-requests", {
        method: "POST",
        token: user,
        body: { roleName: "manager", justification: JUSTIFICATION },
      }),
      callApi(api.url, "/api/access-requests", {
        method: "POST",
        token: user,
        body: { roleName: "manager", justification: JUSTIFICATION },
      }),
    ]);

    const codes = reponses.map((r) => r.status).sort();
    assert.deepEqual(codes, [201, 409], "une seule création doit aboutir");

    const enAttente = await prisma.accessRequest.count({
      where: {
        status: "PENDING",
        requesterId: await localUserId(api.url, user),
        roleId: await roleId("manager"),
      },
    });
    assert.equal(enAttente, 1, "deux demandes en attente ouvriraient une double approbation");
  });

  it("B. deux approbations simultanées ne créent qu'un accès et qu'une trace", async () => {
    const user = await tokenFor("user");
    const manager = await tokenFor("manager");
    const demandeId = await demander(user, "manager");

    const reponses = await Promise.all([
      callApi(api.url, `/api/access-requests/${demandeId}/approve`, {
        method: "POST",
        token: manager,
        body: { comment: "Approbation concurrente 1." },
      }),
      callApi(api.url, `/api/access-requests/${demandeId}/approve`, {
        method: "POST",
        token: manager,
        body: { comment: "Approbation concurrente 2." },
      }),
    ]);

    const codes = reponses.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409]);

    const accès = await prisma.accessGrant.count({ where: { requestId: demandeId } });
    assert.equal(accès, 1, "une demande ne doit produire qu'un accès");

    const approbations = await prisma.auditLog.count({
      where: { action: "access_request_approved", targetId: demandeId },
    });
    assert.equal(approbations, 1, "une seule approbation, donc une seule trace");

    const accordé = await prisma.accessGrant.findFirstOrThrow({
      where: { requestId: demandeId },
    });
    const créations = await prisma.auditLog.count({
      where: { action: "access_grant_created", targetId: accordé.id },
    });
    assert.equal(créations, 1);
  });

  it("C. un conflit détecté après une écriture annule toute la transaction", async () => {
    const user = await tokenFor("user");
    const manager = await tokenFor("manager");

    // Le rôle est d'abord accordé par la voie normale.
    const premiere = await demander(user, "manager");
    const approbation = await callApi(
      api.url,
      `/api/access-requests/${premiere}/approve`,
      { method: "POST", token: manager, body: { comment: "Accordé." } },
    );
    assert.equal(approbation.status, 200);

    // On fabrique ensuite l'état que l'API interdit désormais de créer :
    // une demande en attente pour un rôle déjà détenu. C'est la seule
    // façon d'atteindre la branche de conflit qui suit l'écriture.
    const piegee = await prisma.accessRequest.create({
      data: {
        requesterId: await localUserId(api.url, user),
        roleId: await roleId("manager"),
        justification: "Demande construite pour exercer la branche de conflit.",
        status: "PENDING",
      },
    });

    const reponse = await callApi(
      api.url,
      `/api/access-requests/${piegee.id}/approve`,
      { method: "POST", token: manager, body: { comment: "Ne doit rien écrire." } },
    );
    assert.equal(reponse.status, 409);

    // Le point de la régression : le statut a bien été écrit avant que
    // le conflit ne soit détecté. Si le conflit était retourné au lieu
    // d'être levé, Prisma validerait la transaction et la demande
    // resterait APPROVED, sans accès, sans trace, et impossible à
    // retraiter puisqu'elle ne serait plus en attente.
    const apres = await prisma.accessRequest.findUniqueOrThrow({
      where: { id: piegee.id },
    });
    assert.equal(apres.status, "PENDING", "la transaction doit avoir été annulée");
    assert.equal(apres.reviewedById, null);
    assert.equal(apres.reviewedAt, null);
    assert.equal(apres.reviewComment, null);

    const accès = await prisma.accessGrant.count({ where: { requestId: piegee.id } });
    assert.equal(accès, 0, "aucun accès ne doit avoir été créé");
  });

  it("D. deux révocations simultanées n'écrivent qu'une trace", async () => {
    const user = await tokenFor("user");
    const manager = await tokenFor("manager");

    const demandeId = await demander(user, "manager");
    await callApi(api.url, `/api/access-requests/${demandeId}/approve`, {
      method: "POST",
      token: manager,
      body: { comment: "Accordé." },
    });

    const accès = await prisma.accessGrant.findFirstOrThrow({
      where: { requestId: demandeId },
    });

    const reponses = await Promise.all([
      callApi(api.url, `/api/grants/${accès.id}/revoke`, {
        method: "POST",
        token: manager,
        body: { reason: "Révocation concurrente 1." },
      }),
      callApi(api.url, `/api/grants/${accès.id}/revoke`, {
        method: "POST",
        token: manager,
        body: { reason: "Révocation concurrente 2." },
      }),
    ]);

    const codes = reponses.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409]);

    const apres = await prisma.accessGrant.findUniqueOrThrow({
      where: { id: accès.id },
    });
    assert.equal(apres.status, "REVOKED");
    assert.ok(apres.revokedById, "le révocateur doit être enregistré");

    const traces = await prisma.auditLog.count({
      where: { action: "access_grant_revoked", targetId: accès.id },
    });
    assert.equal(
      traces,
      1,
      "un journal comptant deux révocations là où il n'y en a eu qu'une serait faux",
    );
  });
});
