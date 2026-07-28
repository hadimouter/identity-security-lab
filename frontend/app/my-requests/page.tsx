import Link from "next/link";
import { unauthorized } from "next/navigation";

import { auth } from "@/auth";
import { StatusBadge } from "@/app/components/status-badge";
import { fetchMyRequests } from "@/lib/api";
import { INLINE_LINK } from "@/lib/ui";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function MyRequestsPage() {
  const session = await auth();
  if (!session) unauthorized();

  const result = await fetchMyRequests();

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Mes demandes</h1>
        <p className="text-muted">
          Historique de vos demandes d&apos;accès et de leur traitement.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger vos demandes</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </div>
      ) : result.data.requests.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Aucune demande pour le moment.{" "}
          <Link href="/request-access" className={INLINE_LINK}>
            Demander un accès
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {result.data.requests.map((request) => (
            <li
              key={request.id}
              className="space-y-3 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-medium">
                  {request.role.name}
                </span>
                <StatusBadge status={request.status} />
                <span className="ml-auto text-xs text-muted">
                  demandé le {dateFormat.format(new Date(request.createdAt))}
                </span>
              </div>

              <p className="text-sm text-muted">{request.justification}</p>

              {request.reviewedAt && (
                <div className="border-t border-border pt-3 text-xs text-muted">
                  Traitée le {dateFormat.format(new Date(request.reviewedAt))}
                  {request.reviewedBy ? ` par ${request.reviewedBy.email}` : ""}
                  {request.reviewComment ? ` — « ${request.reviewComment} »` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
