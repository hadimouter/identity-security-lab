import { forbidden } from "next/navigation";

import { requireFreshSession } from "@/lib/session";
import { revokeGrantAction } from "@/app/actions/access";
import { StatusBadge } from "@/app/components/status-badge";
import { SubmitButton } from "@/app/components/submit-button";
import { fetchAllGrants } from "@/lib/api";
import { getEffectiveRoles } from "@/lib/session-roles";
import { SECONDARY_BUTTON } from "@/lib/ui";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function ManagerGrantsPage() {
  await requireFreshSession();

  const { roles } = await getEffectiveRoles();
  if (!roles.includes("manager") && !roles.includes("admin")) forbidden();

  const result = await fetchAllGrants();
  const grants = result.ok ? result.data.grants : [];
  const active = grants.filter((grant) => grant.status === "ACTIVE");
  const revoked = grants.filter((grant) => grant.status === "REVOKED");

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Accès accordés
        </h1>
        <p className="text-muted">
          Révoquer prend effet immédiatement : les droits sont recalculés à
          chaque requête. Le jeton de la personne reste valide jusqu&apos;à son
          expiration, mais il ne porte plus le rôle retiré.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger les accès</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Accès actifs ({active.length})
            </h2>

            {active.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
                Aucun accès actif. Les droits de chacun se limitent au rôle
                porté par son jeton Keycloak.
              </div>
            ) : (
              <ul className="space-y-4">
                {active.map((grant) => (
                  <li
                    key={grant.id}
                    className="space-y-4 rounded-lg border border-border bg-surface p-5"
                  >
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-medium">{grant.user.email}</span>
                      <span className="font-mono font-medium">
                        {grant.role.name}
                      </span>
                      <StatusBadge status={grant.status} />
                      <span className="ml-auto text-xs text-muted">
                        accordé le{" "}
                        {dateFormat.format(new Date(grant.approvedAt))} par{" "}
                        {grant.approvedBy.email}
                      </span>
                    </div>

                    {grant.request && (
                      <p className="border-l-2 border-border pl-4 text-sm text-muted">
                        {grant.request.justification}
                      </p>
                    )}

                    <form
                      action={revokeGrantAction}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <input type="hidden" name="id" value={grant.id} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Motif de la révocation, optionnel"
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                      />
                      <SubmitButton
                        pendingLabel="Révocation…"
                        className={SECONDARY_BUTTON}
                      >
                        Révoquer
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Accès révoqués ({revoked.length})
            </h2>

            {revoked.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
                Aucune révocation à ce jour.
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {revoked.map((grant) => (
                  <li
                    key={grant.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm"
                  >
                    <span>{grant.user.email}</span>
                    <span className="font-mono">{grant.role.name}</span>
                    <StatusBadge status={grant.status} />
                    <span className="ml-auto text-xs text-muted">
                      {grant.revokedAt
                        ? `révoqué le ${dateFormat.format(new Date(grant.revokedAt))}`
                        : "révoqué"}
                      {grant.revokedBy ? ` par ${grant.revokedBy.email}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted">
            Les accès révoqués sont conservés, jamais supprimés : ils font
            partie de la piste d&apos;audit. Chaque révocation est également
            inscrite au journal, avec son motif.
          </p>
        </>
      )}
    </div>
  );
}
