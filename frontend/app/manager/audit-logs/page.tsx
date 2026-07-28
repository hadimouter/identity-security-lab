import { forbidden, unauthorized } from "next/navigation";

import { auth } from "@/auth";
import { fetchAuditLogs, fetchMe } from "@/lib/api";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

/** Libellés lisibles des événements. Voir docs/audit-logs.md. */
const ACTIONS: Record<string, string> = {
  access_request_created: "Demande créée",
  access_request_approved: "Demande approuvée",
  access_request_rejected: "Demande refusée",
  access_grant_created: "Accès accordé",
  access_grant_revoked: "Accès révoqué",
  unauthorized_access_attempt: "Tentative d'accès refusée",
};

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session) unauthorized();

  const me = await fetchMe();
  const roles = me.ok ? me.data.roles.all : session.roles;
  if (!roles.includes("manager") && !roles.includes("admin")) forbidden();

  const result = await fetchAuditLogs();

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Journal d&apos;audit</h1>
        <p className="text-muted">
          Qui a fait quoi, sur quoi, quand, et avec quel résultat. Les refus y
          figurent au même titre que les succès : un journal qui ne contiendrait
          que des succès ne servirait à rien en cas d&apos;incident.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger le journal</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </div>
      ) : result.data.logs.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Aucun événement enregistré.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {result.data.logs.map((log) => (
            <li key={log.id} className="space-y-1.5 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`rounded-md border px-2 py-0.5 font-mono text-xs ${
                    log.result === "denied"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {log.result === "denied" ? "refus" : "succès"}
                </span>
                <span className="font-medium">
                  {ACTIONS[log.action] ?? log.action}
                </span>
                <span className="text-muted">
                  par {log.actor?.email ?? "système"}
                </span>
                <span className="ml-auto text-xs text-muted">
                  {dateFormat.format(new Date(log.createdAt))}
                </span>
              </div>

              <div className="font-mono text-xs text-muted">
                {log.action} · {log.targetType}
                {log.targetId ? ` · ${log.targetId}` : ""}
              </div>

              {log.metadata != null && (
                <pre className="overflow-x-auto rounded border border-border bg-background p-3 font-mono text-xs text-muted">
                  {JSON.stringify(log.metadata)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
