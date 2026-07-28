import { forbidden, unauthorized } from "next/navigation";

import { auth } from "@/auth";
import { reviewRequest } from "@/app/actions/access";
import { DecisionButtons } from "@/app/components/decision-buttons";
import { StatusBadge } from "@/app/components/status-badge";
import { fetchPendingRequests } from "@/lib/api";
import { getEffectiveRoles } from "@/lib/session-roles";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function ManagerRequestsPage() {
  const session = await auth();
  if (!session) unauthorized();

  // Le contrôle qui fait autorité est dans l'API : elle renvoie 403 sur
  // la file d'approbation. Celui-ci évite d'afficher une page vide.
  const roles = await getEffectiveRoles();
  if (!roles.includes("manager") && !roles.includes("admin")) forbidden();

  const result = await fetchPendingRequests();

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Demandes à valider
        </h1>
        <p className="text-muted">
          Approuver crée l&apos;accès et l&apos;inscrit au journal d&apos;audit.
          Refuser n&apos;accorde rien, mais laisse également une trace.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger la file</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </div>
      ) : result.data.requests.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Aucune demande en attente.
        </div>
      ) : (
        <ul className="space-y-4">
          {result.data.requests.map((request) => (
            <li
              key={request.id}
              className="space-y-4 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  <span className="font-medium">{request.requester.email}</span>{" "}
                  demande{" "}
                  <span className="font-mono font-medium">
                    {request.role.name}
                  </span>
                </span>
                <StatusBadge status={request.status} />
                <span className="ml-auto text-xs text-muted">
                  {dateFormat.format(new Date(request.createdAt))}
                </span>
              </div>

              <p className="border-l-2 border-border pl-4 text-sm text-muted">
                {request.justification}
              </p>

              <form
                action={reviewRequest}
                className="flex flex-wrap items-center gap-3"
              >
                <input type="hidden" name="id" value={request.id} />
                <input
                  type="text"
                  name="comment"
                  placeholder="Commentaire de revue, optionnel"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
                <DecisionButtons />
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Séparation des tâches : vous ne pouvez pas traiter votre propre demande.
        L&apos;API refuse l&apos;opération et journalise la tentative.
      </p>
    </div>
  );
}
