import Link from "next/link";

import { SECONDARY_BUTTON } from "@/lib/ui";

type Props = {
  code: string;
  title: string;
  description: string;
  hint?: string;
  action?: React.ReactNode;
};

/**
 * Écran de message unique, réutilisé par les pages 401, 403, 404 et par
 * la page d'erreur d'authentification. Évite d'avoir quatre mises en page
 * différentes pour dire la même chose.
 */
export function MessageScreen({
  code,
  title,
  description,
  hint,
  action,
}: Props) {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
      <p className="font-mono text-sm text-muted">{code}</p>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted">{description}</p>
      </div>

      {hint && (
        <p className="rounded-lg border border-border bg-surface p-4 text-left text-sm text-muted">
          {hint}
        </p>
      )}

      <div className="flex items-center justify-center gap-3 pt-2">
        {action}
        <Link href="/" className={SECONDARY_BUTTON}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
