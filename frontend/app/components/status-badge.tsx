const STYLES: Record<string, string> = {
  PENDING:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  APPROVED:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ACTIVE:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "border-border bg-foreground/5 text-muted",
  REVOKED: "border-border bg-foreground/5 text-muted",
};

const LABELS: Record<string, string> = {
  PENDING: "en attente",
  APPROVED: "approuvée",
  REJECTED: "refusée",
  REVOKED: "révoqué",
  ACTIVE: "actif",
};

/** Statut d'une demande ou d'un accès, avec un code couleur constant. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 font-mono text-xs ${
        STYLES[status] ?? STYLES.REJECTED
      }`}
    >
      {LABELS[status] ?? status.toLowerCase()}
    </span>
  );
}
