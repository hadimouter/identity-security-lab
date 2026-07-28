import { forbidden } from "next/navigation";

import { StatusBadge } from "@/app/components/status-badge";
import { fetchUsers } from "@/lib/api";
import { getEffectiveRoles } from "@/lib/session-roles";
import { requireFreshSession } from "@/lib/session";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminUsersPage() {
  await requireFreshSession();

  // Le contrôle qui fait autorité est celui de l'API : elle renvoie 403
  // sur /api/users. Celui-ci évite d'afficher une page vide.
  const { roles } = await getEffectiveRoles();
  if (!roles.includes("admin")) forbidden();

  const result = await fetchUsers();

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Utilisateurs</h1>
        <p className="text-muted">
          Identités connues de l&apos;application, avec les accès qui leur ont
          été accordés et par qui.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        <p>
          Cette liste ne contient que les identités{" "}
          <span className="font-medium text-foreground">
            provisionnées à la volée
          </span>{" "}
          : une ligne est créée au premier appel authentifié. Une personne
          déclarée dans Keycloak mais qui ne s&apos;est jamais connectée
          n&apos;y figure pas.
        </p>
        <p className="mt-3">
          <span className="font-medium text-foreground">
            Keycloak reste l&apos;annuaire de référence.
          </span>{" "}
          L&apos;application ne duplique pas les comptes : elle rattache à un
          identifiant stable ce que l&apos;Identity Provider ne connaît pas —
          demandes d&apos;accès, accès accordés et audit logs.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger les utilisateurs</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </div>
      ) : result.data.users.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Aucune identité provisionnée. Personne ne s&apos;est encore connecté.
        </div>
      ) : (
        <ul className="space-y-4">
          {result.data.users.map((user) => (
            <li
              key={user.id}
              className="space-y-4 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{user.email}</span>
                <span className="text-sm text-muted">{user.name ?? "—"}</span>
                <span className="ml-auto text-xs text-muted">
                  {user.requestCount} demande
                  {user.requestCount > 1 ? "s" : ""} · première connexion le{" "}
                  {dateFormat.format(new Date(user.createdAt))}
                </span>
              </div>

              <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[9rem_1fr]">
                <dt className="text-muted">Identifiant Keycloak</dt>
                <dd className="font-mono break-all">{user.keycloakId}</dd>
                <dt className="text-muted">Utilisateur local</dt>
                <dd className="font-mono break-all">{user.id}</dd>
              </dl>

              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium">
                  Accès actifs ({user.activeGrants.length})
                </p>
                {user.activeGrants.length === 0 ? (
                  <p className="text-xs text-muted">
                    Aucun. Ses droits se limitent au rôle porté par son jeton.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {user.activeGrants.map((grant) => (
                      <li
                        key={`${grant.role}-${grant.approvedAt}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                      >
                        <span className="font-mono font-medium">
                          {grant.role}
                        </span>
                        <StatusBadge status="ACTIVE" />
                        <span className="text-muted">
                          accordé le{" "}
                          {dateFormat.format(new Date(grant.approvedAt))} par{" "}
                          {grant.approvedBy}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {user.revokedGrants.length > 0 && (
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-xs font-medium">
                    Accès révoqués ({user.revokedGrants.length})
                  </p>
                  <ul className="space-y-1.5">
                    {user.revokedGrants.map((grant) => (
                      <li
                        key={`${grant.role}-${grant.approvedAt}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                      >
                        <span className="font-mono">{grant.role}</span>
                        <StatusBadge status="REVOKED" />
                        <span className="text-muted">
                          {grant.revokedAt
                            ? `révoqué le ${dateFormat.format(new Date(grant.revokedAt))}`
                            : "révoqué"}
                          {grant.revokedBy ? ` par ${grant.revokedBy}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Sans pagination ni recherche : le lab compte trois comptes de
        démonstration. Un annuaire réel imposerait les deux.
      </p>
    </div>
  );
}
