import { requireFreshSession } from "@/lib/session";
import { StatusBadge } from "@/app/components/status-badge";
import { fetchMyGrants } from "@/lib/api";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function MyAccessPage() {
  await requireFreshSession();

  const result = await fetchMyGrants();

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Mes accès</h1>
        <p className="text-muted">
          Accès accordés à la suite d&apos;une demande approuvée. Seuls les
          accès actifs entrent dans le calcul de vos droits.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger vos accès</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </div>
      ) : result.data.grants.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Aucun accès supplémentaire. Vos droits se limitent au rôle porté par
          votre jeton Keycloak.
        </div>
      ) : (
        <ul className="space-y-3">
          {result.data.grants.map((grant) => (
            <li
              key={grant.id}
              className="space-y-3 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-medium">
                  {grant.role.name}
                </span>
                <StatusBadge status={grant.status} />
                <span className="ml-auto text-xs text-muted">
                  accordé le {dateFormat.format(new Date(grant.approvedAt))} par{" "}
                  {grant.approvedBy.email}
                </span>
              </div>

              {grant.request && (
                <p className="text-sm text-muted">
                  Justification : {grant.request.justification}
                </p>
              )}

              {grant.revokedAt && (
                <div className="border-t border-border pt-3 text-xs text-muted">
                  Révoqué le {dateFormat.format(new Date(grant.revokedAt))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
