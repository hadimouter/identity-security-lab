import Link from "next/link";

import { auth } from "@/auth";
import { login } from "@/app/actions";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Identity Security Lab</h1>
        <p className="opacity-80">
          Lab IAM démontrant le SSO OpenID Connect, le RBAC, un workflow de
          demande d&apos;accès avec validation manager, la révocation et les
          audit logs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Authentification</h2>
        <p className="text-sm opacity-80">
          L&apos;authentification est déléguée à Keycloak en Authorization Code
          + PKCE. Le mot de passe ne transite jamais par cette application.
        </p>

        {session ? (
          <p className="text-sm">
            Connecté en tant que{" "}
            <span className="font-mono">{session.user?.email}</span>.{" "}
            <Link href="/profile" className="underline">
              Voir le profil et les claims
            </Link>
          </p>
        ) : (
          <form action={login}>
            <button className="rounded bg-foreground px-4 py-2 text-sm text-background hover:opacity-90">
              Se connecter avec Keycloak
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">Comptes de démonstration</h2>
        <pre className="overflow-x-auto rounded border border-black/10 p-4 font-mono text-xs dark:border-white/15">
{`user@example.com      rôle user
manager@example.com   rôle manager
admin@example.com     rôle admin`}
        </pre>
        <p className="opacity-70">
          Mots de passe locaux, définis dans{" "}
          <span className="font-mono">.env.example</span>.
        </p>
      </section>
    </div>
  );
}
