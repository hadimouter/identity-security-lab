import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import {
  callApi,
  cleanupSince,
  prisma,
  requireStack,
  resetFixturesFor,
  startApi,
  tokenFor,
} from "./helpers.js";

/**
 * Le cycle de vie d'un accès, de bout en bout.
 *
 * Ces tests appellent l'API par HTTP avec de vrais jetons émis par
 * Keycloak : la signature RS256, l'issuer et l'audience sont réellement
 * vérifiés. Rien n'est simulé, sinon on ne testerait plus la propriété
 * qui fait l'intérêt du lab.
 */
describe("Cycle de vie d'un accès", () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let since: Date;

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

  it("refuse, accorde puis retire un accès, sans jamais changer de jeton", async () => {
    const user = await tokenFor("user");
    const manager = await tokenFor("manager");

    // 1. Le rôle admin n'est pas dans le jeton du compte user.
    const avant = await callApi(api.url, "/api/admin/summary", { token: user });
    assert.equal(avant.status, 403, "un compte user ne doit pas voir l'admin");

    // 2. Il le demande, avec une justification.
    const demande = await callApi<{ id: string; status: string }>(
      api.url,
      "/api/access-requests",
      {
        method: "POST",
        token: user,
        body: {
          roleName: "admin",
          justification: "Reprise de l'administration pendant une absence.",
        },
      },
    );
    assert.equal(demande.status, 201);
    assert.equal(demande.body.status, "PENDING");

    // 3. Un manager approuve.
    const approbation = await callApi(
      api.url,
      `/api/access-requests/${demande.body.id}/approve`,
      { method: "POST", token: manager, body: { comment: "Intérim validé." } },
    );
    assert.equal(approbation.status, 200);

    // 4. L'accès est ouvert — avec le MÊME jeton qu'à l'étape 1.
    //    C'est le cœur du modèle : les droits effectifs sont recalculés
    //    en base à chaque requête, le jeton ne les porte pas.
    const apres = await callApi(api.url, "/api/admin/summary", { token: user });
    assert.equal(apres.status, 200, "l'accès accordé doit ouvrir la route");

    // 5. Un manager révoque.
    const grants = await callApi<{ grants: { id: string; status: string }[] }>(
      api.url,
      "/api/grants",
      { token: manager },
    );
    const actif = grants.body.grants.find((g) => g.status === "ACTIVE");
    assert.ok(actif, "l'approbation doit avoir créé un accès actif");

    const revocation = await callApi(
      api.url,
      `/api/grants/${actif.id}/revoke`,
      { method: "POST", token: manager, body: { reason: "Fin de l'intérim." } },
    );
    assert.equal(revocation.status, 200);

    // 6. L'accès est refermé, toujours sans changement de jeton.
    const final = await callApi(api.url, "/api/admin/summary", { token: user });
    assert.equal(final.status, 403, "la révocation doit être immédiate");
  });

  it("laisse une trace d'audit pour chaque étape qui modifie des droits", async () => {
    const user = await tokenFor("user");
    const manager = await tokenFor("manager");

    const demande = await callApi<{ id: string }>(
      api.url,
      "/api/access-requests",
      {
        method: "POST",
        token: user,
        body: {
          roleName: "admin",
          justification: "Vérification de la piste d'audit.",
        },
      },
    );
    await callApi(api.url, `/api/access-requests/${demande.body.id}/approve`, {
      method: "POST",
      token: manager,
      body: { comment: "Approuvé." },
    });

    const traces = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { action: true },
    });
    const actions = traces.map((t) => t.action);

    assert.ok(actions.includes("access_request_created"));
    assert.ok(actions.includes("access_request_approved"));
    assert.ok(
      actions.includes("access_grant_created"),
      "un accès accordé sans trace serait inexplicable",
    );
  });

  it("refuse à chacun ce que son rôle ne permet pas", async () => {
    const attendu = [
      { qui: "anonyme", token: undefined, status: 401 },
      { qui: "user", token: await tokenFor("user"), status: 403 },
      { qui: "manager", token: await tokenFor("manager"), status: 403 },
      { qui: "admin", token: await tokenFor("admin"), status: 200 },
    ];

    for (const { qui, token, status } of attendu) {
      const reponse = await callApi(api.url, "/api/users", { token });
      assert.equal(reponse.status, status, `/api/users pour ${qui}`);
    }
  });

  it("empêche un manager d'approuver sa propre demande", async () => {
    const manager = await tokenFor("manager");
    await resetFixturesFor("manager@example.com");

    const demande = await callApi<{ id: string }>(
      api.url,
      "/api/access-requests",
      {
        method: "POST",
        token: manager,
        body: {
          roleName: "admin",
          justification: "Demande déposée pour tester la séparation des tâches.",
        },
      },
    );
    assert.equal(demande.status, 201);

    const auto = await callApi(
      api.url,
      `/api/access-requests/${demande.body.id}/approve`,
      { method: "POST", token: manager, body: { comment: "Je m'auto-approuve." } },
    );

    // 403 et non 409 : l'identité est connue, c'est la règle métier qui
    // s'y oppose. Sans elle, un manager pourrait se demander les droits
    // admin et se les accorder.
    assert.equal(auto.status, 403);

    const trace = await prisma.auditLog.findFirst({
      where: {
        createdAt: { gte: since },
        action: "unauthorized_access_attempt",
        targetId: demande.body.id,
      },
    });
    assert.ok(trace, "la tentative doit être journalisée");
  });
});
