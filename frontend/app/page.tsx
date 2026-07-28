import Link from "next/link";

import { auth } from "@/auth";
import { login } from "@/app/actions";
import { SubmitButton } from "@/app/components/submit-button";
import { ROLE_CAPABILITIES, ROLE_LABELS, isRole, screensFor } from "@/lib/rbac";
import { getEffectiveRoles } from "@/lib/session-roles";
import { PRIMARY_BUTTON } from "@/lib/ui";

const DEMO_ACCOUNTS = [
  { email: "user@example.com", role: "user", can: "Demander un accès" },
  {
    email: "manager@example.com",
    role: "manager",
    can: "Approuver ou refuser",
  },
  { email: "admin@example.com", role: "admin", can: "Administration" },
];

/** Vue publique : présentation du lab et invitation à se connecter. */
function PublicHome() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Identity Security Lab
        </h1>
        <p className="max-w-xl text-muted">
          Lab IAM démontrant le SSO OpenID Connect, le contrôle d&apos;accès par
          rôles, un workflow de demande d&apos;accès avec validation manager, la
          révocation et les audit logs.
        </p>
        <form action={login} className="pt-2">
          <SubmitButton
            pendingLabel="Redirection vers Keycloak…"
            className={`${PRIMARY_BUTTON} px-5 py-2.5`}
          >
            Se connecter avec Keycloak
          </SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Authentification
        </h2>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-sm text-muted">
            L&apos;authentification est déléguée à Keycloak, en Authorization
            Code + PKCE. Le mot de passe ne transite jamais par cette
            application, et les jetons restent côté serveur : le navigateur ne
            détient qu&apos;un cookie de session.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Comptes de démonstration
        </h2>
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {DEMO_ACCOUNTS.map((account) => (
            <div
              key={account.email}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-sm"
            >
              <span className="font-mono">{account.email}</span>
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted">
                {account.role}
              </span>
              <span className="ml-auto text-xs text-muted">{account.can}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Mots de passe locaux, définis dans{" "}
          <span className="font-mono">.env.example</span>. Aucun compte ne
          démarre avec des droits d&apos;administration : ils doivent être
          demandés et approuvés.
        </p>
      </section>
    </div>
  );
}

/** Vue connectée : ce que le rôle permet, et où aller ensuite. */
async function Dashboard() {
  const session = await auth();
  if (!session) return null;

  const effective = await getEffectiveRoles();
  const roles = effective.filter(isRole);
  const screens = screensFor(effective);
  // Dédoublonné : les listes se recouvrent quand un compte cumule des rôles.
  const capabilities = [
    ...new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role])),
  ];

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Bonjour {session.user?.name?.split(" ")[0] ?? ""}
        </h1>
        <p className="text-muted">
          Vous êtes connecté avec le rôle{" "}
          {roles.length > 0 ? (
            roles.map((role) => (
              <span key={role} className="font-medium text-foreground">
                {ROLE_LABELS[role]}
              </span>
            ))
          ) : (
            <span className="font-medium text-foreground">
              sans rôle métier
            </span>
          )}
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Ce que votre rôle permet
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {capabilities.map((capability) => (
            <li key={capability} className="px-5 py-3 text-sm">
              {capability}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          Défini par la matrice de{" "}
          <span className="font-mono">docs/rbac-model.md</span>. Un accès
          supplémentaire doit être demandé, justifié et approuvé.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Vos écrans</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {screens.map((screen) => {
            const row = (
              <>
                <span
                  className={
                    screen.status === "disponible"
                      ? "font-medium text-accent"
                      : "text-muted"
                  }
                >
                  {screen.label}
                </span>
                <span className="font-mono text-xs text-muted">
                  {screen.href}
                </span>
                <span className="ml-auto text-xs text-muted">
                  {screen.status === "disponible"
                    ? "disponible"
                    : `à venir — ${screen.phase}`}
                </span>
              </>
            );

            const rowClass =
              "flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 text-sm";

            return (
              <li key={screen.href}>
                {screen.status === "disponible" ? (
                  // Toute la ligne est cliquable : cible plus large qu'un
                  // lien de 20px, et l'affordance est plus lisible.
                  <Link
                    href={screen.href}
                    className={`${rowClass} transition-colors hover:bg-foreground/5`}
                  >
                    {row}
                  </Link>
                ) : (
                  <div className={rowClass}>{row}</div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">
          Les écrans à venir sont annoncés pour rendre lisible le périmètre
          complet du lab, tel que décrit dans le PRD.
        </p>
      </section>
    </div>
  );
}

export default async function HomePage() {
  const session = await auth();
  return session ? <Dashboard /> : <PublicHome />;
}
