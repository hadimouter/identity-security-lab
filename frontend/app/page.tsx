import Link from "next/link";

import { auth } from "@/auth";
import { login } from "@/app/actions";

const DEMO_ACCOUNTS = [
  { email: "user@example.com", role: "user", can: "Demander un accès" },
  { email: "manager@example.com", role: "manager", can: "Approuver ou refuser" },
  { email: "admin@example.com", role: "admin", can: "Administration" },
];

export default async function HomePage() {
  const session = await auth();

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

        {session ? (
          <p className="text-sm">
            Connecté en tant que{" "}
            <span className="font-mono">{session.user?.email}</span>.{" "}
            <Link
              href="/profile"
              className="text-accent underline-offset-4 hover:underline"
            >
              Voir le profil et les claims
            </Link>
          </p>
        ) : (
          <form action={login} className="pt-2">
            <button className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90">
              Se connecter avec Keycloak
            </button>
          </form>
        )}
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
