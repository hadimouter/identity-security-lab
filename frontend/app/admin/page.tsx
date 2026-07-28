import Link from "next/link";
import { forbidden } from "next/navigation";

import { requireFreshSession } from "@/lib/session";
import { getEffectiveRoles } from "@/lib/session-roles";

/** Écrans d'administration, avec ce que chacun apporte. */
const ADMIN_SCREENS = [
  {
    href: "/admin/users",
    label: "Utilisateurs",
    description: "identités provisionnées et leurs accès",
  },
  {
    href: "/manager/grants",
    label: "Accès accordés",
    description: "octroi et révocation",
  },
  {
    href: "/manager/audit-logs",
    label: "Journal d'audit",
    description: "toutes les actions sensibles",
  },
];

/**
 * Page d'administration.
 *
 * Le contrôle ci-dessous vit dans le rendu de page, donc côté serveur,
 * mais il ne protège que l'affichage : il évite de rendre un écran vide
 * et de proposer des liens inutilisables.
 *
 * L'autorisation qui fait autorité est celle de l'API, qui revérifie le
 * jeton et recalcule les droits effectifs à chaque requête. Un appel
 * direct au curl sur /api/users reçoit un 403 sans passer par ici.
 */
export default async function AdminPage() {
  // 401 si aucune identité, écran de session expirée si le
  // renouvellement du jeton a échoué.
  await requireFreshSession();

  // 403 : identité connue, rôle insuffisant.
  // Les droits effectifs, pas ceux du jeton : un accès admin accordé par
  // le workflow doit ouvrir cette page comme il ouvre les routes de l'API.
  const { roles } = await getEffectiveRoles();
  if (!roles.includes("admin")) {
    forbidden();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Administration
        </h1>
        <p className="text-muted">
          Écran réservé au rôle <span className="font-mono">admin</span>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        <p>
          Vous voyez cette page parce que vos droits effectifs contiennent{" "}
          <span className="font-mono">admin</span> — qu&apos;il vienne de votre
          jeton Keycloak ou d&apos;un accès approuvé. Un compte{" "}
          <span className="font-mono">user</span> ou{" "}
          <span className="font-mono">manager</span>, lui, obtient un 403 sur
          cette même adresse, et l&apos;API le refuse aussi en direct.
        </p>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {ADMIN_SCREENS.map((screen) => (
          <li key={screen.href}>
            <Link
              href={screen.href}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 text-sm transition-colors hover:bg-foreground/5"
            >
              <span className="font-medium text-accent">{screen.label}</span>
              <span className="font-mono text-xs text-muted">
                {screen.href}
              </span>
              <span className="ml-auto text-xs text-muted">
                {screen.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
